import { getCanvasTextRole } from "@/entities/canvas/lib/textRoles";
import type {
  CanvasElement,
  CanvasTextElement,
  CanvasTextRole,
} from "@/entities/canvas/model/types";
import type { CanvasWorkflowStarterConfig } from "./types";

export type CanvasWorkflowGroupKind =
  | "novel_intent"
  | "novel_foundation";

export type CanvasWorkflowGroup = {
  id: CanvasWorkflowGroupKind;
  title: string;
  color: string;
  elementIds: string[];
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CanvasTextWorkflowReadiness = {
  hasNovelSetup: boolean;
  hasNovelCore: boolean;
  hasNovelWorld: boolean;
  hasStoryOutline: boolean;
  hasVolumeOutline: boolean;
  hasCharacterCast: boolean;
  hasCharacterRelation: boolean;
  hasChapterOutline: boolean;
  hasSceneOutline: boolean;
  hasNovelBible: boolean;
  hasStyleGuide: boolean;
};

const CANVAS_WORKFLOW_GROUP_CONFIGS: Record<
  CanvasWorkflowGroupKind,
  {
    title: string;
    color: string;
    roles: CanvasTextRole[];
  }
> = {
  novel_intent: {
    title: "意图",
    color: "#facc15",
    roles: ["novel_setup"],
  },
  novel_foundation: {
    title: "设定组",
    color: "#fb923c",
    roles: ["novel_core", "character_cast", "novel_world", "novel_style_guide"],
  },
};

const CANVAS_WORKFLOW_GROUP_ORDER: CanvasWorkflowGroupKind[] = [
  "novel_intent",
  "novel_foundation",
];

export function getCanvasWorkflowGroups(
  elements: CanvasElement[],
): CanvasWorkflowGroup[] {
  return CANVAS_WORKFLOW_GROUP_ORDER.map((groupId) => {
    const config = CANVAS_WORKFLOW_GROUP_CONFIGS[groupId];
    const roleSet = new Set(config.roles);
    const groupElements = elements.filter((element): element is CanvasTextElement => {
      if (element.kind !== "text") return false;
      if (element.status === "generating" && !element.text.trim()) return false;
      return roleSet.has(getCanvasTextRole(element.textRole));
    });

    if (groupElements.length < 2) return null;

    const sortedGroupElements = [...groupElements].sort(
      (a, b) =>
        (a.meta?.workflowSequenceNo || 0) - (b.meta?.workflowSequenceNo || 0),
    );
    const left = Math.min(...sortedGroupElements.map((element) => element.x));
    const top = Math.min(...sortedGroupElements.map((element) => element.y));
    const right = Math.max(
      ...sortedGroupElements.map((element) => element.x + element.width),
    );
    const bottom = Math.max(
      ...sortedGroupElements.map((element) => element.y + element.height),
    );
    const paddingX = 44;
    const paddingTop = 72;
    const paddingBottom = 34;

    return {
      id: groupId,
      title: config.title,
      color: config.color,
      elementIds: sortedGroupElements.map((element) => element.id),
      x: left - paddingX,
      y: top - paddingTop,
      width: right - left + paddingX * 2,
      height: bottom - top + paddingTop + paddingBottom,
    };
  }).filter((group): group is CanvasWorkflowGroup => Boolean(group));
}

export function getCanvasTextWorkflowReadiness(
  elements: CanvasElement[],
): CanvasTextWorkflowReadiness {
  const completedTextRoles = new Set<CanvasTextRole>();

  elements.forEach((element) => {
    if (element.kind !== "text") return;
    if (element.status === "generating") return;
    if (!element.text.trim()) return;
    completedTextRoles.add(getCanvasTextRole(element.textRole));
  });

  return {
    hasNovelSetup: completedTextRoles.has("novel_setup"),
    hasNovelCore: completedTextRoles.has("novel_core"),
    hasNovelWorld: completedTextRoles.has("novel_world"),
    hasStoryOutline: completedTextRoles.has("novel_outline"),
    hasVolumeOutline: completedTextRoles.has("novel_volume_outline"),
    hasCharacterCast: completedTextRoles.has("character_cast"),
    hasCharacterRelation: completedTextRoles.has("character_relation"),
    hasChapterOutline: completedTextRoles.has("novel_chapter_outline"),
    hasSceneOutline: completedTextRoles.has("novel_scene_outline"),
    hasNovelBible: completedTextRoles.has("novel_bible"),
    hasStyleGuide: completedTextRoles.has("novel_style_guide"),
  };
}

export function hasNovelDraftPrerequisites(
  readiness: CanvasTextWorkflowReadiness,
): boolean {
  return (
    readiness.hasStoryOutline &&
    readiness.hasVolumeOutline &&
    readiness.hasCharacterCast &&
    readiness.hasChapterOutline
  );
}

export function hasNovelOutlinePrerequisites(
  readiness: CanvasTextWorkflowReadiness,
): boolean {
  return (
    readiness.hasNovelCore &&
    readiness.hasNovelWorld &&
    readiness.hasCharacterCast
  );
}

export function getCanvasTextGenerationBlockReason(params: {
  source: CanvasElement;
  resultTextRole?: CanvasTextRole;
  actionId?: string;
  readiness: CanvasTextWorkflowReadiness;
}): string {
  if (params.source.kind !== "text") return "";
  const sourceRole = getCanvasTextRole(params.source.textRole);

  if (
    params.resultTextRole === "novel_outline" &&
    !hasNovelOutlinePrerequisites(params.readiness)
  ) {
    return "全书大纲前需要完整基础设定。请在右下角小说工作流助手中发起基础设定生成。";
  }

  if (
    params.resultTextRole === "novel_volume_outline" &&
    !params.readiness.hasStoryOutline
  ) {
    return "分卷大纲前需要先完成全书大纲。";
  }

  if (
    params.resultTextRole === "novel_chapter_outline" &&
    sourceRole !== "novel_chapter_outline" &&
    !(
      params.readiness.hasStoryOutline &&
      params.readiness.hasVolumeOutline &&
      params.readiness.hasCharacterCast
    )
  ) {
    return "章节大纲前需要先完成全书大纲、分卷大纲和角色总表。";
  }

  if (params.resultTextRole !== "novel_chapter") return "";
  if (sourceRole === "novel_chapter") return "";

  if (sourceRole !== "novel_chapter_outline" && sourceRole !== "novel_scene_outline") {
    return "正文需要先准备章节大纲或场景大纲，请先生成章纲/场纲后再写正文。";
  }

  if (!hasNovelDraftPrerequisites(params.readiness)) {
    return "正文前需要完成全书大纲、分卷大纲、角色总表和章节大纲。";
  }

  return "";
}

export function getChapterOutlineContextSources(params: {
  elements: CanvasElement[];
  sourceId: string;
}): CanvasElement[] {
  const contextRoles = new Set<CanvasTextRole>([
    "novel_setup",
    "novel_core",
    "novel_world",
    "novel_outline",
    "novel_volume_outline",
    "novel_bible",
    "novel_style_guide",
    "character_cast",
    "character_relation",
    "character",
  ]);

  return params.elements.filter((element): element is CanvasTextElement => {
    if (element.kind !== "text") return false;
    if (element.id === params.sourceId) return false;
    if (element.status === "generating") return false;
    if (!element.text.trim()) return false;
    return contextRoles.has(getCanvasTextRole(element.textRole));
  });
}

export function findCompletedTextElementByRole(
  elements: CanvasElement[],
  role: CanvasTextRole,
): CanvasTextElement | undefined {
  return elements
    .filter((element): element is CanvasTextElement => element.kind === "text")
    .toReversed()
    .find(
      (element) =>
        element.status !== "generating" &&
        !!element.text.trim() &&
        getCanvasTextRole(element.textRole) === role,
    );
}

export function mergeUniqueCanvasElements(
  elements: CanvasElement[],
): CanvasElement[] {
  return Array.from(new Map(elements.map((element) => [element.id, element])).values());
}

export function buildWorkflowStarterCommand(params: {
  workflowLabel: string;
  starter: CanvasWorkflowStarterConfig;
}): string {
  return JSON.stringify({
    kind: "workflow_starter",
    workflow: params.workflowLabel,
    intent: params.starter.intent,
    label: params.starter.label,
    keywords: params.starter.description,
  });
}

export function buildWorkflowConversationMaterial(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): string {
  return messages
    .slice(-10)
    .map((message) => `${message.role === "user" ? "用户" : "助手"}：${message.content}`)
    .join("\n");
}
