const { list } = require('@vercel/blob');
const fs = require('fs');
const path = require('path');

// Load environment variables manually
function getBlobToken() {
  try {
    const envContent = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
    const match = envContent.match(/BLOB_READ_WRITE_TOKEN=["']?([^"'\r\n]+)["']?/);
    return match ? match[1] : null;
  } catch (e) {
    console.error("Failed to read .env.local:", e);
    return null;
  }
}

async function run() {
  const token = getBlobToken();
  if (!token) {
    console.error("BLOB_READ_WRITE_TOKEN is missing in .env.local!");
    return;
  }
  
  console.log("Listing blobs...");
  const { blobs } = await list({ token, prefix: 'sessions/' });
  
  if (blobs.length === 0) {
    console.log("No session blobs found.");
    return;
  }
  
  // Sort by uploadedAt descending
  blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  
  console.log(`Found ${blobs.length} session blobs. Listing all pathnames:`);
  for (const b of blobs) {
    console.log(`- Path: ${b.pathname}, UploadedAt: ${b.uploadedAt}`);
  }
  console.log("\nReading the latest 3:");
  for (let i = 0; i < Math.min(3, blobs.length); i++) {
    const b = blobs[i];
    console.log(`\n--- Blob: ${b.pathname} (${b.uploadedAt}) ---`);
    const response = await fetch(b.url);
    const json = await response.json();
    console.log(JSON.stringify(json, null, 2));
  }
}

run().catch(console.error);
