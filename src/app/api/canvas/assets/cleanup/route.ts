import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteUnreferencedCanvasAssetFiles } from "@/lib/canvas-asset-file-store";

export const runtime = "nodejs";

const requestSchema = z.object({
  olderThanDays: z.number().int().min(1).max(365).default(7),
  limit: z.number().int().min(1).max(1000).default(100),
  ownerId: z.string().optional(),
});

function readToken(request: Request): string {
  const authorization = request.headers.get("authorization") || "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  return request.headers.get("x-cleanup-token") || "";
}

export async function POST(request: Request) {
  try {
    const expectedToken = process.env.CANVAS_CLEANUP_TOKEN;
    if (!expectedToken) {
      return NextResponse.json(
        { error: "未配置清理任务令牌" },
        { status: 503 },
      );
    }

    if (readToken(request) !== expectedToken) {
      return NextResponse.json({ error: "无权执行清理任务" }, { status: 401 });
    }

    const body = requestSchema.parse(await request.json().catch(() => ({})));
    const deletedCount = await deleteUnreferencedCanvasAssetFiles({
      ownerId: body.ownerId,
      olderThanDays: body.olderThanDays,
      limit: body.limit,
    });

    return NextResponse.json({
      success: true,
      deletedCount,
    });
  } catch (error) {
    console.error("[canvas/assets/cleanup]", error);
    return NextResponse.json({ error: "资产清理失败" }, { status: 500 });
  }
}
