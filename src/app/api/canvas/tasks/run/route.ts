import { NextResponse } from "next/server";
import { z } from "zod";
import {
  claimNextRunnableCanvasTask,
  markCanvasTaskFailed,
} from "@/lib/canvas-task-store";
import {
  canvasMemoryTaskPayloadSchema,
  runCanvasMemoryExtractionTask,
} from "@/lib/canvas-memory-extraction-runner";

export const runtime = "nodejs";

const requestSchema = z.object({
  limit: z.number().int().min(1).max(10).optional(),
});

function getBearerToken(request: Request): string {
  const header = request.headers.get("authorization") || "";
  if (header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }
  return request.headers.get("x-canvas-task-token") || "";
}

function verifyWorkerToken(request: Request): boolean {
  const expected = process.env.CANVAS_TASK_WORKER_TOKEN || "";
  if (!expected) return false;
  return getBearerToken(request) === expected;
}

export async function POST(request: Request) {
  try {
    if (!process.env.CANVAS_TASK_WORKER_TOKEN) {
      return NextResponse.json(
        { error: "未配置任务执行密钥" },
        { status: 503 },
      );
    }
    if (!verifyWorkerToken(request)) {
      return NextResponse.json({ error: "无权执行任务" }, { status: 401 });
    }

    const body = requestSchema.parse(await request.json().catch(() => ({})));
    const limit = body.limit || 3;
    const results: Array<{
      taskId: string;
      status: "succeeded" | "failed";
      error?: string;
      extractedCount?: number;
    }> = [];

    for (let index = 0; index < limit; index += 1) {
      const task = await claimNextRunnableCanvasTask();
      if (!task) break;

      if (!task.projectId) {
        await markCanvasTaskFailed({
          taskId: task.id,
          error: "任务缺少画布项目",
          retryable: false,
        });
        results.push({
          taskId: task.id,
          status: "failed",
          error: "任务缺少画布项目",
        });
        continue;
      }

      if (!task.type.startsWith("memory_extract:")) {
        await markCanvasTaskFailed({
          taskId: task.id,
          error: "不支持的任务类型",
          retryable: false,
        });
        results.push({
          taskId: task.id,
          status: "failed",
          error: "不支持的任务类型",
        });
        continue;
      }

      const parsedPayload = canvasMemoryTaskPayloadSchema.safeParse(
        task.payload,
      );
      if (!parsedPayload.success) {
        await markCanvasTaskFailed({
          taskId: task.id,
          error: "任务参数无效",
          retryable: false,
        });
        results.push({
          taskId: task.id,
          status: "failed",
          error: "任务参数无效",
        });
        continue;
      }

      try {
        const result = await runCanvasMemoryExtractionTask({
          taskId: task.id,
          ownerId: task.ownerId,
          projectId: task.projectId,
          payload: parsedPayload.data,
        });
        results.push({
          taskId: task.id,
          status: "succeeded",
          extractedCount: result.extractedCount,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "任务执行失败";
        results.push({
          taskId: task.id,
          status: "failed",
          error: message,
        });
      }
    }

    return NextResponse.json({
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error("[canvas/tasks/run]", error);
    return NextResponse.json({ error: "任务执行失败" }, { status: 500 });
  }
}
