import { NextResponse } from "next/server";
import {
  archiveCanvasModelCredential,
} from "@/lib/canvas-model-credential-store";
import { requireCanvasUserOwnerId } from "@/lib/canvas-project-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ credentialId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const ownerId = await requireCanvasUserOwnerId();
    if (!ownerId) {
      return NextResponse.json({ error: "请先登录后再删除模型凭据" }, { status: 401 });
    }

    const { credentialId } = await context.params;
    await archiveCanvasModelCredential({
      ownerId,
      credentialId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[canvas/model-credentials:delete]", error);
    return NextResponse.json({ error: "模型凭据删除失败" }, { status: 500 });
  }
}
