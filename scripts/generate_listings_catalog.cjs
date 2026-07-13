const fs = require('fs');
const path = require('path');

const listingsDir = 'C:\\Users\\Mikhail\\OneDrive\\nocode\\Etsy\\etsy\\listings';
const outputFilePath = 'C:\\Users\\Mikhail\\OneDrive\\nocode\\Etsy\\listings_trend_catalog.md';

function scanListings() {
  console.log("Scanning listing files...");
  const files = fs.readdirSync(listingsDir);
  const catalog = [];

  // Trend mapping rules based on search analytics
  const trendMapping = {
    'boho': { status: '🔥 HOT (Evergreen)', action: 'Keep & Optimize (Use warm clay/terracotta/jute accents)' },
    'scandi': { status: '⭐ STABLE', action: 'Keep & Maintain' },
    'wald': { status: '🔥 HOT (Evolving)', action: 'Keep (Focus on misty watercolor forests)' },
    'woodland': { status: '🔥 HOT (Evolving)', action: 'Keep (Focus on misty watercolor forests)' },
    'safari': { status: '⭐ STABLE', action: 'Keep (Ensure realistic watercolor look, no cartoon)' },
    'jungle': { status: '⭐ STABLE', action: 'Keep (Ensure realistic watercolor look, no cartoon)' },
    'berge': { status: '📉 DECLINING', action: 'Monitor / Consider replacing with biophilic landscapes' },
    'mountain': { status: '📉 DECLINING', action: 'Monitor / Consider replacing with biophilic landscapes' },
    'balloon': { status: '📉 DECLINING', action: 'Replace with whimsical fantasy/clouds' },
    'cloud': { status: '🔥 HOT', action: 'Keep (Focus on dreamy pastel sunset clouds)' },
    'wolken': { status: '🔥 HOT', action: 'Keep (Focus on dreamy pastel sunset clouds)' },
    'stars': { status: '🔥 HOT', action: 'Keep (Focus on dreamy pastel sunset clouds)' },
    'moon': { status: '🔥 HOT', action: 'Keep (Focus on dreamy pastel sunset clouds)' }
  };

  files.forEach(file => {
    if (!file.endsWith('.md') && !file.endsWith('.txt')) return;
    const filePath = path.join(listingsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');

    // Parse listing number and title
    const lines = content.split('\n');
    let title = lines[0].replace(/#/g, '').trim();
    if (!title) {
      title = file.replace(/\.md$/, '').replace(/\.txt$/, '');
    }

    // Determine primary theme by keywords in title/content
    let theme = 'Other';
    let status = '⭐ STABLE';
    let action = 'Keep & Maintain';

    const lowerContent = content.toLowerCase();
    for (const [key, val] of Object.entries(trendMapping)) {
      if (lowerContent.includes(key)) {
        theme = key.toUpperCase();
        status = val.status;
        action = val.action;
        break;
      }
    }

    catalog.push({
      file: file,
      title: title,
      theme: theme,
      status: status,
      action: action
    });
  });

  // Sort catalog by listing number in title if possible
  catalog.sort((a, b) => {
    const numA = parseInt(a.title.match(/\d+/)?.[0] || '999');
    const numB = parseInt(b.title.match(/\d+/)?.[0] || '999');
    return numA - numB;
  });

  // Generate Markdown report
  let mdContent = `# 📊 Etsy Listings Trend & SEO Catalog (MoonBloomWalls)
Generated on: ${new Date().toISOString().split('T')[0]}

This catalog analyzes all active and draft wallpaper listings against the latest 2026/2027 search trends (USA & Europe, last 90 days). Use this to identify which designs to optimize, keep, or phase out.

## 📈 Search Reach Reference (Last 90 Days)
* **🔥 HOT (Evergreen):** High search volumes (20k-50k+ searches/mo). Keep, expand variants.
* **🔥 HOT (Evolving):** Growing search interest (10k-20k searches/mo). Move away from old motifs to modern styles.
* **⭐ STABLE:** Consistent moderate search interest (5k-10k searches/mo). 
* **📉 DECLINING:** Dropping search volumes (<2k searches/mo) or high market saturation. Phase out or redesign.

## 📋 Listings Database & Action Matrix

| Listing ID | Design Theme / Title | Base Theme | Trend Status (90d) | Action Plan |
| :--- | :--- | :--- | :--- | :--- |
`;

  catalog.forEach(item => {
    mdContent += `| [${item.file}](file:///C:/Users/Mikhail/OneDrive/nocode/Etsy/etsy/listings/${encodeURIComponent(item.file)}) | ${item.title} | ${item.theme} | ${item.status} | ${item.action} |\n`;
  });

  mdContent += `\n\n## 🛠️ Next Steps & Action Plan
1. **Redesign/Replace Declining Themes:** Focus on upgrading listings marked as **📉 DECLINING** (like simple geometric mountains or basic balloons) to **🔥 HOT** themes (Watercolor Misty Forest, Warm Japandi Arches).
2. **Optimize SEO Metadata:** Rewrite titles and top 160 characters of descriptions for **🔥 HOT** listings to target long-tail keywords (e.g. "Japandi nursery wallpaper", "Earthy terracotta wall mural").
3. **Update Batch Generator Prompts:** Update \`buildGeminiPrompt\` to focus on these trending styles.
`;

  fs.writeFileSync(outputFilePath, mdContent, 'utf8');
  console.log(`Catalog successfully written to: ${outputFilePath}`);
}

scanListings();
