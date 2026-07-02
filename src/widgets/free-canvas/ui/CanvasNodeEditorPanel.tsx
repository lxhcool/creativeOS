import {
  type MouseEvent,
  useEffect,
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
  Eye,
  FileText,
  ListTree,
  Loader2,
  PenLine,
  Repeat2,
  RotateCcw,
  Sparkles,
  Tag,
  UserRound,
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
  instruction?: string;
  placement?: TextResultPlacement;
  sourceText?: string;
  resultTextRole?: CanvasTextRole;
  generationMode?: "single" | "collaborative";
  actionLabel?: string;
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
    instruction: "请基于当前文本提炼 8 个标题，覆盖简洁、文艺、悬念、短视频和商业表达几种方向。",
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
    id: "script",
    label: "剧本",
    icon: Clapperboard,
    placement: "create_result",
    resultTextRole: "script",
    instruction: "请基于当前文本写成剧本，包含场景、人物、动作、对白和镜头提示，结构清楚，适合继续拆分分镜。",
  },
  {
    id: "novel",
    label: "小说",
    icon: BookOpen,
    placement: "create_result",
    resultTextRole: "novel_chapter",
    generationMode: "collaborative",
    instruction: "请基于当前文本创作一段小说正文，保留核心设定，强化人物感受、场景氛围和叙事张力。",
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
    label: "角色",
    icon: UserRound,
    placement: "create_result",
    resultTextRole: "character",
    instruction: "请从当前文本中提炼或创作角色设定，包含外貌、性格、背景、目标、弱点、关系和视觉关键词。",
  },
  {
    id: "storyboard",
    label: "分镜",
    icon: Clapperboard,
    placement: "create_result",
    resultTextRole: "storyboard",
    instruction: "请把当前文本拆成分镜脚本，每个镜头包含镜号、画面、动作、对白或旁白、时长和可用于图像/视频生成的提示词。",
  },
  {
    id: "prompt",
    label: "Prompt",
    icon: WandSparkles,
    placement: "create_result",
    resultTextRole: "prompt",
    instruction: "请把当前文本转写成适合图像或视频生成的中文提示词，保留主体、动作、场景、风格、构图和负面限制。",
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
        label: "完善",
        icon: Sparkles,
        placement: "update_current",
        resultTextRole: "novel_setup",
        instruction: "请完善当前小说设定，补齐题材、世界观、主角、核心矛盾、金手指、叙事风格和长期看点，不要额外解释。",
      },
      {
        id: "setup_outline",
        label: "大纲",
        icon: ListTree,
        placement: "create_result",
        resultTextRole: "novel_outline",
        generationMode: "collaborative",
        instruction: "请基于当前小说设定生成故事大纲，包含主线、阶段目标、关键转折、人物成长和结局方向。",
      },
      {
        id: "setup_character",
        label: "角色卡",
        icon: UserRound,
        placement: "create_result",
        resultTextRole: "character",
        instruction: "请基于当前小说设定生成基础角色卡，包含身份、背景、目标、弱点、核心关系、初始冲突和视觉关键词。重点是人物档案，不要展开章节剧情。",
      },
      {
        id: "setup_chapter_outline",
        label: "章纲",
        icon: BookOpen,
        placement: "create_result",
        resultTextRole: "novel_chapter_outline",
        generationMode: "collaborative",
        instruction: "请基于当前小说设定生成第一章章节大纲，包含本章目标、出场人物、场景、冲突、结尾钩子。",
      },
      {
        id: "setup_first_chapter",
        label: "首章",
        icon: PenLine,
        placement: "create_result",
        resultTextRole: "novel_chapter",
        generationMode: "collaborative",
        instruction: "请基于当前小说设定创作第一章正文，开篇要有代入感、冲突和继续阅读的钩子。",
      },
    ],
    secondary: [],
  },
  novel_outline: {
    primary: [
      {
        id: "outline_refine",
        label: "细化",
        icon: Sparkles,
        placement: "update_current",
        resultTextRole: "novel_outline",
        instruction: "请细化当前故事大纲，强化主线、阶段目标、关键转折、人物成长和节奏安排，不要额外解释。",
      },
      {
        id: "outline_chapters",
        label: "拆章",
        icon: ListTree,
        placement: "create_result",
        resultTextRole: "novel_chapter_outline",
        generationMode: "collaborative",
        instruction: "请把当前故事大纲拆成章节大纲，每章包含标题、目标、冲突、关键事件和结尾钩子。",
      },
      {
        id: "outline_characters",
        label: "角色线",
        icon: UserRound,
        placement: "create_result",
        resultTextRole: "character",
        instruction: "请基于当前故事大纲整理角色线，包含主要角色在各阶段的目标变化、关系推进、冲突升级、人物弧光和关键出场节点。重点是角色如何服务剧情，不要重复基础角色档案。",
      },
      {
        id: "outline_first_chapter",
        label: "首章",
        icon: PenLine,
        placement: "create_result",
        resultTextRole: "novel_chapter",
        generationMode: "collaborative",
        instruction: "请基于当前故事大纲创作第一章正文，兼顾设定引入、人物行动、冲突和结尾钩子。",
      },
    ],
    secondary: [],
  },
  novel_chapter_outline: {
    primary: [
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
        label: "冲突",
        icon: Sparkles,
        placement: "update_current",
        resultTextRole: "novel_chapter_outline",
        instruction: "请强化当前章节大纲的戏剧冲突、人物目标、阻碍和结尾悬念，不要额外解释。",
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
        id: "chapter_outline",
        label: "章纲",
        icon: ListTree,
        placement: "create_result",
        resultTextRole: "novel_chapter_outline",
        instruction: "请从当前章节正文中提炼章节大纲，包含标题、关键事件、人物变化、伏笔和下一章方向。",
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
  character: {
    primary: [
      {
        id: "character_complete",
        label: "补全",
        icon: Sparkles,
        placement: "update_current",
        resultTextRole: "character",
        instruction: "请补全当前角色卡，包含外貌、性格、背景、目标、弱点、关系、人物弧光和视觉关键词。",
      },
      {
        id: "character_relation",
        label: "关系",
        icon: UserRound,
        placement: "create_result",
        resultTextRole: "general",
        instruction: "请基于当前角色卡生成人物关系与冲突说明，列出亲密关系、敌对关系、隐藏动机和剧情用途。",
      },
      {
        id: "character_scene",
        label: "出场",
        icon: PenLine,
        placement: "create_result",
        resultTextRole: "novel_chapter",
        generationMode: "collaborative",
        instruction: "请基于当前角色卡创作一段角色首次出场片段，突出人物气质、目标、动作和冲突。",
      },
      {
        id: "character_prompt",
        label: "视觉",
        icon: WandSparkles,
        placement: "create_result",
        resultTextRole: "prompt",
        instruction: "请把当前角色卡转写成适合图像生成的角色视觉提示词，包含外貌、服装、姿态、表情、场景和风格。",
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
    secondary: GENERAL_CONVERT_ACTIONS,
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
        instruction: "请把当前分镜整理成适合图像或视频生成的提示词列表，每个镜头单独输出。",
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
        instruction: "请把当前提示词整理成自然、清晰、适合图像或视频生成的中文提示词，不要额外解释。",
      },
      {
        id: "prompt_storyboard",
        label: "分镜",
        icon: Clapperboard,
        placement: "create_result",
        resultTextRole: "storyboard",
        instruction: "请基于当前提示词扩展成分镜脚本，每个镜头包含画面、动作、时长和生成提示词。",
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
  return TEXT_ACTIONS.some((action) => text === action.instruction);
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
  onRestorePreviousText,
  onOpenPreview,
  disabled = false,
  onContextMenu,
}: {
  element: CanvasElement;
  frame: { left: number; top: number; width: number; height: number };
  modelOptions: CanvasSelectOption[];
  modelValue: string;
  onTextChange: (text: string) => void;
  onPromptChange: (prompt: string) => void;
  onModelChange: (modelRef: string) => void;
  onGenerate: (options?: CanvasNodeGenerateOptions) => void;
  onRestorePreviousText?: () => void;
  onOpenPreview?: () => void;
  disabled?: boolean;
  onContextMenu?: (event: MouseEvent<HTMLElement>) => void;
}) {
  const isGenerating = element.status === "generating";
  const isFailed = element.status === "failed";
  const isText = element.kind === "text";
  const textRole = isText ? getCanvasTextRole(element.textRole) : "general";
  const textRoleConfig = getCanvasTextRoleConfig(textRole);
  const actionGroup = TEXT_ACTION_GROUPS[textRole];
  const roleActions = [...actionGroup.primary, ...actionGroup.secondary];
  const [selectedActionId, setSelectedActionId] = useState("continue");
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const fallbackAction = actionGroup.primary[0] || GENERAL_PRIMARY_ACTIONS[0]!;
  const selectedAction =
    roleActions.find((action) => action.id === selectedActionId) ||
    fallbackAction;
  const selectedConvertAction = actionGroup.secondary.find(
    (action) => action.id === selectedAction.id,
  );
  const SelectedConvertIcon = selectedConvertAction?.icon || WandSparkles;
  const previousTextRevision = isText ? element.meta?.revisions?.[0] : undefined;
  const hasPreviewContent = isText && element.text.trim().length > 0;
  const isModelUnavailable = modelOptions.length === 0 || !modelValue;
  const interactionDisabled = isGenerating || disabled;
  const controlsDisabled = isGenerating || isModelUnavailable || disabled;
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
    setSelectedActionId(TEXT_ACTION_GROUPS[textRole].primary[0]?.id || "continue");
    setOpenMenu(null);
  }, [element.id, element.kind, textRole]);

  useEffect(() => {
    if (element.kind !== "text") return;
    if (isTextActionInstruction(element.prompt)) {
      onPromptChange("");
    }
  }, [element.kind, element.prompt, onPromptChange]);

  const createGenerateOptions = (action: TextWorkbenchAction): CanvasNodeGenerateOptions => {
    const currentText = isText ? element.text.trim() : "";

    return {
      instruction: action.instruction,
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

  const runTextAction = (action: TextWorkbenchAction) => {
    if (disabled) return;
    applyTextAction(action);
    onGenerate(createGenerateOptions(action));
  };

  const handleGenerate = () => {
    if (disabled) return;
    if (isModelUnavailable) return;

    if (!isText) {
      onGenerate();
      return;
    }

    onGenerate(createGenerateOptions(selectedAction));
  };

  const scale = element.width > 0 ? frame.width / element.width : 1;
  const nodeInset = Math.max(14, (NODE_PADDING + 6) * scale);
  const toolbarHeight = 40;
  const footerHeight = 52;
  const noticeHeight = noticeMessage ? 38 : 0;
  const noticeGap = noticeMessage ? 8 : 0;
  const inputGap = 12;
  const textEditorTop = frame.top + nodeInset + toolbarHeight + inputGap;
  const textEditorHeight = Math.max(
    44,
    frame.height -
      nodeInset * 2 -
      toolbarHeight -
      footerHeight -
      noticeHeight -
      noticeGap -
      inputGap * 2,
  );
  const promptEditorHeight = Math.max(
    54,
    frame.height - nodeInset * 2 - footerHeight - noticeHeight - noticeGap - 12,
  );
  const footerTop = frame.top + frame.height - nodeInset - footerHeight;

  return (
    <>
      {isText && (
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
          {actionGroup.primary.map((action) => {
            const Icon = action.icon;

            return (
              <button
                key={action.id}
                type="button"
                onClick={() => runTextAction(action)}
                disabled={controlsDisabled}
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
          {actionGroup.secondary.length > 0 && (
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
                  {actionGroup.secondary.map((action) => {
                    const Icon = action.icon;

                    return (
                      <button
                        key={action.id}
                        type="button"
                        onClick={() => runTextAction(action)}
                        disabled={controlsDisabled}
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
          <span className="pointer-events-none absolute bottom-3 right-4 text-[12px] text-white/32">
            {element.text.length} 字
          </span>
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
                    ? "border border-[#f6c453]/20 bg-[#f6c453]/[0.08] text-[#f8d787]/82"
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
          {hasPreviewContent && onOpenPreview && (
            <button
              type="button"
              onClick={onOpenPreview}
              disabled={interactionDisabled}
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-white/[0.07] text-white/62 shadow-lg shadow-black/20 backdrop-blur-2xl transition-colors duration-200 hover:bg-white/[0.12] hover:text-white/88 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/15 disabled:cursor-not-allowed disabled:opacity-45"
              aria-label="弹窗预览"
              title="弹窗预览"
            >
              <Eye className="h-4 w-4" />
            </button>
          )}
          {previousTextRevision && onRestorePreviousText && (
            <button
              type="button"
              onClick={onRestorePreviousText}
              disabled={interactionDisabled}
              className="flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-2xl bg-white/[0.07] px-3 text-[12px] font-semibold text-white/62 shadow-lg shadow-black/20 backdrop-blur-2xl transition-colors duration-200 hover:bg-white/[0.12] hover:text-white/88 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/15 disabled:cursor-not-allowed disabled:opacity-45"
              aria-label={`恢复${previousTextRevision.label || "上一版"}`}
              title={previousTextRevision.label || "上一版"}
            >
              <RotateCcw className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">上一版</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={controlsDisabled}
            className={`flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border backdrop-blur-2xl transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/15 disabled:cursor-not-allowed ${
              isGenerating
                ? "border-white/[0.08] bg-white/[0.06] text-white/45 shadow-inner shadow-black/20"
                : isModelUnavailable
                  ? "border-[#f6c453]/20 bg-[#f6c453]/[0.08] text-[#f8d787]/72 shadow-inner shadow-black/20"
                  : disabled
                    ? "border-white/[0.08] bg-white/[0.06] text-white/35 shadow-inner shadow-black/20"
                : "border-white/[0.15] bg-white/[0.14] text-white shadow-lg shadow-black/20 hover:border-white/25 hover:bg-white/[0.22]"
            }`}
            aria-label={
              isGenerating
                ? "生成中"
                : disabled
                  ? "结果节点生成中"
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
          className="fixed z-40 flex items-center gap-2 rounded-2xl border border-[#f6c453]/20 bg-[#140f05]/[0.9] px-3 text-[#f8d787] shadow-[0_18px_36px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl"
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
