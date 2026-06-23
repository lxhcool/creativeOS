import type { ProcessingOptions } from "./types";

export const DEFAULT_SPRITE_PROCESSING_OPTIONS: ProcessingOptions = {
  processingPreset: "fast",
  keepEvery: 2,
  outputScale: 100,
  canvasMode: "auto",
  reducePx: 0,
  chromaEnabled: true,
  matteMode: "chroma",
  keyMode: "auto",
  manualKeyHex: "#00ff00",
  threshold: 42,
  softness: 8,
  despillStrength: 0.6,
  haloPixels: 1,
  foregroundProtectEnabled: false,
  foregroundProtectHex: "#2f8f3a",
  foregroundProtectTolerance: 34,
  foregroundProtectStrength: 1,
  corridorkeyScreen: "auto",
  lumaBlack: 0,
  lumaWhite: 85,
  lumaGamma: 0.55,
  lumaStrength: 1.7,
  batchGreenToBlack: false,
  batchGreenDesaturate: false,
  batchSemiTransparentToBlack: false,
  batchSemiTransparentToOpaque: false,
};

export const SPRITE_PROCESSING_PRESETS: Record<
  NonNullable<ProcessingOptions["processingPreset"]>,
  ProcessingOptions
> = {
  fast: DEFAULT_SPRITE_PROCESSING_OPTIONS,
  balanced: {
    ...DEFAULT_SPRITE_PROCESSING_OPTIONS,
    processingPreset: "balanced",
    matteMode: "birefnet_chroma",
    threshold: 38,
    softness: 10,
    despillStrength: 0.75,
    haloPixels: 1,
    batchGreenDesaturate: true,
  },
  quality: {
    ...DEFAULT_SPRITE_PROCESSING_OPTIONS,
    processingPreset: "quality",
    keepEvery: 1,
    matteMode: "birefnet_corridorkey_key",
    threshold: 34,
    softness: 12,
    despillStrength: 0.85,
    haloPixels: 1,
    foregroundProtectEnabled: true,
    foregroundProtectTolerance: 42,
    foregroundProtectStrength: 0.75,
    corridorkeyScreen: "auto",
    batchGreenDesaturate: true,
    batchSemiTransparentToOpaque: true,
  },
};

export const CANVAS_DEFAULT_SPRITE_PROCESSING_OPTIONS =
  {
    ...SPRITE_PROCESSING_PRESETS.fast,
    keepEvery: 2,
    outputScale: 80,
    softness: 10,
    despillStrength: 0.85,
    batchGreenDesaturate: true,
  };

export function applySpriteProcessingPreset(
  options: ProcessingOptions,
  preset: NonNullable<ProcessingOptions["processingPreset"]>,
): ProcessingOptions {
  return {
    ...options,
    ...SPRITE_PROCESSING_PRESETS[preset],
    processingPreset: preset,
  };
}
