import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getCanvasProject,
  requireCanvasUserOwnerId,
} from "@/lib/canvas-project-store";
import { listCanvasTasks } from "@/lib/canvas-task-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

const querySchema = z.object({
  status: z.enum(["pending", "running", "succeeded", "failed"]).optional(),
  take: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const ownerId = await requireCanvasUserOwnerId();
    if (!ownerId) {
      return NextResponse.json({ error: "请先登录后再查看任务" }, { status: 401 });
    }

    const project = await getCanvasProject(ownerId, projectId);
    if (!project) {
      return NextResponse.json({ error: "画布项目不存在" }, { status: 404 });
    }

    const url = new URL(request.url);
    const query = querySchema.parse(Object.fromEntries(url.searchParams));
    const tasks = await listCanvasTasks({
      ownerId,
      projectId,
      status: query.status,
      take: query.take,
    });

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error("[canvas/projects/tasks:list]", error);
    return NextResponse.json({ error: "任务列表读取失败" }, { status: 500 });
  }
}
