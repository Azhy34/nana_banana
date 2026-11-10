---
name: market-trends-auditor
description: Instructions and workflows for auditing active Etsy listings, querying market trends via OpenRouter/Google RSS, and updating the wallpaper generator prompt database.
---

# Market Trends & SEO Auditor Skill

This skill documents the workflow for auditing design trends, managing the keyword database, and keeping Etsy listings aligned with active 2026/2027 search demand.

## 📁 Key Components

*   **Database (the single source of styles and variables):** `Promt/trends.json`. Styles are cards (signature, suitable colours, what to avoid), plus colours, accessories, materials, lighting, camera pools, `realism`, `negatives` and the measured `latestMarketInsights`. The web app and the ComfyUI boards read this file and build prompts with the same code (`services/promptGenerator.ts`); see Promt/Promt.md Rule #6.
*   **Analyst script:** `scripts/analyze_market_trends.cjs` is RETIRED (it asked a model without search and wrote its memory into trends.json). Do not revive it.
*   **RSS Utility:** `scripts/fetch_google_trends_rss.cjs` — demonstrates how to safely retrieve real-time daily trending feeds from Google Trends without API keys.
*   **Listing Catalog:** `C:\Users\Mikhail\OneDrive\nocode\Etsy\listings_trend_catalog.md` — tracks all 27+ active listings, their design themes, trend status (Hot, Stable, Declining), and action plans.

---

## 🛠️ Workflows

### 1. Refreshing the trends (sourced research, then edit the file)
1. Research with Tavily / Exa (German magazines, Pinterest DE reports, parent blogs and forums, retailer and colour-forecast pages). Every claim needs a URL and a date; mark what is only a forecast (Pinterest Predicts and Pantone for the next year appear in December).
2. Edit `Promt/trends.json`: change a style by editing its card (`description` is the signature in words the model understands, `colors` the colours that suit it, `avoid` what does not). Add colours or accessories to the pools; remove one only after a project-wide search shows nothing refers to it.
3. Put every new entry into `latestMarketInsights` with `source`, set `updatedAt`; its colours, styles and accessories must be names that exist in the pools (`comfy_nodes/test_trends_single_source.py` checks it).
4. Run `py -3.12 -X utf8 -m pytest comfy_nodes -q`, `npm run build`, then `scripts/build_comfy_workflows.py --verify-live`.

### 2. Auditing Listings against trends
Compare active listings in `C:\Users\Mikhail\OneDrive\nocode\Etsy\etsy\listings\` against the updated trends database.
*   **🔥 HOT (Evergreen/Evolving):** Update SEO metadata (titles, tags, first 160 characters of descriptions) to incorporate long-tail keywords (e.g., "Japandi nursery wallpaper", "Earthy terracotta wall mural").
*   **📉 DECLINING:** Flag these listings (e.g. flat geometric mountains, basic hot air balloons) for potential replacement or design updates in the catalog.

### 3. Wallpaper Generation Prompting
Use the updated styles and colors in `trends.json` to feed the Batch Generator. Ensure that:
*   **Modern Boho** focuses on clean, structured textures (rattan, jute, linen) with warm clay/terracotta accents.
*   **Japandi** balances warm wood, neutral tones, and low-profile furniture.
*   **Biophilic Forest** focuses on realistic misty watercolor layers instead of cartoons.

---

## 🔍 Google Trends Advanced Querying (Punctuation & Syntax)

To get accurate, clean, and relevant search volume trends from Google Trends (either via manual export or scripting), always use these operators:

1. **Exact Match (`"phrase"`)**: Use double quotes (e.g., `"nursery wallpaper"`) to track the exact keyword phrase. This excludes variants with words in between and shows accurate SEO search demand.
2. **Logical OR (`+` or `OR`)**: Combine similar terms to assess total niche size (e.g., `"boho nursery" + "modern boho"`).
3. **Exclude Term (`-`)**: Strip out unwanted terms (e.g., `wallpaper -peel` or `tapete -selbstklebend`). This is critical because our wallpapers are strictly traditional paste-the-wall.
4. **Google Image Filter**: When analyzing trends manually on the Google Trends portal, change the search property filter from *Web Search* to *Image Search* to see visual-first interest trends.

## 📊 Google Trends Data Mechanics (Normalization & Relative Indexing)

When reading Google Trends metrics, keep these data design facts in mind:
1. **Not Absolute Search Volume**: The index (0 to 100) does not represent the absolute number of searches. It represents the relative search interest (the ratio of a query's search volume to the total search volume of that region at that specific time).
2. **Population Normalization**: Because Google normalizes data by total regional volume, you can directly compare smaller markets (like Germany or specific EU countries) with giant markets (like the USA) without population skewing the results.
3. **Sampling Accuracy**: Google Trends uses a representative, randomized sample of daily Google search data. This ensures fast, real-time feedback that is statistically equivalent to the full search volume database.
4. **Topics vs Search Terms**: Prefer "Topics" (e.g. general design concepts) for broad international trend research, but use exact "Search Terms" (using punctuation operators) for precise SEO copywriting and keyphrase placement.

## 🔄 What the code reads (verified 06.11.2026)

*   `generateRandomTags()` picks a style first, then a colour from that style's card, then the other pools; `buildGeminiPrompt()` and `buildBriefPrompt()` read styles, pools, `realism` and `negatives` from `trends.json`. `latestMarketInsights` adds, with a 50% chance each, one trending colour accent, accessory and material to the long prompt.
*   No style, colour or camera is hard-coded anywhere in the prompt path (a test fails if one is). Old values disappear only when you delete them from `trends.json`.
