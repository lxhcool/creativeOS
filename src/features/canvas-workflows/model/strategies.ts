import {
  createCanvasEdge,
  createTextElement,
} from "@/entities/canvas/lib/factory";
import type {
  CanvasEdge,
  CanvasElement,
  CanvasTextElement,
  CanvasTextRole,
  CanvasWorkflowType,
} from "@/entities/canvas/model/types";
import { findCompletedTextElementByRole } from "./canvas-runtime";
import type {
  CanvasWorkflowAnchorConfig,
  CanvasWorkflowActionContext,
  CanvasWorkflowActionResult,
  CanvasWorkflowAIAssistantConfig,
  CanvasWorkflowConnectionAssessment,
  CanvasWorkflowConnectionContext,
  CanvasWorkflowInitResult,
  CanvasWorkflowGenerationJob,
  CanvasWorkflowStarterConfig,
  CanvasWorkflowStrategy,
  CanvasWorkflowToolbarConfig,
} from "./types";

const COMMON_TEXT_ROLES: CanvasTextRole[] = [
  "general",
  "article",
  "novel_setup",
  "scene",
  "script",
  "storyboard",
  "prompt",
];

const FREE_TOOLBAR: CanvasWorkflowToolbarConfig = {
  textRoles: COMMON_TEXT_ROLES,
  mediaKinds: ["image", "video", "audio"],
  allowImport: true,
};

const NOVEL_LAYOUT = {
  intent: { x: -915, y: -760 },
  foundation: {
    core: { x: -915, y: 0 },
    cast: { x: -305, y: 0 },
    world: { x: 305, y: 0 },
    style: { x: 915, y: 0 },
  },
  outline: { x: -915, y: 560 },
  volumeOutline: { x: -915, y: 1120 },
  chapterOutline: { x: -915, y: 1680 },
  chapterDraft: { x: -915, y: 2240 },
};

function emptyInit(): CanvasWorkflowInitResult {
  return {
    elements: [],
    edges: [],
    viewport: { x: 0, y: 0, scale: 1 },
  };
}

function createAnchors(
  items: Array<[id: string, label: string, textRole: CanvasTextRole]>,
): CanvasWorkflowAnchorConfig {
  return items.map(([id, label, textRole]) => ({ id, label, textRole }));
}

function assistantConfig(params: CanvasWorkflowAIAssistantConfig) {
  return params;
}

function starterConfig(items: CanvasWorkflowStarterConfig[]) {
  return items;
}

function buildWorkflowInputMaterial(command: string): string {
  try {
    const parsed = JSON.parse(command) as {
      kind?: string;
      label?: string;
      keywords?: string;
    };

    if (parsed.kind === "workflow_starter" && parsed.label) {
      return `用户选择：${parsed.label}\n关键词：${parsed.keywords || ""}`.trim();
    }
  } catch {
    // Plain user input is the common path.
  }

  return `用户输入：${command}`;
}

function getWorkflowNextStage(command: string): string | null {
  try {
    const parsed = JSON.parse(command) as {
      kind?: string;
      stage?: string;
    };

    return parsed.kind === "workflow_next" && typeof parsed.stage === "string"
      ? parsed.stage
      : null;
  } catch {
    return null;
  }
}

function buildWorkflowInstruction(params: {
  material: string;
  task: string;
}): string {
  return `${params.material}\n\n任务：${params.task}`;
}

function buildWorkflowSourceMaterial(params: {
  command: string;
  sources: CanvasTextElement[];
}): string {
  const sourceText = params.sources
    .map((source) => {
      const title = source.meta?.title || source.textRole || "材料";
      return `【${title}】\n${source.text}`;
    })
    .join("\n\n");

  return [`用户补充：${params.command}`, sourceText && `已有材料：\n${sourceText}`]
    .filter(Boolean)
    .join("\n\n");
}

function createWorkflowTextNode(params: {
  center: { x: number; y: number };
  offset: { x: number; y: number };
  role: CanvasTextRole;
  title: string;
  material: string;
  prompt: string;
  sequenceNo: number;
}): CanvasTextElement {
  return {
    ...createTextElement(
      {
        x: params.center.x + params.offset.x,
        y: params.center.y + params.offset.y,
      },
      {
        textRole: params.role,
        text: "",
        meta: {
          title: params.title,
          workflowStageId: params.role,
          workflowSequenceNo: params.sequenceNo,
          workflowLocked: true,
        },
      },
    ),
    prompt: buildWorkflowInstruction({
      material: params.material,
      task: params.prompt,
    }),
    status: "generating",
  };
}

function connectWorkflowNodes(
  pairs: Array<[CanvasTextElement, CanvasTextElement]>,
): CanvasEdge[] {
  return pairs.map(([source, target]) =>
    createCanvasEdge({
      sourceId: source.id,
      targetId: target.id,
    }),
  );
}

function createWorkflowGenerationJobs(
  nodes: CanvasTextElement[],
): CanvasWorkflowGenerationJob[] {
  return nodes.map((node) => ({
    elementId: node.id,
    instruction: node.prompt || "",
    resultTextRole: node.textRole,
    generationMode: "single",
    actionId: `workflow_init_${node.textRole || "text"}`,
    actionLabel: node.meta?.title,
    doneMessage: `${node.meta?.title || "当前阶段"}已完成。`,
    silent: true,
  }));
}

