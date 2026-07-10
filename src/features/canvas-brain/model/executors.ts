import type {
  CanvasElement,
  CanvasTextMeta,
  CanvasTextRole,
} from "@/entities/canvas/model/types";
import type { UserModel, UserProvider } from "@/types/provider";
import {
  requestCanvasImageGeneration,
  requestCanvasIntent,
  requestCanvasTextGeneration,
  requestCanvasVideoGeneration,
} from "../api/client";
import {
  buildGenerationPrompt,
  buildVisibleResultPrompt,
  toTextGenerationSource,
} from "../lib/material";
import type { CanvasActionIntent } from "./types";

export type CanvasBrainGeneratedMediaKind = "image" | "video";
export type CanvasBrainMediaOutputKind = CanvasBrainGeneratedMediaKind | "audio";

export type CanvasBrainMediaSize = {
  width: number;
  height: number;
};

type CanvasBrainMediaPatchParams = {
  element: CanvasElement;
  src: string;
  intrinsicSize: CanvasBrainMediaSize;
  padding: number;
};

type CanvasBrainMediaGenerationParams = {
  kind: CanvasBrainGeneratedMediaKind;
  prompt: string;
  projectId?: string | null;
  referenceImageUrls?: string[];
  provider: UserProvider;
  model: UserModel;
  promptProvider?: UserProvider;
  promptModel?: UserModel;
  element: CanvasElement;
  padding: number;
  fallbackSize: CanvasBrainMediaSize;
};

type CanvasBrainTextExecutionParams = {
  prompt: string;
  element: CanvasElement;
  sourceElements: CanvasElement[];
  projectId?: string | null;
  provider: UserProvider;
  model: UserModel;
  intentOverride?: CanvasActionIntent;
  resultTextRole?: CanvasTextRole;
  generationMode?: "single" | "collaborative";
};

export type CanvasBrainTextExecutionResult =
  | {
      kind: "text";
      intent: CanvasActionIntent;
      content: string;
      shouldUpdateCurrent: boolean;
      meta?: Partial<CanvasTextMeta>;
    }
  | {
      kind: "media";
      intent: CanvasActionIntent & { outputKind: CanvasBrainMediaOutputKind };
      generationPrompt: string;
      visiblePrompt: string;
    }
  | {
      kind: "empty-material";
      message: string;
    };

const MEDIA_LIMITS = {
  maxWidth: 720,
  maxHeight: 480,
  minWidth: 180,
  minHeight: 120,
};

function isMediaOutputKind(outputKind: CanvasActionIntent["outputKind"]): outputKind is CanvasBrainMediaOutputKind {
  return outputKind === "image" || outputKind === "video" || outputKind === "audio";
}

export function getCanvasBrainGeneratingMessage(params: {
  kind: CanvasBrainGeneratedMediaKind;
  hasMaterialContext: boolean;
}): string {
  if (params.kind === "video") return "分镜师正在生成动态画面...";
  return params.hasMaterialContext
    ? "设计师正在根据素材出图..."
    : "设计师正在根据描述出图...";
}

export function getCanvasBrainDoneMessage(params: {
  kind: CanvasBrainGeneratedMediaKind;
  createdResult: boolean;
}): string {
  if (params.kind === "video") {
    return params.createdResult
      ? "视频草稿已完成，已经放到画布上。"
      : "视频草稿已完成，当前视频素材已更新。";
  }

  return params.createdResult
    ? "设计稿已完成，已经放到画布上。"
    : "设计稿已完成，当前图片素材已更新。";
}

export function getCanvasBrainFailureMessage(params: {
  kind: CanvasBrainGeneratedMediaKind;
  detail: string;
}): string {
  const serviceName = params.kind === "video" ? "视频生成服务" : "图片生成服务";
  const detail = sanitizeGenerationErrorDetail(params.detail, params.kind);
  if (/请检查|请稍后重试|请切换|暂时不可用/.test(detail)) {
    return detail;
  }
  return `${detail}。请检查${serviceName}配置，或切换可用的${serviceName}。`;
}

