import type { CanvasMediaElement } from "@/entities/canvas/model/types";
import { DEFAULT_SPRITE_PROCESSING_OPTIONS } from "../defaults";
import {
  processSpriteMedia,
  uploadSpriteMedia,
} from "../service";
import type { ProcessingOptions, SpriteJob, SpriteUpload } from "../types";

async function sourceToFile(src: string, filename: string): Promise<File> {
  const response = await fetch(src);
  const blob = await response.blob();
  const type = blob.type || "video/mp4";
  return new File([blob], filename, { type });
}

function uploadRange(upload: SpriteUpload) {
  const info = upload.media_info || {};
  const frameCount = Math.max(1, Number(info.frame_count || 1));
  return {
    startTime: 0,
    endTime: Number(info.duration || 0),
    startFrame: 1,
    endFrame: frameCount,
  };
}

export async function runVideoToTransparentSequence(params: {
  element: CanvasMediaElement;
  options?: ProcessingOptions;
}): Promise<{ upload: SpriteUpload; job: SpriteJob }> {
  if (params.element.kind !== "video" || !params.element.src) {
    throw new Error("请先选择包含视频素材的节点。");
  }

  const file = await sourceToFile(
    params.element.src,
    `${params.element.label || params.element.id}.mp4`,
  );
  const upload = await uploadSpriteMedia([file]);
  const job = await processSpriteMedia({
    uploadId: upload.upload_id,
    options: params.options || DEFAULT_SPRITE_PROCESSING_OPTIONS,
    range: uploadRange(upload),
  });

  return { upload, job };
}