function workflowNextCommand(stage: string): string {
  return JSON.stringify({
    kind: "workflow_next",
    workflow: "novel",
    stage,
  });
}

function findTextElementByRole(
  elements: CanvasElement[],
  role: CanvasTextRole,
): CanvasTextElement | undefined {
  return elements
    .filter((element): element is CanvasTextElement => element.kind === "text")
    .toReversed()
    .find((element) => element.textRole === role);
}

function findTextElementsByRole(
  elements: CanvasElement[],
  role: CanvasTextRole,
): CanvasTextElement[] {
  return elements.filter(
    (element): element is CanvasTextElement =>
      element.kind === "text" && element.textRole === role,
  );
}

function isGeneratingWorkflowRole(
  elements: CanvasElement[],
  role: CanvasTextRole,
): boolean {
  return findTextElementByRole(elements, role)?.status === "generating";
}

function buildWorkflowRetryResult(params: {
  elements: CanvasElement[];
  role: CanvasTextRole;
  message: string;
}): CanvasWorkflowActionResult | null {
  const failed = findTextElementByRole(params.elements, params.role);
  if (!failed || failed.status !== "failed") return null;

  return {
    handled: true,
    message: params.message,
    selectedElementId: failed.id,
    generationJobs: createWorkflowGenerationJobs([failed]),
  };
}

function buildNovelFoundationPlan(context: {
  command: string;
  center: { x: number; y: number };
  history: Array<{ role: "user" | "assistant"; content: string }>;
}): {
  elements: CanvasElement[];
  edges: CanvasEdge[];
  generationJobs: CanvasWorkflowGenerationJob[];
  selectedElementId: string;
} {
  const material = buildWorkflowInputMaterial(context.command);
  const nodeSpecs = [
    {
      role: "novel_setup" as const,
      title: "创作意图",
      offset: NOVEL_LAYOUT.intent,
      prompt:
        "整理创作意图：题材、主角、核心爽点、读者期待、连载卖点、风格关键词。不要展开全书大纲。",
    },
  ];
  const nodes = nodeSpecs.slice(0, 1).map((spec, index) =>
    createWorkflowTextNode({
      center: context.center,
      offset: spec.offset,
      role: spec.role,
      title: spec.title,
      material,
      prompt: spec.prompt,
      sequenceNo: index + 1,
    }),
  );
  const setup = nodes[0]!;

  return {
    elements: nodes,
    edges: [],
    generationJobs: createWorkflowGenerationJobs(nodes),
    selectedElementId: setup.id,
  };
}

function buildVideoFoundationPlan(context: {
  command: string;
  center: { x: number; y: number };
  history: Array<{ role: "user" | "assistant"; content: string }>;
}): {
  elements: CanvasElement[];
  edges: CanvasEdge[];
  generationJobs: CanvasWorkflowGenerationJob[];
  selectedElementId: string;
} {
  const material = buildWorkflowInputMaterial(context.command);
  const nodeSpecs = [
    {
      role: "script" as const,
      title: "剧本方向",
      offset: { x: -720, y: -80 },
      prompt:
        "整理视频剧本方向：主题、受众、时长、风格、核心冲突、情绪曲线和结尾记忆点。",
    },
    {
      role: "character_cast" as const,
      title: "角色设计",
      offset: { x: -160, y: -230 },
      prompt:
        "基于剧本方向，生成角色设计：主要人物/出镜对象、外观、动机、表演关键词和视觉辨识点。",
    },
    {
      role: "scene" as const,
      title: "场景设计",
      offset: { x: -160, y: 120 },
      prompt:
        "基于剧本方向，生成场景设计：主要场景、时间、空间调度、道具、光线、色彩和氛围关键词。",
    },
    {
      role: "storyboard" as const,
      title: "分镜",
      offset: { x: 420, y: -60 },
      prompt:
        "综合剧本、角色和场景，生成分镜：镜头顺序、画面内容、运动、景别、时长、旁白/字幕和转场。",
    },
    {
      role: "prompt" as const,
      title: "生成提示词",
      offset: { x: 980, y: -60 },
      prompt:
        "基于分镜生成可用于图像/视频生成的提示词组，按镜头拆分画面提示、风格提示和负面约束。",
    },
  ];
  const nodes = nodeSpecs.slice(0, 1).map((spec, index) =>
    createWorkflowTextNode({
      center: context.center,
      offset: spec.offset,
      role: spec.role,
      title: spec.title,
      material,
      prompt: spec.prompt,
      sequenceNo: index + 1,
    }),
  );
  const script = nodes[0]!;

  return {
    elements: nodes,
    edges: [],
    generationJobs: createWorkflowGenerationJobs(nodes),
    selectedElementId: script.id,
  };
}

