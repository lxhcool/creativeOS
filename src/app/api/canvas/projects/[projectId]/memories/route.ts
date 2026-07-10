import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import {
  getCanvasProject,
  requireCanvasUserOwnerId,
} from "@/lib/canvas-project-store";
import { upsertCanvasProjectMemoryPatch } from "@/lib/canvas-memory-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

const memoryPatchSchema = z.object({
  id: z.string().optional(),
  type: z.enum([
    "project_bible",
    "continuity",
    "character_state",
    "chapter_event_summary",
    "note",
  ]),
  title: z.string().min(1).max(120),
  content: z.record(z.string(), z.unknown()),
  sourceElementIds: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).optional(),
  importance: z.number().min(0).max(1).optional(),
});

const requestSchema = z.object({
  patches: z.array(memoryPatchSchema).min(1).max(12),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const ownerId = await requireCanvasUserOwnerId();
    if (!ownerId) {
      return NextResponse.json({ error: "请先登录后再写入记忆" }, { status: 401 });
    }

    const project = await getCanvasProject(ownerId, projectId);
    if (!project) {
      return NextResponse.json({ error: "画布项目不存在" }, { status: 404 });
    }

    const body = requestSchema.parse(await request.json());
    const memories = await Promise.all(
      body.patches.map((patch) =>
        upsertCanvasProjectMemoryPatch({
          ownerId,
          projectId,
          memoryId: patch.id,
          type: patch.type,
          title: patch.title,
          content: patch.content as Prisma.InputJsonValue,
          sourceElementIds: patch.sourceElementIds,
          confidence: patch.confidence,
          importance: patch.importance,
        }),
      ),
    );

    return NextResponse.json({ memories });
  } catch (error) {
    console.error("[canvas/projects/memories:upsert]", error);
    return NextResponse.json({ error: "项目记忆写入失败" }, { status: 500 });
  }
}
