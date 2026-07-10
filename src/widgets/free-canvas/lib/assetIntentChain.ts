import {
  createCanvasEdge,
  createImageElement,
  createMediaElement,
  createTextElement,
} from "@/entities/canvas/lib/factory";
import { withCanvasAssetMeta } from "@/entities/canvas/lib/assets";
import type {
  CanvasEdge,
  CanvasElement,
  CanvasImageElement,
  CanvasMediaElement,
  CanvasTextRole,
  CanvasTextElement,
} from "@/entities/canvas/model/types";
import {
  executeCanvasBrainMediaGeneration,
  getCanvasBrainFailureMessage,
  getCanvasReferenceImageUrls,
  requestCanvasProjectMemoryExtraction,
  requestCanvasTextGeneration,
  toTextGenerationSource,
  type CanvasModelEntry,
} from "@/features/canvas-brain";
import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  NODE_PADDING,
} from "../model/constants";
import type { CanvasSnapshot } from "../model/types";

type Position = {
  x: number;
  y: number;
};

type CanvasCommitInput =
  | { elements?: CanvasElement[]; edges?: CanvasEdge[] }
  | ((current: CanvasSnapshot) => { elements?: CanvasElement[]; edges?: CanvasEdge[] });

type StructuredTextAssetChain = {
  kind: "article" | "character" | "script" | "storyboard";
  startMessage: string;
  middleTitle: string;
  middleRole: CanvasTextRole;
  middlePrompt: string[];
  finalTitle: string;
  finalRole: CanvasTextRole;
  finalPrompt: string[];
};

type StructuredTextAssetWorkflow = StructuredTextAssetChain["kind"];

function getConsistencySourceElements(elements: CanvasElement[]): CanvasTextElement[] {
  return elements
    .filter((element): element is CanvasTextElement =>
      element.kind === "text" && element.text.trim().length > 0,
    )
    .filter((element) => {
      const title = element.meta?.title || "";
      const role = element.textRole || "";
      return (
        Boolean(element.asset) ||
        /小说|作品|世界观|角色|人物|大纲|章节|正文|连续|伏笔|设定/.test(title) ||
        ["article", "character_cast", "character", "scene", "script"].includes(role)
      );
    })
    .slice(-18);
}

function getNovelContinuitySourceElements(elements: CanvasElement[]): CanvasTextElement[] {
  const sourceTitlePattern =
    /作品圣经|角色状态表|伏笔台账|主线大纲|世界观|角色种子|作品定位|章节事件|连续性|设定/;

  return elements
    .filter((element): element is CanvasTextElement =>
      element.kind === "text" && element.text.trim().length > 0,
    )
    .filter((element) => {
      const title = element.meta?.title || element.asset?.title || "";
      const role = element.textRole || "";
      return (
        sourceTitlePattern.test(title) ||
        ["character_cast", "character", "character_relation", "scene"].includes(role)
      );
    })
    .slice(-12);
}

function getNovelMergeSourceElements(elements: CanvasElement[]): CanvasTextElement[] {
  const sourceTitlePattern =
    /作品圣经|角色状态表|伏笔台账|章节事件摘要|角色状态更新|伏笔更新|主线大纲|连续性|章节事件/;

  return elements
    .filter((element): element is CanvasTextElement =>
      element.kind === "text" && element.text.trim().length > 0,
    )
    .filter((element) => {
      const title = element.meta?.title || element.asset?.title || "";
      const role = element.textRole || "";
      return (
        sourceTitlePattern.test(title) ||
        ["character_relation", "character_cast", "scene"].includes(role)
      );
    })
    .slice(-18);
}

function getStructuredTextAssetChain(
  command: string,
  workflow?: StructuredTextAssetWorkflow,
): StructuredTextAssetChain {
  if (workflow === "character" || /角色|人物|人设|character/i.test(command)) {
    return {
      kind: "character",
      startMessage: "判断为角色资产，先整理角色简报。",
      middleTitle: "角色简报",
      middleRole: "character",
      middlePrompt: [
        "把用户的角色创作需求整理成角色简报。",
        "要求：只输出可执行素材；包含身份、目标、弱点、欲望、秘密、关系、冲突和剧情功能。",
        `用户需求：${command}`,
      ],
      finalTitle: "角色卡",
      finalRole: "character",
      finalPrompt: [
        "基于角色简报生成可直接使用的角色卡。",
        "要求：结构清晰；包含基础信息、外在表现、内在动机、关键关系、可用桥段和创作注意事项。",
      ],
    };
  }

  if (workflow === "script" || /剧本|脚本|对白|script/i.test(command)) {
    return {
      kind: "script",
      startMessage: "判断为剧本资产，先整理剧本结构。",
      middleTitle: "剧本结构",
      middleRole: "script",
      middlePrompt: [
        "把用户的剧本创作需求整理成剧本结构。",
        "要求：包含主题、人物、场景、冲突、节奏、关键转折和结尾效果。",
        `用户需求：${command}`,
      ],
      finalTitle: "剧本正文",
      finalRole: "script",
      finalPrompt: [
        "基于剧本结构生成可直接使用的剧本正文。",
        "要求：包含场景、动作、对白；节奏明确；不要解释创作过程。",
      ],
    };
  }

  if (workflow === "storyboard" || /分镜|镜头|storyboard/i.test(command)) {
    return {
      kind: "storyboard",
      startMessage: "判断为分镜资产，先整理分镜方案。",
      middleTitle: "分镜方案",
      middleRole: "storyboard",
      middlePrompt: [
        "把用户的视频或画面需求整理成分镜方案。",
        "要求：包含镜头目标、画面内容、景别、运动、时长、声音和转场。",
        `用户需求：${command}`,
      ],
      finalTitle: "分镜表",
      finalRole: "storyboard",
      finalPrompt: [
        "基于分镜方案生成可直接使用的分镜表。",
        "要求：按镜头编号输出；每个镜头包含画面、动作、镜头、声音、时长和备注。",
      ],
    };
  }

  return {
    kind: "article",
    startMessage: "判断为文章资产，先整理文章大纲。",
    middleTitle: "文章大纲",
    middleRole: "article",
    middlePrompt: [
      "把用户的文章创作需求整理成文章大纲。",
      "要求：包含核心观点、目标读者、结构层次、关键论据和表达风格。",
      `用户需求：${command}`,
    ],
    finalTitle: "文章正文",
    finalRole: "article",
    finalPrompt: [
      "基于文章大纲生成可直接使用的文章正文。",
      "要求：中文输出；结构完整；观点清晰；不要解释创作过程。",
    ],
  };
}