function buildImageFoundationPlan(context: {
  command: string;
  center: { x: number; y: number };
  history: Array<{ role: "user" | "assistant"; content: string }>;
}): {
  elements: CanvasElement[];
  edges: CanvasEdge[];
  generationJobs: CanvasWorkflowGenerationJob[];
  selectedElementId: string;
} {
  const material = buildWorkflowInputMaterial(context.command);
  const brief = createWorkflowTextNode({
    center: context.center,
    offset: { x: -360, y: -80 },
    role: "general",
    title: "视觉简报",
    material,
    prompt: "整理视觉简报：用途、主体、风格、构图、情绪、色彩、关键限制。",
    sequenceNo: 1,
  });

  return {
    elements: [brief],
    edges: [],
    generationJobs: createWorkflowGenerationJobs([brief]),
    selectedElementId: brief.id,
  };
}

function getElementCenter(element: CanvasElement): { x: number; y: number } {
  return {
    x: element.x + element.width / 2,
    y: element.y + element.height / 2,
  };
}

function getNovelBaseCenterFromSetup(setup: CanvasElement): { x: number; y: number } {
  const setupCenter = getElementCenter(setup);

  return {
    x: setupCenter.x - NOVEL_LAYOUT.intent.x,
    y: setupCenter.y - NOVEL_LAYOUT.intent.y,
  };
}

