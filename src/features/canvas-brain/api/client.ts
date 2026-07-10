import type { CanvasEdge, CanvasElement } from "@/entities/canvas/model/types";
import type { UserModel, UserProvider } from "@/types/provider";
import { toBrainNodeSummary } from "../lib/material";
import type {
  CanvasActionIntent,
  CanvasBrainMessage,
  CanvasBrainMemorySummary,
  CanvasBrainPlan,
  CanvasImageGenerationParams,
  CanvasTextGenerationSource,
  CanvasTextGenerationParams,
  CanvasVideoGenerationParams,
} from "../model/types";

function serializeProvider(provider: UserProvider) {
  return {
    id: provider.id,
    type: provider.type,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
  };
}

function serializeTextModel(model: UserModel) {
  return {
    kind: model.kind,
    modelName: model.modelName,
    capabilities: model.capabilities,
    contextWindow: model.contextWindow,
    maxOutputTokens: model.maxOutputTokens,
  };
}

function serializeGenerationModel(model: UserModel) {
  return {
    kind: model.kind,
    modelName: model.modelName,
    capabilities: model.capabilities,
    endpoint: model.endpoint,
    options: model.options,
  };
}

function serializeHistory(history: CanvasBrainMessage[]) {
  return history
    .filter((message) => message.content.trim().length > 0)
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

export async function requestCanvasTextGeneration(
  params: CanvasTextGenerationParams,
): Promise<string> {
  const response = await fetch("/api/canvas/text", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: params.prompt,
      current: params.current,
      projectId: params.projectId || undefined,
      provider: serializeProvider(params.provider),
      model: serializeTextModel(params.model),
      sources: params.sources,
    }),
  });

  const data = (await response.json()) as { content?: string; error?: string };
  if (!response.ok || !data.content) {
    throw new Error(data.error || "文本生成失败");
  }

  return data.content;
}

export async function requestCanvasIntent(
  params: CanvasTextGenerationParams,
): Promise<CanvasActionIntent> {
  const response = await fetch("/api/canvas/intent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: params.prompt,
      current: params.current,
      provider: serializeProvider(params.provider),
      model: serializeTextModel(params.model),
      sources: params.sources,
    }),
  });

  const data = (await response.json()) as Partial<CanvasActionIntent> & {
    error?: string;
  };
  if (!response.ok || !data.outputKind || !data.placement || !data.instruction) {
    throw new Error(data.error || "意图识别失败");
  }

  return {
    outputKind: data.outputKind,
    placement: data.placement,
    instruction: data.instruction,
    reason: data.reason,
  };
}

export async function requestCanvasBrainPlan(params: {
  prompt: string;
  history: CanvasBrainMessage[];
  elements: CanvasElement[];
  edges: CanvasEdge[];
  focusIds: string[];
  projectId?: string | null;
  provider: UserProvider;
  model: UserModel;
}): Promise<CanvasBrainPlan> {
  const response = await fetch("/api/canvas/plan", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: params.prompt,
      history: serializeHistory(params.history),
      nodes: params.elements.map(toBrainNodeSummary),
      edges: params.edges.map((edge) => ({
        sourceId: edge.sourceId,
        targetId: edge.targetId,
      })),
      focusIds: params.focusIds,
      projectId: params.projectId || undefined,
      provider: serializeProvider(params.provider),
      model: serializeTextModel(params.model),
    }),
  });

  const data = (await response.json()) as Partial<CanvasBrainPlan> & {
    error?: string;
  };
  if (
    !response.ok ||
    !data.mode ||
    (data.mode === "action" &&
      (!data.outputKind || !data.placement || !data.instruction)) ||
    (data.mode === "chat" && !data.response)
  ) {
    throw new Error(data.error || "画布规划失败");
  }

  return {
    mode: data.mode,
    intentType: data.intentType,
    confidence: data.confidence,
    assetWorkflow: data.assetWorkflow,
    sourceIds: data.sourceIds || [],
    createdSources: data.createdSources || [],
    outputKind: data.outputKind,
    placement: data.placement,
    instruction: data.instruction,
    response: data.response,
    summary: data.summary,
    needsClarification: data.needsClarification,
    question: data.question,
  };
}

