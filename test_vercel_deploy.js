// Using global fetch


const baseUrl = 'https://nana-banana.vercel.app';
const imageUrl = 'https://psskjzvdme0m7e2w.public.blob.vercel-storage.com/input/9x16.png'; // Ваша вчерашняя тестовая картинка из Blob

async function testVercelDeploy() {
  console.log("=== STARTING VERCEL DEPLOY E2E TEST ===");
  console.log(`Target URL: ${baseUrl}`);
  console.log(`Input Image: ${imageUrl}`);

  try {
    // 1. Send animation request to Vercel Backend
    console.log("\nStep 1: Sending animate request...");
    const initResponse = await fetch(`${baseUrl}/api/animate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        imageUrl,
        prompt: 'An extremely slow, steady camera push-in. The room is still and static. High quality.',
        negativePrompt: 'blurry, fast camera, change room color',
        seed: 133466
      })
    });

    if (!initResponse.ok) {
      const errText = await initResponse.text();
      throw new Error(`Animate request failed (${initResponse.status}): ${errText}`);
    }

    const { operationId, traceId } = await initResponse.json();
    console.log(`Success! Operation ID: ${operationId}`);
    console.log(`Trace ID (OpenTelemetry): ${traceId}`);

    // 2. Poll the status of the operation
    console.log("\nStep 2: Polling status...");
    let isDone = false;
    let attempts = 0;

    while (!isDone) {
      attempts++;
      console.log(`Attempt #${attempts}: checking status...`);
      
      const pollResponse = await fetch(
        `${baseUrl}/api/animate/poll?operationId=${encodeURIComponent(operationId)}&traceId=${encodeURIComponent(traceId)}`
      );

      if (!pollResponse.ok) {
        const errText = await pollResponse.text();
        throw new Error(`Polling failed (${pollResponse.status}): ${errText}`);
      }

      const pollResult = await pollResponse.json();
      
      if (pollResult.status === 'done') {
        isDone = true;
        console.log("\n=== TEST SUCCESSFUL ===");
        console.log(`Video URL: ${pollResult.videoUrl}`);
        console.log("=======================");
      } else {
        console.log(`Status: ${pollResult.status || 'processing'}. Waiting 6 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 6000));
      }

      if (attempts > 30) {
        throw new Error("Polling timeout after 3 minutes.");
      }
    }

  } catch (error) {
    console.error("\n=== TEST FAILED ===");
    console.error(error.message || error);
    console.log("===================");
  }
}

testVercelDeploy();