function buildNovelNextStagePlan(
  context: CanvasWorkflowActionContext,
): CanvasWorkflowActionResult {
  const setupRetry = buildWorkflowRetryResult({
    elements: context.elements,
    role: "novel_setup",
    message: "重试创作意图。",
  });
  if (setupRetry) return setupRetry;
  if (isGeneratingWorkflowRole(context.elements, "novel_setup")) {
    return { handled: true, message: "创作意图生成中。" };
  }

  const setup = findCompletedTextElementByRole(context.elements, "novel_setup");
  if (!setup) {
    return {
      handled: true,
      message: "先整理创作意图。",
      ...buildNovelFoundationPlan(context),
    };
  }

  const core = findCompletedTextElementByRole(context.elements, "novel_core");
  const cast = findCompletedTextElementByRole(context.elements, "character_cast");
  const world = findCompletedTextElementByRole(context.elements, "novel_world");
  const style = findCompletedTextElementByRole(
    context.elements,
    "novel_style_guide",
  );
  const outline = findCompletedTextElementByRole(context.elements, "novel_outline");
  const volumeOutline = findCompletedTextElementByRole(
    context.elements,
    "novel_volume_outline",
  );
  const chapterOutline = findCompletedTextElementByRole(
    context.elements,
    "novel_chapter_outline",
  );
  const chapterDraft = findCompletedTextElementByRole(
    context.elements,
    "novel_chapter",
  );

  if (!core || !cast || !world || !style) {
    for (const role of [
      "novel_core",
      "character_cast",
      "novel_world",
      "novel_style_guide",
    ] as const) {
      const retry = buildWorkflowRetryResult({
        elements: context.elements,
        role,
        message: "重试当前设定阶段。",
      });
      if (retry) return retry;
    }
    if (
      isGeneratingWorkflowRole(context.elements, "novel_core") ||
      isGeneratingWorkflowRole(context.elements, "character_cast") ||
      isGeneratingWorkflowRole(context.elements, "novel_world") ||
      isGeneratingWorkflowRole(context.elements, "novel_style_guide")
    ) {
      return { handled: true, message: "设定阶段生成中。" };
    }

    const material = buildWorkflowSourceMaterial({
      command: context.command,
      sources: [setup],
    });
    const center = getNovelBaseCenterFromSetup(setup);
    const specs = [
      {
        role: "novel_core" as const,
        title: "故事核心",
        offset: NOVEL_LAYOUT.foundation.core,
        prompt:
          "基于创作意图，生成故事核心：主线目标、核心冲突、反派/阻力、主角成长线、阶段性爽点和长线钩子。",
        exists: core,
      },
      {
        role: "character_cast" as const,
        title: "角色总表",
        offset: NOVEL_LAYOUT.foundation.cast,
        prompt:
          "基于创作意图，生成角色总表：主角、关键配角、对手、关系、欲望、秘密、剧情功能。",
        exists: cast,
      },
      {
        role: "novel_world" as const,
        title: "世界观",
        offset: NOVEL_LAYOUT.foundation.world,
        prompt:
          "基于创作意图，生成世界观：时代/地理/势力、规则、资源、阶层、冲突场和可持续连载的设定接口。",
        exists: world,
      },
      {
        role: "novel_style_guide" as const,
        title: "风格指南",
        offset: NOVEL_LAYOUT.foundation.style,
        prompt:
          "基于创作意图，生成风格指南：叙事口吻、节奏、章节钩子、爽点表达、禁忌和读者预期管理。",
        exists: style,
      },
    ];
    const nodes = specs
      .filter((spec) => !spec.exists)
      .map((spec, index) =>
        createWorkflowTextNode({
          center,
          offset: spec.offset,
          role: spec.role,
          title: spec.title,
          material,
          prompt: spec.prompt,
          sequenceNo: index + 2,
        }),
      );

    return {
      handled: nodes.length > 0,
      message: "进入设定阶段。",
      elements: nodes,
      edges: nodes[1]
        ? connectWorkflowNodes([[setup, nodes[1]]])
        : nodes[0]
          ? connectWorkflowNodes([[setup, nodes[0]]])
          : [],
      generationJobs: createWorkflowGenerationJobs(nodes),
      selectedElementId: nodes[0]?.id,
      completionMessage: "设定阶段完成。下一步：故事线。",
      actions: [
        {
          id: "novel_next_outline",
          label: "生成故事线",
          command: workflowNextCommand("outline"),
        },
      ],
    };
  }

  if (!outline) {
    const retry = buildWorkflowRetryResult({
      elements: context.elements,
      role: "novel_outline",
      message: "重试故事线。",
    });
    if (retry) return retry;
    if (isGeneratingWorkflowRole(context.elements, "novel_outline")) {
      return { handled: true, message: "故事线生成中。" };
    }

    const sources = [core, cast, world, style];
    const material = buildWorkflowSourceMaterial({
      command: context.command,
      sources,
    });
    const center = getNovelBaseCenterFromSetup(setup);
    const outlineNode = createWorkflowTextNode({
      center,
      offset: NOVEL_LAYOUT.outline,
      role: "novel_outline",
      title: "故事线",
      material,
      prompt:
        "综合故事核心、角色总表、世界观和风格指南，生成第一版故事线：开局、推进阶段、关键转折、阶段高潮和后续悬念。",
      sequenceNo: 6,
    });

    return {
      handled: true,
      message: "进入故事线阶段。",
      elements: [outlineNode],
      edges: connectWorkflowNodes([[cast, outlineNode]]),
      generationJobs: createWorkflowGenerationJobs([outlineNode]),
      selectedElementId: outlineNode.id,
      completionMessage: "故事线完成。下一步：分卷、章节或正文。",
      actions: [
        {
          id: "novel_next_volume",
          label: "生成分卷大纲",
          command: workflowNextCommand("volume_outline"),
        },
      ],
    };
  }

  if (!volumeOutline) {
    const retry = buildWorkflowRetryResult({
      elements: context.elements,
      role: "novel_volume_outline",
      message: "重试分卷大纲。",
    });
    if (retry) return retry;
    if (isGeneratingWorkflowRole(context.elements, "novel_volume_outline")) {
      return { handled: true, message: "分卷大纲生成中。" };
    }

    const sources = [outline, core, cast, world, style];
    const material = buildWorkflowSourceMaterial({
      command: context.command,
      sources,
    });
    const center = getNovelBaseCenterFromSetup(setup);
    const volumeNode = createWorkflowTextNode({
      center,
      offset: NOVEL_LAYOUT.volumeOutline,
      role: "novel_volume_outline",
      title: "分卷大纲",
      material,
      prompt:
        "基于故事线生成分卷大纲：每卷主目标、阶段冲突、关键转折、人物变化、卷末高潮和下一卷钩子。",
      sequenceNo: 7,
    });

    return {
      handled: true,
      message: "进入分卷大纲阶段。",
      elements: [volumeNode],
      edges: connectWorkflowNodes([[outline, volumeNode]]),
      generationJobs: createWorkflowGenerationJobs([volumeNode]),
      selectedElementId: volumeNode.id,
      completionMessage: "分卷大纲完成。下一步：章节大纲。",
      actions: [
        {
          id: "novel_next_chapters",
          label: "生成章节大纲",
          command: workflowNextCommand("chapter_outline"),
        },
      ],
    };
  }

  if (!chapterOutline) {
    const retry = buildWorkflowRetryResult({
      elements: context.elements,
      role: "novel_chapter_outline",
      message: "重试章节大纲。",
    });
    if (retry) return retry;
    if (isGeneratingWorkflowRole(context.elements, "novel_chapter_outline")) {
      return { handled: true, message: "章节大纲生成中。" };
    }

    const sources = [outline, volumeOutline, core, cast, world, style];
    const material = buildWorkflowSourceMaterial({
      command: context.command,
      sources,
    });
    const center = getNovelBaseCenterFromSetup(setup);
    const chapterOutlineNode = createWorkflowTextNode({
      center,
      offset: NOVEL_LAYOUT.chapterOutline,
      role: "novel_chapter_outline",
      title: "章节大纲",
      material,
      prompt:
        "基于分卷大纲生成第一组章节大纲：章节序号、章节目标、主要冲突、出场人物、场景推进、爽点和章末钩子。",
      sequenceNo: 8,
    });

    return {
      handled: true,
      message: "进入章节大纲阶段。",
      elements: [chapterOutlineNode],
      edges: connectWorkflowNodes([[volumeOutline, chapterOutlineNode]]),
      generationJobs: createWorkflowGenerationJobs([chapterOutlineNode]),
      selectedElementId: chapterOutlineNode.id,
      completionMessage: "章节大纲完成。下一步：正文。",
      actions: [
        {
          id: "novel_next_draft",
          label: "生成正文",
          command: workflowNextCommand("draft"),
        },
      ],
    };
  }

  if (!chapterDraft) {
    const retry = buildWorkflowRetryResult({
      elements: context.elements,
      role: "novel_chapter",
      message: "重试正文。",
    });
    if (retry) return retry;
    if (isGeneratingWorkflowRole(context.elements, "novel_chapter")) {
      return { handled: true, message: "正文生成中。" };
    }

    const sources = [chapterOutline, outline, volumeOutline, core, cast, world, style];
    const material = buildWorkflowSourceMaterial({
      command: context.command,
      sources,
    });
    const center = getNovelBaseCenterFromSetup(setup);
    const chapterNode = createWorkflowTextNode({
      center,
      offset: NOVEL_LAYOUT.chapterDraft,
      role: "novel_chapter",
      title: "章节正文",
      material,
      prompt:
        "基于章节大纲生成第一章正文：保留章节目标、冲突和章末钩子，写出完整叙事场景、动作、对白、心理和节奏推进。",
      sequenceNo: 9,
    });

    return {
      handled: true,
      message: "进入正文阶段。",
      elements: [chapterNode],
      edges: connectWorkflowNodes([[chapterOutline, chapterNode]]),
      generationJobs: createWorkflowGenerationJobs([chapterNode]),
      selectedElementId: chapterNode.id,
      completionMessage: "正文完成。可以继续扩写下一章或调整设定。",
      actions: [
        {
          id: "novel_next_chapter",
          label: "继续下一章",
          command: workflowNextCommand("next_chapter"),
        },
      ],
    };
  }

  if (getWorkflowNextStage(context.command) === "next_chapter") {
    const chapterDrafts = findTextElementsByRole(context.elements, "novel_chapter")
      .filter((element) => element.text.trim())
      .sort(
        (a, b) =>
          (a.meta?.chapterNo || a.meta?.workflowSequenceNo || 0) -
          (b.meta?.chapterNo || b.meta?.workflowSequenceNo || 0),
      );
    const previousChapter = chapterDrafts.at(-1) || chapterDraft;
    const nextChapterNo = (previousChapter.meta?.chapterNo || chapterDrafts.length || 1) + 1;
    const baseCenter = getNovelBaseCenterFromSetup(setup);
    const nextChapterNode = createWorkflowTextNode({
      center: baseCenter,
      offset: {
        x: NOVEL_LAYOUT.chapterDraft.x,
        y: NOVEL_LAYOUT.chapterDraft.y + (nextChapterNo - 1) * 560,
      },
      role: "novel_chapter",
      title: `第 ${nextChapterNo} 章正文`,
      material: buildWorkflowSourceMaterial({
        command: context.command,
        sources: [previousChapter, chapterOutline, outline, volumeOutline, cast, world],
      }),
      prompt:
        "基于上一章正文、章节大纲和已有设定，继续生成下一章正文：承接上一章钩子，推进一个明确事件，保留人物动机和章末悬念。",
      sequenceNo: 8 + nextChapterNo,
    });

    nextChapterNode.meta = {
      ...(nextChapterNode.meta || {}),
      chapterNo: nextChapterNo,
    };

    return {
      handled: true,
      message: `进入第 ${nextChapterNo} 章。`,
      elements: [nextChapterNode],
      edges: connectWorkflowNodes([[previousChapter, nextChapterNode]]),
      generationJobs: createWorkflowGenerationJobs([nextChapterNode]),
      selectedElementId: nextChapterNode.id,
      completionMessage: `第 ${nextChapterNo} 章完成。`,
      actions: [
        {
          id: `novel_next_chapter_${nextChapterNo + 1}`,
          label: "继续下一章",
          command: workflowNextCommand("next_chapter"),
        },
      ],
    };
  }

  return {
    handled: true,
    message: "正文已完成。可以继续下一章，或补充修改要求。",
    actions: [
      {
        id: "novel_next_chapter",
        label: "继续下一章",
        command: workflowNextCommand("next_chapter"),
      },
    ],
  };
}