function sanitizeGenerationErrorDetail(
  detail: string,
  kind: CanvasBrainGeneratedMediaKind,
): string {
  const aggregateReason = extractReadableAggregateReason(detail);
  if (aggregateReason) return aggregateReason;

  if (/insufficient_user_quota|额度不足|quota/i.test(detail)) {
    return "图片生成额度不足，请检查图像服务账户余额或切换其他图像服务";
  }

  if (/All image generation models failed|All video generation models failed|Attempted:|Reasons:|prov_[A-Za-z0-9]+:/.test(detail)) {
    return kind === "image"
      ? "图片生成服务暂时不可用"
      : "视频生成服务暂时不可用";
  }
  if (/model_not_found|No available channel|not found/i.test(detail)) {
    return kind === "image"
      ? "当前图像模型暂时不可用"
      : "当前视频模型暂时不可用";
  }
  return sanitizeProviderDetails(detail);
}

function extractReadableAggregateReason(detail: string): string | undefined {
  const reasons = detail.match(/Reasons:\s*(.+)$/)?.[1];
  if (!reasons) return undefined;

  const cleaned = reasons
    .split(/\s+\|\s+/)
    .map((reason) => sanitizeProviderDetails(reason.replace(/^prov_[A-Za-z0-9]+:[^:]+:\s*/, "")))
    .filter(Boolean);

  return cleaned[0];
}

function sanitizeProviderDetails(detail: string): string {
  const cleaned = detail
    .replace(/prov_[A-Za-z0-9]+:/g, "")
    .replace(/insufficient_user_quota/gi, "额度不足")
    .replace(/\bOpenAI API error\s*/gi, "")
    .replace(/\bAPI error\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (/No available channel for model .* under group/i.test(cleaned)) {
    return "图像代理的参考图生图通道配置异常，请检查代理是否支持当前图像模型的图生图能力";
  }
  if (/EADDRNOTAVAIL|ECONNRESET|ECONNREFUSED|UND_ERR_SOCKET|upstream_error/i.test(cleaned)) {
    return "图像代理连接上游失败，请稍后重试或检查本地图像代理状态";
  }
  if (/Headers Timeout|UND_ERR_HEADERS_TIMEOUT|fetch failed/i.test(cleaned)) {
    return "图像代理长时间没有返回结果，请检查参考图生图通道是否正常";
  }

  return cleaned;
}

export function getCanvasBrainMissingModelMessage(kind: "text" | "image" | "video" | "audio"): string {
  const label =
    kind === "image"
      ? "图像"
      : kind === "video"
        ? "视频"
        : kind === "audio"
          ? "音频"
          : "文本";
  return `请先配置可用的${label}模型。`;
}

export function getCanvasBrainTextDoneMessage(createdResult: boolean): string {
  return createdResult
    ? "已发送，结果已生成到右侧节点。"
    : "已按你的要求更新当前文本节点。";
}

export function getCanvasBrainTextGeneratingMessage(params: {
  generationMode?: "single" | "collaborative";
}): string {
  return params.generationMode === "collaborative"
    ? "创作组正在协作：先规划，再写作、润色和整理记忆..."
    : "正在生成文本...";
}

export function getCanvasBrainReadyElementPatch(modelRef: string): Partial<CanvasElement> {
  return {
    prompt: "",
    status: "done",
    error: undefined,
    modelRef,
  } as Partial<CanvasElement>;
}

export function getCanvasReferenceImageUrls(elements: CanvasElement[]): string[] {
  return Array.from(
    new Set(
      elements
        .filter((element): element is Extract<CanvasElement, { kind: "image" }> =>
          element.kind === "image" && Boolean(element.src),
        )
        .map((element) => element.src)
        .filter((src): src is string => Boolean(src?.trim())),
    ),
  );
}

export function readBrowserImageSize(src: string): Promise<CanvasBrainMediaSize> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      resolve({
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      });
    };
    image.onerror = () => reject(new Error("图片尺寸读取失败"));
    image.src = src;
  });
}

export function readBrowserVideoSize(
  src: string,
  fallbackSize: CanvasBrainMediaSize,
): Promise<CanvasBrainMediaSize> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      resolve({
        width: video.videoWidth || fallbackSize.width,
        height: video.videoHeight || fallbackSize.height,
      });
      video.src = "";
      video.load();
    };
    video.onerror = () => {
      resolve(fallbackSize);
      video.src = "";
      video.load();
    };
    video.src = src;
  });
}

