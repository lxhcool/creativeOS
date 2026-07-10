import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCanvasUserOwnerId } from "@/lib/canvas-project-store";
import {
  listCanvasModelCredentials,
  upsertCanvasModelCredential,
} from "@/lib/canvas-model-credential-store";

export const runtime = "nodejs";

const credentialSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(80),
  providerType: z.enum([
    "openai",
    "anthropic",
    "google",
    "litellm",
    "openrouter",
    "openai_compatible",
  ]),
  baseUrl: z.string().min(1).max(300),
  apiKey: z.string().min(1).max(4000),
});

export async function GET() {
  try {
    const ownerId = await requireCanvasUserOwnerId();
    if (!ownerId) {
      return NextResponse.json({ error: "请先登录后再查看模型凭据" }, { status: 401 });
    }

    const credentials = await listCanvasModelCredentials({ ownerId });
    return NextResponse.json({ credentials });
  } catch (error) {
    console.error("[canvas/model-credentials:list]", error);
    return NextResponse.json({ error: "模型凭据读取失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ownerId = await requireCanvasUserOwnerId();
    if (!ownerId) {
      return NextResponse.json({ error: "请先登录后再保存模型凭据" }, { status: 401 });
    }

    const body = credentialSchema.parse(await request.json());
    const credential = await upsertCanvasModelCredential({
      ownerId,
      credentialId: body.id,
      name: body.name,
      providerType: body.providerType,
      baseUrl: body.baseUrl,
      apiKey: body.apiKey,
    });

    return NextResponse.json({ credential });
  } catch (error) {
    console.error("[canvas/model-credentials:upsert]", error);
    return NextResponse.json({ error: "模型凭据保存失败" }, { status: 500 });
  }
}
