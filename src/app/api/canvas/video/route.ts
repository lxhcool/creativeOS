import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isDataUrl,
  persistCanvasDataUrlAsset,
} from "@/lib/canvas-asset-storage";
import { createCanvasAssetFileRecord } from "@/lib/canvas-asset-file-store";
import { getSession } from "@/lib/session-store";
import { ModelGateway } from "@/services/model/gateway";
import type { VideoOutput } from "@/services/model/types";
import { toCanvasGenerationErrorMessage } from "../lib/errors";
import {
  buildSingleModelGatewayConfig,
  canvasProviderSchema,
  canvasVideoModelSchema,
} from "../lib/modelRequest";

const requestSchema = z.object({
  prompt: z.string().min(1),
  projectId: z.string().optional(),
  provider: canvasProviderSchema,
  model: canvasVideoModelSchema,
});

async function persistGeneratedVideoIfNeeded(
  result: VideoOutput,
  projectId?: string | null,
): Promise<VideoOutput> {
  if (!isDataUrl(result.src)) return result;

  const session = await getSession();
  if (!session) return result;

  const stored = await persistCanvasDataUrlAsset({
    dataUrl: result.src,
    userId: session.userId,
    fallbackMimeType: result.mimeType,
  });
  await createCanvasAssetFileRecord({
    ownerId: `user:${session.userId}`,
    projectId,
    url: stored.url,
    storageKey: stored.storageKey,
    kind: "video",
    mimeType: stored.mimeType,
    size: stored.size,
  });

  return {
    ...result,
    src: stored.url,
    mimeType: stored.mimeType,
    metadata: {
      ...(result.metadata || {}),
      storedAs: "local_file",
    },
  };
}

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const gateway = new ModelGateway(buildSingleModelGatewayConfig({
      task: "canvas_video",
      provider: body.provider,
      model: body.model,
    }));
    const result = await gateway.generateVideo({
      task: "canvas_video",
      prompt: body.prompt,
    });

    return NextResponse.json(await persistGeneratedVideoIfNeeded(result, body.projectId));
  } catch (error) {
    const message = toCanvasGenerationErrorMessage(error, "video");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
