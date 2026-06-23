import type { CanvasMediaElement } from "@/entities/canvas/model/types";
import { DEFAULT_SPRITE_PROCESSING_OPTIONS } from "../defaults";
import {
  getLatestSpriteJob,
  processSpriteMedia,
  uploadSpriteMedia,
} from "../service";
import type { ProcessingOptions, SpriteJob, SpriteUpload } from "../types";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function sourceToFile(src: string, filename: string): Promise<File> {
  const response = await fetch(src);
  const blob = await response.blob();
  const type = blob.type || "video/mp4";
  return new File([blob], filename, { type });
}

function uploadRange(upload: SpriteUpload) {
  const info = upload.media_info || {};
  const frameCount = Math.max(1, Number(info.frame_count || 1));
  const duration = Number(info.duration || 0);
  return {
    startTime: 0,
    endTime: duration > 0 ? duration : 24 * 60 * 60,
    startFrame: 1,
    endFrame: frameCount,
  };
}

export async function runVideoToTransparentSequence(params: {
  element: CanvasMediaElement;
  options?: ProcessingOptions;
}): Promise<{
  upload: SpriteUpload;
  job: SpriteJob;
  usedOptions: ProcessingOptions;
  fallbackReason?: string;
}> {
  if (params.element.kind !== "video" || !params.element.src) {
    throw new Error("请先选择包含视频素材的节点。");
  }

  const file = await sourceToFile(
    params.element.src,
    `${params.element.label || params.element.id}.mp4`,
  );
  const upload = await uploadSpriteMedia([file]);
  const range = uploadRange(upload);
  const options = params.options || DEFAULT_SPRITE_PROCESSING_OPTIONS;

  const runProcess = async (runOptions: ProcessingOptions) => {
    const startedAfterMs = Date.now();
    try {
      return await processSpriteMedia({
        uploadId: upload.upload_id,
        options: runOptions,
        range,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        /连接中断|Broken pipe|terminated|aborted|fetch failed|UND_ERR/i.test(error.message)
      ) {
        let lastError: unknown = error;
        for (let attempt = 0; attempt < 45; attempt += 1) {
          try {
            return await getLatestSpriteJob({
              uploadId: upload.upload_id,
              startedAfterMs,
            });
          } catch (latestError) {
            lastError = latestError;
            await delay(1000);
          }
        }
        throw lastError;
      }
      throw error;
    }
  };

  try {
    const job = await runProcess(options);
    return { upload, job, usedOptions: options };
  } catch (error) {
    if (options.processingPreset === "fast" || options.matteMode === "chroma") {
      throw error;
    }

    const fallbackOptions: ProcessingOptions = {
      ...DEFAULT_SPRITE_PROCESSING_OPTIONS,
      keepEvery: options.keepEvery,
      outputScale: options.outputScale,
      canvasMode: options.canvasMode,
    };
    const job = await runProcess(fallbackOptions);
    return {
      upload,
      job,
      usedOptions: fallbackOptions,
      fallbackReason: error instanceof Error ? error.message : "算法 + AI 抠图失败",
    };
  }
}