function buildVideoNextStagePlan(
  context: CanvasWorkflowActionContext,
): CanvasWorkflowActionResult {
  const scriptRetry = buildWorkflowRetryResult({
    elements: context.elements,
    role: "script",
    message: "重试剧本方向。",
  });
  if (scriptRetry) return scriptRetry;
  if (isGeneratingWorkflowRole(context.elements, "script")) {
    return { handled: true, message: "剧本方向生成中。" };
  }

  const script = findCompletedTextElementByRole(context.elements, "script");
  if (!script) {
    return {
      handled: true,
      message: "先整理剧本方向。",
      ...buildVideoFoundationPlan(context),
    };
  }

  const cast = findCompletedTextElementByRole(context.elements, "character_cast");
  const scene = findCompletedTextElementByRole(context.elements, "scene");
  const storyboard = findCompletedTextElementByRole(context.elements, "storyboard");
  const prompt = findCompletedTextElementByRole(context.elements, "prompt");

  if (!cast || !scene) {
    for (const role of ["character_cast", "scene"] as const) {
      const retry = buildWorkflowRetryResult({
        elements: context.elements,
        role,
        message: "重试当前设计阶段。",
      });
      if (retry) return retry;
    }
    if (
      isGeneratingWorkflowRole(context.elements, "character_cast") ||
      isGeneratingWorkflowRole(context.elements, "scene")
    ) {
      return { handled: true, message: "设计阶段生成中。" };
    }

    const material = buildWorkflowSourceMaterial({
      command: context.command,
      sources: [script],
    });
    const center = getElementCenter(script);
    const specs = [
      {
        role: "character_cast" as const,
        title: "角色设计",
        offset: { x: 560, y: -180 },
        prompt:
          "基于剧本方向，生成角色设计：主要人物/出镜对象、外观、动机、表演关键词和视觉辨识点。",
        exists: cast,
      },
      {
        role: "scene" as const,
        title: "场景设计",
        offset: { x: 560, y: 180 },
        prompt:
          "基于剧本方向，生成场景设计：主要场景、时间、空间调度、道具、光线、色彩和氛围关键词。",
        exists: scene,
      },
    ];
    const nodes = specs
      .filter((spec) => !spec.exists)
      .map((spec, index) =>
        createWorkflowTextNode({
          center,
          offset: spec.offset,
          role: spec.role,
          title: spec.title,
          material,
          prompt: spec.prompt,
          sequenceNo: index + 2,
        }),
      );

    return {
      handled: nodes.length > 0,
      message: "进入设计阶段。",
      elements: nodes,
      edges: connectWorkflowNodes(nodes.map((node) => [script, node])),
      generationJobs: createWorkflowGenerationJobs(nodes),
      selectedElementId: nodes[0]?.id,
      completionMessage: "设计阶段完成。下一步：分镜。",
    };
  }

  if (!storyboard) {
    const retry = buildWorkflowRetryResult({
      elements: context.elements,
      role: "storyboard",
      message: "重试分镜。",
    });
    if (retry) return retry;
    if (isGeneratingWorkflowRole(context.elements, "storyboard")) {
      return { handled: true, message: "分镜生成中。" };
    }

    const sources = [cast, scene];
    const material = buildWorkflowSourceMaterial({
      command: context.command,
      sources: [script, ...sources],
    });
    const center = getElementCenter(scene);
    const storyboardNode = createWorkflowTextNode({
      center,
      offset: { x: 580, y: -180 },
      role: "storyboard",
      title: "分镜",
      material,
      prompt:
        "综合剧本、角色和场景，生成分镜：镜头顺序、画面内容、运动、景别、时长、旁白/字幕和转场。",
      sequenceNo: 4,
    });

    return {
      handled: true,
      message: "进入分镜阶段。",
      elements: [storyboardNode],
      edges: connectWorkflowNodes(sources.map((source) => [source, storyboardNode])),
      generationJobs: createWorkflowGenerationJobs([storyboardNode]),
      selectedElementId: storyboardNode.id,
      completionMessage: "分镜完成。下一步：生成提示词。",
    };
  }

  if (!prompt) {
    const retry = buildWorkflowRetryResult({
      elements: context.elements,
      role: "prompt",
      message: "重试提示词。",
    });
    if (retry) return retry;
    if (isGeneratingWorkflowRole(context.elements, "prompt")) {
      return { handled: true, message: "提示词生成中。" };
    }

    const material = buildWorkflowSourceMaterial({
      command: context.command,
      sources: [script, cast, scene, storyboard],
    });
    const center = getElementCenter(storyboard);
    const promptNode = createWorkflowTextNode({
      center,
      offset: { x: 580, y: 0 },
      role: "prompt",
      title: "生成提示词",
      material,
      prompt:
        "基于分镜生成可用于图像/视频生成的提示词组，按镜头拆分画面提示、风格提示和负面约束。",
      sequenceNo: 5,
    });

    return {
      handled: true,
      message: "进入提示词阶段。",
      elements: [promptNode],
      edges: connectWorkflowNodes([[storyboard, promptNode]]),
      generationJobs: createWorkflowGenerationJobs([promptNode]),
      selectedElementId: promptNode.id,
      completionMessage: "提示词完成。下一步：生成画面或视频。",
    };
  }

  return { handled: false };
}

