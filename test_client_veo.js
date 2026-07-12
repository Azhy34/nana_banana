import { generateVeoVideoOnClient } from './services/veoService.ts';
import fetch from 'node-fetch';

const apiKey = "AIzaSyAwHuRH39ZF2j2uOr9B4GfsqWuWbBmGCjo";
const imageUrl = 'https://psskjzvdme0m7e2w.public.blob.vercel-storage.com/input/9x16.png';

async function testClientVeo() {
  console.log("=== STARTING CLIENT-SIDE VEO GENERATION TEST ===");
  try {
    // 1. Download image and convert to Base64 (simulate client reading file)
    console.log("Downloading reference image...");
    const imgResponse = await fetch(imageUrl);
    const arrayBuffer = await imgResponse.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString('base64');

    console.log("Triggering client-side Veo animation...");
    const videoUrl = await generateVeoVideoOnClient(
      base64Image,
      {
        promptPreset: 'dolly_in',
        customPrompt: 'An extremely slow, steady, and smooth cinematic camera push-in. The wallpaper is a flat, non-moving print on the wall. It behaves strictly as a static flat print, showing zero changes.',
        seed: 133466
      },
      'morphing wallpaper pattern, warped walls, text, bad quality',
      apiKey,
      (progress) => {
        console.log(`Generation Progress: ${Math.round(progress)}%`);
      }
    );

    console.log("\n=== TEST SUCCESSFUL ===");
    console.log(`Generated Video Data URL (Base64) preview: ${videoUrl.substring(0, 100)}...`);
    console.log("=======================");
  } catch (error) {
    console.error("\n=== TEST FAILED ===");
    console.error(error.message || error);
    console.log("===================");
  }
}

testClientVeo();
