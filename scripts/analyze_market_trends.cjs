const fs = require('fs');
const path = require('path');

// Load environment variables manually
function getOpenRouterKey() {
  try {
    const envContent = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
    const match = envContent.match(/OPENROUTER_API_KEY=["']?([^"'\r\n]+)["']?/);
    return match ? match[1] : null;
  } catch (e) {
    console.error("Failed to read .env.local:", e);
    return null;
  }
}

async function run() {
  const apiKey = getOpenRouterKey();
  if (!apiKey) {
    console.error("OpenRouter API Key not found in .env.local!");
    return;
  }

  console.log("Analyzing market trends via OpenRouter... (Processing US, Germany and EU data)");

  const prompt = `
  Analyze the Google Search and Google Trends data from the last 3 months (latest 90 days) in the USA, Germany, and the EU, focusing strictly on these core keywords:
  1. "nursery wallpaper" / "tapete kinderzimmer"
  2. "boho nursery" / "modern boho"
  3. "woodland nursery" / "forest wallpaper" / "fototapete wald"
  4. "safari wallpaper" / "safari jungle"
  5. "cloud wallpaper" / "wolken tapete"
  
  For each of these keyword areas, analyze what specific styles, design aesthetics, colors, materials, and accessories have shown the highest relative search volume and growth in the last 3 months.
  
  Please extract and merge these targeted trends into a structured JSON object that matches this exact schema:
  {
    "colors": [{"name": "Color Name", "description": "short description of why it is trending for these keys"}],
    "styles": [{"name": "Style Name", "description": "short description of how it fits these keys"}],
    "accessories": ["accessory 1", "accessory 2"],
    "materials": ["material 1", "material 2"]
  }
  
  Provide only the raw JSON block, no markdown code block formatting (do not wrap in \`\`\`json).
  `;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter API error: ${response.statusText} - ${errText}`);
    }

    const data = await response.json();
    const text = data.choices[0].message.content;
    
    // Clean up potential markdown code block wrappers
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const freshTrends = JSON.parse(jsonStr);

    // Read current trends.json
    const trendsPath = path.join(process.cwd(), 'Promt', 'trends.json');
    const currentTrends = JSON.parse(fs.readFileSync(trendsPath, 'utf8'));

    // Update the dedicated latestMarketInsights key, leaving original pools intact
    currentTrends.latestMarketInsights = {
      updatedAt: new Date().toISOString().split('T')[0],
      colors: freshTrends.colors || [],
      styles: freshTrends.styles || [],
      accessories: freshTrends.accessories || [],
      materials: freshTrends.materials || []
    };

    fs.writeFileSync(trendsPath, JSON.stringify(currentTrends, null, 2), 'utf8');
    console.log("Successfully updated Promt/trends.json latestMarketInsights key with latest US/EU trends!");

  } catch (error) {
    console.error("Error running trend analysis:", error);
  }
}

run();
