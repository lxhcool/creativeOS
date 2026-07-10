import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export type CanvasTaskStatus = "pending" | "running" | "succeeded" | "failed";

export type CanvasTaskRecord = {
  id: string;
  ownerId: string;
  projectId: string | null;
  type: string;
  status: CanvasTaskStatus;
  payload: unknown;
  result: unknown;
  error: string | null;
  attempts: number;
  maxAttempts: number;
  runAfter: string;
  lockedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function toTaskRecord(row: {
  id: string;
  ownerId: string;
  projectId: string | null;
  type: string;
  status: string;
  payload: Prisma.JsonValue;
  result: Prisma.JsonValue | null;
  error: string | null;
  attempts: number;
  maxAttempts: number;
  runAfter: Date;
  lockedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): CanvasTaskRecord {
  return {
    id: row.id,
    ownerId: row.ownerId,
    projectId: row.projectId,
    type: row.type,
    status: row.status as CanvasTaskStatus,
    payload: row.payload,
    result: row.result,
    error: row.error,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    runAfter: row.runAfter.toISOString(),
    lockedAt: row.lockedAt?.toISOString() || null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function createCanvasTaskId(): string {
  return `canvas_task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getRetryRunAfter(attempts: number): Date {
  const delaySeconds = Math.min(300, 15 * 2 ** Math.max(0, attempts - 1));
  return new Date(Date.now() + delaySeconds * 1000);
}

export async function createCanvasTask(params: {
  ownerId: string;
  projectId?: string | null;
  type: string;
  payload: Prisma.InputJsonValue;
  maxAttempts?: number;
}): Promise<CanvasTaskRecord> {
  const row = await prisma.canvasTask.create({
    data: {
      id: createCanvasTaskId(),
      ownerId: params.ownerId,
      projectId: params.projectId || null,
      type: params.type,
      payload: params.payload,
      maxAttempts: params.maxAttempts || 3,
      status: "pending",
    },
  });

  return toTaskRecord(row);
}

export async function markCanvasTaskRunning(taskId: string): Promise<CanvasTaskRecord> {
  const row = await prisma.canvasTask.update({
    where: { id: taskId },
    data: {
      status: "running",
      attempts: {
        increment: 1,
      },
      lockedAt: new Date(),
      error: null,
    },
  });

  return toTaskRecord(row);
}

export async function markCanvasTaskSucceeded(params: {
  taskId: string;
  result?: Prisma.InputJsonValue;
}): Promise<CanvasTaskRecord> {
  const row = await prisma.canvasTask.update({
    where: { id: params.taskId },
    data: {
      status: "succeeded",
      result: params.result || {},
      error: null,
      lockedAt: null,
    },
  });

  return toTaskRecord(row);
}

export async function markCanvasTaskFailed(params: {
  taskId: string;
  error: string;
  retryable?: boolean;
}): Promise<CanvasTaskRecord> {
  const current = await prisma.canvasTask.findUnique({
    where: { id: params.taskId },
    select: {
      attempts: true,
      maxAttempts: true,
    },
  });
  const attempts = current?.attempts || 1;
  const maxAttempts = current?.maxAttempts || 1;
  const shouldRetry = params.retryable !== false && attempts < maxAttempts;

  const row = await prisma.canvasTask.update({
    where: { id: params.taskId },
    data: {
      status: shouldRetry ? "pending" : "failed",
      error: params.error.slice(0, 2000),
      lockedAt: null,
      runAfter: shouldRetry ? getRetryRunAfter(attempts) : new Date(),
    },
  });

  return toTaskRecord(row);
}

export async function listCanvasTasks(params: {
  ownerId: string;
  projectId?: string | null;
  status?: CanvasTaskStatus;
  take?: number;
}): Promise<CanvasTaskRecord[]> {
  const rows = await prisma.canvasTask.findMany({
    where: {
      ownerId: params.ownerId,
      ...(params.projectId ? { projectId: params.projectId } : {}),
      ...(params.status ? { status: params.status } : {}),
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: params.take || 30,
  });

  return rows.map(toTaskRecord);
}

export async function claimNextRunnableCanvasTask(params: {
  type?: string;
} = {}): Promise<CanvasTaskRecord | null> {
  const candidate = await prisma.canvasTask.findFirst({
    where: {
      status: "pending",
      runAfter: {
        lte: new Date(),
      },
      ...(params.type ? { type: params.type } : {}),
    },
    orderBy: [
      {
        runAfter: "asc",
      },
      {
        updatedAt: "asc",
      },
    ],
  });
  if (!candidate) return null;

  const claimed = await prisma.canvasTask.updateMany({
    where: {
      id: candidate.id,
      status: "pending",
    },
    data: {
      status: "running",
      attempts: {
        increment: 1,
      },
      lockedAt: new Date(),
      error: null,
    },
  });
  if (claimed.count === 0) return null;

  const row = await prisma.canvasTask.findUnique({
    where: {
      id: candidate.id,
    },
  });

  return row ? toTaskRecord(row) : null;
}
