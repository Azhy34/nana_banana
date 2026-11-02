export interface GmcSizeOption {
  size: string;
  price: string;
  priceEur: number;
}

export interface GmcProductDesign {
  itemGroupId: string;
  title: string;
  description: string;
  canonicalLink: string;
  productType: string;
  material: string;
  startingPriceEur: number;
  samplePriceEur: number;
  sizes: GmcSizeOption[];
  primaryImageUrl: string;
  additionalImageUrls: string[];
  allImageUrls: string[];
  flatMuralImageUrl?: string;
}

export type GmcCameraMotion = 'dolly_in' | 'dolly_out' | 'pan_to_wall' | 'montessori_push';
export type GmcPipelineMode = 'keyframe_pair' | 'room_to_macro';

export interface GmcKeyframePlan {
  mode: GmcPipelineMode;
  cameraMotion: GmcCameraMotion;
  startFrameUrl: string;
  endFrameUrl?: string;
  flatMuralUrl?: string;
  referenceUrls: string[];
}

export interface GmcVideoRunManifest {
  traceId: string;
  itemGroupId: string;
  timestamp: string;
  mode: GmcPipelineMode;
  engine: 'veo' | 'omni';
  plan: GmcKeyframePlan;
  prompts: {
    endFramePrompt?: string;
    videoPrompt: string;
    negativePrompt?: string;
  };
  estimatedCostUsd: number;
  status: 'dry_run' | 'started' | 'success' | 'error';
  resultVideoUrl?: string;
  error?: string;
  meta: {
    title: string;
    priceStarting: number;
    samplePrice: number;
    material: string;
  };
}

