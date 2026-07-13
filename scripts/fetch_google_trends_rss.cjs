const https = require('https');

function fetchRss(targetUrl) {
  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  };

  return new Promise((resolve, reject) => {
    https.get(targetUrl, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve(data);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

function parseRss(xmlText) {
  const items = [];
  const matches = xmlText.matchAll(/<item>([\s\S]*?)<\/item>/g);
  for (const match of matches) {
    const itemContent = match[1];
    const titleMatch = itemContent.match(/<title>(.*?)<\/title>/);
    const approxTrafficMatch = itemContent.match(/<ht:approx_traffic>(.*?)<\/ht:approx_traffic>/);
    
    if (titleMatch) {
      items.push({
        title: titleMatch[1].replace('<![CDATA[', '').replace(']]>', ''),
        traffic: approxTrafficMatch ? approxTrafficMatch[1] : 'N/A'
      });
    }
  }
  return items.slice(0, 10);
}

async function run() {
  console.log("=== FETCHING LIVE GOOGLE TRENDS RSS ===");
  try {
    console.log("\n[1] Fetching trends for Germany (DE)...");
    const deXml = await fetchRss('https://trends.google.com/trending/rss?geo=DE');
    if (deXml.includes('Not Found') || deXml.length < 500) {
      console.log("DE RSS failed to return valid data (returned: " + deXml.substring(0, 100) + ")");
    } else {
      const deTrends = parseRss(deXml);
      console.log("Top 10 Live Trends in Germany today:");
      deTrends.forEach((t, i) => console.log(`${i+1}. ${t.title} (${t.traffic} searches)`));
    }

    console.log("\n[2] Fetching trends for USA (US)...");
    const usXml = await fetchRss('https://trends.google.com/trending/rss?geo=US');
    if (usXml.includes('Not Found') || usXml.length < 500) {
      console.log("US RSS failed to return valid data (returned: " + usXml.substring(0, 100) + ")");
    } else {
      const usTrends = parseRss(usXml);
      console.log("Top 10 Live Trends in USA today:");
      usTrends.forEach((t, i) => console.log(`${i+1}. ${t.title} (${t.traffic} searches)`));
    }

  } catch (error) {
    console.error("Error fetching Google Trends RSS:", error);
  }
}

run();