function buildImageNextStagePlan(
  context: CanvasWorkflowActionContext,
): CanvasWorkflowActionResult {
  const briefRetry = buildWorkflowRetryResult({
    elements: context.elements,
    role: "general",
    message: "重试视觉简报。",
  });
  if (briefRetry) return briefRetry;
  if (isGeneratingWorkflowRole(context.elements, "general")) {
    return { handled: true, message: "视觉简报生成中。" };
  }

  const brief = findCompletedTextElementByRole(context.elements, "general");
  const prompt = findCompletedTextElementByRole(context.elements, "prompt");
  if (!brief) {
    return {
      handled: true,
      message: "先整理视觉简报。",
      ...buildImageFoundationPlan(context),
    };
  }
  if (prompt) return { handled: false };

  const promptRetry = buildWorkflowRetryResult({
    elements: context.elements,
    role: "prompt",
    message: "重试提示词。",
  });
  if (promptRetry) return promptRetry;
  if (isGeneratingWorkflowRole(context.elements, "prompt")) {
    return { handled: true, message: "提示词生成中。" };
  }

  const material = buildWorkflowSourceMaterial({
    command: context.command,
    sources: [brief],
  });
  const center = getElementCenter(brief);
  const promptNode = createWorkflowTextNode({
    center,
    offset: { x: 580, y: 0 },
    role: "prompt",
    title: "生成提示词",
    material,
    prompt:
      "基于视觉简报生成图片提示词：主体、环境、镜头、材质、光线、风格和负面约束。",
    sequenceNo: 2,
  });

  return {
    handled: true,
    message: "进入提示词阶段。",
    elements: [promptNode],
    edges: connectWorkflowNodes([[brief, promptNode]]),
    generationJobs: createWorkflowGenerationJobs([promptNode]),
    selectedElementId: promptNode.id,
    completionMessage: "提示词完成。下一步：生成图片。",
  };
}