function mergeCanvasElements(
  currentElements: CanvasElement[],
  nextElements: CanvasElement[],
): CanvasElement[] {
  const byId = new Map(currentElements.map((element) => [element.id, element]));
  nextElements.forEach((element) => byId.set(element.id, element));
  return Array.from(byId.values());
}

function mergeCanvasEdges(
  currentEdges: CanvasEdge[],
  nextEdges: CanvasEdge[],
): CanvasEdge[] {
  const seen = new Set<string>();
  return [...currentEdges, ...nextEdges].filter((edge) => {
    const key = `${edge.sourceId}:${edge.targetId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createAssetTextNode(params: {
  center: Position;
  xOffset: number;
  yOffset?: number;
  title: string;
  text?: string;
  prompt?: string;
  status?: CanvasTextElement["status"];
  textRole?: CanvasTextElement["textRole"];
  modelRef?: string;
}): CanvasTextElement {
  return {
    ...createTextElement(
      {
        x: params.center.x + params.xOffset,
        y: params.center.y + (params.yOffset || 0),
      },
      {
        text: params.text || "",
        textRole: params.textRole || "general",
        meta: {
          title: params.title,
          version: 1,
        },
      },
    ),
    prompt: params.prompt,
    status: params.status,
    modelRef: params.modelRef,
  };
}

async function generateTextNode(params: {
  node: CanvasTextElement;
  prompt: string;
  current: CanvasTextElement;
  sources: CanvasElement[];
  projectId?: string | null;
  asAsset?: boolean;
  modelEntry: CanvasModelEntry;
  commitCanvas: (next: CanvasCommitInput) => void;
  appendAssistantMessage: (message: string) => void;
}): Promise<CanvasTextElement> {
  const { modelEntry } = params;
  if (!modelEntry.provider || !modelEntry.model) {
    throw new Error("请先配置可用的文本模型。");
  }

  try {
    const content = await requestCanvasTextGeneration({
      prompt: params.prompt,
      current: toTextGenerationSource(params.current),
      projectId: params.projectId,
      sources: params.sources.map(toTextGenerationSource),
      provider: modelEntry.provider,
      model: modelEntry.model,
    });
    const doneNode = {
      ...params.node,
      text: content,
      status: "done",
      error: undefined,
    } satisfies CanvasTextElement;
    const assetNode =
      params.asAsset !== false
        ? withCanvasAssetMeta(doneNode, {
            title: doneNode.meta?.title,
            sourceNodeIds: [params.current.id, ...params.sources.map((source) => source.id)],
            status: "ready",
            modelRef: modelEntry.ref,
          })
        : doneNode;

    params.commitCanvas((current) => ({
      elements: mergeCanvasElements(current.elements, [assetNode]),
      edges: current.edges,
    }));
    return assetNode;
  } catch (error) {
    const message = error instanceof Error ? error.message : "文本生成失败";
    const failedNode = {
      ...params.node,
      status: "failed",
      error: message,
    } satisfies CanvasTextElement;
    params.commitCanvas((current) => ({
      elements: mergeCanvasElements(current.elements, [failedNode]),
      edges: current.edges,
    }));
    params.appendAssistantMessage(message);
    throw error;
  }
}

export async function runStructuredTextAssetIntentChain(params: {
  command: string;
  workflow?: StructuredTextAssetWorkflow;
  currentProjectId?: string | null;
  textModelEntry?: CanvasModelEntry;
  center: Position;
  commitCanvas: (next: CanvasCommitInput) => void;
  setSelectedId: (id: string | null) => void;
  appendAssistantMessage: (message: string) => void;
}): Promise<void> {
  const textModelEntry = params.textModelEntry;
  if (!textModelEntry?.provider || !textModelEntry.model) {
    params.appendAssistantMessage("请先配置可用的文本模型。");
    return;
  }

  const chain = getStructuredTextAssetChain(params.command, params.workflow);
  const modelRef = textModelEntry.ref;
  const intentNode = createAssetTextNode({
    center: params.center,
    xOffset: -620,
    title: "创作意图",
    text: params.command,
    status: "done",
    modelRef,
  });
  const middleNode = createAssetTextNode({
    center: params.center,
    xOffset: 0,
    title: chain.middleTitle,
    textRole: chain.middleRole,
    status: "generating",
    modelRef,
  });
  const finalNode = createAssetTextNode({
    center: params.center,
    xOffset: 620,
    title: chain.finalTitle,
    textRole: chain.finalRole,
    status: "generating",
    modelRef,
  });
  const chainEdges = [
    createCanvasEdge({ sourceId: intentNode.id, targetId: middleNode.id }),
    createCanvasEdge({ sourceId: middleNode.id, targetId: finalNode.id }),
  ];

  params.commitCanvas((current) => ({
    elements: mergeCanvasElements(current.elements, [intentNode, middleNode, finalNode]),
    edges: mergeCanvasEdges(current.edges, chainEdges),
  }));
  params.setSelectedId(middleNode.id);
  params.appendAssistantMessage(chain.startMessage);

  const middle = await generateTextNode({
    node: middleNode,
    current: intentNode,
    sources: [],
    projectId: params.currentProjectId,
    modelEntry: textModelEntry,
    commitCanvas: params.commitCanvas,
    appendAssistantMessage: params.appendAssistantMessage,
    prompt: chain.middlePrompt.join("\n"),
  });

  params.setSelectedId(finalNode.id);
  params.appendAssistantMessage(`生成${chain.finalTitle}。`);
  const final = await generateTextNode({
    node: finalNode,
    current: middle,
    sources: [intentNode],
    projectId: params.currentProjectId,
    modelEntry: textModelEntry,
    commitCanvas: params.commitCanvas,
    appendAssistantMessage: params.appendAssistantMessage,
    prompt: chain.finalPrompt.join("\n"),
  });
  params.setSelectedId(finalNode.id);
  params.appendAssistantMessage(`${chain.finalTitle}已生成到画布。`);
  void persistTextAssetMemories({
    projectId: params.currentProjectId,
    asset: final,
    sources: [middle, intentNode],
    textModelEntry,
    appendAssistantMessage: params.appendAssistantMessage,
  }).catch((error) => {
    console.error("[canvas:text-asset-memory]", error);
  });
}

export async function runNovelAssetIntentChain(params: {
  command: string;
  currentProjectId?: string | null;
  textModelEntry?: CanvasModelEntry;
  center: Position;
  commitCanvas: (next: CanvasCommitInput) => void;
  setSelectedId: (id: string | null) => void;
  appendAssistantMessage: (message: string) => void;
}): Promise<void> {
  const textModelEntry = params.textModelEntry;
  if (!textModelEntry?.provider || !textModelEntry.model) {
    params.appendAssistantMessage("请先配置可用的文本模型。");
    return;
  }

  const modelRef = textModelEntry.ref;
  const intentNode = createAssetTextNode({
    center: params.center,
    xOffset: -900,
    title: "小说意图",
    text: params.command,
    status: "done",
    modelRef,
  });
  const positioningNode = createAssetTextNode({
    center: params.center,
    xOffset: -240,
    yOffset: -270,
    title: "作品定位",
    textRole: "general",
    status: "generating",
    modelRef,
  });
  const worldNode = createAssetTextNode({
    center: params.center,
    xOffset: -240,
    yOffset: 0,
    title: "世界观简表",
    textRole: "scene",
    status: "generating",
    modelRef,
  });
  const characterNode = createAssetTextNode({
    center: params.center,
    xOffset: 420,
    yOffset: -140,
    title: "角色种子",
    textRole: "character_cast",
    status: "generating",
    modelRef,
  });
  const outlineNode = createAssetTextNode({
    center: params.center,
    xOffset: 420,
    yOffset: 160,
    title: "主线大纲",
    textRole: "article",
    status: "generating",
    modelRef,
  });
  const bibleNode = createAssetTextNode({
    center: params.center,
    xOffset: 1080,
    yOffset: -300,
    title: "作品圣经",
    textRole: "general",
    status: "generating",
    modelRef,
  });
  const characterStateNode = createAssetTextNode({
    center: params.center,
    xOffset: 1080,
    yOffset: 0,
    title: "角色状态表",
    textRole: "character_relation",
    status: "generating",
    modelRef,
  });
  const foreshadowingNode = createAssetTextNode({
    center: params.center,
    xOffset: 1080,
    yOffset: 300,
    title: "伏笔台账",
    textRole: "general",
    status: "generating",
    modelRef,
  });
  const edges = [
    createCanvasEdge({ sourceId: intentNode.id, targetId: positioningNode.id }),
    createCanvasEdge({ sourceId: intentNode.id, targetId: worldNode.id }),
    createCanvasEdge({ sourceId: positioningNode.id, targetId: characterNode.id }),
    createCanvasEdge({ sourceId: worldNode.id, targetId: characterNode.id }),
    createCanvasEdge({ sourceId: positioningNode.id, targetId: outlineNode.id }),
    createCanvasEdge({ sourceId: characterNode.id, targetId: outlineNode.id }),
    createCanvasEdge({ sourceId: worldNode.id, targetId: bibleNode.id }),
    createCanvasEdge({ sourceId: outlineNode.id, targetId: bibleNode.id }),
    createCanvasEdge({ sourceId: characterNode.id, targetId: characterStateNode.id }),
    createCanvasEdge({ sourceId: bibleNode.id, targetId: characterStateNode.id }),
    createCanvasEdge({ sourceId: outlineNode.id, targetId: foreshadowingNode.id }),
    createCanvasEdge({ sourceId: bibleNode.id, targetId: foreshadowingNode.id }),
  ];

  params.commitCanvas((current) => ({
    elements: mergeCanvasElements(current.elements, [
      intentNode,
      positioningNode,
      worldNode,
      characterNode,
      outlineNode,
      bibleNode,
      characterStateNode,
      foreshadowingNode,
    ]),
    edges: mergeCanvasEdges(current.edges, edges),
  }));

  params.setSelectedId(positioningNode.id);
  params.appendAssistantMessage("判断为小说创作，先生成基础资产。");

  const positioning = await generateTextNode({
    node: positioningNode,
    current: intentNode,
    sources: [],
    projectId: params.currentProjectId,
    modelEntry: textModelEntry,
    commitCanvas: params.commitCanvas,
    appendAssistantMessage: params.appendAssistantMessage,
    prompt: [
      "根据用户的小说创作意图，生成作品定位。",
      "要求：包含题材、类型、读者感、核心卖点、叙事视角、风格、篇幅倾向和创作边界。",
      "不要写正文，不要解释过程。",
      `用户意图：${params.command}`,
    ].join("\n"),
  });

  params.setSelectedId(worldNode.id);
  const world = await generateTextNode({
    node: worldNode,
    current: intentNode,
    sources: [positioning],
    projectId: params.currentProjectId,
    modelEntry: textModelEntry,
    commitCanvas: params.commitCanvas,
    appendAssistantMessage: params.appendAssistantMessage,
    prompt: [
      "基于小说意图和作品定位，生成世界观简表。",
      "要求：包含时代背景、主要地点、组织/势力、关键规则、限制条件和可制造冲突的设定。",
      "只输出设定资产，不写正文。",
    ].join("\n"),
  });

  params.setSelectedId(characterNode.id);
  const characters = await generateTextNode({
    node: characterNode,
    current: intentNode,
    sources: [positioning, world],
    projectId: params.currentProjectId,
    modelEntry: textModelEntry,
    commitCanvas: params.commitCanvas,
    appendAssistantMessage: params.appendAssistantMessage,
    prompt: [
      "基于小说意图、作品定位和世界观，生成角色种子。",
      "要求：包含主角、对手、关键配角；每个角色给出身份、目标、弱点、秘密、关系和剧情功能。",
      "只输出角色资产，不写正文。",
    ].join("\n"),
  });

  params.setSelectedId(outlineNode.id);
  const outline = await generateTextNode({
    node: outlineNode,
    current: intentNode,
    sources: [positioning, world, characters],
    projectId: params.currentProjectId,
    modelEntry: textModelEntry,
    commitCanvas: params.commitCanvas,
    appendAssistantMessage: params.appendAssistantMessage,
    prompt: [
      "基于小说意图、作品定位、世界观和角色种子，生成主线大纲。",
      "要求：包含开局、主要冲突、关键转折、高潮、结局方向、伏笔和可扩展章节方向。",
      "只输出大纲资产，不写正文。",
    ].join("\n"),
  });

  params.setSelectedId(bibleNode.id);
  const bible = await generateTextNode({
    node: bibleNode,
    current: outline,
    sources: [positioning, world, characters],
    projectId: params.currentProjectId,
    modelEntry: textModelEntry,
    commitCanvas: params.commitCanvas,
    appendAssistantMessage: params.appendAssistantMessage,
    prompt: [
      "基于作品定位、世界观、角色种子和主线大纲，生成作品圣经。",
      "要求：沉淀长期不应随意改动的正典信息；包含核心主题、叙事承诺、世界规则、人物关系、关键矛盾、禁改设定、语气风格和待确认问题。",
      "输出要可被后续章节创作持续引用，不写正文，不解释过程。",
    ].join("\n"),
  });

  params.setSelectedId(characterStateNode.id);
  const characterState = await generateTextNode({
    node: characterStateNode,
    current: characters,
    sources: [bible, outline],
    projectId: params.currentProjectId,
    modelEntry: textModelEntry,
    commitCanvas: params.commitCanvas,
    appendAssistantMessage: params.appendAssistantMessage,
    prompt: [
      "基于角色种子、作品圣经和主线大纲，生成角色状态表。",
      "要求：每个主要角色包含当前身份、目标、动机、秘密、资源、关系、冲突、已知信息、未知信息、状态约束和可推进的角色弧线。",
      "这是长期连续性资产，不写正文。",
    ].join("\n"),
  });

  params.setSelectedId(foreshadowingNode.id);
  const foreshadowing = await generateTextNode({
    node: foreshadowingNode,
    current: outline,
    sources: [bible, characterState],
    projectId: params.currentProjectId,
    modelEntry: textModelEntry,
    commitCanvas: params.commitCanvas,
    appendAssistantMessage: params.appendAssistantMessage,
    prompt: [
      "基于作品圣经、角色状态表和主线大纲，生成伏笔台账。",
      "要求：列出可布置的线索、首次出现建议、误导方式、回收方向、关联角色/设定、风险等级和需要避免的剧透。",
      "这是长期追踪资产，不写正文。",
    ].join("\n"),
  });

  params.setSelectedId(bibleNode.id);
  params.appendAssistantMessage("小说创作底座已生成到画布。");
  void persistMultipleTextAssetMemories({
    projectId: params.currentProjectId,
    assets: [outline, bible, characterState, foreshadowing],
    sources: [positioning, world, characters],
    textModelEntry,
    appendAssistantMessage: params.appendAssistantMessage,
  }).catch((error) => {
    console.error("[canvas:novel-base-memory]", error);
  });
}

async function persistMultipleTextAssetMemories(params: {
  projectId?: string | null;
  assets: CanvasTextElement[];
  sources: CanvasTextElement[];
  textModelEntry: CanvasModelEntry;
  appendAssistantMessage: (message: string) => void;
}): Promise<void> {
  if (!params.projectId) return;
  let total = 0;
  for (const asset of params.assets) {
    total += await persistTextAssetMemories({
      projectId: params.projectId,
      asset,
      sources: params.sources,
      textModelEntry: params.textModelEntry,
    });
  }
  params.appendAssistantMessage(`项目记忆已更新 ${total} 项。`);
}

async function persistTextAssetMemories(params: {
  projectId?: string | null;
  asset: CanvasTextElement;
  sources: CanvasTextElement[];
  textModelEntry: CanvasModelEntry;
  appendAssistantMessage?: (message: string) => void;
}): Promise<number> {
  if (!params.projectId) return 0;
  const { asset, sources, textModelEntry } = params;
  if (!textModelEntry.provider || !textModelEntry.model) return 0;

  const extractedCount = await requestCanvasProjectMemoryExtraction({
    projectId: params.projectId,
    kind: "text_asset",
    assetId: asset.id,
    assetTitle: asset.meta?.title || asset.asset?.title || "文本资产",
    current: {
      ...toTextGenerationSource(asset),
      id: asset.id,
    },
    sources: sources.map((source) => ({
      ...toTextGenerationSource(source),
      id: source.id,
    })),
    provider: textModelEntry.provider,
    model: textModelEntry.model,
  });
  params.appendAssistantMessage?.(`项目记忆已更新 ${extractedCount} 项。`);
  return extractedCount;
}

async function persistNovelChapterMemories(params: {
  projectId: string;
  chapter: CanvasTextElement;
  outline: CanvasTextElement;
  textModelEntry: CanvasModelEntry;
  appendAssistantMessage: (message: string) => void;
}): Promise<void> {
  const { projectId, chapter, outline, textModelEntry } = params;
  if (!textModelEntry.provider || !textModelEntry.model) return;

  const current = {
    ...toTextGenerationSource(chapter),
    id: chapter.id,
  };
  const outlineSource = {
    ...toTextGenerationSource(outline),
    id: outline.id,
  };
  const extractedCount = await requestCanvasProjectMemoryExtraction({
    projectId,
    kind: "novel_chapter",
    chapterId: chapter.id,
    outlineId: outline.id,
    chapterTitle: chapter.meta?.title || "章节",
    current,
    sources: [outlineSource],
    provider: textModelEntry.provider,
    model: textModelEntry.model,
  });
  params.appendAssistantMessage(`章节记忆已更新 ${extractedCount} 项。`);
}

export async function runNovelChapterAssetIntentChain(params: {
  command: string;
  elements?: CanvasElement[];
  currentProjectId?: string | null;
  textModelEntry?: CanvasModelEntry;
  center: Position;
  commitCanvas: (next: CanvasCommitInput) => void;
  setSelectedId: (id: string | null) => void;
  appendAssistantMessage: (message: string) => void;
}): Promise<void> {
  const textModelEntry = params.textModelEntry;
  if (!textModelEntry?.provider || !textModelEntry.model) {
    params.appendAssistantMessage("请先配置可用的文本模型。");
    return;
  }

  const modelRef = textModelEntry.ref;
  const continuitySources = getNovelContinuitySourceElements(params.elements || []);
  const intentNode = createAssetTextNode({
    center: params.center,
    xOffset: -620,
    title: "章节意图",
    text: params.command,
    status: "done",
    modelRef,
  });
  const outlineNode = createAssetTextNode({
    center: params.center,
    xOffset: 0,
    title: "章节大纲",
    textRole: "scene",
    status: "generating",
    modelRef,
  });
  const chapterNode = createAssetTextNode({
    center: params.center,
    xOffset: 620,
    title: "章节正文",
    textRole: "article",
    status: "generating",
    modelRef,
  });
  const eventSummaryNode = createAssetTextNode({
    center: params.center,
    xOffset: 1240,
    yOffset: -260,
    title: "章节事件摘要",
    textRole: "scene",
    status: "generating",
    modelRef,
  });
  const characterUpdateNode = createAssetTextNode({
    center: params.center,
    xOffset: 1240,
    yOffset: 0,
    title: "角色状态更新",
    textRole: "character_relation",
    status: "generating",
    modelRef,
  });
  const foreshadowingUpdateNode = createAssetTextNode({
    center: params.center,
    xOffset: 1240,
    yOffset: 260,
    title: "伏笔更新",
    textRole: "general",
    status: "generating",
    modelRef,
  });
  const edges = [
    createCanvasEdge({ sourceId: intentNode.id, targetId: outlineNode.id }),
    createCanvasEdge({ sourceId: outlineNode.id, targetId: chapterNode.id }),
    createCanvasEdge({ sourceId: chapterNode.id, targetId: eventSummaryNode.id }),
    createCanvasEdge({ sourceId: chapterNode.id, targetId: characterUpdateNode.id }),
    createCanvasEdge({ sourceId: chapterNode.id, targetId: foreshadowingUpdateNode.id }),
    ...continuitySources.slice(-8).map((source) =>
      createCanvasEdge({ sourceId: source.id, targetId: outlineNode.id }),
    ),
  ];

  params.commitCanvas((current) => ({
    elements: mergeCanvasElements(current.elements, [
      intentNode,
      outlineNode,
      chapterNode,
      eventSummaryNode,
      characterUpdateNode,
      foreshadowingUpdateNode,
    ]),
    edges: mergeCanvasEdges(current.edges, edges),
  }));

  params.setSelectedId(outlineNode.id);
  params.appendAssistantMessage("判断为章节创作，先生成章节大纲。");

  const outline = await generateTextNode({
    node: outlineNode,
    current: intentNode,
    sources: continuitySources,
    projectId: params.currentProjectId,
    modelEntry: textModelEntry,
    commitCanvas: params.commitCanvas,
    appendAssistantMessage: params.appendAssistantMessage,
    prompt: [
      "根据用户的章节创作意图和项目记忆，生成章节大纲。",
      continuitySources.length > 0
        ? "优先参考画布里的作品圣经、角色状态、伏笔台账、主线大纲和连续性资产，不能随意推翻既有设定。"
        : "如果项目记忆不足，先按用户意图生成可继续扩展的章节大纲。",
      "要求：包含章节目标、出场角色、场景、冲突、信息释放、情绪推进、伏笔布置/回收、结尾钩子和连续性注意事项。",
      "只输出章节大纲，不写正文。",
      `用户意图：${params.command}`,
    ].join("\n"),
  });

  params.setSelectedId(chapterNode.id);
  params.appendAssistantMessage("生成章节正文。");
  const chapter = await generateTextNode({
    node: chapterNode,
    current: outline,
    sources: [intentNode, ...continuitySources],
    projectId: params.currentProjectId,
    modelEntry: textModelEntry,
    commitCanvas: params.commitCanvas,
    appendAssistantMessage: params.appendAssistantMessage,
    prompt: [
      "基于章节大纲和项目记忆，生成章节正文。",
      continuitySources.length > 0
        ? "必须遵守画布里的作品圣经、角色状态、伏笔台账和连续性资产，不要让角色状态、世界规则或伏笔信息前后冲突。"
        : "项目连续性资产不足时，保持信息克制，为后续章节留下可追踪状态。",
      "要求：小说正文风格；场景清楚；人物行动和心理具体；推进冲突；合理布置或回收伏笔；结尾留下钩子。",
      "不要解释创作过程，不要输出大纲。",
    ].join("\n"),
  });

  params.setSelectedId(eventSummaryNode.id);
  const eventSummary = await generateTextNode({
    node: eventSummaryNode,
    current: chapter,
    sources: [outline, ...continuitySources],
    projectId: params.currentProjectId,
    modelEntry: textModelEntry,
    commitCanvas: params.commitCanvas,
    appendAssistantMessage: params.appendAssistantMessage,
    prompt: [
      "基于本章正文、章节大纲和项目连续性资产，生成章节事件摘要。",
      "要求：记录本章发生的关键事件、信息释放、角色行动结果、世界状态变化、时间地点变化和后续必须记住的事实。",
      "只输出可追踪摘要，不评价文本质量。",
    ].join("\n"),
  });

  params.setSelectedId(characterUpdateNode.id);
  const characterUpdate = await generateTextNode({
    node: characterUpdateNode,
    current: chapter,
    sources: [outline, eventSummary, ...continuitySources],
    projectId: params.currentProjectId,
    modelEntry: textModelEntry,
    commitCanvas: params.commitCanvas,
    appendAssistantMessage: params.appendAssistantMessage,
    prompt: [
      "基于本章正文、章节事件摘要和既有角色状态资产，生成角色状态更新。",
      "要求：按角色列出状态变化、关系变化、掌握信息变化、伤害/资源/位置变化、目标变化、秘密暴露情况和下一章约束。",
      "只记录本章造成的增量变化，不重写完整角色卡。",
    ].join("\n"),
  });

  params.setSelectedId(foreshadowingUpdateNode.id);
  const foreshadowingUpdate = await generateTextNode({
    node: foreshadowingUpdateNode,
    current: chapter,
    sources: [outline, eventSummary, ...continuitySources],
    projectId: params.currentProjectId,
    modelEntry: textModelEntry,
    commitCanvas: params.commitCanvas,
    appendAssistantMessage: params.appendAssistantMessage,
    prompt: [
      "基于本章正文、章节事件摘要和既有伏笔台账，生成伏笔更新。",
      "要求：列出本章新布置的伏笔、推进的伏笔、已回收的伏笔、被误导的信息、需要后续补写或避免遗忘的线索。",
      "输出要能并入长期伏笔台账，不写正文。",
    ].join("\n"),
  });

  params.setSelectedId(chapterNode.id);
  params.appendAssistantMessage("章节正文和章节更新资产已生成到画布。");

  if (params.currentProjectId) {
    params.appendAssistantMessage("正在整理章节记忆。");
    void persistNovelChapterMemories({
      projectId: params.currentProjectId,
      chapter,
      outline,
      textModelEntry,
      appendAssistantMessage: params.appendAssistantMessage,
    }).catch((error) => {
      console.error("[canvas:novel-chapter-memory]", error);
    });
    void persistMultipleTextAssetMemories({
      projectId: params.currentProjectId,
      assets: [eventSummary, characterUpdate, foreshadowingUpdate],
      sources: [outline, chapter],
      textModelEntry,
      appendAssistantMessage: params.appendAssistantMessage,
    }).catch((error) => {
      console.error("[canvas:novel-chapter-update-memory]", error);
    });
  }
}

export async function runNovelMergeUpdatesIntentChain(params: {
  command: string;
  elements: CanvasElement[];
  currentProjectId?: string | null;
  textModelEntry?: CanvasModelEntry;
  center: Position;
  commitCanvas: (next: CanvasCommitInput) => void;
  setSelectedId: (id: string | null) => void;
  appendAssistantMessage: (message: string) => void;
}): Promise<void> {
  const textModelEntry = params.textModelEntry;
  if (!textModelEntry?.provider || !textModelEntry.model) {
    params.appendAssistantMessage("请先配置可用的文本模型。");
    return;
  }

  const sources = getNovelMergeSourceElements(params.elements);
  if (sources.length === 0) {
    params.appendAssistantMessage("画布里还没有可合并的小说更新资产。");
    return;
  }

  const modelRef = textModelEntry.ref;
  const intentNode = createAssetTextNode({
    center: params.center,
    xOffset: -760,
    title: "合并意图",
    text: params.command,
    status: "done",
    modelRef,
  });
  const biblePatchNode = createAssetTextNode({
    center: params.center,
    xOffset: 0,
    yOffset: -260,
    title: "作品圣经补丁",
    textRole: "general",
    status: "generating",
    modelRef,
  });
  const characterStateNode = createAssetTextNode({
    center: params.center,
    xOffset: 0,
    yOffset: 40,
    title: "角色状态表更新版",
    textRole: "character_relation",
    status: "generating",
    modelRef,
  });
  const foreshadowingNode = createAssetTextNode({
    center: params.center,
    xOffset: 0,
    yOffset: 340,
    title: "伏笔台账更新版",
    textRole: "general",
    status: "generating",
    modelRef,
  });
  const edges = [
    createCanvasEdge({ sourceId: intentNode.id, targetId: biblePatchNode.id }),
    createCanvasEdge({ sourceId: intentNode.id, targetId: characterStateNode.id }),
    createCanvasEdge({ sourceId: intentNode.id, targetId: foreshadowingNode.id }),
    ...sources.slice(-12).flatMap((source) => [
      createCanvasEdge({ sourceId: source.id, targetId: biblePatchNode.id }),
      createCanvasEdge({ sourceId: source.id, targetId: characterStateNode.id }),
      createCanvasEdge({ sourceId: source.id, targetId: foreshadowingNode.id }),
    ]),
  ];

  params.commitCanvas((current) => ({
    elements: mergeCanvasElements(current.elements, [
      intentNode,
      biblePatchNode,
      characterStateNode,
      foreshadowingNode,
    ]),
    edges: mergeCanvasEdges(current.edges, edges),
  }));

  params.setSelectedId(biblePatchNode.id);
  params.appendAssistantMessage("整理小说更新资产。");
  const biblePatch = await generateTextNode({
    node: biblePatchNode,
    current: intentNode,
    sources,
    projectId: params.currentProjectId,
    modelEntry: textModelEntry,
    commitCanvas: params.commitCanvas,
    appendAssistantMessage: params.appendAssistantMessage,
    prompt: [
      "基于画布中的作品圣经、章节事件摘要、角色状态更新、伏笔更新和连续性资产，生成作品圣经补丁。",
      "要求：只记录应该并入作品圣经的新增正典、世界状态变化、禁改信息、待确认问题和冲突风险。",
      "不要重写完整作品圣经；输出补丁格式，便于人工确认后合并。",
      `用户要求：${params.command}`,
    ].join("\n"),
  });

  params.setSelectedId(characterStateNode.id);
  const characterState = await generateTextNode({
    node: characterStateNode,
    current: intentNode,
    sources,
    projectId: params.currentProjectId,
    modelEntry: textModelEntry,
    commitCanvas: params.commitCanvas,
    appendAssistantMessage: params.appendAssistantMessage,
    prompt: [
      "基于画布中的角色状态表、章节事件摘要和角色状态更新，生成角色状态表更新版。",
      "要求：合并增量变化；保留每个角色的当前状态、目标、关系、掌握信息、秘密暴露、资源/位置/伤害变化、下一章约束。",
      "如果发现冲突，标出冲突来源和建议处理方式。",
    ].join("\n"),
  });

  params.setSelectedId(foreshadowingNode.id);
  const foreshadowing = await generateTextNode({
    node: foreshadowingNode,
    current: intentNode,
    sources,
    projectId: params.currentProjectId,
    modelEntry: textModelEntry,
    commitCanvas: params.commitCanvas,
    appendAssistantMessage: params.appendAssistantMessage,
    prompt: [
      "基于画布中的伏笔台账、章节事件摘要和伏笔更新，生成伏笔台账更新版。",
      "要求：合并新伏笔、推进中伏笔、已回收伏笔、误导信息、遗留线索和风险项。",
      "输出要能继续被后续章节引用；如果某条伏笔缺少回收方向，明确标出。",
    ].join("\n"),
  });

  params.setSelectedId(characterStateNode.id);
  params.appendAssistantMessage("小说更新资产已整理到画布。");
  void persistMultipleTextAssetMemories({
    projectId: params.currentProjectId,
    assets: [biblePatch, characterState, foreshadowing],
    sources,
    textModelEntry,
    appendAssistantMessage: params.appendAssistantMessage,
  }).catch((error) => {
    console.error("[canvas:novel-merge-memory]", error);
  });
}

export async function runGlobalConsistencyCheckIntentChain(params: {
  command: string;
  elements: CanvasElement[];
  currentProjectId?: string | null;
  textModelEntry?: CanvasModelEntry;
  center: Position;
  commitCanvas: (next: CanvasCommitInput) => void;
  setSelectedId: (id: string | null) => void;
  appendAssistantMessage: (message: string) => void;
}): Promise<void> {
  const textModelEntry = params.textModelEntry;
  if (!textModelEntry?.provider || !textModelEntry.model) {
    params.appendAssistantMessage("请先配置可用的文本模型。");
    return;
  }

  const sources = getConsistencySourceElements(params.elements);
  if (sources.length === 0) {
    params.appendAssistantMessage("画布里还没有可检查的文本资产。");
    return;
  }

  const modelRef = textModelEntry.ref;
  const intentNode = createAssetTextNode({
    center: params.center,
    xOffset: -420,
    title: "检查意图",
    text: params.command,
    status: "done",
    modelRef,
  });
  const reportNode = createAssetTextNode({
    center: params.center,
    xOffset: 420,
    title: "全局一致性审计",
    textRole: "general",
    status: "generating",
    modelRef,
  });
  const edges = [
    createCanvasEdge({ sourceId: intentNode.id, targetId: reportNode.id }),
    ...sources.slice(-10).map((source) =>
      createCanvasEdge({ sourceId: source.id, targetId: reportNode.id }),
    ),
  ];

  params.commitCanvas((current) => ({
    elements: mergeCanvasElements(current.elements, [intentNode, reportNode]),
    edges: mergeCanvasEdges(current.edges, edges),
  }));
  params.setSelectedId(reportNode.id);
  params.appendAssistantMessage("检查画布资产的一致性。");

  await generateTextNode({
    node: reportNode,
    current: intentNode,
    sources,
    projectId: params.currentProjectId,
    asAsset: true,
    modelEntry: textModelEntry,
    commitCanvas: params.commitCanvas,
    appendAssistantMessage: params.appendAssistantMessage,
    prompt: [
      "基于画布中的文本资产和项目记忆，生成全局一致性审计报告。",
      "重点检查：世界观规则冲突、角色状态冲突、人物关系冲突、时间线冲突、章节事件矛盾、信息公开范围冲突、伏笔遗漏和需要补充确认的问题。",
      "输出格式：问题清单、依据、风险等级、建议修改、建议优先级。",
      "只输出可执行报告，不要解释检查过程。",
      `用户要求：${params.command}`,
    ].join("\n"),
  });
  params.setSelectedId(reportNode.id);
  params.appendAssistantMessage("一致性审计已生成到画布。");
}

export async function runImageAssetIntentChain(params: {
  command: string;
  elements: CanvasElement[];
  edges: CanvasEdge[];
  brainAttachmentIds: string[];
  currentProjectId?: string | null;
  textModelEntry?: CanvasModelEntry;
  imageModelEntry?: CanvasModelEntry;
  promptModelEntry?: CanvasModelEntry;
  center: Position;
  commitCanvas: (next: CanvasCommitInput) => void;
  patchElementDraft: (id: string, updates: Partial<CanvasElement>) => void;
  setSelectedId: (id: string | null) => void;
  clearBrainAttachments: () => void;
  appendAssistantMessage: (message: string) => void;
}): Promise<void> {
  const textModelEntry = params.textModelEntry;
  if (!textModelEntry?.provider || !textModelEntry.model) {
    params.appendAssistantMessage("请先配置可用的文本模型。");
    return;
  }

  const referenceElements = params.elements.filter(
    (element) =>
      params.brainAttachmentIds.includes(element.id) && element.kind === "image",
  );
  const modelRef = textModelEntry.ref;
  const intentNode = createAssetTextNode({
    center: params.center,
    xOffset: -620,
    title: "创作意图",
    text: params.command,
    status: "done",
    modelRef,
  });
  const briefNode = createAssetTextNode({
    center: params.center,
    xOffset: 0,
    title: "视觉简报",
    status: "generating",
    modelRef,
  });
  const promptNode = createAssetTextNode({
    center: params.center,
    xOffset: 620,
    title: "生图提示词",
    status: "generating",
    textRole: "prompt",
    modelRef,
  });
  const baseEdges = [
    createCanvasEdge({ sourceId: intentNode.id, targetId: briefNode.id }),
    ...referenceElements.map((element) =>
      createCanvasEdge({ sourceId: element.id, targetId: briefNode.id }),
    ),
    createCanvasEdge({ sourceId: briefNode.id, targetId: promptNode.id }),
  ];

  params.commitCanvas((current) => ({
    elements: mergeCanvasElements(current.elements, [
      intentNode,
      briefNode,
      promptNode,
    ]),
    edges: mergeCanvasEdges(current.edges, baseEdges),
  }));
  params.setSelectedId(briefNode.id);
  params.appendAssistantMessage("判断为图片生成，先整理视觉简报。");

  const brief = await generateTextNode({
    node: briefNode,
    current: intentNode,
    sources: referenceElements,
    projectId: params.currentProjectId,
    modelEntry: textModelEntry,
    commitCanvas: params.commitCanvas,
    appendAssistantMessage: params.appendAssistantMessage,
    prompt: [
      "把用户的图片生成需求整理成一份视觉简报。",
      "要求：只输出可执行的视觉信息，不写解释；包含主体、构图、风格、色彩、材质、光线、镜头、限制。",
      `用户需求：${params.command}`,
    ].join("\n"),
  });

  params.setSelectedId(promptNode.id);
  params.appendAssistantMessage("下一步：生成生图提示词。");
  const prompt = await generateTextNode({
    node: promptNode,
    current: brief,
    sources: [intentNode, ...referenceElements],
    projectId: params.currentProjectId,
    modelEntry: textModelEntry,
    commitCanvas: params.commitCanvas,
    appendAssistantMessage: params.appendAssistantMessage,
    prompt: [
      "把视觉简报改写成最终生图提示词。",
      "要求：直接输出提示词；主体明确；细节具体；包含风格、构图、光线、镜头、质量要求；不要解释。",
      "如果有参考图，保留需要继承的外观、风格或构图特征。",
    ].join("\n"),
  });

  if (!params.imageModelEntry?.provider || !params.imageModelEntry.model) {
    params.appendAssistantMessage("生图提示词已生成。请先配置可用的图像模型。");
    params.clearBrainAttachments();
    return;
  }

  const imageNode = withCanvasAssetMeta({
    ...createImageElement({
      position: {
        x: params.center.x + 1240,
        y: params.center.y,
      },
      label: "生成图片",
    }),
    prompt: prompt.text,
    modelRef: params.imageModelEntry.ref,
    status: "generating",
  } satisfies CanvasImageElement, {
    title: "生成图片",
    sourceNodeIds: [prompt.id, ...referenceElements.map((element) => element.id)],
    status: "draft",
    modelRef: params.imageModelEntry.ref,
  });
  const imageEdges = [
    createCanvasEdge({ sourceId: prompt.id, targetId: imageNode.id }),
    ...referenceElements.map((element) =>
      createCanvasEdge({ sourceId: element.id, targetId: imageNode.id }),
    ),
  ];

  params.commitCanvas((current) => ({
    elements: mergeCanvasElements(current.elements, [imageNode]),
    edges: mergeCanvasEdges(current.edges, imageEdges),
  }));
  params.setSelectedId(imageNode.id);
  params.appendAssistantMessage("正在生成图片。");

  try {
    const patch = await executeCanvasBrainMediaGeneration({
      kind: "image",
      prompt: prompt.text,
      projectId: params.currentProjectId,
      referenceImageUrls: getCanvasReferenceImageUrls(referenceElements),
      provider: params.imageModelEntry.provider,
      model: params.imageModelEntry.model,
      promptProvider: params.promptModelEntry?.provider,
      promptModel: params.promptModelEntry?.model,
      element: imageNode,
      padding: NODE_PADDING,
      fallbackSize: {
        width: DEFAULT_NODE_WIDTH,
        height: DEFAULT_NODE_HEIGHT,
      },
    });

    params.patchElementDraft(imageNode.id, {
      ...patch,
      asset: imageNode.asset
        ? {
            ...imageNode.asset,
            status: "ready",
            modelRef: params.imageModelEntry.ref,
          }
        : undefined,
    } as Partial<CanvasElement>);
    params.appendAssistantMessage("图片已生成到画布。");
  } catch (error) {
    const detail = error instanceof Error ? error.message : "图片生成失败";
    const message = getCanvasBrainFailureMessage({
      kind: "image",
      detail,
    });
    params.patchElementDraft(imageNode.id, {
      status: "failed",
      error: message,
    } as Partial<CanvasElement>);
    params.appendAssistantMessage(message);
  } finally {
    params.clearBrainAttachments();
  }
}

export async function runVideoAssetIntentChain(params: {
  command: string;
  elements: CanvasElement[];
  brainAttachmentIds: string[];
  currentProjectId?: string | null;
  textModelEntry?: CanvasModelEntry;
  videoModelEntry?: CanvasModelEntry;
  center: Position;
  commitCanvas: (next: CanvasCommitInput) => void;
  patchElementDraft: (id: string, updates: Partial<CanvasElement>) => void;
  setSelectedId: (id: string | null) => void;
  clearBrainAttachments: () => void;
  appendAssistantMessage: (message: string) => void;
}): Promise<void> {
  const textModelEntry = params.textModelEntry;
  if (!textModelEntry?.provider || !textModelEntry.model) {
    params.appendAssistantMessage("请先配置可用的文本模型。");
    return;
  }

  const referenceElements = params.elements.filter(
    (element) =>
      params.brainAttachmentIds.includes(element.id) && element.kind === "image",
  );
  const modelRef = textModelEntry.ref;
  const intentNode = createAssetTextNode({
    center: params.center,
    xOffset: -930,
    title: "创作意图",
    text: params.command,
    status: "done",
    modelRef,
  });
  const scriptNode = createAssetTextNode({
    center: params.center,
    xOffset: -310,
    title: "视频脚本",
    textRole: "script",
    status: "generating",
    modelRef,
  });
  const storyboardNode = createAssetTextNode({
    center: params.center,
    xOffset: 310,
    title: "分镜方案",
    textRole: "storyboard",
    status: "generating",
    modelRef,
  });
  const promptNode = createAssetTextNode({
    center: params.center,
    xOffset: 930,
    title: "视频提示词",
    status: "generating",
    textRole: "prompt",
    modelRef,
  });
  const baseEdges = [
    createCanvasEdge({ sourceId: intentNode.id, targetId: scriptNode.id }),
    ...referenceElements.map((element) =>
      createCanvasEdge({ sourceId: element.id, targetId: scriptNode.id }),
    ),
    createCanvasEdge({ sourceId: scriptNode.id, targetId: storyboardNode.id }),
    createCanvasEdge({ sourceId: storyboardNode.id, targetId: promptNode.id }),
  ];

  params.commitCanvas((current) => ({
    elements: mergeCanvasElements(current.elements, [
      intentNode,
      scriptNode,
      storyboardNode,
      promptNode,
    ]),
    edges: mergeCanvasEdges(current.edges, baseEdges),
  }));
  params.setSelectedId(scriptNode.id);
  params.appendAssistantMessage("判断为视频生成，先整理视频脚本。");

  const script = await generateTextNode({
    node: scriptNode,
    current: intentNode,
    sources: referenceElements,
    projectId: params.currentProjectId,
    modelEntry: textModelEntry,
    commitCanvas: params.commitCanvas,
    appendAssistantMessage: params.appendAssistantMessage,
    prompt: [
      "把用户的视频生成需求整理成视频脚本。",
      "要求：只输出可执行素材；包含主题、画面目标、主体动作、场景、情绪、节奏、时长倾向和限制。",
      "如果有参考图，说明需要继承的主体、风格、构图或色彩。",
      `用户需求：${params.command}`,
    ].join("\n"),
  });

  params.setSelectedId(storyboardNode.id);
  params.appendAssistantMessage("下一步：生成分镜方案。");
  const storyboard = await generateTextNode({
    node: storyboardNode,
    current: script,
    sources: [intentNode, ...referenceElements],
    projectId: params.currentProjectId,
    modelEntry: textModelEntry,
    commitCanvas: params.commitCanvas,
    appendAssistantMessage: params.appendAssistantMessage,
    prompt: [
      "基于视频脚本生成分镜方案。",
      "要求：按镜头列出；每个镜头包含画面、主体动作、镜头运动、景别、节奏、时长和声音/氛围。",
      "只输出分镜资产，不解释过程。",
    ].join("\n"),
  });

  params.setSelectedId(promptNode.id);
  params.appendAssistantMessage("下一步：生成视频提示词。");
  const prompt = await generateTextNode({
    node: promptNode,
    current: storyboard,
    sources: [intentNode, script, ...referenceElements],
    projectId: params.currentProjectId,
    modelEntry: textModelEntry,
    commitCanvas: params.commitCanvas,
    appendAssistantMessage: params.appendAssistantMessage,
    prompt: [
      "把分镜方案改写成视频生成提示词。",
      "要求：直接输出提示词；包含主体、场景、动作、镜头运动、光线、风格、节奏、时长和质量要求；不要解释。",
      "如果有参考图，保留需要继承的外观、构图或风格特征。",
    ].join("\n"),
  });

  if (!params.videoModelEntry?.provider || !params.videoModelEntry.model) {
    params.appendAssistantMessage("视频提示词已生成。请先配置可用的视频模型。");
    params.clearBrainAttachments();
    return;
  }

  const videoNode = withCanvasAssetMeta({
    ...createMediaElement({
      kind: "video",
      position: {
        x: params.center.x + 1550,
        y: params.center.y,
      },
      label: "生成视频",
    }),
    prompt: prompt.text,
    modelRef: params.videoModelEntry.ref,
    status: "generating",
  } satisfies CanvasMediaElement, {
    title: "生成视频",
    sourceNodeIds: [prompt.id, ...referenceElements.map((element) => element.id)],
    status: "draft",
    modelRef: params.videoModelEntry.ref,
  });

  params.commitCanvas((current) => ({
    elements: mergeCanvasElements(current.elements, [videoNode]),
    edges: mergeCanvasEdges(current.edges, [
      createCanvasEdge({ sourceId: prompt.id, targetId: videoNode.id }),
      ...referenceElements.map((element) =>
        createCanvasEdge({ sourceId: element.id, targetId: videoNode.id }),
      ),
    ]),
  }));
  params.setSelectedId(videoNode.id);
  params.appendAssistantMessage("正在生成视频。");

  try {
    const patch = await executeCanvasBrainMediaGeneration({
      kind: "video",
      prompt: prompt.text,
      projectId: params.currentProjectId,
      provider: params.videoModelEntry.provider,
      model: params.videoModelEntry.model,
      element: videoNode,
      padding: NODE_PADDING,
      fallbackSize: {
        width: DEFAULT_NODE_WIDTH,
        height: DEFAULT_NODE_HEIGHT,
      },
    });

    params.patchElementDraft(videoNode.id, {
      ...patch,
      asset: videoNode.asset
        ? {
            ...videoNode.asset,
            status: "ready",
            modelRef: params.videoModelEntry.ref,
          }
        : undefined,
    } as Partial<CanvasElement>);
    params.appendAssistantMessage("视频已生成到画布。");
  } catch (error) {
    const detail = error instanceof Error ? error.message : "视频生成失败";
    const message = getCanvasBrainFailureMessage({
      kind: "video",
      detail,
    });
    params.patchElementDraft(videoNode.id, {
      status: "failed",
      error: message,
    } as Partial<CanvasElement>);
    params.appendAssistantMessage(message);
  } finally {
    params.clearBrainAttachments();
  }
}
