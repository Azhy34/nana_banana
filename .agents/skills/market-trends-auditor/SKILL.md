---
name: market-trends-auditor
description: Instructions and workflows for auditing active Etsy listings, querying market trends via OpenRouter/Google RSS, and updating the wallpaper generator prompt database.
---

# Market Trends & SEO Auditor Skill

This skill documents the workflow for auditing design trends, managing the keyword database, and keeping Etsy listings aligned with active 2026/2027 search demand.

## 📁 Key Components

*   **Database:** `Promt/trends.json` — holds the active style and color parameters.
*   **Analyst Script:** `scripts/analyze_market_trends.cjs` — queries OpenRouter for the latest 90-day search volumes of core keywords (nursery, boho, forest, clouds, safari) and updates `trends.json` automatically.
*   **RSS Utility:** `scripts/fetch_google_trends_rss.cjs` — demonstrates how to safely retrieve real-time daily trending feeds from Google Trends without API keys.
*   **Listing Catalog:** `C:\Users\Mikhail\OneDrive\nocode\Etsy\listings_trend_catalog.md` — tracks all 27+ active listings, their design themes, trend status (Hot, Stable, Declining), and action plans.

---

## 🛠️ Workflows

### 1. Daily/Weekly Trend Update
Run the analyst script to pull the latest 3-month keyword search stats:
```bash
node scripts/analyze_market_trends.cjs
```
This updates `trends.json` styles and colors based on high-performing SEO key terms.

### 2. Auditing Listings against trends
Compare active listings in `C:\Users\Mikhail\OneDrive\nocode\Etsy\etsy\listings\` against the updated trends database.
*   **🔥 HOT (Evergreen/Evolving):** Update SEO metadata (titles, tags, first 160 characters of descriptions) to incorporate long-tail keywords (e.g., "Japandi nursery wallpaper", "Earthy terracotta wall mural").
*   **📉 DECLINING:** Flag these listings (e.g. flat geometric mountains, basic hot air balloons) for potential replacement or design updates in the catalog.

### 3. Wallpaper Generation Prompting
Use the updated styles and colors in `trends.json` to feed the Batch Generator. Ensure that:
*   **Modern Boho** focuses on clean, structured textures (rattan, jute, linen) with warm clay/terracotta accents.
*   **Japandi** balances warm wood, neutral tones, and low-profile furniture.
*   **Biophilic Forest** focuses on realistic misty watercolor layers instead of cartoons.