function getElementRole(element: CanvasWorkflowConnectionContext["source"]) {
  return element.kind === "text" ? element.textRole || "general" : element.kind;
}

function getConnectionAssessment(params: {
  context: CanvasWorkflowConnectionContext;
  allowed: Array<[CanvasTextRole | string, CanvasTextRole | string]>;
  positiveMessage: string;
  noticeMessage: string;
}): CanvasWorkflowConnectionAssessment {
  const sourceRole = getElementRole(params.context.source);
  const targetRole = getElementRole(params.context.target);
  const matched = params.allowed.some(
    ([source, target]) => source === sourceRole && target === targetRole,
  );

  if (matched) {
    return {
      tone: "positive",
      message: params.positiveMessage,
    };
  }

  return {
    tone: "notice",
    message: params.noticeMessage,
  };
}

const freeStrategy: CanvasWorkflowStrategy = {
  type: "free",
  label: "自由创作",
  description: "开放创作",
  initNodes: emptyInit,
  getToolbarConfig: () => FREE_TOOLBAR,
  getAnchorConfig: () => [],
  getAIAssistantConfig: () =>
    assistantConfig({
      title: "画布大脑",
      subtitle: "统筹素材、关系和生成任务",
      placeholder: "描述目标，我来协调画布素材和生成任务",
      initialMessage:
        "我是画布大脑。可以选择素材、协调上下文，并把你的意图转成画布操作。",
      workingMessage: "我正在整理画布上下文，看看哪些素材最适合参与这次生成...",
      defaultOpen: false,
    }),
  getStarterConfig: () => [],
  assessConnection: () => null,
  handleWorkflowAction: () => ({ handled: false }),
};

const novelStrategy: CanvasWorkflowStrategy = {
  type: "novel",
  label: "小说创作",
  description: "长篇故事",
  initNodes: emptyInit,
  getToolbarConfig: () => ({
    textRoles: ["general", "novel_setup"],
    mediaKinds: [],
    allowImport: true,
  }),
  getAnchorConfig: () =>
    createAnchors([
      ["overview", "总览", "novel_setup"],
      ["foundation", "设定", "novel_core"],
      ["characters", "角色", "character_cast"],
      ["outline", "大纲", "novel_outline"],
      ["chapters", "正文", "novel_chapter"],
    ]),
  getAIAssistantConfig: () =>
    assistantConfig({
      title: "小说工作流",
      subtitle: "设定、大纲、正文调度",
      placeholder: "说说你的小说想法",
      initialMessage: "说说你的小说想法。题材、主角、爽点、风格都可以。",
      workingMessage: "主编构思中，设定组和写手已就位...",
      defaultOpen: true,
    }),
  getStarterConfig: () =>
    starterConfig([
      {
        id: "fantasy",
        label: "玄幻小说",
        description: "升级、宗门、秘境、强者体系",
        intent: "novel.genre.fantasy",
      },
      {
        id: "urban",
        label: "都市小说",
        description: "现实逆袭、职业、情感、商业",
        intent: "novel.genre.urban",
      },
      {
        id: "suspense",
        label: "悬疑小说",
        description: "案件、秘密、反转、心理博弈",
        intent: "novel.genre.suspense",
      },
      {
        id: "xianxia",
        label: "仙侠小说",
        description: "修行、因果、门派、长线宿命",
        intent: "novel.genre.xianxia",
      },
      {
        id: "scifi",
        label: "科幻小说",
        description: "技术、文明、危机、未来社会",
        intent: "novel.genre.scifi",
      },
    ]),
  assessConnection: (context) =>
    getConnectionAssessment({
      context,
      allowed: [
        ["novel_setup", "novel_core"],
        ["novel_setup", "character_cast"],
        ["novel_setup", "novel_world"],
        ["novel_setup", "novel_style_guide"],
        ["novel_core", "novel_outline"],
        ["character_cast", "novel_outline"],
        ["novel_world", "novel_outline"],
        ["novel_outline", "novel_volume_outline"],
        ["novel_volume_outline", "novel_chapter_outline"],
        ["novel_chapter_outline", "novel_chapter"],
      ],
      positiveMessage:
        "连线合理。已作为上游材料关系记录。",
      noticeMessage:
        "连线已记录。它更像补充参考，不是标准阶段依赖。",
    }),
  handleWorkflowAction: (context) => {
    if (context.elements.length > 0) return buildNovelNextStagePlan(context);
    const plan = buildNovelFoundationPlan(context);

    return {
      handled: true,
      message: "先整理创作意图。",
      ...plan,
      completionMessage: "创作意图完成。下一步：故事核心、角色、世界观和风格。",
      actions: [
        {
          id: "novel_next_foundation",
          label: "生成设定组",
          command: workflowNextCommand("foundation"),
        },
      ],
    };
  },
};

