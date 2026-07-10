import { NextResponse } from "next/server";
import {
  addCanvasSaveHistoryItem,
  getCanvasOwnerId,
  listCanvasSaveHistory,
  requireCanvasUserOwnerId,
} from "@/lib/canvas-project-store";
import type { CanvasProjectExport } from "@/entities/canvas/model/types";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const ownerId = await getCanvasOwnerId();
    const items = await listCanvasSaveHistory(ownerId, projectId);
    return NextResponse.json({ items });
  } catch (error) {
    console.error("[canvas/projects/history:list]", error);
    return NextResponse.json({ error: "保存记录读取失败" }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const body = (await request.json()) as {
      id?: string;
      name?: string;
      payload?: CanvasProjectExport;
    };

    if (!body.id || !body.payload) {
      return NextResponse.json({ error: "保存记录参数不完整" }, { status: 400 });
    }

    const ownerId = await requireCanvasUserOwnerId();
    if (!ownerId) {
      return NextResponse.json({ error: "请先登录后再保存画布" }, { status: 401 });
    }

    const item = await addCanvasSaveHistoryItem({
      ownerId,
      projectId,
      historyId: body.id,
      payload: body.payload,
      name: body.name,
    });

    return NextResponse.json({ item });
  } catch (error) {
    console.error("[canvas/projects/history:add]", error);
    return NextResponse.json({ error: "保存记录写入失败" }, { status: 500 });
  }
}
