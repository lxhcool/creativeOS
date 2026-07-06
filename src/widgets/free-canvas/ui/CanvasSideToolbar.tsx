import {
  BookOpen,
  ChevronRight,
  Clapperboard,
  FileInput,
  FileText,
  Image as ImageIcon,
  ListTree,
  Music,
  PenLine,
  Settings,
  Type,
  UserRound,
  UsersRound,
  Video,
  WandSparkles,
} from "lucide-react";
import {
  type FocusEvent,
  type ReactNode,
  useState,
} from "react";
import type { CanvasTextRole } from "@/entities/canvas/model/types";
import {
  getCanvasTextRoleConfig,
} from "@/entities/canvas/lib/textRoles";

type TextMenuItem = {
  role: CanvasTextRole;
  icon: ReactNode;
  description: string;
};

const TEXT_MENU_ITEMS: TextMenuItem[] = [
  {
    role: "general",
    icon: <Type className="h-4 w-4" />,
    description: "素材、草稿、普通文本",
  },
  {
    role: "article",
    icon: <FileText className="h-4 w-4" />,
    description: "文章、观点、长内容",
  },
  {
    role: "novel_setup",
    icon: <BookOpen className="h-4 w-4" />,
    description: "类型、读者、卖点、风格",
  },
  {
    role: "novel_core",
    icon: <BookOpen className="h-4 w-4" />,
    description: "梗概、目标、冲突、情绪线",
  },
  {
    role: "novel_world",
    icon: <ListTree className="h-4 w-4" />,
    description: "背景、规则、势力、名词表",
  },
  {
    role: "novel_outline",
    icon: <ListTree className="h-4 w-4" />,
    description: "全书主线、阶段、结局",
  },
  {
    role: "novel_volume_outline",
    icon: <ListTree className="h-4 w-4" />,
    description: "分卷目标、转折、卷末钩子",
  },
  {
    role: "novel_chapter_outline",
    icon: <ListTree className="h-4 w-4" />,
    description: "本章目标、冲突、钩子",
  },
  {
    role: "novel_chapter",
    icon: <BookOpen className="h-4 w-4" />,
    description: "章节正文、续写",
  },
  {
    role: "novel_bible",
    icon: <FileText className="h-4 w-4" />,
    description: "时间线、伏笔、设定一致性",
  },
  {
    role: "novel_style_guide",
    icon: <PenLine className="h-4 w-4" />,
    description: "句式、对白、节奏、禁用词",
  },
  {
    role: "character_cast",
    icon: <UsersRound className="h-4 w-4" />,
    description: "主要角色、阵营、目标",
  },
  {
    role: "character",
    icon: <UserRound className="h-4 w-4" />,
    description: "单人角色卡、人设档案",
  },
  {
    role: "character_relation",
    icon: <UsersRound className="h-4 w-4" />,
    description: "关系网、阵营、冲突结构",
  },
  {
    role: "scene",
    icon: <PenLine className="h-4 w-4" />,
    description: "出场片段、关键桥段、单场戏",
  },
  {
    role: "script",
    icon: <Clapperboard className="h-4 w-4" />,
    description: "改编稿、动作、对白",
  },
  {
    role: "storyboard",
    icon: <Clapperboard className="h-4 w-4" />,
    description: "视频分镜、镜头、时长",
  },
  {
    role: "prompt",
    icon: <WandSparkles className="h-4 w-4" />,
    description: "图像生成提示词",
  },
];

export function CanvasSideToolbar({
  onAddTextRole,
  onAddImage,
  onAddVideo,
  onAddAudio,
  onImport,
  onOpenApiConfig,
  textRoles,
  mediaKinds,
  allowImport = true,
}: {
  onAddTextRole: (role: CanvasTextRole) => void;
  onAddImage: () => void;
  onAddVideo: () => void;
  onAddAudio: () => void;
  onImport: () => void;
  onOpenApiConfig: () => void;
  textRoles?: CanvasTextRole[];
  mediaKinds?: Array<"image" | "video" | "audio">;
  allowImport?: boolean;
}) {
  const visibleTextRoles = textRoles || TEXT_MENU_ITEMS.map((item) => item.role);
  const visibleMediaKinds = mediaKinds || ["image", "video", "audio"];

  return (
    <aside
      className="fixed z-20 box-border flex w-[68px] flex-col items-center gap-1 overflow-visible border border-white/10 bg-black/[0.28] p-[6px] text-white shadow-2xl shadow-black/[0.28] backdrop-blur-xl"
      style={{ left: 16, top: 48, borderRadius: 12 }}
    >
      {/* 创作工具组 */}
      <TextToolMenu onAddTextRole={onAddTextRole} textRoles={visibleTextRoles} />
      {visibleMediaKinds.includes("image") && (
        <ToolButton
          icon={<ImageIcon className="h-[18px] w-[18px]" />}
          label="图像"
          tooltip="添加图像节点"
          onClick={onAddImage}
        />
      )}
      {visibleMediaKinds.includes("video") && (
        <ToolButton
          icon={<Video className="h-[18px] w-[18px]" />}
          label="视频"
          tooltip="添加视频节点"
          onClick={onAddVideo}
        />
      )}
      {visibleMediaKinds.includes("audio") && (
        <ToolButton
          icon={<Music className="h-[18px] w-[18px]" />}
          label="音乐"
          tooltip="添加音频节点"
          onClick={onAddAudio}
        />
      )}

      <ToolbarDivider />

      {/* 系统工具组 */}
      {allowImport && (
        <ToolButton
          icon={<FileInput className="h-[18px] w-[18px]" />}
          label="导入"
          tooltip="导入画布 JSON"
          onClick={onImport}
        />
      )}
      <ToolButton
        icon={<Settings className="h-[18px] w-[18px]" />}
        label="API"
        tooltip="模型与接口配置"
        onClick={onOpenApiConfig}
      />
    </aside>
  );
}

