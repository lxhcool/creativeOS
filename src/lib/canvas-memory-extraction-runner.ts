import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ModelGateway } from "@/services/model/gateway";
import { toCanvasTextGenerationErrorMessage } from "@/app/api/canvas/lib/errors";
import {
  buildSingleModelGatewayConfig,
  canvasProviderSchema,
  canvasTextModelSchema,
} from "@/app/api/canvas/lib/modelRequest";
import { getCanvasModelCredentialProviderInput } from "@/lib/canvas-model-credential-store";
import { upsertCanvasProjectMemoryPatch } from "@/lib/canvas-memory-store";
import {
  markCanvasTaskFailed,
  markCanvasTaskSucceeded,
} from "@/lib/canvas-task-store";

export const novelChapterMemorySourceSchema = z.object({
  id: z.string().optional(),
  kind: z.string(),
  text: z.string().optional(),
  prompt: z.string().optional(),
  label: z.string().optional(),
});

export const novelChapterMemoryTaskPayloadSchema = z.object({
  kind: z.literal("novel_chapter"),
  chapterId: z.string().min(1),
  outlineId: z.string().optional(),
  chapterTitle: z.string().optional(),
  current: novelChapterMemorySourceSchema,
  sources: z.array(novelChapterMemorySourceSchema).default([]),
  providerCredentialId: z.string().optional(),
  provider: canvasProviderSchema.extend({
    hasApiKey: z.boolean().optional(),
  }),
  model: canvasTextModelSchema,
  credentialsStored: z.boolean().optional(),
});

export const textAssetMemoryTaskPayloadSchema = z.object({
  kind: z.literal("text_asset"),
  assetId: z.string().min(1),
  assetTitle: z.string().optional(),
  current: novelChapterMemorySourceSchema,
  sources: z.array(novelChapterMemorySourceSchema).default([]),
  providerCredentialId: z.string().optional(),
  provider: canvasProviderSchema.extend({
    hasApiKey: z.boolean().optional(),
  }),
  model: canvasTextModelSchema,
  credentialsStored: z.boolean().optional(),
});

export const canvasMemoryTaskPayloadSchema = z.discriminatedUnion("kind", [
  novelChapterMemoryTaskPayloadSchema,
  textAssetMemoryTaskPayloadSchema,
]);

export type NovelChapterMemoryTaskPayload = z.infer<
  typeof novelChapterMemoryTaskPayloadSchema
>;
export type TextAssetMemoryTaskPayload = z.infer<
  typeof textAssetMemoryTaskPayloadSchema
>;
export type CanvasMemoryTaskPayload = z.infer<typeof canvasMemoryTaskPayloadSchema>;

type NovelChapterMemorySource = z.infer<typeof novelChapterMemorySourceSchema>;

type ExtractedMemoryPatch = {
  type:
    | "project_bible"
    | "chapter_event_summary"
    | "continuity"
    | "character_state"
    | "note";
  title: string;
  content: Prisma.InputJsonValue;
  sourceElementIds: string[];
  confidence: number;
  importance: number;
};

function getSourceContent(source: NovelChapterMemorySource): string {
  return source.text || source.prompt || source.label || "";
}

