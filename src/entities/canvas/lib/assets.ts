import type {
  CanvasArtifactType,
  CanvasAssetMeta,
  CanvasElement,
} from "../model/types";

export function getCanvasElementAssetType(
  element: Pick<CanvasElement, "kind">,
): CanvasArtifactType | null {
  if (element.kind === "text") return "text";
  if (element.kind === "image") return "image";
  if (element.kind === "video") return "video";
  if (element.kind === "audio") return "audio";
  if (element.kind === "template") return "sequence";
  if (element.kind === "processor") return "json";
  return null;
}

export function getCanvasAssetExportFormats(type: CanvasArtifactType): string[] {
  if (type === "text") return ["md", "docx", "txt", "json"];
  if (type === "image") return ["png", "webp", "json"];
  if (type === "video") return ["mp4", "webm", "json"];
  if (type === "audio") return ["mp3", "wav", "json"];
  if (type === "sequence") return ["png-sequence", "gif", "webm", "json"];
  if (type === "asset_pack") return ["zip", "json"];
  return ["json"];
}

export function createCanvasAssetMeta(params: {
  elementId: string;
  type: CanvasArtifactType;
  title: string;
  sourceNodeIds?: string[];
  version?: number;
  status?: CanvasAssetMeta["status"];
  modelRef?: string;
}): CanvasAssetMeta {
  return {
    id: `asset_${params.elementId}`,
    type: params.type,
    title: params.title.trim() || "未命名资产",
    status: params.status || "draft",
    version: params.version || 1,
    sourceNodeIds: params.sourceNodeIds || [],
    createdAt: new Date().toISOString(),
    exportFormats: getCanvasAssetExportFormats(params.type),
    modelRef: params.modelRef,
  };
}

export function withCanvasAssetMeta<T extends CanvasElement>(
  element: T,
  params: {
    title?: string;
    sourceNodeIds?: string[];
    version?: number;
    status?: CanvasAssetMeta["status"];
    modelRef?: string;
  } = {},
): T {
  const type = getCanvasElementAssetType(element);
  if (!type) return element;

  const fallbackTitle =
    element.kind === "text"
      ? element.meta?.title || "文本资产"
      : element.kind === "image"
        ? element.label || "图像资产"
        : element.kind === "video"
          ? element.label || "视频资产"
          : element.kind === "audio"
            ? element.label || "音频资产"
            : element.kind === "template"
              ? element.title || "序列资产"
              : element.kind === "processor"
                ? element.title || "处理资产"
                : "资产";

  return {
    ...element,
    asset: createCanvasAssetMeta({
      elementId: element.id,
      type,
      title: params.title || fallbackTitle,
      sourceNodeIds: params.sourceNodeIds,
      version: params.version,
      status: params.status,
      modelRef: params.modelRef || element.modelRef,
    }),
  };
}
