/**
 * Replicate Service - Handles image upscaling via Topaz Labs
 * 
 * Model: topazlabs/image-upscale
 * 
 * Features:
 * - Professional-grade upscaling without tiling artifacts.
 * - Supports up to 6x upscale.
 * - Multiple enhancement models (Standard, High Fidelity, etc.).
 */

const CORS_PROXY = 'https://corsproxy.io/?';
// Using the model-specific endpoint to always use the latest version
const REPLICATE_MODEL_URL = 'https://api.replicate.com/v1/models/topazlabs/image-upscale/predictions';
const PROXIED_API_URL = CORS_PROXY + encodeURIComponent(REPLICATE_MODEL_URL);

export type TopazEnhanceModel =
    | 'Standard V2'
    | 'High Fidelity V2'
    | 'Low Resolution V2'
    | 'CGI'
    | 'Text Refine';

interface TopazUpscaleInput {
    image: string; // URL or data URL
    upscale_factor?: '2x' | '4x' | '6x';
    enhance_model?: TopazEnhanceModel;
    output_format?: 'png' | 'jpg';
    face_enhancement?: boolean;
    face_enhancement_creativity?: number; // 0-1
    face_enhancement_strength?: number; // 0-1
    subject_detection?: 'None' | 'All' | 'Foreground' | 'Background';
}

interface ReplicatePrediction {
    id: string;
    status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
    output?: string | string[];
    error?: string;
    urls?: {
        get: string;
        cancel: string;
    };
}

/**
 * Start an upscale prediction on Replicate using Topaz Labs
 */
export async function startUpscale(
    apiToken: string,
    imageUrl: string,
    upscaleFactor: '2x' | '4x' | '6x' = '4x',
    enhanceModel: TopazEnhanceModel = 'High Fidelity V2',
    faceEnhance: boolean = false
): Promise<{ id: string, pollUrl: string }> {
    const input: TopazUpscaleInput = {
        image: imageUrl,
        upscale_factor: upscaleFactor,
        enhance_model: enhanceModel,
        output_format: 'png',
        face_enhancement: faceEnhance,
        subject_detection: 'All'
    };

    const response = await fetch(PROXIED_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'wait=5' // Suggest wait for 5s to maybe get result immediately
        },
        body: JSON.stringify({
            input: input,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to start Topaz upscale');
    }

    const prediction: ReplicatePrediction = await response.json();

    if (!prediction.urls?.get) {
        throw new Error('No polling URL returned from Replicate');
    }

    return {
        id: prediction.id,
        pollUrl: prediction.urls.get
    };
}

/**
 * Poll for prediction result
 */
export async function pollPrediction(
    apiToken: string,
    initialPollUrl: string,
    onProgress?: (status: string) => void,
    maxAttempts: number = 100,
    intervalMs: number = 3000
): Promise<string> {
    for (let i = 0; i < maxAttempts; i++) {
        // Use the polling URL provided by the API response
        const pollUrl = CORS_PROXY + encodeURIComponent(initialPollUrl);
        const response = await fetch(pollUrl, {
            headers: {
                'Authorization': `Bearer ${apiToken}`,
            },
        });

        if (!response.ok) {
            throw new Error('Failed to check prediction status');
        }

        const prediction: ReplicatePrediction = await response.json();

        if (onProgress) {
            onProgress(prediction.status);
        }

        if (prediction.status === 'succeeded') {
            const output = prediction.output;
            if (Array.isArray(output)) {
                return output[0];
            }
            return output as string;
        }

        if (prediction.status === 'failed' || prediction.status === 'canceled') {
            throw new Error(prediction.error || 'Upscale failed');
        }

        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error('Upscale timed out');
}

/**
 * Full upscale workflow using Topaz Labs
 */
export async function upscaleImage(
    apiToken: string,
    imageData: string, // base64 or URL
    mimeType: string,
    scaleFactorValue: number = 4,
    enhanceModel: TopazEnhanceModel = 'High Fidelity V2',
    faceEnhance: boolean = false,
    onProgress?: (status: string) => void
): Promise<string> {
    // Replicate accepts data URLs
    const imageUrl = imageData.startsWith('http')
        ? imageData
        : `data:${mimeType};base64,${imageData}`;

    // Map numeric scale to Topaz string factor
    let upscaleFactor: '2x' | '4x' | '6x' = '4x';
    if (scaleFactorValue <= 2) upscaleFactor = '2x';
    else if (scaleFactorValue <= 4) upscaleFactor = '4x';
    else upscaleFactor = '6x';

    const { pollUrl } = await startUpscale(
        apiToken,
        imageUrl,
        upscaleFactor,
        enhanceModel,
        faceEnhance
    );

    if (onProgress) {
        onProgress('processing');
    }

    return await pollPrediction(apiToken, pollUrl, onProgress);
}