export async function requestCanvasBrainChat(params: {
  prompt: string;
  history: CanvasBrainMessage[];
  elements: CanvasElement[];
  focusIds: string[];
  memories?: CanvasBrainMemorySummary[];
  provider: UserProvider;
  model: UserModel;
}): Promise<string> {
  const response = await fetch("/api/canvas/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: params.prompt,
      history: serializeHistory(params.history),
      nodes: params.elements.map(toBrainNodeSummary),
      focusIds: params.focusIds,
      provider: serializeProvider(params.provider),
      model: serializeTextModel(params.model),
    }),
  });

  const data = (await response.json()) as { content?: string; error?: string };
  if (!response.ok || !data.content) {
    throw new Error(data.error || "创作输入回复失败");
  }

  return data.content;
}

export async function requestCanvasImageGeneration(
  params: CanvasImageGenerationParams,
): Promise<string> {
  const response = await fetch("/api/canvas/image", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: params.prompt,
      projectId: params.projectId || undefined,
      referenceImageUrls: params.referenceImageUrls || [],
      provider: serializeProvider(params.provider),
      model: serializeGenerationModel(params.model),
      promptProvider: params.promptProvider
        ? serializeProvider(params.promptProvider)
        : undefined,
      promptModel: params.promptModel
        ? serializeTextModel(params.promptModel)
        : undefined,
    }),
  });

  const data = (await response.json()) as { src?: string; error?: string };
  if (!response.ok || !data.src) {
    throw new Error(data.error || "图片生成失败");
  }

  return data.src;
}

export async function requestCanvasVideoGeneration(
  params: CanvasVideoGenerationParams,
): Promise<string> {
  const response = await fetch("/api/canvas/video", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: params.prompt,
      projectId: params.projectId || undefined,
      provider: serializeProvider(params.provider),
      model: serializeGenerationModel(params.model),
    }),
  });

  const data = (await response.json()) as { src?: string; error?: string };
  if (!response.ok || !data.src) {
    throw new Error(data.error || "视频生成失败");
  }

  return data.src;
}

export async function writeCanvasProjectMemoryPatches(params: {
  projectId: string;
  patches: Array<{
    type:
      | "project_bible"
      | "continuity"
      | "character_state"
      | "chapter_event_summary"
      | "note";
    title: string;
    content: Record<string, unknown>;
    sourceElementIds?: string[];
    confidence?: number;
    importance?: number;
  }>;
}): Promise<void> {
  const response = await fetch(
    `/api/canvas/projects/${encodeURIComponent(params.projectId)}/memories`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        patches: params.patches,
      }),
    },
  );

  const data = (await response.json()) as { error?: string };
  if (!response.ok) {
    throw new Error(data.error || "项目记忆写入失败");
  }
}

export async function requestCanvasProjectMemoryExtraction(params: {
  projectId: string;
  kind: "novel_chapter" | "text_asset";
  chapterId?: string;
  outlineId?: string;
  chapterTitle?: string;
  assetId?: string;
  assetTitle?: string;
  current: CanvasTextGenerationSource & { id?: string };
  sources: Array<CanvasTextGenerationSource & { id?: string }>;
  provider: UserProvider;
  model: UserModel;
}): Promise<number> {
  const response = await fetch(
    `/api/canvas/projects/${encodeURIComponent(params.projectId)}/memories/extract`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        kind: params.kind,
        chapterId: params.chapterId,
        outlineId: params.outlineId,
        chapterTitle: params.chapterTitle,
        assetId: params.assetId,
        assetTitle: params.assetTitle,
        current: params.current,
        sources: params.sources,
        providerCredentialId: params.provider.serverCredentialId,
        provider: serializeProvider(params.provider),
        model: serializeTextModel(params.model),
      }),
    },
  );

  const data = (await response.json()) as {
    extractedCount?: number;
    error?: string;
  };
  if (!response.ok || typeof data.extractedCount !== "number") {
    throw new Error(data.error || "项目记忆整理失败");
  }

  return data.extractedCount;
}
