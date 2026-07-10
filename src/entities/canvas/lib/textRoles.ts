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
