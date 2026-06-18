import type { CanvasActionDefinition } from "../model/types";

export const videoToTransparentSequenceAction: CanvasActionDefinition = {
  id: "video.toTransparentSequence",
  label: "抠图",
  description: "使用 Sprite 处理能力把视频转换为透明帧序列。",
  category: "transform",
  inputKinds: ["video"],
  outputKind: "template",
  outputArtifactType: "sequence",
  outputTemplateId: "sequence-viewer",
  executorId: "sprite.videoToTransparentSequence",
};

export const videoActions: CanvasActionDefinition[] = [
  videoToTransparentSequenceAction,
];
