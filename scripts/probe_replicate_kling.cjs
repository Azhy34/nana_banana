const fs = require('fs');

const token = fs.readFileSync('.env.local', 'utf8').match(/REPLICATE_API_TOKEN=["']?([^"'\r\n]+)["']?/)[1];

async function checkPricing(slug) {
  const res = await fetch('https://api.replicate.com/v1/models/' + slug, {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const data = await res.json();
  console.log(slug);
  console.log('  Run count:', data.run_count);
  console.log('  Hardware:', data.latest_version?.hardware);
  console.log('  Created at:', data.latest_version?.created_at);
}

async function run() {
  await checkPricing('kwaivgi/kling-v4.0');
  await checkPricing('kwaivgi/kling-v2.6');
  await checkPricing('minimax/video-01');
}

run().catch(console.error);