const videoStrategy: CanvasWorkflowStrategy = {
  type: "video",
  label: "视频创作",
  description: "短片视频",
  initNodes: emptyInit,
  getToolbarConfig: () => ({
    textRoles: ["script", "character_cast", "scene", "storyboard", "prompt"],
    mediaKinds: ["image", "video", "audio"],
    allowImport: true,
  }),
  getAnchorConfig: () =>
    createAnchors([
      ["overview", "总览", "script"],
      ["script", "剧本", "script"],
      ["characters", "角色", "character_cast"],
      ["scenes", "场景", "scene"],
      ["storyboard", "分镜", "storyboard"],
    ]),
  getAIAssistantConfig: () =>
    assistantConfig({
      title: "视频工作流",
      subtitle: "剧本、角色、场景、分镜调度",
      placeholder: "说说你的视频想法",
      initialMessage: "说说你的视频想法。主题、风格、时长、受众都可以。",
      workingMessage: "编剧正在找冲突点，角色设计师已经开始翻衣柜，场景设计师在搭第一盏灯...",
      defaultOpen: true,
    }),
  getStarterConfig: () =>
    starterConfig([
      {
        id: "story-ad",
        label: "剧情短片",
        description: "人物、冲突、反转",
        intent: "video.type.story",
      },
      {
        id: "product-ad",
        label: "商品广告",
        description: "卖点、场景、转化",
        intent: "video.type.product_ad",
      },
      {
        id: "knowledge",
        label: "知识视频",
        description: "选题、结构、表达",
        intent: "video.type.knowledge",
      },
      {
        id: "music-video",
        label: "氛围短片",
        description: "情绪、画面、节奏",
        intent: "video.type.mood",
      },
    ]),
  assessConnection: (context) =>
    getConnectionAssessment({
      context,
      allowed: [
        ["script", "character_cast"],
        ["script", "scene"],
        ["character_cast", "storyboard"],
        ["character", "storyboard"],
        ["scene", "storyboard"],
        ["storyboard", "prompt"],
        ["prompt", "image"],
        ["prompt", "video"],
      ],
      positiveMessage:
        "连线顺畅。已作为上游交付关系记录。",
      noticeMessage:
        "连线有点跳步。先保留，后续可能需要补中间阶段。",
    }),
  handleWorkflowAction: (context) => {
    if (context.elements.length > 0) return buildVideoNextStagePlan(context);
    const plan = buildVideoFoundationPlan(context);

    return {
      handled: true,
      message: "先整理剧本方向。",
      ...plan,
      completionMessage: "剧本方向完成。下一步：角色和场景。",
    };
  },
};

const imageStrategy: CanvasWorkflowStrategy = {
  type: "image",
  label: "图片创作",
  description: "视觉生成",
  initNodes: emptyInit,
  getToolbarConfig: () => ({
    textRoles: ["general", "prompt"],
    mediaKinds: ["image"],
    allowImport: true,
  }),
  getAnchorConfig: () =>
    createAnchors([
      ["overview", "总览", "general"],
      ["brief", "简报", "general"],
      ["prompt", "Prompt", "prompt"],
    ]),
  getAIAssistantConfig: () =>
    assistantConfig({
      title: "图片工作流",
      subtitle: "简报、提示词、图片生成",
      placeholder: "说说你的图片想法",
      initialMessage: "说说你的图片想法。主题、风格、用途、参考要求都可以。",
      workingMessage: "创意策划正在抓关键词，提示词工程师正在把画面拧成可生成的句子...",
      defaultOpen: true,
    }),
  getStarterConfig: () =>
    starterConfig([
      {
        id: "poster",
        label: "海报",
        description: "主题、构图、视觉冲击",
        intent: "image.type.poster",
      },
      {
        id: "character",
        label: "角色图",
        description: "人设、服装、姿态",
        intent: "image.type.character",
      },
      {
        id: "product",
        label: "商品图",
        description: "质感、场景、卖点",
        intent: "image.type.product",
      },
      {
        id: "scene",
        label: "场景概念",
        description: "空间、氛围、光影",
        intent: "image.type.scene",
      },
    ]),
  assessConnection: (context) =>
    getConnectionAssessment({
      context,
      allowed: [
        ["general", "prompt"],
        ["image", "prompt"],
        ["prompt", "image"],
      ],
      positiveMessage:
        "连线合理。已作为创意、参考或生成目标关系记录。",
      noticeMessage:
        "连线已记录。它不像标准图片链路，后续可能需要补简报或 Prompt。",
    }),
  handleWorkflowAction: (context) => {
    if (context.elements.length > 0) return buildImageNextStagePlan(context);
    const plan = buildImageFoundationPlan(context);

    return {
      handled: true,
      message: "先整理视觉简报。",
      ...plan,
      completionMessage: "视觉简报完成。下一步：生成提示词。",
    };
  },
};

export const CANVAS_WORKFLOW_STRATEGIES: Record<
  CanvasWorkflowType,
  CanvasWorkflowStrategy
> = {
  free: freeStrategy,
  novel: novelStrategy,
  video: videoStrategy,
  image: imageStrategy,
};

export const CANVAS_WORKFLOW_OPTIONS = Object.values(CANVAS_WORKFLOW_STRATEGIES).map(
  (strategy) => ({
    type: strategy.type,
    label: strategy.label,
    description: strategy.description,
  }),
);

export function getCanvasWorkflowStrategy(
  type?: CanvasWorkflowType,
): CanvasWorkflowStrategy {
  return CANVAS_WORKFLOW_STRATEGIES[type || "free"] || freeStrategy;
}