function buildExtractionPrompt(params: {
  instruction: string;
  current: NovelChapterMemorySource;
  sources: NovelChapterMemorySource[];
}): string {
  const currentContent = getSourceContent(params.current);
  const sourceText = params.sources
    .map((source, index) => {
      const content = getSourceContent(source);
      return content ? `${index + 1}. [${source.kind}]\n${content}` : "";
    })
    .filter(Boolean)
    .join("\n\n");

  return [
    params.instruction,
    "输出必须是可长期复用的项目记忆，中文，精简但不要遗漏关键事实。",
    "不要评价文本，不要解释提取过程，不要输出寒暄。",
    sourceText ? `关联素材：\n${sourceText}` : "",
    currentContent ? `章节正文：\n${currentContent}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function extractMemoryText(params: {
  gateway: ModelGateway;
  modelMaxOutputTokens?: number;
  instruction: string;
  current: NovelChapterMemorySource;
  sources: NovelChapterMemorySource[];
}): Promise<string> {
  const result = await params.gateway.chat({
    task: "canvas_memory_extract",
    messages: [
      {
        role: "system",
        content:
          "你是 CreativeOS 的项目记忆整理器。你只从用户提供的创作素材中提取可复用事实，输出给后续创作使用的长期记忆。",
      },
      {
        role: "user",
        content: buildExtractionPrompt(params),
      },
    ],
    temperature: 0.2,
    maxTokens: params.modelMaxOutputTokens
      ? Math.min(params.modelMaxOutputTokens, 1800)
      : 1400,
  });

  return result.content.trim();
}

async function createMemoryExtractionGateway(params: {
  ownerId: string;
  payload: CanvasMemoryTaskPayload;
}): Promise<ModelGateway> {
  if (!params.payload.model.capabilities.includes("text")) {
    throw new Error("请选择文本模型后再整理记忆。");
  }

  const storedProvider = params.payload.providerCredentialId
    ? await getCanvasModelCredentialProviderInput({
        ownerId: params.ownerId,
        credentialId: params.payload.providerCredentialId,
      })
    : null;
  if (params.payload.providerCredentialId && !storedProvider) {
    throw new Error("模型凭据不存在");
  }
  const runtimeProvider = storedProvider || params.payload.provider;
  if (!runtimeProvider.apiKey) {
    throw new Error("后台任务缺少模型凭据，请先保存服务端模型凭据。");
  }

  return new ModelGateway(
    buildSingleModelGatewayConfig({
      task: "canvas_memory_extract",
      provider: runtimeProvider,
      model: params.payload.model,
    }),
  );
}

export async function runNovelChapterMemoryExtractionTask(params: {
  taskId: string;
  ownerId: string;
  projectId: string;
  payload: NovelChapterMemoryTaskPayload;
}): Promise<{
  task: Awaited<ReturnType<typeof markCanvasTaskSucceeded>>;
  memories: Awaited<ReturnType<typeof upsertCanvasProjectMemoryPatch>>[];
  extractedCount: number;
}> {
  try {
    const gateway = await createMemoryExtractionGateway({
      ownerId: params.ownerId,
      payload: params.payload,
    });
    const chapterTitle = params.payload.chapterTitle || "章节";
    const outlineId =
      params.payload.outlineId ||
      params.payload.sources.find((source) => source.id)?.id;
    const sourceElementIds = Array.from(
      new Set(
        [params.payload.chapterId, outlineId].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    );
    const baseContent = {
      sourceChapterId: params.payload.chapterId,
      sourceOutlineId: outlineId,
      updatedFrom: "server_memory_extract",
      updatedAt: new Date().toISOString(),
    };

    const [
      eventSummaryResult,
      continuityResult,
      characterStateResult,
      foreshadowingResult,
    ] = await Promise.allSettled([
      extractMemoryText({
        gateway,
        modelMaxOutputTokens: params.payload.model.maxOutputTokens,
        current: params.payload.current,
        sources: params.payload.sources,
        instruction:
          "从章节正文中提取本章事件摘要。按时间顺序列出已经发生的关键事件、出场角色、地点变化、重要信息释放和章节结尾状态。",
      }),
      extractMemoryText({
        gateway,
        modelMaxOutputTokens: params.payload.model.maxOutputTokens,
        current: params.payload.current,
        sources: params.payload.sources,
        instruction:
          "从章节正文中提取连续性记录。包含已发生事件、公开信息、下一章钩子和需要避免的矛盾。",
      }),
      extractMemoryText({
        gateway,
        modelMaxOutputTokens: params.payload.model.maxOutputTokens,
        current: params.payload.current,
        sources: params.payload.sources,
        instruction:
          "从章节正文中提取角色状态表。按角色整理当前目标、情绪状态、关系变化、掌握的信息、隐藏秘密、身体/资源状态和下一步可能行动。",
      }),
      extractMemoryText({
        gateway,
        modelMaxOutputTokens: params.payload.model.maxOutputTokens,
        current: params.payload.current,
        sources: params.payload.sources,
        instruction:
          "从章节正文中提取伏笔台账。列出本章新埋伏笔、延续伏笔、已回收伏笔、读者已知但角色未知的信息、后续必须回收或避免矛盾的点。",
      }),
    ]);

    const patches: ExtractedMemoryPatch[] = [
      eventSummaryResult.status === "fulfilled"
        ? {
            type: "chapter_event_summary",
            title: `${chapterTitle}事件摘要`,
            content: {
              ...baseContent,
              text: eventSummaryResult.value,
            } as Prisma.InputJsonValue,
            sourceElementIds,
            confidence: 0.84,
            importance: 0.88,
          }
        : null,
      continuityResult.status === "fulfilled"
        ? {
            type: "continuity",
            title: `${chapterTitle}连续性记录`,
            content: {
              ...baseContent,
              text: continuityResult.value,
            } as Prisma.InputJsonValue,
            sourceElementIds,
            confidence: 0.82,
            importance: 0.92,
          }
        : null,
      characterStateResult.status === "fulfilled"
        ? {
            type: "character_state",
            title: `${chapterTitle}角色状态`,
            content: {
              ...baseContent,
              text: characterStateResult.value,
            } as Prisma.InputJsonValue,
            sourceElementIds,
            confidence: 0.8,
            importance: 0.88,
          }
        : null,
      foreshadowingResult.status === "fulfilled"
        ? {
            type: "note",
            title: `${chapterTitle}伏笔台账`,
            content: {
              ...baseContent,
              text: foreshadowingResult.value,
              noteType: "foreshadowing",
            } as Prisma.InputJsonValue,
            sourceElementIds,
            confidence: 0.78,
            importance: 0.86,
          }
        : null,
    ].filter((patch): patch is ExtractedMemoryPatch => Boolean(patch));

    if (patches.length === 0) {
      throw new Error("章节记忆提取失败");
    }

    const memories = await Promise.all(
      patches.map((patch) =>
        upsertCanvasProjectMemoryPatch({
          ownerId: params.ownerId,
          projectId: params.projectId,
          type: patch.type,
          title: patch.title,
          content: patch.content,
          sourceElementIds: patch.sourceElementIds,
          confidence: patch.confidence,
          importance: patch.importance,
        }),
      ),
    );
    const task = await markCanvasTaskSucceeded({
      taskId: params.taskId,
      result: {
        extractedCount: memories.length,
        memoryIds: memories.map((memory) => memory.id),
      },
    });

    return {
      task,
      memories,
      extractedCount: memories.length,
    };
  } catch (error) {
    const message = toCanvasTextGenerationErrorMessage(error);
    await markCanvasTaskFailed({
      taskId: params.taskId,
      error: message,
      retryable: Boolean(params.payload.providerCredentialId),
    });
    throw new Error(message);
  }
}

export async function runTextAssetMemoryExtractionTask(params: {
  taskId: string;
  ownerId: string;
  projectId: string;
  payload: TextAssetMemoryTaskPayload;
}): Promise<{
  task: Awaited<ReturnType<typeof markCanvasTaskSucceeded>>;
  memories: Awaited<ReturnType<typeof upsertCanvasProjectMemoryPatch>>[];
  extractedCount: number;
}> {
  try {
    const gateway = await createMemoryExtractionGateway({
      ownerId: params.ownerId,
      payload: params.payload,
    });
    const assetTitle = params.payload.assetTitle || "文本资产";
    const sourceElementIds = Array.from(
      new Set([params.payload.assetId, ...params.payload.sources.map((source) => source.id)].filter((id): id is string => Boolean(id))),
    );
    const baseContent = {
      sourceAssetId: params.payload.assetId,
      updatedFrom: "server_text_asset_memory_extract",
      updatedAt: new Date().toISOString(),
    };

    const [
      bibleResult,
      continuityResult,
      characterStateResult,
      noteResult,
    ] = await Promise.allSettled([
      extractMemoryText({
        gateway,
        modelMaxOutputTokens: params.payload.model.maxOutputTokens,
        current: params.payload.current,
        sources: params.payload.sources,
        instruction:
          "从当前文本中提取作品设定。整理题材、风格、世界观规则、核心设定、主线方向、重要约束和后续创作必须保持一致的信息。",
      }),
      extractMemoryText({
        gateway,
        modelMaxOutputTokens: params.payload.model.maxOutputTokens,
        current: params.payload.current,
        sources: params.payload.sources,
        instruction:
          "从当前文本中提取连续性记录。整理已确立事实、时间线、地点、事件因果、未解决问题和后续需要避免的矛盾。",
      }),
      extractMemoryText({
        gateway,
        modelMaxOutputTokens: params.payload.model.maxOutputTokens,
        current: params.payload.current,
        sources: params.payload.sources,
        instruction:
          "从当前文本中提取角色状态。按角色整理身份、人设、目标、关系、情绪、秘密、能力资源和当前状态。",
      }),
      extractMemoryText({
        gateway,
        modelMaxOutputTokens: params.payload.model.maxOutputTokens,
        current: params.payload.current,
        sources: params.payload.sources,
        instruction:
          "从当前文本中提取后续创作备注。只记录对后续生成有用的待办、伏笔、风险、偏好和需要回收的信息。",
      }),
    ]);

    const patches: ExtractedMemoryPatch[] = [
      bibleResult.status === "fulfilled"
        ? {
            type: "project_bible",
            title: `${assetTitle}设定记忆`,
            content: {
              ...baseContent,
              text: bibleResult.value,
            } as Prisma.InputJsonValue,
            sourceElementIds,
            confidence: 0.82,
            importance: 0.9,
          }
        : null,
      continuityResult.status === "fulfilled"
        ? {
            type: "continuity",
            title: `${assetTitle}连续性记录`,
            content: {
              ...baseContent,
              text: continuityResult.value,
            } as Prisma.InputJsonValue,
            sourceElementIds,
            confidence: 0.82,
            importance: 0.9,
          }
        : null,
      characterStateResult.status === "fulfilled"
        ? {
            type: "character_state",
            title: `${assetTitle}角色状态`,
            content: {
              ...baseContent,
              text: characterStateResult.value,
            } as Prisma.InputJsonValue,
            sourceElementIds,
            confidence: 0.8,
            importance: 0.86,
          }
        : null,
      noteResult.status === "fulfilled"
        ? {
            type: "note",
            title: `${assetTitle}创作备注`,
            content: {
              ...baseContent,
              text: noteResult.value,
              noteType: "text_asset_extract",
            } as Prisma.InputJsonValue,
            sourceElementIds,
            confidence: 0.76,
            importance: 0.78,
          }
        : null,
    ].filter((patch): patch is ExtractedMemoryPatch => Boolean(patch));

    if (patches.length === 0) {
      throw new Error("文本记忆提取失败");
    }

    const memories = await Promise.all(
      patches.map((patch) =>
        upsertCanvasProjectMemoryPatch({
          ownerId: params.ownerId,
          projectId: params.projectId,
          type: patch.type,
          title: patch.title,
          content: patch.content,
          sourceElementIds: patch.sourceElementIds,
          confidence: patch.confidence,
          importance: patch.importance,
        }),
      ),
    );
    const task = await markCanvasTaskSucceeded({
      taskId: params.taskId,
      result: {
        extractedCount: memories.length,
        memoryIds: memories.map((memory) => memory.id),
      },
    });

    return {
      task,
      memories,
      extractedCount: memories.length,
    };
  } catch (error) {
    const message = toCanvasTextGenerationErrorMessage(error);
    await markCanvasTaskFailed({
      taskId: params.taskId,
      error: message,
      retryable: Boolean(params.payload.providerCredentialId),
    });
    throw new Error(message);
  }
}

export async function runCanvasMemoryExtractionTask(params: {
  taskId: string;
  ownerId: string;
  projectId: string;
  payload: CanvasMemoryTaskPayload;
}): Promise<{
  task: Awaited<ReturnType<typeof markCanvasTaskSucceeded>>;
  memories: Awaited<ReturnType<typeof upsertCanvasProjectMemoryPatch>>[];
  extractedCount: number;
}> {
  if (params.payload.kind === "novel_chapter") {
    return runNovelChapterMemoryExtractionTask({
      ...params,
      payload: params.payload,
    });
  }

  return runTextAssetMemoryExtractionTask({
    ...params,
    payload: params.payload,
  });
}
