import { NextResponse } from "next/server";
import {
  deleteCanvasProject,
  getCanvasOwnerId,
  getCanvasProject,
  requireCanvasUserOwnerId,
  upsertCanvasProject,
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
    const project = await getCanvasProject(ownerId, projectId);

    if (!project) {
      return NextResponse.json({ error: "画布项目不存在" }, { status: 404 });
    }

    return NextResponse.json(project);
  } catch (error) {
    console.error("[canvas/projects:get]", error);
    return NextResponse.json({ error: "画布项目读取失败" }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const body = (await request.json()) as {
      name?: string;
      payload?: CanvasProjectExport;
    };

    if (!body.payload) {
      return NextResponse.json({ error: "画布内容不能为空" }, { status: 400 });
    }

    const ownerId = await requireCanvasUserOwnerId();
    if (!ownerId) {
      return NextResponse.json({ error: "请先登录后再保存画布" }, { status: 401 });
    }

    const record = await upsertCanvasProject({
      ownerId,
      projectId,
      payload: body.payload,
      name: body.name,
    });

    return NextResponse.json({ record });
  } catch (error) {
    console.error("[canvas/projects:update]", error);
    return NextResponse.json({ error: "画布项目保存失败" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const ownerId = await requireCanvasUserOwnerId();
    if (!ownerId) {
      return NextResponse.json({ error: "请先登录后再删除画布" }, { status: 401 });
    }

    await deleteCanvasProject(ownerId, projectId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[canvas/projects:delete]", error);
    return NextResponse.json({ error: "画布项目删除失败" }, { status: 500 });
  }
}
