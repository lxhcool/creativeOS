import {
  type MouseEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as Popover from "@radix-ui/react-popover";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import {
  AlertTriangle,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  Clapperboard,
  FileText,
  ListTree,
  Loader2,
  PenLine,
  Repeat2,
  RotateCcw,
  Sparkles,
  Tag,
  UserRound,
  UsersRound,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import type {
  CanvasElement,
  CanvasTextRole,
} from "@/entities/canvas/model/types";
import {
  getCanvasTextRole,
  getCanvasTextRoleConfig,
} from "@/entities/canvas/lib/textRoles";
import type { CanvasSelectOption } from "../model/types";
import { getCanvasNodeEditorPlaceholder } from "../lib/editor";
import { NODE_PADDING } from "../model/constants";

type TextResultPlacement = "update_current" | "create_result";
type OpenMenu = "model" | "convert" | null;

export type CanvasNodeGenerateOptions = {
  actionId?: string;
  instruction?: string;
  placement?: TextResultPlacement;
  sourceText?: string;
  resultTextRole?: CanvasTextRole;
  generationMode?: "single" | "collaborative";
  actionLabel?: string;
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

type TextWorkbenchAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  placement: TextResultPlacement;
  instruction: string;
  resultTextRole?: CanvasTextRole;
  generationMode?: "single" | "collaborative";
};

type TextActionGroup = {
  primary: TextWorkbenchAction[];
  secondary: TextWorkbenchAction[];
};

const GENERAL_PRIMARY_ACTIONS: TextWorkbenchAction[] = [
  {
    id: "continue",
    label: "续写",
    icon: PenLine,
    placement: "create_result",
    instruction: "请接着当前文本继续写下去，保持原有语气、节奏和世界观，不要重复原文。",
  },
  {
    id: "optimize",
    label: "优化",
    icon: Sparkles,
    placement: "update_current",
    instruction: "请优化当前文本，保留核心意思，综合润色、改写和表达提升，让内容更自然、更清晰、更有吸引力，不要额外解释。",
  },
  {
    id: "expand",
    label: "扩写",
    icon: Repeat2,
    placement: "create_result",
    instruction: "请在当前文本基础上扩写，补充细节、情绪、动作和画面，但保留原本的核心意思。",
  },
  {
    id: "summary",
    label: "总结",
    icon: FileText,
    placement: "create_result",
    instruction: "请把当前文本整理成清晰总结，先给一句话概括，再列出 3 到 5 个要点。",
  },
  {
    id: "title",
    label: "标题",
    icon: Tag,
    placement: "create_result",
    instruction: "请基于当前文本提炼 8 个标题，覆盖简洁、文艺、悬念、文学感和商业表达几种方向。",
  },
];

const GENERAL_CONVERT_ACTIONS: TextWorkbenchAction[] = [
  {
    id: "article",
    label: "文章",
    icon: FileText,
    placement: "create_result",
    resultTextRole: "article",
    instruction: "请基于当前主题、观点或素材写成一篇结构完整的文章，包含清晰标题、开头、主体段落和结尾，表达自然，不要额外解释。",
  },
  {
    id: "novel",
    label: "小说",
    icon: BookOpen,
    placement: "create_result",
    resultTextRole: "novel_setup",
    generationMode: "collaborative",
    instruction: "请基于当前文本整理成创作意图，只包含题材类型、目标读者、篇幅目标、叙事视角、情绪基调、核心卖点、平台方向和读者期待。不要写角色总表、世界观设定、故事大纲或正文。",
  },
  {
    id: "outline",
    label: "大纲",
    icon: ListTree,
    placement: "create_result",
    resultTextRole: "novel_outline",
    instruction: "请把当前文本整理成创作大纲，包含主题、核心冲突、人物关系、起承转合和后续可展开方向。",
  },
  {
    id: "character",
    label: "角色总表",
    icon: UsersRound,
    placement: "create_result",
    resultTextRole: "character_cast",
    instruction: "请从当前文本中提炼或创作角色总表，覆盖主要角色、身份、阵营、目标、弱点、剧情功能、与主线关系和彼此的基础连接。不要写世界观、故事大纲、单个角色卡或正文。",
  },
  {
    id: "scene",
    label: "场景",
    icon: PenLine,
    placement: "create_result",
    resultTextRole: "scene",
    instruction: "请把当前文本整理成一个可继续创作的场景片段，包含场景目标、人物行动、冲突触发点、关键对白或旁白和结尾钩子。",
  },
];

const TEXT_ACTION_GROUPS: Record<CanvasTextRole, TextActionGroup> = {
  general: {
    primary: GENERAL_PRIMARY_ACTIONS,
    secondary: GENERAL_CONVERT_ACTIONS,
  },
  article: {
    primary: [
      GENERAL_PRIMARY_ACTIONS[1]!,
      GENERAL_PRIMARY_ACTIONS[2]!,
      GENERAL_PRIMARY_ACTIONS[3]!,
      GENERAL_PRIMARY_ACTIONS[4]!,
      {
        id: "article_structure",
        label: "结构",
        icon: ListTree,
        placement: "update_current",
        resultTextRole: "article",
        instruction: "请重组当前文章结构，强化标题、开头、分论点、过渡和结尾，保留核心观点，不要额外解释。",
      },
    ],
    secondary: GENERAL_CONVERT_ACTIONS,
  },
  novel_setup: {
    primary: [
      {
        id: "setup_complete",
        label: "补全",
        icon: Sparkles,
        placement: "update_current",
        resultTextRole: "novel_setup",
        instruction: "请补全当前创作意图，只补齐类型、目标读者、篇幅目标、叙事视角、情绪基调、核心卖点、平台方向、读者期待和禁区。不要展开角色、世界观、剧情大纲或正文。",
      },
      {
        id: "setup_core",
        label: "故事核心",
        icon: BookOpen,
        placement: "create_result",
        resultTextRole: "novel_core",
        generationMode: "collaborative",
        instruction: "请基于当前创作意图生成故事核心，只定义主线驱动力：一句话故事命题、核心问题、主线目标、主要阻碍类型、关键赌注、冲突升级方式、结局方向和情绪主线。不要写角色总表、世界观设定、章节大纲或正文。",
      },
      {
        id: "setup_cast",
        label: "角色总表",
        icon: UsersRound,
        placement: "create_result",
        resultTextRole: "character_cast",
        generationMode: "collaborative",
        instruction: "请基于当前创作意图生成角色总表，覆盖主要角色、身份、阵营、目标、弱点、剧情功能、与主线关系和彼此的基础连接。不要写世界观、全书大纲、章节大纲或正文。",
      },
      {
        id: "setup_world",
        label: "世界观",
        icon: ListTree,
        placement: "create_result",
        resultTextRole: "novel_world",
        generationMode: "collaborative",
        instruction: "请基于当前创作意图生成世界观设定，只定义故事发生的外部规则：时代/空间背景、权力结构、能力或规则体系、社会规则、禁忌代价、主要场景、历史事件和名词表。不要写角色总表、故事大纲或正文。",
      },
    ],
    secondary: [],
  },
  novel_core: {
    primary: [
      {
        id: "core_refine",
        label: "补强",
        icon: Sparkles,
        placement: "update_current",
        resultTextRole: "novel_core",
        instruction: "请补强当前故事核心，只强化一句话故事命题、核心问题、主线目标、主要阻碍类型、关键赌注、冲突升级方式、结局方向和情绪主线。不要扩展角色总表、世界观设定、章节大纲或正文。",
      },
      {
        id: "core_cast",
        label: "角色总表",
        icon: UsersRound,
        placement: "create_result",
        resultTextRole: "character_cast",
        generationMode: "collaborative",
        instruction: "请基于当前故事核心生成角色总表，覆盖主要角色、身份、阵营、目标、弱点、剧情功能、与主线关系和彼此基础连接。不要写世界观、全书大纲、章节大纲或正文。",
      },
      {
        id: "core_world",
        label: "世界观",
        icon: ListTree,
        placement: "create_result",
        resultTextRole: "novel_world",
        generationMode: "collaborative",
        instruction: "请基于当前故事核心生成世界观设定，只定义故事发生的外部规则：时代/空间背景、权力结构、能力或规则体系、社会规则、禁忌代价、主要场景、历史事件和名词表。不要写角色总表、全书大纲、章节大纲或正文。",
      },
      {
        id: "core_outline",
        label: "全书大纲",
        icon: ListTree,
        placement: "create_result",
        resultTextRole: "novel_outline",
        generationMode: "collaborative",
        instruction: "请基于故事核心、角色总表和世界观生成全书大纲，包含全书主线、阶段目标、核心冲突升级、关键转折、人物成长和结局方向。",
      },
    ],
    secondary: [],
  },
  novel_world: {
    primary: [
      {
        id: "world_refine",
        label: "完善",
        icon: Sparkles,
        placement: "update_current",
        resultTextRole: "novel_world",
        instruction: "请完善当前世界观设定，只补齐外部规则：时代/空间背景、规则体系、权力结构、禁忌代价、主要场景、历史事件和专有名词表。不要扩展角色总表、全书大纲、章节大纲或正文。",
      },
      {
        id: "world_outline",
        label: "全书大纲",
        icon: ListTree,
        placement: "create_result",
        resultTextRole: "novel_outline",
        generationMode: "collaborative",
        instruction: "请基于故事核心、角色总表和当前世界观生成全书大纲，包含全书主线、阶段目标、核心冲突升级、关键转折、人物成长和结局方向。",
      },
    ],
    secondary: [],
  },
  novel_outline: {
    primary: [
      {
        id: "outline_refine",
        label: "完善",
        icon: Sparkles,
        placement: "update_current",
        resultTextRole: "novel_outline",
        instruction: "请完善当前全书大纲，强化主线目标、阶段结构、关键转折、冲突升级、人物成长路径、伏笔安排和结局方向，不要额外解释。",
      },
      {
        id: "outline_volumes",
        label: "分卷大纲",
        icon: ListTree,
        placement: "create_result",
        resultTextRole: "novel_volume_outline",
        generationMode: "collaborative",
        instruction: "请基于当前全书大纲生成分卷大纲。每卷包含主题、阶段目标、主要冲突、关键转折、人物变化、伏笔推进和卷末钩子。",
      },
    ],
    secondary: [],
  },
  novel_volume_outline: {
    primary: [
      {
        id: "volume_refine",
        label: "细化",
        icon: Sparkles,
        placement: "update_current",
        resultTextRole: "novel_volume_outline",
        instruction: "请细化当前分卷大纲，明确每卷目标、主要冲突、关键转折、人物变化、伏笔推进和卷末钩子。",
      },
      {
        id: "volume_chapters",
        label: "章节大纲",
        icon: ListTree,
        placement: "create_result",
        resultTextRole: "novel_chapter_outline",
        generationMode: "collaborative",
        instruction: "请基于当前分卷大纲，并结合全书大纲、角色总表、人物关系和世界观，生成章节大纲。每章包含标题、目标、出场人物、关键事件、人物变化、伏笔和结尾钩子。",
      },
    ],
    secondary: [],
  },
  novel_chapter_outline: {
    primary: [
      {
        id: "chapter_outline_scene",
        label: "场景大纲",
        icon: ListTree,
        placement: "create_result",
        resultTextRole: "novel_scene_outline",
        generationMode: "collaborative",
        instruction: "请基于当前章节大纲拆成场景大纲，每个场景包含场景目标、出场人物、行动推进、尝试失败、线索或反转、情绪变化和悬念收尾。不要写成视频分镜。",
      },
      {
        id: "chapter_outline_write",
        label: "正文",
        icon: PenLine,
        placement: "create_result",
        resultTextRole: "novel_chapter",
        generationMode: "collaborative",
        instruction: "请基于当前章节大纲创作章节正文，强化场景、行动、对白、冲突和结尾钩子。",
      },
      {
        id: "chapter_outline_conflict",
        label: "细化",
        icon: Sparkles,
        placement: "update_current",
        resultTextRole: "novel_chapter_outline",
        instruction: "请强化当前章节大纲的戏剧张力，明确本章人物目标、阻碍、代价、关键转折和结尾悬念，不要额外解释。",
      },
      {
        id: "chapter_outline_next",
        label: "下章纲",
        icon: BookOpen,
        placement: "create_result",
        resultTextRole: "novel_chapter_outline",
        generationMode: "collaborative",
        instruction: "请根据当前章节大纲生成下一章章节大纲，保持主线连续，推进冲突并制造新钩子。",
      },
      {
        id: "chapter_outline_summary",
        label: "摘要",
        icon: FileText,
        placement: "create_result",
        resultTextRole: "general",
        instruction: "请把当前章节大纲整理成简短摘要，列出本章目标、关键事件、人物变化和伏笔。",
      },
    ],
    secondary: [],
  },
  novel_scene_outline: {
    primary: [
      {
        id: "scene_outline_refine",
        label: "细化",
        icon: Sparkles,
        placement: "update_current",
        resultTextRole: "novel_scene_outline",
        instruction: "请细化当前场景大纲，补强每个场景的目标、动作、阻碍、线索、反转、情绪推进和悬念收尾。不要写成视频分镜。",
      },
      {
        id: "scene_outline_write",
        label: "正文",
        icon: PenLine,
        placement: "create_result",
        resultTextRole: "novel_chapter",
        generationMode: "collaborative",
        instruction: "请基于当前场景大纲创作章节正文，强化场景、行动、对白、冲突推进、人物感受和结尾钩子。",
      },
    ],
    secondary: [],
  },
  novel_chapter: {
    primary: [
      {
        id: "chapter_continue",
        label: "续写",
        icon: PenLine,
        placement: "create_result",
        resultTextRole: "novel_chapter",
        generationMode: "collaborative",
        instruction: "请接着当前章节正文继续写下去，保持人物、语气、世界观和叙事节奏，不要重复原文。",
      },
      {
        id: "chapter_polish",
        label: "润色",
        icon: Sparkles,
        placement: "update_current",
        resultTextRole: "novel_chapter",
        instruction: "请润色当前章节正文，强化画面、节奏、人物感受和叙事张力，保留原有情节，不要额外解释。",
      },
      {
        id: "chapter_dialogue",
        label: "对白",
        icon: Clapperboard,
        placement: "update_current",
        resultTextRole: "novel_chapter",
        instruction: "请优化当前章节对白，让人物语气更鲜明、信息更自然、冲突更清楚，保留剧情走向。",
      },
      {
        id: "chapter_check",
        label: "检查",
        icon: ListTree,
        placement: "create_result",
        resultTextRole: "novel_bible",
        generationMode: "collaborative",
        instruction: "请基于当前章节正文，并结合已有材料，更新小说圣经：人物变化、已埋伏笔、未解决悬念、时间线、重要道具、能力规则和设定冲突。",
      },
      {
        id: "chapter_next",
        label: "下一章",
        icon: BookOpen,
        placement: "create_result",
        resultTextRole: "novel_chapter",
        generationMode: "collaborative",
        instruction: "请基于当前章节正文创作下一章，承接上一章结尾，推进主线、冲突和人物变化。",
      },
    ],
    secondary: [],
  },
  novel_bible: {
    primary: [
      {
        id: "bible_update",
        label: "更新",
        icon: RotateCcw,
        placement: "update_current",
        resultTextRole: "novel_bible",
        generationMode: "collaborative",
        instruction: "请更新当前小说圣经，补齐人物设定表、时间线、地点表、伏笔表、道具表、能力规则表、已发生事件摘要和未解决悬念。",
      },
      {
        id: "bible_check",
        label: "连贯性",
        icon: Check,
        placement: "create_result",
        resultTextRole: "general",
        generationMode: "collaborative",
        instruction: "请基于当前小说圣经做连贯性检查，指出人物、时间线、地点、伏笔、道具、能力规则和已发生事件之间的冲突，并给出修正建议。",
      },
    ],
    secondary: [],
  },
  novel_style_guide: {
    primary: [
      {
        id: "style_refine",
        label: "完善",
        icon: Sparkles,
        placement: "update_current",
        resultTextRole: "novel_style_guide",
        instruction: "请完善当前风格指南，明确句子长短、对白风格、描写密度、叙事节奏、禁用词、高频词、平台尺度和示例表达。",
      },
    ],
    secondary: [],
  },
  character_cast: {
    primary: [
      {
        id: "cast_refine",
        label: "补全",
        icon: Sparkles,
        placement: "update_current",
        resultTextRole: "character_cast",
        instruction: "请完善当前角色总表，补齐主要角色、身份、阵营、目标、弱点、剧情功能、与主线关系和角色之间的基础连接。保持多人总表结构，不要写世界观、故事大纲、单个角色卡或正文。",
      },
      {
        id: "cast_relation",
        label: "人物关系",
        icon: UsersRound,
        placement: "create_result",
        resultTextRole: "character_relation",
        generationMode: "collaborative",
        instruction: "请基于当前角色总表生成人物关系，整理主要角色之间的立场、利益、情感联系、秘密、冲突点和剧情用途。不要写成角色档案或正文。",
      },
      {
        id: "cast_character",
        label: "角色卡",
        icon: UserRound,
        placement: "create_result",
        resultTextRole: "character",
        instruction: "请从当前角色总表中挑选一个最关键角色，生成单人角色卡，包含身份、外貌、性格、背景、目标、弱点、关键关系和人物弧光。只写一个角色。",
      },
    ],
    secondary: [],
  },
  character: {
    primary: [
      {
        id: "character_complete",
        label: "补全",
        icon: Sparkles,
        placement: "update_current",
        resultTextRole: "character",
        instruction: "请补全当前角色卡，包含外貌、性格、背景、目标、弱点、关系和人物弧光。",
      },
    ],
    secondary: [],
  },
  character_relation: {
    primary: [
      {
        id: "relation_refine",
        label: "梳理",
        icon: Sparkles,
        placement: "update_current",
        resultTextRole: "character_relation",
        instruction: "请梳理当前人物关系网，补全阵营、利益、情感、秘密、对立点和剧情用途，让关系更清晰可用。",
      },
      {
        id: "relation_chapter_outline",
        label: "章节大纲",
        icon: ListTree,
        placement: "create_result",
        resultTextRole: "novel_chapter_outline",
        generationMode: "collaborative",
        instruction: "请基于当前人物关系，并结合已有故事大纲和角色总表，生成章节大纲。每章包含标题、目标、出场人物、关系推进、冲突、关键事件和结尾钩子。",
      },
    ],
    secondary: [],
  },
  character_arc: {
    primary: [
      {
        id: "arc_refine",
        label: "完善",
        icon: Sparkles,
        placement: "update_current",
        resultTextRole: "character_arc",
        instruction: "请完善当前角色线，补全阶段目标、关键转折、关系变化、冲突升级和人物弧光。这个节点仅作为旧画布的辅助材料，不要扩展成正文或关系网。",
      },
    ],
    secondary: [],
  },
  scene: {
    primary: [
      {
        id: "scene_refine",
        label: "润色",
        icon: Sparkles,
        placement: "update_current",
        resultTextRole: "scene",
        instruction: "请润色当前场景片段，强化空间感、动作、情绪、对白张力和结尾钩子，保留原有情节方向。",
      },
      {
        id: "scene_chapter",
        label: "扩正文",
        icon: BookOpen,
        placement: "create_result",
        resultTextRole: "novel_chapter",
        generationMode: "collaborative",
        instruction: "请基于当前场景片段扩写成更完整的小说正文，补全场景铺垫、行动、对白、人物感受和叙事张力。",
      },
    ],
    secondary: [],
  },
  script: {
    primary: [
      GENERAL_PRIMARY_ACTIONS[1]!,
      {
        id: "script_dialogue",
        label: "对白",
        icon: Clapperboard,
        placement: "update_current",
        resultTextRole: "script",
        instruction: "请优化当前剧本对白，让人物语气更清晰、冲突更强、信息更自然，保留原有剧情。",
      },
      {
        id: "script_storyboard",
        label: "分镜",
        icon: ListTree,
        placement: "create_result",
        resultTextRole: "storyboard",
        instruction: "请把当前剧本拆成分镜脚本，每个镜头包含镜号、画面、动作、对白或旁白、时长和生成提示词。",
      },
      GENERAL_PRIMARY_ACTIONS[3]!,
    ],
    secondary: [],
  },
  storyboard: {
    primary: [
      {
        id: "storyboard_refine",
        label: "细化",
        icon: Sparkles,
        placement: "update_current",
        resultTextRole: "storyboard",
        instruction: "请细化当前分镜，补充构图、镜头运动、动作、对白或旁白、时长和视觉提示词。",
      },
      {
        id: "storyboard_prompt",
        label: "Prompt",
        icon: WandSparkles,
        placement: "create_result",
        resultTextRole: "prompt",
        instruction: "请把当前分镜整理成适合图像生成的提示词列表，每个镜头单独输出。",
      },
      GENERAL_PRIMARY_ACTIONS[3]!,
    ],
    secondary: [],
  },
  prompt: {
    primary: [
      {
        id: "prompt_optimize",
        label: "优化",
        icon: Sparkles,
        placement: "update_current",
        resultTextRole: "prompt",
        instruction: "请优化当前提示词，补全主体、动作、场景、风格、构图、光线、镜头和负面限制，不要额外解释。",
      },
      {
        id: "prompt_cn",
        label: "中文",
        icon: FileText,
        placement: "update_current",
        resultTextRole: "prompt",
        instruction: "请把当前提示词整理成自然、清晰、适合图像生成的中文提示词，不要额外解释。",
      },
    ],
    secondary: [],
  },
};

const TEXT_ACTIONS = Object.values(TEXT_ACTION_GROUPS).flatMap((group) => [
  ...group.primary,
  ...group.secondary,
]);
const GLASS_POPOVER_CLASS =
  "z-[80] overflow-hidden border border-white/[0.1] bg-[#02070b]/[0.92] shadow-[0_24px_60px_rgba(0,0,0,0.46),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-2xl outline-none";
const MENU_ITEM_CLASS =
  "cursor-pointer transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/15 disabled:cursor-not-allowed disabled:opacity-45";

function isTextActionInstruction(value: string | undefined): boolean {
  const text = value?.trim();
  if (!text) return false;
  return TEXT_ACTIONS.some(
    (action) =>
      text === action.instruction ||
      text.startsWith(`${action.instruction}\n\n补充要求：`),
  );
}

function getVisibleTextPrompt(value: string | undefined): string {
  return isTextActionInstruction(value) ? "" : value || "";
}

function buildActionInstruction(action: TextWorkbenchAction, extra: string): string {
  const normalizedExtra = extra.trim();
  if (!normalizedExtra) return action.instruction;

  return `${action.instruction}\n\n补充要求：${normalizedExtra}`;
}

function hasNovelDraftPrerequisites(
  readiness?: CanvasTextWorkflowReadiness,
): boolean {
  return !!(
    readiness?.hasStoryOutline &&
    readiness.hasVolumeOutline &&
    readiness.hasCharacterCast &&
    readiness.hasChapterOutline
  );
}

function hasNovelOutlinePrerequisites(
  readiness?: CanvasTextWorkflowReadiness,
): boolean {
  return !!(
    readiness?.hasNovelCore &&
    readiness.hasNovelWorld &&
    readiness.hasCharacterCast
  );
}

function isTextActionAvailable(params: {
  action: TextWorkbenchAction;
  sourceRole: CanvasTextRole;
  readiness?: CanvasTextWorkflowReadiness;
}): boolean {
  const { action, sourceRole, readiness } = params;

  if (action.id === "relation_chapter_outline") return false;

  if (action.id === "scene_chapter") return false;

  if (
    (action.id === "core_outline" || action.id === "world_outline") &&
    !hasNovelOutlinePrerequisites(readiness)
  ) {
    return false;
  }

  if (action.id === "volume_chapters" && !readiness?.hasStoryOutline) {
    return false;
  }

  if (action.resultTextRole !== "novel_chapter") return true;

  if (sourceRole === "novel_chapter") return true;

  if (sourceRole !== "novel_chapter_outline" && sourceRole !== "novel_scene_outline") {
    return false;
  }

  return hasNovelDraftPrerequisites(readiness);
}

export function CanvasNodeEditorPanel({
  element,
  frame,
  modelOptions,
  modelValue,
  onTextChange,
  onPromptChange,
  onModelChange,
  onGenerate,
  disabled = false,
  onContextMenu,
  workflowReadiness,
}: {
  element: CanvasElement;
  frame: { left: number; top: number; width: number; height: number };
  modelOptions: CanvasSelectOption[];
  modelValue: string;
  onTextChange: (text: string) => void;
  onPromptChange: (prompt: string) => void;
  onModelChange: (modelRef: string) => void;
  onGenerate: (options?: CanvasNodeGenerateOptions) => void;
  disabled?: boolean;
  onContextMenu?: (event: MouseEvent<HTMLElement>) => void;
  workflowReadiness?: CanvasTextWorkflowReadiness;
}) {
  const isGenerating = element.status === "generating";
  const isFailed = element.status === "failed";
  const isText = element.kind === "text";
  const textRole = isText ? getCanvasTextRole(element.textRole) : "general";
  const isNovelWorkflowText =
    isText &&
    (textRole === "novel_setup" ||
      textRole === "novel_core" ||
      textRole === "character_cast" ||
      textRole === "novel_world" ||
      textRole === "novel_style_guide" ||
      textRole === "novel_outline" ||
      textRole === "novel_volume_outline" ||
      textRole === "novel_chapter_outline" ||
      textRole === "novel_chapter");
  const showTextToolbar = isText && !isNovelWorkflowText;
  const textRoleConfig = getCanvasTextRoleConfig(textRole);
  const actionGroup = TEXT_ACTION_GROUPS[textRole];
  const primaryActions = useMemo(
    () =>
      actionGroup.primary.filter((action) =>
        isTextActionAvailable({
          action,
          sourceRole: textRole,
          readiness: workflowReadiness,
        }),
      ),
    [actionGroup.primary, textRole, workflowReadiness],
  );
  const secondaryActions = useMemo(
    () =>
      actionGroup.secondary.filter((action) =>
        isTextActionAvailable({
          action,
          sourceRole: textRole,
          readiness: workflowReadiness,
        }),
      ),
    [actionGroup.secondary, textRole, workflowReadiness],
  );
  const roleActions = useMemo(
    () => [...primaryActions, ...secondaryActions],
    [primaryActions, secondaryActions],
  );
  const [selectedActionId, setSelectedActionId] = useState("continue");
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const fallbackAction = primaryActions[0] || secondaryActions[0] || GENERAL_PRIMARY_ACTIONS[0]!;
  const firstActionId = primaryActions[0]?.id || secondaryActions[0]?.id || "continue";
  const selectedAction =
    roleActions.find((action) => action.id === selectedActionId) ||
    fallbackAction;
  const selectedConvertAction = secondaryActions.find(
    (action) => action.id === selectedAction.id,
  );
  const SelectedConvertIcon = selectedConvertAction?.icon || WandSparkles;
  const hasTextInput =
    !isText || element.text.trim().length > 0 || !!element.prompt?.trim();
  const visiblePrompt = getVisibleTextPrompt(element.prompt);
  const isModelUnavailable = modelOptions.length === 0 || !modelValue;
  const interactionDisabled = isGenerating || disabled;
  const controlsDisabled = isGenerating || isModelUnavailable || disabled;
  const sendDisabled = controlsDisabled || !hasTextInput;
  const noticeMessage = isModelUnavailable
    ? isText
      ? "未配置可用文本模型，请先在模型设置中启用一个文本模型。"
      : "当前节点没有可用模型，请先在模型设置中启用对应类型。"
    : isFailed && element.error
      ? element.error
      : "";
  const selectedModelLabel =
    modelOptions.find((option) => option.ref === modelValue)?.label ||
    (modelOptions.length === 0 ? "未配置模型" : "选择模型");

  useEffect(() => {
    if (element.kind !== "text") return;
    setSelectedActionId(firstActionId);
    setOpenMenu(null);
  }, [element.id, element.kind, firstActionId, textRole]);

  useEffect(() => {
    if (element.kind !== "text") return;
    if (isTextActionInstruction(element.prompt)) {
      onPromptChange("");
    }
  }, [element.kind, element.prompt, onPromptChange]);

  const createGenerateOptions = (action: TextWorkbenchAction): CanvasNodeGenerateOptions => {
    const currentText = isText ? element.text.trim() : "";

    return {
      actionId: action.id,
      instruction: buildActionInstruction(action, visiblePrompt),
      placement: action.placement,
      sourceText: currentText,
      resultTextRole: action.resultTextRole || textRole,
      generationMode: action.generationMode,
      actionLabel: action.label,
    };
  };

  const applyTextAction = (action: TextWorkbenchAction) => {
    setSelectedActionId(action.id);
    setOpenMenu(null);
  };

  const handleGenerate = () => {
    if (disabled) return;
    if (isModelUnavailable) return;
    if (!hasTextInput) return;

    if (!isText || isNovelWorkflowText) {
      onGenerate();
      return;
    }

    onGenerate(createGenerateOptions(selectedAction));
  };

  const scale = element.width > 0 ? frame.width / element.width : 1;
  const nodeInset = Math.max(14, (NODE_PADDING + 6) * scale);
  const toolbarHeight = showTextToolbar ? 40 : 0;
  const footerHeight = 52;
  const instructionHeight = isText ? 42 : 0;
  const noticeHeight = noticeMessage ? 38 : 0;
  const noticeGap = noticeMessage ? 8 : 0;
  const inputGap = 12;
  const textEditorTop =
    frame.top + nodeInset + (showTextToolbar ? toolbarHeight + inputGap : 0);
  const footerTop = frame.top + frame.height - nodeInset - footerHeight;
  const instructionTop =
    footerTop - noticeHeight - noticeGap - instructionHeight - 8;
  const textEditorHeight = Math.max(
    44,
    frame.height -
      nodeInset * 2 -
      toolbarHeight -
      footerHeight -
      instructionHeight -
      noticeHeight -
      noticeGap -
      inputGap * 2 -
      8,
  );
  const promptEditorHeight = Math.max(
    54,
    frame.height - nodeInset * 2 - footerHeight - noticeHeight - noticeGap - 12,
  );

  return (
    <>
      {showTextToolbar && (
        <div
          className="fixed z-30 flex items-center gap-1.5 overflow-x-auto rounded-full bg-black/[0.24] px-1.5 py-1 text-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{
            left: frame.left + nodeInset,
            top: frame.top + nodeInset,
            width: Math.max(40, frame.width - nodeInset * 2),
            height: toolbarHeight,
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onContextMenu={onContextMenu}
          onWheel={(event) => event.stopPropagation()}
        >
          {primaryActions.map((action) => {
            const Icon = action.icon;

            return (
              <button
                key={action.id}
                type="button"
                onClick={() => applyTextAction(action)}
                disabled={controlsDisabled}
                title={action.label}
                className={`flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/15 ${
                  selectedAction.id === action.id
                    ? "bg-white/[0.14] text-white shadow-sm shadow-black/20"
                    : "text-white/56 hover:bg-white/[0.08] hover:text-white/88"
                } disabled:cursor-not-allowed disabled:opacity-45`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {action.label}
              </button>
            );
          })}
          {secondaryActions.length > 0 && (
            <Popover.Root
              open={openMenu === "convert"}
              onOpenChange={(open) => setOpenMenu(open ? "convert" : null)}
            >
              <Popover.Trigger asChild>
                <button
                  type="button"
                  disabled={controlsDisabled}
                  className={`flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/15 ${
                    selectedConvertAction
                      ? "bg-white/[0.14] text-white shadow-sm shadow-black/20"
                      : "text-white/56 hover:bg-white/[0.08] hover:text-white/88"
                  } disabled:cursor-not-allowed disabled:opacity-45`}
                  aria-expanded={openMenu === "convert"}
                  aria-label="转换文本类型"
                >
                  <SelectedConvertIcon className="h-3.5 w-3.5 shrink-0" />
                  {selectedConvertAction?.label || "转换"}
                  <ChevronDown
                    className={`h-3 w-3 shrink-0 transition-transform duration-200 ${
                      openMenu === "convert" ? "rotate-180" : ""
                    }`}
                  />
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  side="bottom"
                  align="start"
                  sideOffset={8}
                  collisionPadding={12}
                  className={`${GLASS_POPOVER_CLASS} grid w-56 grid-cols-2 gap-1.5 rounded-[18px] p-2`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                  onWheel={(event) => event.stopPropagation()}
                >
                  {secondaryActions.map((action) => {
                    const Icon = action.icon;

                    return (
                      <button
                        key={action.id}
                        type="button"
                        onClick={() => applyTextAction(action)}
                        disabled={controlsDisabled}
                        title={action.label}
                        className={`flex h-9 items-center gap-2 rounded-xl px-2.5 text-left text-[12px] font-semibold ${MENU_ITEM_CLASS} ${
                          selectedAction.id === action.id
                            ? "bg-white/[0.14] text-white"
                            : "text-white/68 hover:bg-white/[0.08] hover:text-white"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{action.label}</span>
                      </button>
                    );
                  })}
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          )}
        </div>
      )}

      {isText && (
        <div
          className="fixed z-20 rounded-2xl bg-black/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          style={{
            left: frame.left + nodeInset,
            top: textEditorTop,
            width: Math.max(40, frame.width - nodeInset * 2),
            height: textEditorHeight,
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onContextMenu={onContextMenu}
          onWheel={(event) => event.stopPropagation()}
        >
          <textarea
            value={element.text}
            onChange={(event) => onTextChange(event.target.value)}
            disabled={interactionDisabled}
            placeholder={textRoleConfig.placeholder}
            className="h-full w-full resize-none overflow-y-auto overscroll-contain border-none bg-transparent px-4 py-4 text-[15px] leading-6 text-white/88 outline-none placeholder:text-white/34 disabled:cursor-not-allowed disabled:text-white/54 [scrollbar-color:rgba(255,255,255,0.2)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5"
          />
        </div>
      )}

      {isText && (
        <div
          className="fixed z-30 overflow-hidden rounded-2xl bg-white/[0.055] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md"
          style={{
            left: frame.left + nodeInset,
            top: instructionTop,
            width: Math.max(40, frame.width - nodeInset * 2),
            height: instructionHeight,
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onContextMenu={onContextMenu}
          onWheel={(event) => event.stopPropagation()}
        >
          <input
            value={visiblePrompt}
            onChange={(event) => onPromptChange(event.target.value)}
            disabled={interactionDisabled}
            placeholder={`补充要求：告诉 AI 这次怎么${selectedAction.label}`}
            className="h-full w-full border-none bg-transparent px-3.5 text-[12px] font-medium text-white/78 outline-none placeholder:text-white/30 disabled:cursor-not-allowed disabled:text-white/42"
          />
        </div>
      )}

      {!isText && (
        <textarea
          value={element.prompt || ""}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder={getCanvasNodeEditorPlaceholder(element)}
          className="fixed z-30 resize-none overflow-y-auto overscroll-contain rounded-2xl bg-black/[0.14] px-4 py-4 text-[14px] leading-6 text-white/86 outline-none backdrop-blur-sm transition placeholder:text-white/34 focus:bg-black/[0.2] [scrollbar-color:rgba(255,255,255,0.2)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5"
          style={{
            left: frame.left + nodeInset,
            top: frame.top + nodeInset,
            width: Math.max(40, frame.width - nodeInset * 2),
            height: promptEditorHeight,
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onContextMenu={onContextMenu}
          onWheel={(event) => event.stopPropagation()}
        />
      )}

      <div
        className="fixed z-40 text-white"
        style={{
          left: frame.left + nodeInset,
          top: footerTop,
          width: Math.max(40, frame.width - nodeInset * 2),
          height: footerHeight,
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onContextMenu={onContextMenu}
        onWheel={(event) => event.stopPropagation()}
      >
        <div className="flex h-full items-center justify-between gap-2.5">
          <Popover.Root
            open={openMenu === "model"}
            onOpenChange={(open) => {
              if (modelOptions.length > 0) {
                setOpenMenu(open ? "model" : null);
              }
            }}
          >
            <Popover.Trigger asChild>
              <button
                type="button"
                disabled={controlsDisabled}
                className={`flex h-11 min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 rounded-2xl px-4 text-left text-[13px] font-semibold shadow-lg shadow-black/20 backdrop-blur-2xl transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/15 disabled:cursor-not-allowed ${
                  isModelUnavailable
                    ? "border border-white/[0.1] bg-white/[0.06] text-white/42"
                    : "bg-white/[0.07] text-white/78 hover:bg-white/[0.12] disabled:text-white/35"
                }`}
                aria-expanded={openMenu === "model"}
                aria-label="选择模型"
              >
                <span className="truncate">{selectedModelLabel}</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 text-white/45 transition-transform duration-200 ${
                    openMenu === "model" ? "rotate-180" : ""
                  }`}
                />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                side="top"
                align="start"
                sideOffset={8}
                collisionPadding={12}
                className={`${GLASS_POPOVER_CLASS} w-[var(--radix-popover-trigger-width)] min-w-72 max-w-96 rounded-[20px] p-1.5`}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                onWheel={(event) => event.stopPropagation()}
              >
                <ScrollArea.Root className="h-64 overflow-hidden">
                  <ScrollArea.Viewport className="h-full w-full pr-2">
                    {modelOptions.map((option) => (
                      <button
                        key={option.ref}
                        type="button"
                        onClick={() => {
                          onModelChange(option.ref);
                          setOpenMenu(null);
                        }}
                        className={`flex h-10 w-full items-center justify-between rounded-xl px-3 text-left text-sm font-semibold ${MENU_ITEM_CLASS} ${
                          option.ref === modelValue
                            ? "bg-white/[0.11] text-white"
                            : "text-white/62 hover:bg-white/[0.07] hover:text-white/90"
                        }`}
                      >
                        <span className="truncate">{option.label}</span>
                        {option.ref === modelValue && (
                          <Check className="h-4 w-4 shrink-0 text-white/72" />
                        )}
                      </button>
                    ))}
                  </ScrollArea.Viewport>
                  <ScrollArea.Scrollbar
                    orientation="vertical"
                    className="flex w-2 touch-none select-none p-0.5 opacity-70 transition-opacity duration-200 hover:opacity-100"
                  >
                    <ScrollArea.Thumb className="relative flex-1 rounded-full bg-white/[0.18] before:absolute before:left-1/2 before:top-1/2 before:h-full before:min-h-8 before:w-full before:-translate-x-1/2 before:-translate-y-1/2" />
                  </ScrollArea.Scrollbar>
                </ScrollArea.Root>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={sendDisabled}
            className={`flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border backdrop-blur-2xl transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/15 disabled:cursor-not-allowed ${
              isGenerating
                ? "border-white/[0.08] bg-white/[0.06] text-white/45 shadow-inner shadow-black/20"
                : isModelUnavailable
                  ? "border-white/[0.08] bg-white/[0.06] text-white/42 shadow-inner shadow-black/20"
                  : disabled
                    ? "border-white/[0.08] bg-white/[0.06] text-white/35 shadow-inner shadow-black/20"
                    : "border-white/[0.15] bg-white/[0.14] text-white shadow-lg shadow-black/20 hover:border-white/25 hover:bg-white/[0.22]"
            }`}
            aria-label={
              isGenerating
                ? "生成中"
                : disabled
                  ? "结果节点生成中"
                : !hasTextInput
                  ? "请输入内容后生成"
                : isModelUnavailable
                  ? "未配置可用模型"
                  : isFailed
                    ? "重试"
                    : "生成"
            }
            aria-busy={isGenerating}
          >
            {isGenerating ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : isModelUnavailable ? (
              <AlertTriangle className="h-5 w-5" />
            ) : (
              <ArrowUp className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>
      {noticeMessage && (
        <div
          className={`fixed z-40 flex items-center gap-2 rounded-2xl border px-3 shadow-[0_18px_36px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl ${
            isFailed
              ? "border-rose-200/[0.16] bg-rose-950/[0.72] text-rose-50/88"
              : "border-white/[0.1] bg-[#02070b]/[0.9] text-white/68"
          }`}
          style={{
            left: frame.left + nodeInset,
            top: footerTop - noticeHeight - noticeGap,
            width: Math.max(40, frame.width - nodeInset * 2),
            height: noticeHeight,
          }}
          role="alert"
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onContextMenu={onContextMenu}
          onWheel={(event) => event.stopPropagation()}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">
            {noticeMessage}
          </span>
          {isModelUnavailable && (
            <button
              type="button"
              className="shrink-0 cursor-pointer rounded-full bg-white/[0.1] px-2.5 py-1 text-[12px] font-semibold text-white/82 transition-colors duration-200 hover:bg-white/[0.16] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/15"
              onClick={() => {
                window.location.href = "/settings/providers";
              }}
            >
              去配置
            </button>
          )}
        </div>
      )}
    </>
  );
}
