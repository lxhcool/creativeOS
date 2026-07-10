import { NextResponse } from "next/server";
import {
  getCanvasProject,
  requireCanvasUserOwnerId,
} from "@/lib/canvas-project-store";
import {
  createCanvasTask,
  markCanvasTaskRunning,
} from "@/lib/canvas-task-store";
import {
  type CanvasMemoryTaskPayload,
  canvasMemoryTaskPayloadSchema,
  runCanvasMemoryExtractionTask,
} from "@/lib/canvas-memory-extraction-runner";
import { toCanvasTextGenerationErrorMessage } from "@/app/api/canvas/lib/errors";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

function getTaskType(kind: CanvasMemoryTaskPayload["kind"]): string {
  return kind === "novel_chapter"
    ? "memory_extract:novel_chapter"
    : "memory_extract:text_asset";
}

function toStoredTaskPayload(body: CanvasMemoryTaskPayload) {
  const base = {
    current: body.current,
    sources: body.sources,
    providerCredentialId: body.providerCredentialId,
    provider: {
      id: body.provider.id,
      type: body.provider.type,
      baseUrl: body.provider.baseUrl,
      hasApiKey: Boolean(body.provider.apiKey),
    },
    model: body.model,
    credentialsStored: Boolean(body.providerCredentialId),
  };

  if (body.kind === "novel_chapter") {
    return {
      ...base,
      kind: body.kind,
      chapterId: body.chapterId,
      outlineId: body.outlineId,
      chapterTitle: body.chapterTitle,
    };
  }

  return {
    ...base,
    kind: body.kind,
    assetId: body.assetId,
    assetTitle: body.assetTitle,
  };
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const ownerId = await requireCanvasUserOwnerId();
    if (!ownerId) {
      return NextResponse.json({ error: "请先登录后再整理记忆" }, { status: 401 });
    }

    const project = await getCanvasProject(ownerId, projectId);
    if (!project) {
      return NextResponse.json({ error: "画布项目不存在" }, { status: 404 });
    }

    const body = canvasMemoryTaskPayloadSchema.parse(await request.json());
    if (!body.model.capabilities.includes("text")) {
      return NextResponse.json(
        { error: "请选择文本模型后再整理记忆。" },
        { status: 400 },
      );
    }

    const task = await createCanvasTask({
      ownerId,
      projectId,
      type: getTaskType(body.kind),
      maxAttempts: body.providerCredentialId ? 3 : 1,
      payload: toStoredTaskPayload(body),
    });
    await markCanvasTaskRunning(task.id);

    const result = await runCanvasMemoryExtractionTask({
      taskId: task.id,
      ownerId,
      projectId,
      payload: body,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[canvas/projects/memories/extract]", error);
    return NextResponse.json(
      { error: toCanvasTextGenerationErrorMessage(error) },
      { status: 400 },
    );
  }
}
