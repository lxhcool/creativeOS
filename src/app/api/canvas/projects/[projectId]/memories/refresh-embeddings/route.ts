import { NextResponse } from "next/server";
import {
  getCanvasProject,
  requireCanvasUserOwnerId,
} from "@/lib/canvas-project-store";
import { refreshCanvasProjectMemoryEmbeddings } from "@/lib/canvas-memory-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const ownerId = await requireCanvasUserOwnerId();
    if (!ownerId) {
      return NextResponse.json({ error: "请先登录后再刷新记忆" }, { status: 401 });
    }

    const project = await getCanvasProject(ownerId, projectId);
    if (!project) {
      return NextResponse.json({ error: "画布项目不存在" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      limit?: number;
    };
    const result = await refreshCanvasProjectMemoryEmbeddings({
      ownerId,
      projectId,
      limit: body.limit,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[canvas/projects/memories:refresh-embeddings]", error);
    return NextResponse.json({ error: "记忆向量刷新失败" }, { status: 500 });
  }
}