export function getCanvasBrainMediaNodeSize(params: {
  intrinsicSize: CanvasBrainMediaSize;
  padding: number;
}): CanvasBrainMediaSize {
  const safeWidth = Math.max(1, params.intrinsicSize.width);
  const safeHeight = Math.max(1, params.intrinsicSize.height);
  const fitScale = Math.min(
    MEDIA_LIMITS.maxWidth / safeWidth,
    MEDIA_LIMITS.maxHeight / safeHeight,
  );
  const minScale = Math.max(
    MEDIA_LIMITS.minWidth / safeWidth,
    MEDIA_LIMITS.minHeight / safeHeight,
  );
  const scale = Math.max(Math.min(fitScale, 1), Math.min(minScale, fitScale));

  return {
    width: safeWidth * scale + params.padding * 2,
    height: safeHeight * scale + params.padding * 2,
  };
}

export function buildGeneratedMediaElementPatch(
  params: CanvasBrainMediaPatchParams,
): Partial<CanvasElement> {
  const nodeSize = getCanvasBrainMediaNodeSize({
    intrinsicSize: params.intrinsicSize,
    padding: params.padding,
  });

  return {
    src: params.src,
    label: "生成结果",
    status: "done",
    error: undefined,
    x: params.element.x + params.element.width / 2 - nodeSize.width / 2,
    y: params.element.y + params.element.height / 2 - nodeSize.height / 2,
    width: nodeSize.width,
    height: nodeSize.height,
  } as Partial<CanvasElement>;
}

export async function executeCanvasBrainMediaGeneration(
  params: CanvasBrainMediaGenerationParams,
): Promise<Partial<CanvasElement>> {
  const src =
    params.kind === "image"
      ? await requestCanvasImageGeneration({
          prompt: params.prompt,
          projectId: params.projectId,
          referenceImageUrls: params.referenceImageUrls,
          provider: params.provider,
          model: params.model,
          promptProvider: params.promptProvider,
          promptModel: params.promptModel,
        })
      : await requestCanvasVideoGeneration({
          prompt: params.prompt,
          projectId: params.projectId,
          provider: params.provider,
          model: params.model,
        });
  const intrinsicSize =
    params.kind === "image"
      ? await readBrowserImageSize(src).catch(() => params.fallbackSize)
      : await readBrowserVideoSize(src, params.fallbackSize);

  return buildGeneratedMediaElementPatch({
    element: params.element,
    src,
    intrinsicSize,
    padding: params.padding,
  });
}

export async function executeCanvasBrainTextNode(
  params: CanvasBrainTextExecutionParams,
): Promise<CanvasBrainTextExecutionResult> {
  const intent =
    params.intentOverride ||
    (await requestCanvasIntent({
      prompt: params.prompt,
      current: toTextGenerationSource(params.element),
      provider: params.provider,
      model: params.model,
      sources: params.sourceElements.map(toTextGenerationSource),
    }));

  if (isMediaOutputKind(intent.outputKind)) {
    const generationPrompt = buildGenerationPrompt({
      instruction: intent.instruction || params.prompt,
      current: params.element,
      sources: params.sourceElements,
    });
    const visiblePrompt = buildVisibleResultPrompt({
      current: params.element,
      sources: params.sourceElements,
      fallback: generationPrompt,
    });

    if (!generationPrompt) {
      return {
        kind: "empty-material",
        message: "当前节点没有可用于生成的素材内容。请先在节点内容里写入素材，或先让 AI 生成文本内容。",
      };
    }

    return {
      kind: "media",
      intent: {
        ...intent,
        outputKind: intent.outputKind,
      },
      generationPrompt,
      visiblePrompt,
    };
  }

  const textGenerationParams = {
    prompt: intent.instruction || params.prompt,
    current: toTextGenerationSource(params.element),
    projectId: params.projectId,
    provider: params.provider,
    model: params.model,
    sources: params.sourceElements.map(toTextGenerationSource),
  };
  const result = {
    content: await requestCanvasTextGeneration(textGenerationParams),
  };

  return {
    kind: "text",
    intent,
    content: result.content,
    shouldUpdateCurrent: intent.placement === "update_current",
  };
}