function ToolbarDivider() {
  return <div className="my-0.5 h-px w-9 shrink-0 bg-white/[0.08]" />;
}

function TextToolMenu({
  onAddTextRole,
  textRoles,
}: {
  onAddTextRole: (role: CanvasTextRole) => void;
  textRoles: CanvasTextRole[];
}) {
  const [open, setOpen] = useState(false);
  const visibleItems = TEXT_MENU_ITEMS.filter((item) => textRoles.includes(item.role));

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }
    setOpen(false);
  };

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={handleBlur}
    >
      <div
        className={`relative flex h-[50px] w-[56px] min-w-0 cursor-default flex-col items-center justify-center gap-1 rounded-lg text-[11px] transition-colors duration-200 ${
          open ? "bg-white/[0.12] text-white" : "text-white/72"
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="文本节点（含更多类型）"
        tabIndex={0}
      >
        <Type className="h-[18px] w-[18px] shrink-0" />
        <span className="max-w-full truncate">文本</span>
        <ChevronRight
          aria-hidden
          className={`absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 transition duration-200 ${
            open
              ? "translate-x-0 text-white/72"
              : "-translate-x-0.5 text-white/32"
          }`}
        />
      </div>
      {open && <div className="absolute left-full top-0 h-full w-3" />}
      <div
        className={`absolute left-[calc(100%+10px)] top-0 w-[238px] transition duration-150 ease-out motion-reduce:transition-none ${
          open
            ? "pointer-events-auto translate-x-0 opacity-100"
            : "pointer-events-none translate-x-1 opacity-0"
        }`}
        aria-hidden={!open}
        role="menu"
      >
        <div className="overflow-hidden rounded-xl border border-white/[0.1] bg-[#02070b]/[0.92] p-1.5 shadow-[0_24px_70px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-2xl">
          <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium text-white/38">
            文本节点
          </div>
          <div className="grid gap-1">
            {visibleItems.map((item) => {
              const config = getCanvasTextRoleConfig(item.role);

              return (
                <button
                  key={item.role}
                  type="button"
                  role="menuitem"
                  tabIndex={open ? 0 : -1}
                  onClick={() => onAddTextRole(item.role)}
                  className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-white/72 transition-colors duration-200 hover:bg-white/[0.1] hover:text-white focus:outline-none focus-visible:bg-white/[0.12] focus-visible:ring-2 focus-visible:ring-white/15"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/[0.07] text-white/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                    {item.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-semibold leading-4 text-current">
                      {config.title}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] leading-4 text-white/42">
                      {item.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolButton({
  icon,
  label,
  tooltip,
  active = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  tooltip?: string;
  active?: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const tip = tooltip ?? label;

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={tip}
        onBlur={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        className={`flex h-[50px] w-[56px] min-w-0 flex-col items-center justify-center gap-1 rounded-lg text-[11px] transition-colors duration-200 hover:bg-white/[0.12] hover:text-white focus:outline-none focus-visible:bg-white/[0.12] focus-visible:ring-2 focus-visible:ring-white/15 ${
          active ? "bg-white/[0.14] text-white" : "text-white/72"
        }`}
      >
        {icon}
        <span className="max-w-full truncate">{label}</span>
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-30 -translate-y-1/2 whitespace-nowrap rounded-lg border border-white/[0.1] bg-[#02070b]/[0.92] px-2.5 py-1.5 text-[11px] font-medium text-white/82 shadow-[0_16px_40px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl transition duration-150 ease-out motion-reduce:transition-none ${
          hovered
            ? "translate-x-0 opacity-100"
            : "-translate-x-1 opacity-0"
        }`}
        aria-hidden={!hovered}
      >
        {tip}
      </span>
    </div>
  );
}
