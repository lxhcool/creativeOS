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
    label: "意图",
    title: "创作意图",
    placeholder: "写入题材、主角、爽点、风格、读者期待和连载卖点...",
  },
  novel_core: {
    role: "novel_core",
    label: "核心",
    title: "故事核心",
    placeholder: "写入故事命题、主线目标、核心冲突、关键赌注和结局方向...",
  },
  novel_world: {
    role: "novel_world",
    label: "世界观",
    title: "世界观",
    placeholder: "写入世界背景、规则体系、权力结构、禁忌代价和名词表...",
  },
  novel_outline: {
    role: "novel_outline",
    label: "全纲",
    title: "全书大纲",
    placeholder: "写入主线、冲突、阶段、转折和结局方向...",
  },
  novel_volume_outline: {
    role: "novel_volume_outline",
    label: "卷纲",
    title: "分卷大纲",
    placeholder: "写入每卷目标、阶段冲突、关键转折、人物变化和卷末钩子...",
  },
  novel_chapter_outline: {
    role: "novel_chapter_outline",
    label: "章纲",
    title: "章节大纲",
    placeholder: "写入本章目标、冲突、场景、出场人物和结尾钩子...",
  },
  novel_scene_outline: {
    role: "novel_scene_outline",
    label: "场纲",
    title: "场景大纲",
    placeholder: "写入场景目标、人物行动、尝试失败、线索反转和悬念收尾...",
  },
  novel_chapter: {
    role: "novel_chapter",
    label: "章节",
    title: "章节正文",
    placeholder: "写入章节正文，或先写本章要发生什么...",
  },
  novel_bible: {
    role: "novel_bible",
    label: "圣经",
    title: "小说圣经",
    placeholder: "写入人物设定、时间线、地点、伏笔、道具、规则和未解悬念...",
  },
  novel_style_guide: {
    role: "novel_style_guide",
    label: "风格",
    title: "风格指南",
    placeholder: "写入句式、对白风格、描写密度、节奏、禁用词和平台尺度...",
  },
  character_cast: {
    role: "character_cast",
    label: "角色总表",
    title: "角色总表",
    placeholder: "写入主要角色、身份、目标、弱点、阵营、关系和剧情功能...",
  },
  character: {
    role: "character",
    label: "角色",
    title: "角色卡",
    placeholder: "写入角色身份、目标、弱点、关系和人物弧光...",
  },
  character_relation: {
    role: "character_relation",
    label: "关系",
    title: "人物关系",
    placeholder: "写入角色之间的立场、利益、情感、秘密和冲突...",
  },
  character_arc: {
    role: "character_arc",
    label: "角色线",
    title: "角色线",
    placeholder: "写入主要角色在剧情中的目标变化、关系推进和人物弧光...",
  },
  scene: {
    role: "scene",
    label: "场景",
    title: "场景片段",
    placeholder: "写入角色出场、关键桥段、单场戏或可继续扩写的片段...",
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
    placeholder: "写入要转换成图像提示词的内容...",
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
