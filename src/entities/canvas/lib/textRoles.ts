import type { CanvasTextElement, CanvasTextRole } from "../model/types";

export type CanvasTextRoleConfig = {
  role: CanvasTextRole;
  label: string;
  title: string;
  placeholder: string;
};

export const CANVAS_TEXT_ROLE_CONFIGS: Record<
  CanvasTextRole,
  CanvasTextRoleConfig
> = {
  general: {
    role: "general",
    label: "文本",
    title: "文本",
    placeholder: "写入素材、草稿或原文...",
  },
  article: {
    role: "article",
    label: "文章",
    title: "文章",
    placeholder: "写入主题、观点、素材或文章草稿...",
  },
  novel_setup: {
    role: "novel_setup",
    label: "设定",
    title: "小说设定",
    placeholder: "写入题材、世界观、主角、金手指、叙事风格...",
  },
  novel_outline: {
    role: "novel_outline",
    label: "大纲",
    title: "故事大纲",
    placeholder: "写入主线、冲突、阶段、转折和结局方向...",
  },
  novel_chapter_outline: {
    role: "novel_chapter_outline",
    label: "章纲",
    title: "章节大纲",
    placeholder: "写入本章目标、冲突、场景、出场人物和结尾钩子...",
  },
  novel_chapter: {
    role: "novel_chapter",
    label: "章节",
    title: "章节正文",
    placeholder: "写入章节正文，或先写本章要发生什么...",
  },
  character: {
    role: "character",
    label: "角色",
    title: "角色卡",
    placeholder: "写入角色身份、目标、弱点、关系和视觉关键词...",
  },
  script: {
    role: "script",
    label: "剧本",
    title: "剧本",
    placeholder: "写入场景、人物、动作、对白或拍摄需求...",
  },
  storyboard: {
    role: "storyboard",
    label: "分镜",
    title: "分镜",
    placeholder: "写入镜头、画面、动作、旁白、时长或视觉风格...",
  },
  prompt: {
    role: "prompt",
    label: "Prompt",
    title: "Prompt",
    placeholder: "写入要转换成图片或视频提示词的内容...",
  },
};

export function getCanvasTextRole(role?: CanvasTextRole): CanvasTextRole {
  return role && role in CANVAS_TEXT_ROLE_CONFIGS ? role : "general";
}

export function getCanvasTextRoleConfig(
  role?: CanvasTextRole,
): CanvasTextRoleConfig {
  return CANVAS_TEXT_ROLE_CONFIGS[getCanvasTextRole(role)];
}

export function getCanvasTextTitle(element: CanvasTextElement): string {
  return element.meta?.title || getCanvasTextRoleConfig(element.textRole).title;
}
