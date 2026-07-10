import { NextResponse } from "next/server";
import {
  getCanvasOwnerId,
  listCanvasProjects,
  requireCanvasUserOwnerId,
  upsertCanvasProject,
} from "@/lib/canvas-project-store";
import type { CanvasProjectExport } from "@/entities/canvas/model/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ownerId = await getCanvasOwnerId();
    const projects = await listCanvasProjects(ownerId);
    return NextResponse.json({ projects });
  } catch (error) {
    console.error("[canvas/projects]", error);
    return NextResponse.json({ error: "画布项目读取失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      id?: string;
      name?: string;
      payload?: CanvasProjectExport;
    };

    if (!body.id || !body.payload) {
      return NextResponse.json({ error: "画布项目参数不完整" }, { status: 400 });
    }

    const ownerId = await requireCanvasUserOwnerId();
    if (!ownerId) {
      return NextResponse.json({ error: "请先登录后再创建画布" }, { status: 401 });
    }

    const record = await upsertCanvasProject({
      ownerId,
      projectId: body.id,
      payload: body.payload,
      name: body.name,
    });

    return NextResponse.json({ record });
  } catch (error) {
    console.error("[canvas/projects:create]", error);
    return NextResponse.json({ error: "画布项目保存失败" }, { status: 500 });
  }
}
