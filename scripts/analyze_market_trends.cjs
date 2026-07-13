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
  Analyze the current nursery and kids room design trends for 2026/2027 in the USA, Germany, and the EU.
  US trends usually lead the market (e.g. bold colors, playful themes), while Germany/EU trends focus heavily on sustainability (Nachhaltigkeit), eco-friendly materials (solid wood, linen), and soft warm neutrals (Japandi, Montessori).
  
  Please extract and merge these trends into a structured JSON database that matches this exact schema:
  {
    "colors": [{"name": "Color Name", "description": "short description"}],
    "styles": [{"name": "Style Name", "description": "short description"}],
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

    // Update with fresh data
    currentTrends.colors = freshTrends.colors || currentTrends.colors;
    currentTrends.styles = freshTrends.styles || currentTrends.styles;
    currentTrends.accessories = freshTrends.accessories || currentTrends.accessories;
    currentTrends.materials = freshTrends.materials || currentTrends.materials;

    fs.writeFileSync(trendsPath, JSON.stringify(currentTrends, null, 2), 'utf8');
    console.log("Successfully updated Promt/trends.json with latest US/EU trends via OpenRouter!");

  } catch (error) {
    console.error("Error running trend analysis:", error);
  }
}

run();
