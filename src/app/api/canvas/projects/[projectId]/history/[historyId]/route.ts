import { NextResponse } from "next/server";
import {
  deleteCanvasSaveHistoryItem,
  requireCanvasUserOwnerId,
} from "@/lib/canvas-project-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string; historyId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { projectId, historyId } = await context.params;
    const ownerId = await requireCanvasUserOwnerId();
    if (!ownerId) {
      return NextResponse.json({ error: "请先登录后再删除保存记录" }, { status: 401 });
    }

    await deleteCanvasSaveHistoryItem({ ownerId, projectId, historyId });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[canvas/projects/history:delete]", error);
    return NextResponse.json({ error: "保存记录删除失败" }, { status: 500 });
  }
}
