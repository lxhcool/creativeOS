import { NextResponse } from "next/server";
import { z } from "zod";
import { ModelGateway } from "@/services/model/gateway";
import { toCanvasTextGenerationErrorMessage } from "../lib/errors";
import {
  buildSingleModelGatewayConfig,
  canvasProviderSchema,
  canvasTextModelSchema,
} from "../lib/modelRequest";
import {
  listCanvasMemoriesForPlan,
  type CanvasMemoryRecord,
} from "@/lib/canvas-memory-store";
import { getCanvasOwnerId } from "@/lib/canvas-project-store";

const sourceSchema = z.object({
  kind: z.string(),
  text: z.string().optional(),
  prompt: z.string().optional(),
  label: z.string().optional(),
});

const requestSchema = z.object({
  prompt: z.string().min(1),
  current: sourceSchema.optional(),
  projectId: z.string().optional(),
  provider: canvasProviderSchema,
  model: canvasTextModelSchema,
  sources: z.array(sourceSchema).default([]),
});

function summarizeMemoryContent(content: unknown): string {
  if (!content || typeof content !== "object") return "";

  const value = content as {
    title?: string;
    text?: string;
    summary?: string;
    items?: Array<{
      title?: string;
      kind?: string;
      assetType?: string;
      assetStatus?: string;
      excerpt?: string;
    }>;
  };

  if (typeof value.text === "string") {
    return [
      value.title ? `标题=${value.title}` : "",
      value.text.slice(0, 1400),
    ].filter(Boolean).join("\n");
  }

  if (typeof value.summary === "string") return value.summary.slice(0, 1200);

  if (Array.isArray(value.items)) {
    return value.items
      .slice(0, 18)
      .map((item, index) =>
        [
          `${index + 1}. ${item.title || "未命名"}`,
          item.kind ? `kind=${item.kind}` : "",
          item.assetType ? `asset=${item.assetType}` : "",
          item.assetStatus ? `status=${item.assetStatus}` : "",
          item.excerpt ? `内容=${item.excerpt}` : "",
        ]
          .filter(Boolean)
          .join(" | "),
      )
      .join("\n");
  }

  return JSON.stringify(content).slice(0, 1200);
}

function buildMemoryText(memories: CanvasMemoryRecord[]): string {
  return memories
    .map((memory, index) =>
      [
        `${index + 1}. ${memory.title}`,
        `type=${memory.type}`,
        summarizeMemoryContent(memory.content),
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

function buildPrompt(params: z.infer<typeof requestSchema> & {
  memories: CanvasMemoryRecord[];
}): string {
  const currentContent = params.current
    ? params.current.text || params.current.prompt || params.current.label || ""
    : "";
  const sourceText = params.sources
    .map((source, index) => {
      const content = source.text || source.prompt || source.label || "";
      return `${index + 1}. [${source.kind}] ${content}`;
    })
    .filter((line) => line.trim().length > 0)
      .join("\n");
  const memoryText = buildMemoryText(params.memories);

  return [
    "你正在为 CreativeOS 自由画布生成一个文本节点的正文结果。",
    "请严格执行用户指令，并结合当前节点内容和上游输入节点。",
    "输出应该是可以直接放进画布文本节点的正文，不要解释你的处理过程，不要写“以下是”。",
    "默认输出语言必须是中文。即使当前节点或上游节点是英文，也要转换为自然、可直接使用的中文结果；只有用户明确要求英文时才输出英文。",
    "如果指令是润色、改写、纠错或翻译，尽量保留原有信息结构；如果指令是剧本、小说、分镜、角色、Prompt 等创作任务，则输出结构清晰的创作素材。",
    "项目记忆只作为长期上下文和一致性参考，不要机械复述记忆内容；如果与用户当前指令冲突，优先执行用户当前指令。",
    currentContent ? `当前选中节点内容：\n${currentContent}` : "",
    sourceText ? `上游输入节点：\n${sourceText}` : "",
    memoryText ? `项目记忆：\n${memoryText}` : "",
    `用户指令：\n${params.prompt}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    if (!body.model.capabilities.includes("text")) {
      return NextResponse.json(
        { error: "请选择文本模型后再发送。" },
        { status: 400 },
      );
    }

    const gateway = new ModelGateway(buildSingleModelGatewayConfig({
      task: "canvas_text",
      provider: body.provider,
      model: body.model,
    }));
    const ownerId = await getCanvasOwnerId();
    const memories = await listCanvasMemoriesForPlan({
      ownerId,
      projectId: body.projectId || null,
      query: [
        body.prompt,
        body.current?.text,
        body.current?.prompt,
        body.current?.label,
      ]
        .filter(Boolean)
        .join("\n"),
    });
    const result = await gateway.chat({
      task: "canvas_text",
      messages: [
        {
          role: "system",
          content:
            "你是 CreativeOS 画布里的文本创作助手。你擅长续写、润色、扩写、摘要、标题、剧本、小说、分镜、角色设定和生成提示词。输出必须可直接放回画布文本节点，默认中文，不要解释过程。",
        },
        {
          role: "user",
          content: buildPrompt({ ...body, memories }),
        },
      ],
      temperature: 0.7,
      maxTokens: body.model.maxOutputTokens
        ? Math.min(body.model.maxOutputTokens, 4096)
        : 2048,
    });

    return NextResponse.json({
      content: result.content.trim(),
      modelId: result.modelId,
      providerId: result.providerId,
    });
  } catch (error) {
    const message = toCanvasTextGenerationErrorMessage(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
