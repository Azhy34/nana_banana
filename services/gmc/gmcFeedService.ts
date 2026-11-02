import { GmcProductDesign, GmcSizeOption } from './types';

export const GMC_DEFAULT_FEED_URL = 'https://moonbloomwalls.com/google_shopping_feed.xml';

/**
 * Parses raw XML text from Google Shopping RSS 2.0 Feed into structured product designs.
 * Works uniformly across Node.js CLI and Browser environments without native DOM/window dependencies.
 */
export function parseGmcXml(xmlText: string): GmcProductDesign[] {
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  const tagRegex = /<([a-zA-Z0-9_:]+)>([\s\S]*?)<\/\1>/gi;

  const rawItems: Array<Record<string, string[]>> = [];
  let itemMatch: RegExpExecArray | null;

  while ((itemMatch = itemRegex.exec(xmlText)) !== null) {
    const itemBlock = itemMatch[1];
    const itemFields: Record<string, string[]> = {};
    let fieldMatch: RegExpExecArray | null;

    while ((fieldMatch = tagRegex.exec(itemBlock)) !== null) {
      const tagName = fieldMatch[1].replace(/^g:/, ''); // strip Google namespace if present
      const tagValue = fieldMatch[2].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
      if (!itemFields[tagName]) {
        itemFields[tagName] = [];
      }
      itemFields[tagName].push(tagValue);
    }
    rawItems.push(itemFields);
  }

  // Group items by item_group_id
  const groups = new Map<string, Array<Record<string, string[]>>>();
  for (const item of rawItems) {
    const groupId = item.item_group_id?.[0] || item.id?.[0]?.split('-')?.[0] || 'UNKNOWN';
    if (!groups.has(groupId)) {
      groups.set(groupId, []);
    }
    groups.get(groupId)!.push(item);
  }

  const designs: GmcProductDesign[] = [];

  for (const [groupId, items] of groups.entries()) {
    const first = items[0];
    const canonicalLink = first.canonical_link?.[0] || first.link?.[0] || '';
    const title = first.title?.[0]?.replace(/\s*–\s*\d+.*$/i, '')?.trim() || '';
    const description = first.description?.[0] || '';
    const productType = first.product_type?.[0] || '';
    const material = first.material?.[0] || 'Struktur-Vinyl auf Vliesbasis';

    const sizes: GmcSizeOption[] = [];
    let startingPriceEur = 9999;
    let samplePriceEur = 16.5;

    for (const it of items) {
      const sizeStr = it.size?.[0] || '';
      const rawPrice = it.price?.[0] || '0.00 EUR';
      const numericPrice = parseFloat(rawPrice.replace(/[^\d.]/g, '')) || 0;

      if (sizeStr.toLowerCase().includes('muster') || sizeStr.toLowerCase().includes('a4')) {
        samplePriceEur = numericPrice;
      } else if (numericPrice > 0 && numericPrice < startingPriceEur) {
        startingPriceEur = numericPrice;
      }

      sizes.push({
        size: sizeStr,
        price: rawPrice,
        priceEur: numericPrice
      });
    }

    if (startingPriceEur === 9999) startingPriceEur = 135.0;

    const primaryImageUrl = first.image_link?.[0] || '';
    const additionalImageUrls = first.additional_image_link || [];
    const allImageUrls = [primaryImageUrl, ...additionalImageUrls].filter(Boolean);

    // Flat 2D wallpaper graphic: on MoonBloom this is typically the isolated mural shot
    // (e.g. -6-xxxx.webp or highest resolution pattern). We tag candidate by pattern:
    const flatMuralCandidate = allImageUrls.find(url => url.includes('-6-')) || primaryImageUrl;

    designs.push({
      itemGroupId: groupId,
      title,
      description,
      canonicalLink,
      productType,
      material,
      startingPriceEur,
      samplePriceEur,
      sizes,
      primaryImageUrl,
      additionalImageUrls,
      allImageUrls,
      flatMuralImageUrl: flatMuralCandidate
    });
  }

  return designs;
}

/**
 * Fetches and parses the live Google Merchant Center XML feed.
 */
export async function fetchGmcFeed(feedUrl: string = GMC_DEFAULT_FEED_URL): Promise<GmcProductDesign[]> {
  const response = await fetch(feedUrl, {
    headers: {
      'User-Agent': 'MoonBloom-Pipeline/1.0',
      'Accept': 'application/xml, text/xml, */*'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch GMC feed from ${feedUrl}: HTTP ${response.status} ${response.statusText}`);
  }

  const xmlText = await response.text();
  return parseGmcXml(xmlText);
}

/**
 * Finds a specific wallpaper design by canonical URL or SKU ID (e.g., 'WA-003' or 'salbei-nebelwald').
 */
export async function findGmcProduct(
  query: string,
  feedUrl: string = GMC_DEFAULT_FEED_URL
): Promise<GmcProductDesign | null> {
  const designs = await fetchGmcFeed(feedUrl);
  const q = query.trim().toLowerCase();

  return designs.find(d =>
    d.itemGroupId.toLowerCase() === q ||
    d.canonicalLink.toLowerCase() === q ||
    d.canonicalLink.toLowerCase().includes(q) ||
    d.title.toLowerCase().includes(q)
  ) || null;
}

