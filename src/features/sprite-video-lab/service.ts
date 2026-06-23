import { spriteApi } from "./api";
import type {
  ProcessingOptions,
  SpriteExport,
  SpriteJob,
  SpritePreview,
  SpriteUpload,
} from "./types";

export type SpriteProcessingRange = {
  startTime?: number;
  endTime?: number;
  startFrame?: number;
  endFrame?: number;
  sampleTime?: number;
  sampleFrame?: number;
};

export function buildSpriteProcessingPayload(params: {
  uploadId: string;
  options: ProcessingOptions;
  range?: SpriteProcessingRange;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  const { options, range, extra } = params;

  return {
    upload_id: params.uploadId,
    start_time: range?.startTime ?? 0,
    end_time: range?.endTime ?? 0,
    start_frame: range?.startFrame ?? 1,
    end_frame: range?.endFrame ?? 1,
    keep_every: options.keepEvery,
    output_scale: options.outputScale / 100,
    reduce_px: options.reducePx,
    canvas_mode: options.canvasMode,
    chroma_enabled: options.chromaEnabled,
    matte_mode: options.chromaEnabled ? options.matteMode : "none",
    key_mode: options.keyMode,
    manual_key_hex: options.manualKeyHex,
    threshold: options.threshold,
    softness: options.softness,
    despill_strength: options.despillStrength,
    halo_pixels: options.haloPixels,
    foreground_protect_enabled: options.foregroundProtectEnabled,
    foreground_protect_hex: options.foregroundProtectHex,
    foreground_protect_tolerance: options.foregroundProtectTolerance,
    foreground_protect_strength: options.foregroundProtectStrength,
    ai_model: "birefnet-hr-matting",
    ai_device: "auto",
    ai_resolution: "auto",
    luma_black: options.lumaBlack,
    luma_white: options.lumaWhite,
    luma_gamma: options.lumaGamma,
    luma_strength: options.lumaStrength,
    corridorkey_enabled: options.matteMode.includes("corridorkey"),
    corridorkey_screen: options.corridorkeyScreen,
    batch_green_to_black: options.batchGreenToBlack,
    batch_green_desaturate: options.batchGreenDesaturate,
    batch_semitransparent_to_black: options.batchSemiTransparentToBlack,
    batch_semitransparent_to_opaque: options.batchSemiTransparentToOpaque,
    sample_time: range?.sampleTime,
    sample_frame: range?.sampleFrame,
    ...extra,
  };
}

export async function uploadSpriteMedia(files: File[]): Promise<SpriteUpload> {
  const form = new FormData();
  files.forEach((file) =>
    form.append("video", file, file.webkitRelativePath || file.name),
  );
  const data = await spriteApi<{ ok: true; upload: SpriteUpload }>("/upload", {
    method: "POST",
    body: form,
  });
  return data.upload;
}

export async function previewSpriteFrame(params: {
  uploadId: string;
  options: ProcessingOptions;
  range?: SpriteProcessingRange;
}): Promise<SpritePreview> {
  const data = await spriteApi<{ ok: true; preview: SpritePreview }>("/preview-frame", {
    method: "POST",
    body: buildSpriteProcessingPayload(params),
  });
  return data.preview;
}

export async function processSpriteMedia(params: {
  uploadId: string;
  options: ProcessingOptions;
  range?: SpriteProcessingRange;
}): Promise<SpriteJob> {
  const data = await spriteApi<{ ok: true; job: SpriteJob }>("/process", {
    method: "POST",
    body: buildSpriteProcessingPayload(params),
  });
  return data.job;
}

export async function getLatestSpriteJob(params: {
  uploadId: string;
  startedAfterMs: number;
}): Promise<SpriteJob> {
  const data = await spriteApi<{ ok: true; job: SpriteJob }>("/latest-job", {
    method: "POST",
    body: {
      upload_id: params.uploadId,
      started_after_ms: params.startedAfterMs,
    },
  });
  return data.job;
}

export async function exportSpriteFrames(params: {
  jobId: string;
  selectedIndices: number[];
  videoDurationMs: number;
}): Promise<SpriteExport> {
  const data = await spriteApi<{ ok: true; export: SpriteExport }>("/export", {
    method: "POST",
    body: {
      job_id: params.jobId,
      selected_indices: params.selectedIndices,
      video_duration_ms: params.videoDurationMs,
    },
  });
  return data.export;
}
