import type { Prisma } from "@prisma/client";
import type {
  CanvasElement,
  CanvasProjectExport,
  CanvasTextElement,
} from "@/entities/canvas/model/types";
import { getCanvasTextTitle } from "@/entities/canvas/lib/textRoles";
import {
  cosineSimilarity,
  createCanvasMemoryEmbeddingData,
  createCanvasMemoryQueryEmbedding,
  memoryContentToSearchText,
  tokenizeForCanvasMemory,
} from "./canvas-memory-embedding";
import { prisma } from "./prisma";

const PROJECT_ASSET_INDEX_TYPE = "project_asset_index";
const PROJECT_SESSION_SUMMARY_TYPE = "project_session_summary";
const STRUCTURED_PROJECT_MEMORY_TYPES = [
  "project_bible",
  "continuity",
  "character_state",
  "chapter_event_summary",
] as const;
const MAX_MEMORY_ITEMS_FOR_PLAN = 12;
const MEMORY_CANDIDATE_LIMIT = 80;
const MAX_ASSET_INDEX_ITEMS = 80;
const MAX_EXCERPT_LENGTH = 360;

export type CanvasMemoryScope = "project" | "user";

export type CanvasMemoryType =
  | "project_asset_index"
  | "project_session_summary"
  | "project_bible"
  | "continuity"
  | "character_state"
  | "chapter_event_summary"
  | "user_preference"
  | "note";

