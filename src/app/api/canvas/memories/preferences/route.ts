import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireCanvasUserOwnerId } from "@/lib/canvas-project-store";
import { upsertCanvasUserPreferenceMemory } from "@/lib/canvas-memory-store";

export const runtime = "nodejs";

const requestSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).max(120),
  content: z.record(z.string(), z.unknown()),
  confidence: z.number().min(0).max(1).optional(),
  importance: z.number().min(0).max(1).optional(),
});

export async function POST(request: Request) {
  try {
    const ownerId = await requireCanvasUserOwnerId();
    if (!ownerId) {
      return NextResponse.json({ error: "请先登录后再写入偏好" }, { status: 401 });
    }

    const body = requestSchema.parse(await request.json());
    const memory = await upsertCanvasUserPreferenceMemory({
      ownerId,
      memoryId: body.id,
      title: body.title,
      content: body.content as Prisma.InputJsonValue,
      confidence: body.confidence,
      importance: body.importance,
    });

    return NextResponse.json({ memory });
  } catch (error) {
    console.error("[canvas/memories/preferences:upsert]", error);
    return NextResponse.json({ error: "偏好记忆写入失败" }, { status: 500 });
  }
}
