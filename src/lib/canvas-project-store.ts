import type { Prisma } from "@prisma/client";
import type {
  CanvasProjectExport,
  CanvasProjectRecord,
  CanvasSaveHistoryItem,
  CanvasTextElement,
} from "@/entities/canvas/model/types";
import { getCurrentAuthPayload } from "./auth-service";
import {
  deleteCanvasProjectAssetFiles,
  syncCanvasProjectAssetFileReferences,
} from "./canvas-asset-file-store";
import { syncCanvasProjectAssetMemory } from "./canvas-memory-store";
import { prisma } from "./prisma";

const CANVAS_SAVE_HISTORY_LIMIT = 12;

type CanvasProjectRow = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  nodeCount: number;
  edgeCount: number;
  payload: Prisma.JsonValue;
};

type CanvasHistoryRow = {
  id: string;
  name: string;
  savedAt: Date;
  nodeCount: number;
  edgeCount: number;
  payload: Prisma.JsonValue;
};

function getProjectName(payload: CanvasProjectExport, fallback = "未命名画布"): string {
  const firstText = payload.elements.find(
    (element): element is CanvasTextElement =>
      element.kind === "text" && Boolean(element.text.trim()),
  );

  if (!firstText) return fallback;

  const title = firstText.meta?.title || firstText.text.trim().split(/\s+/)[0] || fallback;
  return title.slice(0, 28);
}

function toProjectRecord(row: CanvasProjectRow): CanvasProjectRecord {
  const payload = toCanvasPayload(row.payload);

  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    nodeCount: row.nodeCount,
    edgeCount: row.edgeCount,
    assetCount: payload.elements.filter((element) => Boolean(element.asset)).length,
  };
}

function toCanvasPayload(value: Prisma.JsonValue): CanvasProjectExport {
  return value as unknown as CanvasProjectExport;
}

function toHistoryItem(row: CanvasHistoryRow): CanvasSaveHistoryItem {
  return {
    id: row.id,
    name: row.name,
    savedAt: row.savedAt.toISOString(),
    nodeCount: row.nodeCount,
    edgeCount: row.edgeCount,
    payload: toCanvasPayload(row.payload),
  };
}

export async function getCanvasOwnerId(): Promise<string> {
  const auth = await getCurrentAuthPayload();
  if (auth?.user.id) return `user:${auth.user.id}`;

  return "";
}

export async function requireCanvasUserOwnerId(): Promise<string | null> {
  const auth = await getCurrentAuthPayload();
  return auth?.user.id ? `user:${auth.user.id}` : null;
}

export async function listCanvasProjects(ownerId: string): Promise<CanvasProjectRecord[]> {
  if (!ownerId) return [];

  const rows = await prisma.canvasProject.findMany({
    where: { ownerId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      nodeCount: true,
      edgeCount: true,
      payload: true,
    },
  });

  return rows.map(toProjectRecord);
}

export async function getCanvasProject(
  ownerId: string,
  projectId: string,
): Promise<{ record: CanvasProjectRecord; payload: CanvasProjectExport } | null> {
  if (!ownerId) return null;

  const row = await prisma.canvasProject.findFirst({
    where: { ownerId, id: projectId },
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      nodeCount: true,
      edgeCount: true,
      payload: true,
    },
  });

  if (!row) return null;

  return {
    record: toProjectRecord(row),
    payload: toCanvasPayload(row.payload),
  };
}

export async function upsertCanvasProject(params: {
  ownerId: string;
  projectId: string;
  payload: CanvasProjectExport;
  name?: string;
}): Promise<CanvasProjectRecord> {
  const existing = await prisma.canvasProject.findFirst({
    where: { ownerId: params.ownerId, id: params.projectId },
    select: { id: true, name: true },
  });
  const name = params.name?.trim() || existing?.name || getProjectName(params.payload);
  const data = {
    name,
    nodeCount: params.payload.elements.length,
    edgeCount: params.payload.edges.length,
    payload: params.payload as unknown as Prisma.InputJsonValue,
  };

  const row = existing
    ? await prisma.canvasProject.update({
        where: { id: existing.id },
        data,
        select: {
          id: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          nodeCount: true,
          edgeCount: true,
          payload: true,
        },
      })
    : await prisma.canvasProject.create({
        data: {
          id: params.projectId,
          ownerId: params.ownerId,
          ...data,
        },
        select: {
          id: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          nodeCount: true,
          edgeCount: true,
          payload: true,
        },
      });

  await syncCanvasProjectAssetMemory({
    ownerId: params.ownerId,
    projectId: params.projectId,
    payload: params.payload,
  });
  await syncCanvasProjectAssetFileReferences({
    ownerId: params.ownerId,
    projectId: params.projectId,
    payload: params.payload,
  });

  return toProjectRecord(row);
}

export async function deleteCanvasProject(
  ownerId: string,
  projectId: string,
): Promise<void> {
  const project = await prisma.canvasProject.findFirst({
    where: { ownerId, id: projectId },
    select: { id: true },
  });

  if (!project) return;

  await deleteCanvasProjectAssetFiles({
    ownerId,
    projectId,
  });

  await prisma.canvasProject.delete({
    where: { id: project.id },
  });
}

export async function listCanvasSaveHistory(
  ownerId: string,
  projectId: string,
): Promise<CanvasSaveHistoryItem[]> {
  if (!ownerId) return [];

  const rows = await prisma.canvasSaveHistory.findMany({
    where: { ownerId, projectId },
    orderBy: { savedAt: "desc" },
    take: CANVAS_SAVE_HISTORY_LIMIT,
    select: {
      id: true,
      name: true,
      savedAt: true,
      nodeCount: true,
      edgeCount: true,
      payload: true,
    },
  });

  return rows.map(toHistoryItem);
}

export async function addCanvasSaveHistoryItem(params: {
  ownerId: string;
  projectId: string;
  historyId: string;
  payload: CanvasProjectExport;
  name?: string;
}): Promise<CanvasSaveHistoryItem> {
  const name = params.name?.trim() || getProjectName(params.payload, "画布快照");
  const data = {
    name,
    nodeCount: params.payload.elements.length,
    edgeCount: params.payload.edges.length,
    payload: params.payload as unknown as Prisma.InputJsonValue,
  };

  const row = await prisma.$transaction(async (tx) => {
    const item = await tx.canvasSaveHistory.create({
      data: {
        id: params.historyId,
        projectId: params.projectId,
        ownerId: params.ownerId,
        ...data,
      },
      select: {
        id: true,
        name: true,
        savedAt: true,
        nodeCount: true,
        edgeCount: true,
        payload: true,
      },
    });

    const oldRows = await tx.canvasSaveHistory.findMany({
      where: { ownerId: params.ownerId, projectId: params.projectId },
      orderBy: { savedAt: "desc" },
      skip: CANVAS_SAVE_HISTORY_LIMIT,
      select: { id: true },
    });

    if (oldRows.length > 0) {
      await tx.canvasSaveHistory.deleteMany({
        where: {
          ownerId: params.ownerId,
          id: { in: oldRows.map((oldRow) => oldRow.id) },
        },
      });
    }

    return item;
  });

  return toHistoryItem(row);
}

export async function deleteCanvasSaveHistoryItem(params: {
  ownerId: string;
  projectId: string;
  historyId: string;
}): Promise<void> {
  await prisma.canvasSaveHistory.deleteMany({
    where: {
      ownerId: params.ownerId,
      projectId: params.projectId,
      id: params.historyId,
    },
  });
}
