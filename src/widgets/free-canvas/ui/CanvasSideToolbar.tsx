import {
  FileInput,
  Image as ImageIcon,
  Music,
  Settings,
  Type,
  Video,
} from "lucide-react";
import type { ReactNode } from "react";

export function CanvasSideToolbar({
  onAddText,
  onAddImage,
  onAddVideo,
  onAddAudio,
  onImport,
  onOpenApiConfig,
}: {
  onAddText: () => void;
  onAddImage: () => void;
  onAddVideo: () => void;
  onAddAudio: () => void;
  onImport: () => void;
  onOpenApiConfig: () => void;
}) {
  return (
    <aside
      className="fixed z-20 box-border flex w-[68px] flex-col items-center gap-1.5 overflow-hidden border border-white/10 bg-black/[0.28] p-[6px] text-white shadow-2xl shadow-black/[0.28] backdrop-blur-xl"
      style={{ left: 16, top: 48, borderRadius: 12 }}
    >
      <ToolButton icon={<Type className="h-4 w-4" />} label="文本" onClick={onAddText} />
      <ToolButton
        icon={<ImageIcon className="h-4 w-4" />}
        label="图像"
        onClick={onAddImage}
      />
      <ToolButton icon={<Video className="h-4 w-4" />} label="视频" onClick={onAddVideo} />
      <ToolButton icon={<Music className="h-4 w-4" />} label="音乐" onClick={onAddAudio} />
      <ToolButton
        icon={<FileInput className="h-4 w-4" />}
        label="导入"
        onClick={onImport}
      />
      <ToolButton
        icon={<Settings className="h-4 w-4" />}
        label="API"
        onClick={onOpenApiConfig}
      />
    </aside>
  );
}

function ToolButton({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-[50px] w-[56px] min-w-0 flex-col items-center justify-center gap-1 rounded-lg text-[11px] transition hover:bg-white/[0.12] hover:text-white ${
        active ? "bg-sky-300/15 text-sky-100" : "text-white/72"
      }`}
    >
      {icon}
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}
