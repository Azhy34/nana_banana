#!/usr/bin/env node
/**
 * RETIRED (06.11.2026). This script used to ask a language model (Gemini 2.5 Flash via OpenRouter) to "analyse Google Trends data"
 * WITHOUT any search tool: the answer was the model's memory, not a measurement, and it was written into
 * Promt/trends.json -> latestMarketInsights, which the web app mixes into half of its prompts.
 *
 * Trends are now refreshed by research with sources (Tavily / Exa: German magazines, Pinterest DE reports, parent blogs), by editing
 * Promt/trends.json by hand (styles are cards there) and by putting the source URL and date of every entry into
 * latestMarketInsights. See .agents/skills/market-trends-auditor/SKILL.md.
 */
console.error('analyze_market_trends.cjs is retired: it asked a model without search and wrote its guess into trends.json.');
console.error('Refresh the trends by sourced research and edit Promt/trends.json (see .agents/skills/market-trends-auditor/SKILL.md).');
process.exit(1);