export type CanvasMemoryRecord = {
  id: string;
  ownerId: string;
  projectId: string | null;
  scope: CanvasMemoryScope;
  type: CanvasMemoryType;
  title: string;
  content: unknown;
  sourceElementIds: string[];
  confidence: number;
  importance: number;
  embedding: number[];
  embeddingModel: string | null;
  embeddingUpdatedAt: string | null;
  accessCount: number;
  lastAccessedAt: string | null;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

function getElementTitle(element: CanvasElement): string {
  if (element.asset?.title) return element.asset.title;
  if (element.kind === "text") return getCanvasTextTitle(element);
  if (element.kind === "image" || element.kind === "video" || element.kind === "audio") {
    return element.label || element.kind;
  }
  if (element.kind === "template") return element.title || element.templateId;
  if (element.kind === "processor") return element.title || element.processorId;
  return element.kind;
}

function getElementExcerpt(element: CanvasElement): string {
  const text =
    (element.kind === "text"
      ? element.text
      : element.prompt ||
        (element.kind === "image" || element.kind === "video" || element.kind === "audio"
          ? element.label
          : element.kind === "template"
            ? element.title
            : element.kind === "processor"
              ? element.title
              : "")) || "";

  return text.trim().replace(/\s+/g, " ").slice(0, MAX_EXCERPT_LENGTH);
}

function isMemoryCandidate(element: CanvasElement): boolean {
  if (element.asset) return true;
  if (element.kind !== "text") return false;

  const text = element.text.trim();
  if (!text) return false;

  const title = (element as CanvasTextElement).meta?.title || "";
  return /意图|定位|设定|大纲|角色|世界观|连续性|伏笔|章节|场景/.test(title);
}

function getStructuredMemoryType(element: CanvasElement): (typeof STRUCTURED_PROJECT_MEMORY_TYPES)[number] | null {
  if (element.kind !== "text") return null;

  const title = getElementTitle(element);
  const textRole = element.textRole || "";
  const text = element.text.trim();
  if (!text) return null;

  if (/章节摘要|章节记录|本章事件|章节事件/.test(title)) {
    return "chapter_event_summary";
  }

  if (/连续|伏笔|章节事件|已发生|事件摘要|回收/.test(title)) {
    return "continuity";
  }

  if (/角色|人物|关系|人设/.test(title) || textRole.includes("character")) {
    return "character_state";
  }

  if (/作品|定位|世界观|规则|设定|大纲|主线|风格/.test(title)) {
    return "project_bible";
  }

  return null;
}

function buildStructuredMemoryContent(element: CanvasTextElement) {
  return {
    elementId: element.id,
    title: getElementTitle(element),
    textRole: element.textRole,
    text: element.text.trim().slice(0, 4000),
    version: element.meta?.version,
    sourceNodeId: element.meta?.sourceNodeId,
    updatedFromCanvasAt: new Date().toISOString(),
  };
}

function toMemoryRecord(row: {
  id: string;
  ownerId: string;
  projectId: string | null;
  scope: string;
  type: string;
  title: string;
  content: Prisma.JsonValue;
  sourceElementIds: string[];
  confidence: number;
  importance: number;
  embedding: number[];
  embeddingModel: string | null;
  embeddingUpdatedAt: Date | null;
  accessCount: number;
  lastAccessedAt: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): CanvasMemoryRecord {
  return {
    id: row.id,
    ownerId: row.ownerId,
    projectId: row.projectId,
    scope: row.scope as CanvasMemoryScope,
    type: row.type as CanvasMemoryType,
    title: row.title,
    content: row.content,
    sourceElementIds: row.sourceElementIds,
    confidence: row.confidence,
    importance: row.importance,
    embedding: row.embedding,
    embeddingModel: row.embeddingModel,
    embeddingUpdatedAt: row.embeddingUpdatedAt?.toISOString() || null,
    accessCount: row.accessCount,
    lastAccessedAt: row.lastAccessedAt?.toISOString() || null,
    status: row.status as CanvasMemoryRecord["status"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function getMemoryTypeWeight(type: CanvasMemoryType): number {
  if (type === "project_session_summary") return 0.92;
  if (type === "project_bible") return 0.88;
  if (type === "continuity") return 0.9;
  if (type === "chapter_event_summary") return 0.88;
  if (type === "character_state") return 0.86;
  if (type === "user_preference") return 0.8;
  if (type === "project_asset_index") return 0.58;
  return 0.62;
}

function getMemoryImportance(type: CanvasMemoryType): number {
  if (type === "continuity") return 0.92;
  if (type === "chapter_event_summary") return 0.88;
  if (type === "project_bible") return 0.9;
  if (type === "character_state") return 0.86;
  if (type === "project_session_summary") return 0.78;
  if (type === "user_preference") return 0.82;
  if (type === "project_asset_index") return 0.48;
  return 0.5;
}

function scoreCanvasMemory(params: {
  memory: CanvasMemoryRecord;
  queryTokens: Set<string>;
  queryEmbedding: number[];
  focusIds: Set<string>;
  now: number;
}): number {
  const memory = params.memory;
  const searchable = `${memory.title}\n${memory.type}\n${memoryContentToSearchText(memory.content)}`;
  const memoryTokens = new Set(tokenizeForCanvasMemory(searchable));
  const overlap = Array.from(params.queryTokens).filter((token) => memoryTokens.has(token)).length;
  const lexicalScore =
    params.queryTokens.size > 0
      ? Math.min(1, overlap / Math.min(params.queryTokens.size, 8))
      : 0;
  const focusScore = memory.sourceElementIds.some((id) => params.focusIds.has(id)) ? 0.28 : 0;
  const ageMs = Math.max(0, params.now - new Date(memory.updatedAt).getTime());
  const ageDays = ageMs / 86_400_000;
  const recencyScore = Math.max(0, 1 - ageDays / 30) * 0.18;
  const importanceScore = memory.importance * 0.36;
  const confidenceScore = memory.confidence * 0.16;
  const typeScore = getMemoryTypeWeight(memory.type) * 0.18;
  const semanticScore =
    params.queryEmbedding.length > 0 && memory.embedding.length > 0
      ? Math.max(0, cosineSimilarity(params.queryEmbedding, memory.embedding)) * 0.36
      : 0;

  return lexicalScore * 0.42 + semanticScore + focusScore + recencyScore + importanceScore + confidenceScore + typeScore;
}

export async function listCanvasMemoriesForPlan(params: {
  ownerId: string;
  projectId?: string | null;
  query?: string;
  focusIds?: string[];
}): Promise<CanvasMemoryRecord[]> {
  if (!params.ownerId) return [];

  const rows = await prisma.canvasMemory.findMany({
    where: {
      ownerId: params.ownerId,
      status: "active",
      OR: [
        { scope: "user", projectId: null },
        ...(params.projectId
          ? [{ scope: "project", projectId: params.projectId }]
          : []),
      ],
    },
    orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
    take: MEMORY_CANDIDATE_LIMIT,
  });

  const queryTokens = new Set(tokenizeForCanvasMemory(params.query || ""));
  const queryEmbedding = params.query
    ? await createCanvasMemoryQueryEmbedding(params.query)
    : [];
  const focusIds = new Set(params.focusIds || []);
  const now = Date.now();
  const memories = rows
    .map(toMemoryRecord)
    .map((memory) => ({
      memory,
      score: scoreCanvasMemory({
        memory,
        queryTokens,
        queryEmbedding,
        focusIds,
        now,
      }),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MEMORY_ITEMS_FOR_PLAN)
    .map((entry) => entry.memory);

  if (memories.length > 0) {
    await prisma.canvasMemory.updateMany({
      where: {
        id: {
          in: memories.map((memory) => memory.id),
        },
      },
      data: {
        accessCount: {
          increment: 1,
        },
        lastAccessedAt: new Date(),
      },
    });
  }

  return memories;
}

export async function syncCanvasProjectAssetMemory(params: {
  ownerId: string;
  projectId: string;
  payload: CanvasProjectExport;
}): Promise<void> {
  const memoryElements = params.payload.elements
    .filter(isMemoryCandidate)
    .slice(0, MAX_ASSET_INDEX_ITEMS);

  const content = {
    assetCount: params.payload.elements.filter((element) => Boolean(element.asset)).length,
    nodeCount: params.payload.elements.length,
    edgeCount: params.payload.edges.length,
    items: memoryElements.map((element) => ({
      id: element.id,
      kind: element.kind,
      title: getElementTitle(element),
      assetType: element.asset?.type,
      assetStatus: element.asset?.status,
      excerpt: getElementExcerpt(element),
    })),
  };
  const assetIndexEmbedding = await createCanvasMemoryEmbeddingData({
    type: PROJECT_ASSET_INDEX_TYPE,
    title: "项目资产索引",
    content,
  });

  await prisma.canvasMemory.upsert({
    where: {
      id: `${params.projectId}:${PROJECT_ASSET_INDEX_TYPE}`,
    },
    create: {
      id: `${params.projectId}:${PROJECT_ASSET_INDEX_TYPE}`,
      ownerId: params.ownerId,
      projectId: params.projectId,
      scope: "project",
      type: PROJECT_ASSET_INDEX_TYPE,
      title: "项目资产索引",
      content: content as Prisma.InputJsonValue,
      sourceElementIds: memoryElements.map((element) => element.id),
      confidence: 1,
      importance: getMemoryImportance(PROJECT_ASSET_INDEX_TYPE),
      ...assetIndexEmbedding,
      status: "active",
    },
    update: {
      title: "项目资产索引",
      content: content as Prisma.InputJsonValue,
      sourceElementIds: memoryElements.map((element) => element.id),
      confidence: 1,
      importance: getMemoryImportance(PROJECT_ASSET_INDEX_TYPE),
      ...assetIndexEmbedding,
      status: "active",
    },
  });

  const structuredMemories = params.payload.elements
    .filter((element): element is CanvasTextElement => element.kind === "text")
    .map((element) => ({
      element,
      type: getStructuredMemoryType(element),
    }))
    .filter((entry): entry is {
      element: CanvasTextElement;
      type: (typeof STRUCTURED_PROJECT_MEMORY_TYPES)[number];
    } => Boolean(entry.type));

  const structuredMemoryData = await Promise.all(
    structuredMemories.map(async ({ element, type }) => {
      const content = buildStructuredMemoryContent(element);
      return {
        ...(await createCanvasMemoryEmbeddingData({
          type,
          title: getElementTitle(element),
          content,
        })),
        id: `${params.projectId}:${type}:${element.id}`,
        ownerId: params.ownerId,
        projectId: params.projectId,
        scope: "project",
        type,
        title: getElementTitle(element),
        content: content as Prisma.InputJsonValue,
        sourceElementIds: [element.id],
        confidence: 1,
        importance: getMemoryImportance(type),
        status: "active",
      };
    }),
  );

  await prisma.$transaction(async (tx) => {
    await tx.canvasMemory.deleteMany({
      where: {
        ownerId: params.ownerId,
        projectId: params.projectId,
        scope: "project",
        type: {
          in: [...STRUCTURED_PROJECT_MEMORY_TYPES],
        },
      },
    });

    if (structuredMemoryData.length === 0) return;

    await tx.canvasMemory.createMany({
      data: structuredMemoryData,
    });
  });

  const sessionSummary = params.payload.assistantSession?.summary.trim();
  if (!sessionSummary) return;
  const sessionContent = {
    summary: sessionSummary,
    lastFocusElementId: params.payload.assistantSession?.lastFocusElementId,
    updatedAt: params.payload.assistantSession?.updatedAt,
  };
  const sessionEmbedding = await createCanvasMemoryEmbeddingData({
    type: PROJECT_SESSION_SUMMARY_TYPE,
    title: "上次沟通摘要",
    content: sessionContent,
  });

  await prisma.canvasMemory.upsert({
    where: {
      id: `${params.projectId}:${PROJECT_SESSION_SUMMARY_TYPE}`,
    },
    create: {
      id: `${params.projectId}:${PROJECT_SESSION_SUMMARY_TYPE}`,
      ownerId: params.ownerId,
      projectId: params.projectId,
      scope: "project",
      type: PROJECT_SESSION_SUMMARY_TYPE,
      title: "上次沟通摘要",
      content: sessionContent as Prisma.InputJsonValue,
      sourceElementIds: params.payload.assistantSession?.lastFocusElementId
        ? [params.payload.assistantSession.lastFocusElementId]
        : [],
      confidence: 1,
      importance: getMemoryImportance(PROJECT_SESSION_SUMMARY_TYPE),
      ...sessionEmbedding,
      status: "active",
    },
    update: {
      title: "上次沟通摘要",
      content: sessionContent as Prisma.InputJsonValue,
      sourceElementIds: params.payload.assistantSession?.lastFocusElementId
        ? [params.payload.assistantSession.lastFocusElementId]
        : [],
      confidence: 1,
      importance: getMemoryImportance(PROJECT_SESSION_SUMMARY_TYPE),
      ...sessionEmbedding,
      status: "active",
    },
  });
}

export async function upsertCanvasProjectMemoryPatch(params: {
  ownerId: string;
  projectId: string;
  memoryId?: string;
  type: Extract<
    CanvasMemoryType,
    "project_bible" | "continuity" | "character_state" | "chapter_event_summary" | "note"
  >;
  title: string;
  content: Prisma.InputJsonValue;
  sourceElementIds?: string[];
  confidence?: number;
  importance?: number;
}): Promise<CanvasMemoryRecord> {
  const id =
    params.memoryId ||
    `${params.projectId}:${params.type}:manual_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  const embeddingData = await createCanvasMemoryEmbeddingData({
    type: params.type,
    title: params.title,
    content: params.content,
  });

  const row = await prisma.canvasMemory.upsert({
    where: { id },
    create: {
      id,
      ownerId: params.ownerId,
      projectId: params.projectId,
      scope: "project",
      type: params.type,
      title: params.title,
      content: params.content,
      sourceElementIds: params.sourceElementIds || [],
      confidence: params.confidence ?? 0.85,
      importance: params.importance ?? getMemoryImportance(params.type),
      ...embeddingData,
      status: "active",
    },
    update: {
      title: params.title,
      content: params.content,
      sourceElementIds: params.sourceElementIds || [],
      confidence: params.confidence ?? 0.85,
      importance: params.importance ?? getMemoryImportance(params.type),
      ...embeddingData,
      status: "active",
    },
  });

  return toMemoryRecord(row);
}

export async function upsertCanvasUserPreferenceMemory(params: {
  ownerId: string;
  memoryId?: string;
  title: string;
  content: Prisma.InputJsonValue;
  confidence?: number;
  importance?: number;
}): Promise<CanvasMemoryRecord> {
  const type: CanvasMemoryType = "user_preference";
  const id =
    params.memoryId ||
    `${params.ownerId}:${type}:manual_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  const embeddingData = await createCanvasMemoryEmbeddingData({
    type,
    title: params.title,
    content: params.content,
  });

  const row = await prisma.canvasMemory.upsert({
    where: { id },
    create: {
      id,
      ownerId: params.ownerId,
      projectId: null,
      scope: "user",
      type,
      title: params.title,
      content: params.content,
      sourceElementIds: [],
      confidence: params.confidence ?? 0.8,
      importance: params.importance ?? getMemoryImportance(type),
      ...embeddingData,
      status: "active",
    },
    update: {
      title: params.title,
      content: params.content,
      confidence: params.confidence ?? 0.8,
      importance: params.importance ?? getMemoryImportance(type),
      ...embeddingData,
      status: "active",
    },
  });

  return toMemoryRecord(row);
}

export async function refreshCanvasProjectMemoryEmbeddings(params: {
  ownerId: string;
  projectId: string;
  limit?: number;
}): Promise<{ updated: number }> {
  const rows = await prisma.canvasMemory.findMany({
    where: {
      ownerId: params.ownerId,
      projectId: params.projectId,
      scope: "project",
      status: "active",
    },
    orderBy: { updatedAt: "desc" },
    take: Math.min(Math.max(params.limit || 100, 1), 500),
    select: {
      id: true,
      type: true,
      title: true,
      content: true,
    },
  });

  const updates = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      data: await createCanvasMemoryEmbeddingData({
        type: row.type,
        title: row.title,
        content: row.content,
      }),
    })),
  );

  if (updates.length === 0) return { updated: 0 };

  await prisma.$transaction(
    updates.map((entry) =>
      prisma.canvasMemory.update({
        where: { id: entry.id },
        data: entry.data,
      }),
    ),
  );

  return { updated: updates.length };
}
