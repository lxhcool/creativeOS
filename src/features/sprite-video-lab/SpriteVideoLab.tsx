"use client";

/* eslint-disable @next/next/no-img-element, react-hooks/refs */

import Link from "next/link";
import { createPortal } from "react-dom";
import { HexColorPicker } from "react-colorful";
import {
  ArrowLeft,
  Download,
  Eraser,
  Film,
  FolderOpen,
  ImagePlus,
  Loader2,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import {
  ChangeEvent,
  DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  clamp,
  downloadUrl,
  formatBytes,
  formatSeconds,
  isSupportedImage,
  isSupportedMedia,
  sortFiles,
  spriteApi,
  spriteAssetUrl,
} from "./api";
import { DEFAULT_SPRITE_PROCESSING_OPTIONS } from "./defaults";
import type {
  MagicVariant,
  ProcessingOptions,
  SpriteExport,
  SpriteFrame,
  SpriteJob,
  SpriteMagic,
  SpritePreview,
  SpriteUpload,
  UploadMediaType,
} from "./types";

type Tone = "idle" | "success" | "warn" | "error";
type WorkbenchMode = "sprite" | "line-cleaner";
type PreviewPostprocessKind = "green-to-black" | "green-desaturate" | "semitransparent-to-black" | "semitransparent-to-opaque";

type LineFrame = {
  file: File;
  name: string;
  sourceUrl: string;
  sourceBitmap: ImageBitmap;
  sourceBytes: number;
  processedUrl: string;
  processedBitmap: HTMLImageElement | null;
  processedBytes: number;
  processedWidth: number;
  processedHeight: number;
};

const MATTE_MODES = [
  ["chroma", "快速去绿幕"],
  ["birefnet_chroma", "AI 保主体去背景"],
  ["birefnet", "AI 抠主体"],
  ["corridorkey", "精细绿幕"],
  ["luma", "按明暗抠图"],
  ["birefnet_corridorkey", "AI + 精细边缘"],
  ["birefnet_corridorkey_key", "AI + 收紧绿边"],
  ["birefnet_luma", "AI + 保留亮部"],
  ["birefnet_luma_key", "AI + 明暗收边"],
  ["birefnet_luma_corridorkey", "AI + 亮部 + 精细边缘"],
  ["none", "不抠图"],
] as const;

const MATTE_MODE_HELP: Record<ProcessingOptions["matteMode"], string> = {
  chroma: "适合绿幕、蓝幕和纯色背景，速度最快。",
  birefnet_chroma: "先找主体，再去背景；主体颜色接近背景时更稳。",
  birefnet: "只靠 AI 找主体，不依赖背景色。",
  corridorkey: "适合边缘要求更细的绿幕素材。",
  luma: "按明暗生成透明度，适合遮罩或高反差素材。",
  birefnet_corridorkey: "AI 找主体，模型细修边缘。",
  birefnet_corridorkey_key: "AI 后再收紧背景残留。",
  birefnet_luma: "AI 保主体，同时保留亮部特效。",
  birefnet_luma_key: "AI 后用明暗继续收边。",
  birefnet_luma_corridorkey: "质量优先，适合复杂边缘。",
  none: "不去背景，只调整尺寸和画布。",
};

const PREVIEW_POSTPROCESS: Record<PreviewPostprocessKind, { label: string; route: string; manifestKey: string }> = {
  "green-to-black": { label: "绿边变暗", route: "/preview-green-to-black", manifestKey: "green_to_black" },
  "green-desaturate": { label: "淡化绿边", route: "/preview-green-desaturate", manifestKey: "green_desaturate" },
  "semitransparent-to-black": { label: "半透明变暗", route: "/preview-semitransparent-to-black", manifestKey: "semitransparent_to_black" },
  "semitransparent-to-opaque": { label: "补实半透明", route: "/preview-semitransparent-to-opaque", manifestKey: "semitransparent_to_opaque" },
};

const PREVIEW_POSTPROCESS_KINDS = Object.keys(PREVIEW_POSTPROCESS) as PreviewPostprocessKind[];

function previewPostprocessStats(preview: SpritePreview | null | undefined, kind: PreviewPostprocessKind) {
  return preview?.postprocess?.[PREVIEW_POSTPROCESS[kind].manifestKey];
}

function previewPostprocessChanged(preview: SpritePreview | null | undefined, kind: PreviewPostprocessKind) {
  const changed = previewPostprocessStats(preview, kind)?.changed_pixels;
  return typeof changed === "number" ? changed : null;
}

const MAGIC_VARIANTS: Array<{ key: MagicVariant["key"]; label: string }> = [
  { key: "half", label: "MAGIC 1/2" },
  { key: "quarter", label: "MAGIC 1/4" },
  { key: "eighth", label: "MAGIC 1/8" },
];

function uploadInfo(upload: SpriteUpload | null) {
  return upload?.media_info || {};
}

function mediaType(upload: SpriteUpload | null): UploadMediaType {
  return upload?.media_type || "video";
}

function frameCountForUpload(upload: SpriteUpload | null): number {
  const info = uploadInfo(upload);
  if (!upload) return 1;
  if (mediaType(upload) === "image") return 1;
  if (mediaType(upload) === "image_sequence") {
    return Math.max(1, Math.round(Number(info.frame_count || 1)));
  }
  const fps = Number(info.fps || 0);
  const duration = Number(info.duration || 0);
  return fps > 0 && duration > 0 ? Math.max(1, Math.round(fps * duration)) : 1;
}

function frameToTime(upload: SpriteUpload | null, frame: number, edge: "start" | "end") {
  if (!upload || mediaType(upload) !== "video") return 0;
  const fps = Number(uploadInfo(upload).fps || 0);
  if (fps <= 0) return 0;
  const raw = edge === "start" ? (frame - 1) / fps : frame / fps;
  return Number(clamp(raw, 0, Number(uploadInfo(upload).duration || raw)).toFixed(8));
}

function selectedFrames(
  job: SpriteJob | null,
  selected: Set<number>,
  ordered: boolean,
  order: number[],
  reversed: boolean,
): SpriteFrame[] {
  if (!job) return [];
  const byIndex = new Map(job.frames.map((frame) => [frame.index, frame]));
  const frames = ordered
    ? order.map((index) => byIndex.get(index)).filter(Boolean)
    : job.frames.filter((frame) => selected.has(frame.index));
  const compactFrames = frames.filter((frame): frame is SpriteFrame => Boolean(frame));
  return reversed ? [...compactFrames].reverse() : compactFrames;
}

function Button({
  children,
  onClick,
  disabled,
  variant = "secondary",
  type = "button",
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "magic";
  type?: "button" | "submit";
  className?: string;
}) {
  const variants = {
    primary: "border-white/15 bg-white/[0.14] text-white hover:bg-white/[0.2]",
    secondary: "border-white/10 bg-white/[0.07] text-white/80 hover:bg-white/[0.12] hover:text-white",
    ghost: "border-transparent bg-transparent text-white/55 hover:bg-white/[0.08] hover:text-white",
    danger: "border-red-400/25 bg-red-500/10 text-red-100 hover:bg-red-500/20",
    magic: "border-sky-300/25 bg-sky-300/15 text-sky-100 hover:bg-sky-300/25",
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-3xl border px-3 text-xs font-medium shadow-lg shadow-black/20 backdrop-blur-xl transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white/15 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

function SurfaceActionButton({
  children,
  onClick,
  disabled,
  active = false,
  accent = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-3xl border px-3 text-xs font-medium shadow-lg shadow-black/20 backdrop-blur-xl transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white/15 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 ${
        accent
          ? "border-orange-200/25 bg-[linear-gradient(135deg,rgba(251,146,60,0.34),rgba(12,12,14,0.82))] text-orange-50 hover:border-orange-200/40"
          : active
            ? "border-white/18 bg-white/[0.12] text-white hover:bg-white/[0.16]"
            : "border-white/10 bg-white/[0.07] text-white/78 hover:bg-white/[0.1] hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function ToolPill({
  children,
  onClick,
  disabled,
  active = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-3xl border px-2.5 text-xs font-medium shadow-lg shadow-black/20 backdrop-blur-xl transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white/15 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 ${
        active
          ? "border-white/18 bg-white/[0.12] text-white hover:bg-white/[0.16]"
          : "border-white/10 bg-white/[0.07] text-white/72 hover:bg-white/[0.1] hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="grid gap-1.5 text-xs text-white/58">
      <span>{label}</span>
      {children}
      {hint && <span className="text-[11px] leading-4 text-white/32">{hint}</span>}
    </label>
  );
}

function ColorField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (!buttonRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleClick = () => {
    if (disabled) return;
    const nextOpen = !open;
    if (nextOpen) {
      setRect(buttonRef.current?.getBoundingClientRect() || null);
    }
    setOpen(nextOpen);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={handleClick}
        className={`flex h-9 w-full items-center gap-2 rounded-2xl border border-white/10 px-3 text-xs outline-none transition ${disabled ? "cursor-not-allowed bg-white/[0.04] text-white/35 opacity-40" : "bg-white/[0.07] text-white hover:bg-white/[0.1] focus:border-white/25 focus:ring-2 focus:ring-white/10"}`}
      >
        <span className="h-5 w-5 rounded-md border border-white/10" style={{ backgroundColor: value }} />
        <span className="text-white/70">{value.toUpperCase()}</span>
      </button>
      {open && rect &&
        createPortal(
          <div
            className="fixed z-[9999] mt-2 rounded-xl border border-white/10 bg-zinc-900/95 p-2 shadow-xl backdrop-blur-xl"
            style={{ left: rect.left, top: rect.bottom + 8 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <HexColorPicker color={value} onChange={onChange} />
          </div>,
          document.body
        )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/35">{children}</h3>
  );
}

function Panel({
  title,
  kicker,
  action,
  children,
  className = "",
}: {
  title?: string;
  kicker?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-white/10 bg-white/[0.055] shadow-2xl shadow-black/20 backdrop-blur-2xl ${className}`}>
      {title && (
        <div className="flex min-h-12 items-center justify-between gap-3 px-4 py-2">
          <div>
            {kicker && <p className="text-[10px] uppercase tracking-[0.2em] text-sky-200/45">{kicker}</p>}
            <h2 className="text-sm font-semibold text-white/88">{title}</h2>
          </div>
          {action}
        </div>
      )}
      <div className="p-2.5">{children}</div>
    </section>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-9 w-full rounded-2xl border border-white/10 bg-white/[0.07] px-3 text-xs text-white outline-none transition placeholder:text-white/25 focus:border-white/25 focus:bg-white/[0.1] focus:ring-2 focus:ring-white/10 disabled:cursor-not-allowed disabled:bg-white/[0.04] disabled:text-white/35 disabled:opacity-40 ${props.className || ""}`}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        {...props}
        className={`h-9 w-full appearance-none rounded-2xl border border-white/10 bg-white/[0.07] px-3 pr-9 text-xs text-white outline-none transition hover:bg-white/[0.1] focus:border-white/25 focus:bg-white/[0.1] focus:ring-2 focus:ring-white/10 disabled:cursor-not-allowed disabled:bg-white/[0.04] disabled:text-white/35 disabled:opacity-40 ${props.className || ""}`}
      />
      <svg
        className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 6l4 4 4-4" />
      </svg>
    </div>
  );
}

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex min-h-8 cursor-pointer items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.035] px-3 text-xs text-white/70 transition hover:bg-white/[0.07]">
      <span className={`relative flex h-4 w-4 shrink-0 items-center justify-center rounded-[6px] border transition ${checked ? "border-white/40 bg-white" : "border-white/25 bg-white/[0.04]"}`}>
        {checked && (
          <svg viewBox="0 0 16 16" className="h-3 w-3 text-zinc-900" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 8.5l3 3 6-6.5" />
          </svg>
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="sr-only"
      />
      <span>{label}</span>
    </label>
  );
}

export default function SpriteVideoLab() {
  const [mode, setMode] = useState<WorkbenchMode>("sprite");
  const [status, setStatus] = useState("请先导入素材。");
  const [tone, setTone] = useState<Tone>("idle");
  const [busy, setBusy] = useState("");
  const [upload, setUpload] = useState<SpriteUpload | null>(null);
  const [options, setOptions] = useState<ProcessingOptions>(DEFAULT_SPRITE_PROCESSING_OPTIONS);
  const [startFrame, setStartFrame] = useState(1);
  const [endFrame, setEndFrame] = useState(1);
  const [preview, setPreview] = useState<SpritePreview | null>(null);
  const [previewBgMode, setPreviewBgMode] = useState<"checkerboard" | "color">("checkerboard");
  const [previewBg, setPreviewBg] = useState("#070707");
  const [job, setJob] = useState<SpriteJob | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [selectionOrder, setSelectionOrder] = useState<number[]>([]);
  const [orderedSelection, setOrderedSelection] = useState(false);
  const [reverse, setReverse] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
  const [intervalMs, setIntervalMs] = useState(100);
  const [animationBg, setAnimationBg] = useState("#070707");
  const [exportResult, setExportResult] = useState<SpriteExport | null>(null);
  const [magic, setMagic] = useState<SpriteMagic | null>(null);
  const [magicResizeMode, setMagicResizeMode] = useState<"hard" | "soft">("hard");
  const [lineFrames, setLineFrames] = useState<LineFrame[]>([]);
  const [lineIndex, setLineIndex] = useState(0);
  const [linePlaying, setLinePlaying] = useState(false);
  const [lineFps, setLineFps] = useState(12);
  const [lineMethod, setLineMethod] = useState<"classic" | "realesrgan_anime">("classic");
  const [lineScale, setLineScale] = useState(0.5);
  const [lineAlphaCutoff, setLineAlphaCutoff] = useState(8);
  const [lineSharpen, setLineSharpen] = useState(80);
  const [lineColorCount, setLineColorCount] = useState(128);
  const [lineZoom, setLineZoom] = useState(1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const animationCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const lineSourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const lineProcessedCanvasRef = useRef<HTMLCanvasElement>(null);

  const uploadFrameCount = frameCountForUpload(upload);
  const currentMediaType = mediaType(upload);
  const mediaUrl = spriteAssetUrl(upload?.media_url || upload?.video_url);
  const activePreview = preview && upload && preview.upload_id === upload.upload_id ? preview : null;
  const selectedForPreview = useMemo(
    () => selectedFrames(job, selected, orderedSelection, selectionOrder, reverse),
    [job, orderedSelection, reverse, selected, selectionOrder],
  );

  const selectState = useMemo(() => {
    const total = job?.frame_count || 0;
    const sel = selected.size;
    const allSelected = total > 0 && sel === total;
    const noneSelected = sel === 0;
    const oddOnly = sel > 0 && total > 0 && [...selected].every((i) => (i + 1) % 2 === 1);
    const evenOnly = sel > 0 && total > 0 && [...selected].every((i) => (i + 1) % 2 === 0);
    if (allSelected) return "all" as const;
    if (noneSelected) return "none" as const;
    if (oddOnly) return "odd" as const;
    if (evenOnly) return "even" as const;
    return "partial" as const;
  }, [selected, job?.frame_count]);

  const setMessage = useCallback((message: string, nextTone: Tone = "idle") => {
    setStatus(message);
    setTone(nextTone);
  }, []);

  const runBusy = useCallback(
    async (key: string, task: () => Promise<void>) => {
      setBusy(key);
      try {
        await task();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error), "error");
      } finally {
        setBusy("");
      }
    },
    [setMessage],
  );

  function applyUpload(nextUpload: SpriteUpload) {
    const count = frameCountForUpload(nextUpload);
    setUpload(nextUpload);
    setStartFrame(1);
    setEndFrame(count);
    setPreview(null);
    setJob(null);
    setExportResult(null);
    setMagic(null);
    setSelected(new Set());
    setSelectionOrder([]);
    setCurrentPreviewIndex(0);
  }

  async function uploadFiles(files: File[]) {
    if (!files.length) return;
    const sorted = sortFiles(files);
    if (sorted.length > 1 && !sorted.every(isSupportedImage)) {
      setMessage("多文件只支持图片序列。", "warn");
      return;
    }
    if (sorted.length === 1 && !isSupportedMedia(sorted[0]!)) {
      setMessage("请导入视频、GIF、图片或图片序列。", "warn");
      return;
    }
    await runBusy("upload", async () => {
      setPreview(null);
      const form = new FormData();
      sorted.forEach((file) => form.append("video", file, file.webkitRelativePath || file.name));
      setMessage(sorted.length > 1 ? `正在载入 ${sorted.length} 张序列帧...` : `正在载入 ${sorted[0]!.name}...`);
      const data = await spriteApi<{ ok: true; upload: SpriteUpload }>("/upload", {
        method: "POST",
        body: form,
      });
      applyUpload(data.upload);
      setMessage(`已载入 ${data.upload.display_name}。`, "success");
    });
  }

  function payload(extra: Record<string, unknown> = {}) {
    const start = frameToTime(upload, startFrame, "start");
    const end = frameToTime(upload, endFrame, "end");
    return {
      upload_id: upload?.upload_id,
      start_time: start,
      end_time: end,
      start_frame: startFrame,
      end_frame: endFrame,
      keep_every: options.keepEvery,
      output_scale: options.outputScale / 100,
      reduce_px: options.reducePx,
      canvas_mode: options.canvasMode,
      chroma_enabled: options.chromaEnabled,
      matte_mode: options.chromaEnabled ? options.matteMode : "none",
      key_mode: options.keyMode,
      manual_key_hex: options.manualKeyHex,
      threshold: options.threshold,
      softness: options.softness,
      despill_strength: options.despillStrength,
      halo_pixels: options.haloPixels,
      foreground_protect_enabled: options.foregroundProtectEnabled,
      foreground_protect_hex: options.foregroundProtectHex,
      foreground_protect_tolerance: options.foregroundProtectTolerance,
      foreground_protect_strength: options.foregroundProtectStrength,
      ai_model: "birefnet-hr-matting",
      ai_device: "auto",
      ai_resolution: "auto",
      luma_black: options.lumaBlack,
      luma_white: options.lumaWhite,
      luma_gamma: options.lumaGamma,
      luma_strength: options.lumaStrength,
      corridorkey_enabled: options.matteMode.includes("corridorkey"),
      corridorkey_screen: options.corridorkeyScreen,
      batch_green_to_black: options.batchGreenToBlack,
      batch_green_desaturate: options.batchGreenDesaturate,
      batch_semitransparent_to_black: options.batchSemiTransparentToBlack,
      batch_semitransparent_to_opaque: options.batchSemiTransparentToOpaque,
      ...extra,
    };
  }

  async function previewFrame() {
    if (!upload) {
      setMessage("先导入素材。", "warn");
      return;
    }
    const sampleTime =
      currentMediaType === "video"
        ? clamp(videoRef.current?.currentTime || frameToTime(upload, startFrame, "start"), frameToTime(upload, startFrame, "start"), frameToTime(upload, endFrame, "end"))
        : 0;
    await runBusy("preview", async () => {
      setMessage("正在预览单帧...");
      const data = await spriteApi<{ ok: true; preview: SpritePreview }>("/preview-frame", {
        method: "POST",
        body: payload({ sample_time: sampleTime, sample_frame: startFrame }),
      });
      setPreview(data.preview);
      setMessage("预览已更新。", "success");
    });
  }

  async function processSource() {
    if (!upload) {
      setMessage("先导入素材。", "warn");
      return;
    }
    await runBusy("process", async () => {
      setMessage("正在生成透明帧...");
      const data = await spriteApi<{ ok: true; job: SpriteJob }>("/process", {
        method: "POST",
        body: payload(),
      });
      setJob(data.job);
      setSelected(new Set(data.job.frames.map((frame) => frame.index)));
      setSelectionOrder(data.job.frames.map((frame) => frame.index));
      setCurrentPreviewIndex(0);
      setExportResult(null);
      setMagic(null);
      setMessage(`已生成 ${data.job.frame_count} 帧。`, "success");
    });
  }

  async function importAnimation(files: File[]) {
    const images = sortFiles(files).filter(isSupportedImage);
    if (!images.length) {
      setMessage("请选择图片序列。", "warn");
      return;
    }
    await runBusy("import-animation", async () => {
      const form = new FormData();
      images.forEach((file) => form.append("frames", file, file.webkitRelativePath || file.name));
      setMessage(`正在导入 ${images.length} 帧动画序列...`);
      const data = await spriteApi<{ ok: true; job: SpriteJob }>("/import-animation", {
        method: "POST",
        body: form,
      });
      setUpload(null);
      setPreview(null);
      setJob(data.job);
      setSelected(new Set(data.job.frames.map((frame) => frame.index)));
      setSelectionOrder(data.job.frames.map((frame) => frame.index));
      setMessage(`已导入 ${data.job.frame_count} 帧动画序列。`, "success");
    });
  }

  async function postprocessPreview(kind: PreviewPostprocessKind) {
    if (!activePreview?.preview_id) {
      setMessage("先预览一帧。", "warn");
      return;
    }
    await runBusy(kind, async () => {
      const data = await spriteApi<{ ok: true; preview: SpritePreview }>(PREVIEW_POSTPROCESS[kind].route, {
        method: "POST",
        body: { preview_id: activePreview.preview_id, threshold: 42, dominance: 24, alpha_min: 1, alpha_max: 254 },
      });
      setPreview(data.preview);
      const changed = previewPostprocessChanged(data.preview, kind);
      setMessage(
        changed === null
          ? `${PREVIEW_POSTPROCESS[kind].label}已应用到当前预览。`
          : changed > 0
            ? `${PREVIEW_POSTPROCESS[kind].label}已应用，影响 ${changed.toLocaleString()} 个像素。`
            : `${PREVIEW_POSTPROCESS[kind].label}没有命中像素，当前预览不会变化。`,
        changed === 0 ? "warn" : "success",
      );
    });
  }

  function toggleFrame(index: number, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(index);
      else next.delete(index);
      return next;
    });
    setSelectionOrder((current) => {
      const filtered = current.filter((item) => item !== index);
      return checked ? [...filtered, index] : filtered;
    });
    setMagic(null);
  }

  function selectBy(predicate: (frame: SpriteFrame) => boolean) {
    if (!job) return;
    const indices = job.frames.filter(predicate).map((frame) => frame.index);
    setSelected(new Set(indices));
    setSelectionOrder(indices);
    setCurrentPreviewIndex(0);
    setMagic(null);
  }

  async function exportFrames() {
    if (!job || selectedForPreview.length === 0) {
      setMessage("至少选择一帧。", "warn");
      return;
    }
    await runBusy("export", async () => {
      const data = await spriteApi<{ ok: true; export: SpriteExport }>("/export", {
        method: "POST",
        body: {
          job_id: job.job_id,
          selected_indices: selectedForPreview.map((frame) => frame.index),
          video_duration_ms: intervalMs,
        },
      });
      setExportResult(data.export);
      setMessage("导出完成。", "success");
    });
  }

  async function runMagic() {
    if (!job || selectedForPreview.length === 0) {
      setMessage("至少选择一帧。", "warn");
      return;
    }
    await runBusy("magic", async () => {
      setMessage("正在生成 MAGIC 版本...");
      const data = await spriteApi<{ ok: true; magic: SpriteMagic }>("/magic-preview", {
        method: "POST",
        body: {
          job_id: job.job_id,
          selected_indices: selectedForPreview.map((frame) => frame.index),
          resize_mode: magicResizeMode,
        },
      });
      setMagic(data.magic);
      setMessage(`MAGIC 完成，共 ${data.magic.frame_count || data.magic.variants?.half?.frame_count || 0} 帧。`, "success");
    });
  }

  async function exportMagic(variantKey: MagicVariant["key"]) {
    if (!magic?.magic_id) return;
    await runBusy(`export-magic-${variantKey}`, async () => {
      const data = await spriteApi<{ ok: true; export: SpriteExport }>("/export-magic-frames", {
        method: "POST",
        body: {
          magic_id: magic.magic_id,
          variant_key: variantKey,
          video_duration_ms: intervalMs,
        },
      });
      setExportResult(data.export);
      setMessage(`${variantKey} MAGIC 帧已导出。`, "success");
    });
  }

  async function openPath(target?: string) {
    if (!target) return;
    await runBusy("open-path", async () => {
      await spriteApi<{ ok: true }>("/open-path", {
        method: "POST",
        body: { path: target },
      });
    });
  }

  useEffect(() => {
    if (!upload || currentMediaType !== "video" || !videoRef.current) return;
    videoRef.current.currentTime = frameToTime(upload, startFrame, "start");
    void videoRef.current.play().catch(() => undefined);
  }, [currentMediaType, startFrame, upload]);

  useEffect(() => {
    if (!playing || selectedForPreview.length <= 1) return;
    const timer = window.setInterval(() => {
      setCurrentPreviewIndex((index) => (index + 1) % selectedForPreview.length);
    }, clamp(intervalMs, 20, 5000));
    return () => window.clearInterval(timer);
  }, [intervalMs, playing, selectedForPreview.length]);

  useEffect(() => {
    const canvas = animationCanvasRef.current;
    const frame = selectedForPreview[currentPreviewIndex];
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const drawImage = (image: HTMLImageElement) => {
      context.fillStyle = animationBg;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingEnabled = false;
      const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    };

    if (!frame) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = animationBg;
      context.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const url = spriteAssetUrl(frame.url);
    const cached = animationImageCacheRef.current.get(url);
    if (cached?.complete) {
      drawImage(cached);
      return;
    }

    let cancelled = false;
    const image = cached || new Image();
    image.onload = () => {
      if (cancelled) return;
      animationImageCacheRef.current.set(url, image);
      drawImage(image);
    };
    image.onerror = () => {
      if (!cancelled) animationImageCacheRef.current.delete(url);
    };
    if (!cached) {
      animationImageCacheRef.current.set(url, image);
      image.src = url;
    }

    return () => {
      cancelled = true;
    };
  }, [animationBg, currentPreviewIndex, selectedForPreview]);

  useEffect(() => {
    selectedForPreview.forEach((frame) => {
      const url = spriteAssetUrl(frame.url);
      if (animationImageCacheRef.current.has(url)) return;
      const image = new Image();
      image.src = url;
      animationImageCacheRef.current.set(url, image);
    });
  }, [selectedForPreview]);

  const lineCurrent = lineFrames[lineIndex];
  const lineProcessed = lineFrames.filter((frame) => frame.processedUrl);
  const lineSourceBytes = lineFrames.reduce((sum, frame) => sum + frame.sourceBytes, 0);
  const lineProcessedBytes = lineProcessed.reduce((sum, frame) => sum + frame.processedBytes, 0);

  const drawLineFrame = useCallback(() => {
    function draw(canvas: HTMLCanvasElement | null, image?: ImageBitmap | HTMLImageElement | null) {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#0b1115";
      context.fillRect(0, 0, canvas.width, canvas.height);
      if (!image) return;
      const width = "naturalWidth" in image ? image.naturalWidth : image.width;
      const height = "naturalHeight" in image ? image.naturalHeight : image.height;
      const scale = Math.min(canvas.width / width, canvas.height / height) * lineZoom;
      const drawWidth = width * scale;
      const drawHeight = height * scale;
      context.imageSmoothingEnabled = false;
      context.drawImage(image, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
    }
    draw(lineSourceCanvasRef.current, lineCurrent?.sourceBitmap);
    draw(lineProcessedCanvasRef.current, lineCurrent?.processedBitmap || lineCurrent?.sourceBitmap);
  }, [lineCurrent, lineZoom]);

  useEffect(() => {
    drawLineFrame();
  }, [drawLineFrame]);

  useEffect(() => {
    if (!linePlaying || lineFrames.length <= 1) return;
    const timer = window.setInterval(() => {
      setLineIndex((index) => (index + 1) % lineFrames.length);
    }, 1000 / clamp(lineFps, 1, 60));
    return () => window.clearInterval(timer);
  }, [lineFps, lineFrames.length, linePlaying]);

  async function loadLineFiles(files: File[]) {
    const images = sortFiles(files).filter(isSupportedImage);
    if (!images.length) {
      setMessage("请导入图片序列。", "warn");
      return;
    }
    await runBusy("line-load", async () => {
      lineFrames.forEach((frame) => URL.revokeObjectURL(frame.sourceUrl));
      const loaded: LineFrame[] = [];
      for (const file of images) {
        const sourceUrl = URL.createObjectURL(file);
        const sourceBitmap = await createImageBitmap(file);
        loaded.push({
          file,
          name: file.webkitRelativePath || file.name,
          sourceUrl,
          sourceBitmap,
          sourceBytes: file.size,
          processedUrl: "",
          processedBitmap: null,
          processedBytes: 0,
          processedWidth: 0,
          processedHeight: 0,
        });
      }
      setLineFrames(loaded);
      setLineIndex(0);
      setLinePlaying(true);
      setMessage(`线稿清理已载入 ${loaded.length} 帧。`, "success");
    });
  }

  async function processLineCleaner() {
    if (!lineFrames.length) {
      setMessage("先导入图片序列。", "warn");
      return;
    }
    await runBusy("line-process", async () => {
      const form = new FormData();
      lineFrames.forEach((frame) => form.append("frames", frame.file, frame.name));
      form.append("method", lineMethod);
      form.append("scale", String(lineScale));
      form.append("alpha_cutoff", String(lineAlphaCutoff));
      form.append("sharpen_percent", String(lineSharpen));
      form.append("color_count", String(lineColorCount));
      setMessage("正在处理序列...");
      const data = await spriteApi<{
        ok: true;
        result: { frames: Array<{ index: number; url: string; width: number; height: number; bytes: number }> };
      }>("/line-cleaner-process", { method: "POST", body: form });
      const next = [...lineFrames];
      for (const resultFrame of data.result.frames) {
        const frame = next[resultFrame.index];
        if (!frame) continue;
        frame.processedUrl = spriteAssetUrl(`${resultFrame.url}?ts=${Date.now()}`);
        frame.processedWidth = resultFrame.width;
        frame.processedHeight = resultFrame.height;
        frame.processedBytes = resultFrame.bytes;
        frame.processedBitmap = await loadImage(frame.processedUrl);
      }
      setLineFrames(next);
      setLinePlaying(true);
      setMessage("处理完成。", "success");
    });
  }

  async function downloadLineTar() {
    const frames = lineFrames.filter((frame) => frame.processedUrl);
    if (!frames.length) return;
    const parts: BlobPart[] = [];
    for (const [index, frame] of frames.entries()) {
      const bytes = new Uint8Array(await (await fetch(frame.processedUrl)).arrayBuffer());
      parts.push(tarHeader(`frame_${String(index + 1).padStart(3, "0")}.png`, bytes.length) as BlobPart);
      parts.push(bytes as BlobPart);
      const padding = (512 - (bytes.length % 512)) % 512;
      if (padding > 0) parts.push(new Uint8Array(new ArrayBuffer(padding)) as BlobPart);
    }
    parts.push(new Uint8Array(new ArrayBuffer(1024)) as BlobPart);
    const url = URL.createObjectURL(new Blob(parts, { type: "application/x-tar" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "sprite-line-cleaner-frames.tar";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <main className="h-screen overflow-hidden bg-[#02070b] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(56,189,248,0.16),transparent_30%),radial-gradient(circle_at_80%_15%,rgba(255,255,255,0.08),transparent_24%),linear-gradient(180deg,#02070b,#071016_45%,#030609)]" />
      <div className="relative z-10 flex h-screen flex-col">
        <header className="flex h-18 shrink-0 items-center justify-between px-5">
          <div className="flex min-w-0 items-center gap-4">
            <Link href="/" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.07] text-white/70 transition hover:bg-white/[0.13] hover:text-white">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-base font-semibold tracking-wide text-white/90 shrink-0">Sprite 处理</h1>
            <div className="flex min-w-0 items-center gap-2 text-xs">
              <span className={`h-2 w-2 shrink-0 rounded-full ${tone === "error" ? "bg-red-400" : tone === "warn" ? "bg-amber-300" : tone === "success" ? "bg-emerald-300" : "bg-sky-300"}`} />
              <span className="truncate text-white/50">{status}</span>
              {busy && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-white/45" />}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="secondary" onClick={() => setMode((current) => current === "sprite" ? "line-cleaner" : "sprite")}>
              {mode === "sprite" ? <Eraser className="h-3.5 w-3.5" /> : <Film className="h-3.5 w-3.5" />}
              {mode === "sprite" ? "清理线稿" : "返回 Sprite"}
            </Button>
          </div>
        </header>

        {mode === "sprite" ? (
          <div className="grid min-h-0 flex-1 grid-cols-[390px_390px_minmax(0,1fr)] gap-4 overflow-hidden px-4 pb-4">
            <aside className="min-h-0 space-y-4 overflow-y-auto pr-1 no-scrollbar">
              <SourcePanel upload={upload} uploadFiles={uploadFiles} videoRef={videoRef} mediaUrl={mediaUrl} />
              {upload && (
                <TimelinePanel
                  upload={upload}
                  startFrame={startFrame}
                  endFrame={endFrame}
                  setStartFrame={(value) => setStartFrame(clamp(Math.round(value), 1, uploadFrameCount))}
                  setEndFrame={(value) => setEndFrame(clamp(Math.round(value), startFrame, uploadFrameCount))}
                />
              )}
              <OptionsPanel options={options} setOptions={setOptions} detectedKeyColor={activePreview?.key_color} />
            </aside>

            <section className="h-full min-h-0 overflow-y-auto pr-1 no-scrollbar">
              <Panel
                title="单帧预览"
                className="max-h-[calc(100vh-88px)] min-h-full overflow-y-auto no-scrollbar"
                action={
                  <button
                    type="button"
                    disabled={!upload || busy === "preview"}
                    onClick={() => void previewFrame()}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-200/80 transition hover:text-sky-100 disabled:opacity-40"
                  >
                    {busy === "preview" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    预览一帧
                  </button>
                }
              >
                <div className="space-y-3">
                  <div className="grid gap-2">
                    <PreviewImage title="原图" url={activePreview?.source_url} compact />
                    <PreviewImage title="处理后" url={activePreview?.processed_url} bgMode={previewBgMode} bgColor={previewBg} compact />
                  </div>
                  <section className="rounded-xl border border-white/8 bg-white/[0.025] p-3 space-y-2">
                    <SectionLabel>背景</SectionLabel>
                    <Field label="显示方式">
                      <Select value={previewBgMode} onChange={(event) => setPreviewBgMode(event.target.value as "checkerboard" | "color")}>
                        <option value="checkerboard">透明格</option>
                        <option value="color">纯色</option>
                      </Select>
                    </Field>
                    <Field label="预览颜色">
                      <ColorField value={previewBg} onChange={(value) => setPreviewBg(value)} />
                    </Field>
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-black/15 px-3 py-2 text-xs">
                      <span className="text-white/40">自动取色</span>
                      {activePreview?.key_color ? (
                        <span className="inline-flex items-center gap-2 text-white/72">
                          <span className="h-4 w-4 rounded border border-white/15" style={{ backgroundColor: activePreview.key_color }} />
                          {activePreview.key_color.toUpperCase()}
                        </span>
                      ) : (
                        <span className="text-white/25">预览后显示</span>
                      )}
                    </div>
                  </section>
                  <section className="rounded-xl border border-white/8 bg-white/[0.025] p-3 space-y-2">
                    <SectionLabel>单帧修正</SectionLabel>
                    <div className="grid grid-cols-2 gap-2">
                      {PREVIEW_POSTPROCESS_KINDS.map((kind) => {
                        const changed = previewPostprocessChanged(activePreview, kind);
                        const applied = Boolean(previewPostprocessStats(activePreview, kind)?.enabled) && changed !== 0;
                        const processing = busy === kind;
                        return (
                          <Button
                            key={kind}
                            disabled={!activePreview || (Boolean(busy) && !processing)}
                            onClick={() => postprocessPreview(kind)}
                            variant={applied ? "primary" : "secondary"}
                            className={applied ? "ring-1 ring-sky-300/25" : ""}
                          >
                            {processing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            <span>{PREVIEW_POSTPROCESS[kind].label}</span>
                            {changed !== null && changed > 0 && (
                              <span className="rounded-full bg-sky-300/18 px-1.5 py-0.5 text-[10px] text-sky-100">
                                {changed > 999 ? `${Math.round(changed / 1000)}k` : changed}
                              </span>
                            )}
                          </Button>
                        );
                      })}
                    </div>
                    <p className="text-[11px] leading-4 text-white/35">
                      只影响当前预览；批量处理请用左侧开关。
                    </p>
                    <Button disabled={!activePreview?.processed_url} onClick={() => activePreview?.processed_url && downloadUrl(activePreview.processed_url, "sprite-preview.png")} className="w-full">
                      <Download className="h-3.5 w-3.5" />
                      下载当前帧
                    </Button>
                  </section>
                </div>
              </Panel>
            </section>

            <section className="h-full min-h-0 overflow-y-auto pr-1 no-scrollbar">
              <Panel
                title="批量生成"
                className="relative max-h-[calc(100vh-88px)] min-h-full overflow-y-auto no-scrollbar"
              >
                <div className="absolute right-4 top-[18px] z-10 flex flex-wrap items-center justify-end gap-2">
                  <FileButton onFiles={importAnimation} multiple label="导入帧" icon={<ImagePlus className="h-3.5 w-3.5" />} accent />
                  <Button disabled={!upload || busy === "process"} onClick={processSource} variant="primary">
                    {busy === "process" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    开始处理
                  </Button>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-[minmax(0,0.42fr)_minmax(0,1fr)] items-start gap-4">
                    <div className="min-w-0 space-y-2">
                      <div className="relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]" style={{ backgroundColor: animationBg }}>
                        <canvas ref={animationCanvasRef} width={512} height={512} className="h-full w-full" />
                        {!selectedForPreview.length && <EmptyStage label="处理后显示" />}
                        <div className="absolute left-2 top-2 z-10 inline-flex h-7 items-center rounded-xl border border-white/15 bg-black/45 px-2.5 text-[11px] font-medium text-white/90 shadow-md shadow-black/25 backdrop-blur-2xl">
                          当前 {selectedForPreview.length ? `${currentPreviewIndex + 1} / ${selectedForPreview.length}` : "0 / 0"}
                        </div>
                        <div className="absolute right-2 top-2 z-10 flex items-center gap-2">
                          <button
                            type="button"
                            disabled={selectedForPreview.length <= 1}
                            onClick={() => setPlaying((value) => !value)}
                            className="inline-flex h-7 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-black/45 px-2.5 text-[11px] font-medium text-white/90 shadow-md shadow-black/25 backdrop-blur-2xl transition hover:bg-black/60 focus:outline-none focus:ring-2 focus:ring-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                            {playing ? "暂停" : "播放"}
                          </button>
                          <button
                            type="button"
                            disabled={!selectedForPreview.length}
                            onClick={() => setCurrentPreviewIndex(0)}
                            className="inline-flex h-7 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-black/45 px-2.5 text-[11px] font-medium text-white/90 shadow-md shadow-black/25 backdrop-blur-2xl transition hover:bg-black/60 focus:outline-none focus:ring-2 focus:ring-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <RotateCcw className="h-3 w-3" />
                            重播
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="flex min-h-full min-w-0 max-w-full flex-col items-start justify-between gap-3 self-stretch">
                      <div className="flex max-w-full flex-col items-start gap-2">
                        <div className="flex max-w-full flex-col items-start gap-3 px-1">
                          <div className="w-full max-w-44">
                            <Field label="预览底色">
                              <ColorField value={animationBg} onChange={(value) => setAnimationBg(value)} />
                            </Field>
                          </div>
                          <div className="w-full max-w-44">
                            <Field label="播放间隔">
                              <TextInput type="number" min={20} max={5000} value={intervalMs} onChange={(event) => setIntervalMs(clamp(Number(event.target.value || 100), 20, 5000))} />
                            </Field>
                          </div>
                        </div>
                        <div className="grid max-w-full gap-1.5 px-1 text-xs text-white/58">
                          <span>选帧</span>
                          <div className="flex max-w-full flex-wrap items-center gap-2">
                            <ToolPill disabled={!job} active={selectState === "all"} onClick={() => selectBy(() => true)}>全选</ToolPill>
                            <ToolPill disabled={!job} active={selectState === "none"} onClick={() => selectBy(() => false)}>清空</ToolPill>
                            <ToolPill disabled={!job} onClick={() => job && selectBy((frame) => !selected.has(frame.index))}>反选</ToolPill>
                            <ToolPill disabled={!job} active={selectState === "odd"} onClick={() => selectBy((frame) => (frame.index + 1) % 2 === 1)}>奇数帧</ToolPill>
                            <ToolPill disabled={!job} active={selectState === "even"} onClick={() => selectBy((frame) => (frame.index + 1) % 2 === 0)}>偶数帧</ToolPill>
                            <ToolPill disabled={!job} active={orderedSelection} onClick={() => setOrderedSelection((value) => !value)}>按点击顺序</ToolPill>
                          </div>
                        </div>
                        <div className="grid max-w-full gap-1.5 px-1 text-xs text-white/58">
                          <span>播放顺序</span>
                          <label className="flex h-9 w-full max-w-44 cursor-pointer items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.07] px-3 text-xs text-white/70 transition hover:bg-white/[0.1] hover:text-white">
                            <span className={`relative flex h-4 w-4 shrink-0 items-center justify-center rounded-[6px] border transition ${reverse ? "border-white/40 bg-white" : "border-white/25 bg-white/[0.04]"}`}>
                              {reverse && (
                                <svg viewBox="0 0 16 16" className="h-3 w-3 text-zinc-900" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3.5 8.5l3 3 6-6.5" />
                                </svg>
                              )}
                            </span>
                            <input
                              type="checkbox"
                              checked={reverse}
                              onChange={(event) => setReverse(event.target.checked)}
                              className="sr-only"
                            />
                            <span>倒序预览和导出</span>
                          </label>
                        </div>
                      </div>
                      <div className="flex w-fit max-w-full flex-wrap items-center gap-2 px-1">
                        <SurfaceActionButton disabled={!job?.processed_dir} onClick={() => openPath(job?.processed_dir)}>
                          <FolderOpen className="h-3.5 w-3.5" />
                          打开目录
                        </SurfaceActionButton>
                        <SurfaceActionButton active={magicResizeMode === "hard"} onClick={() => setMagicResizeMode("hard")}>硬</SurfaceActionButton>
                        <SurfaceActionButton active={magicResizeMode === "soft"} onClick={() => setMagicResizeMode("soft")}>软</SurfaceActionButton>
                        <SurfaceActionButton disabled={!job || !selectedForPreview.length || busy === "magic"} onClick={runMagic}>MAGIC</SurfaceActionButton>
                        <SurfaceActionButton disabled={!job || !selectedForPreview.length || busy === "export"} onClick={exportFrames} accent>导出</SurfaceActionButton>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {(magic || exportResult) && (
                      <div className="grid grid-cols-2 gap-3">
                        <MagicPanel magic={magic} exportMagic={exportMagic} busy={busy} />
                        <ExportPanel result={exportResult} openPath={openPath} />
                      </div>
                    )}
                    <FrameGrid job={job} selected={selected} order={selectionOrder} ordered={orderedSelection} toggleFrame={toggleFrame} />
                  </div>
                </div>
              </Panel>
            </section>
          </div>
        ) : (
          <LineCleaner
            busy={busy}
            frames={lineFrames}
            currentIndex={lineIndex}
            setCurrentIndex={setLineIndex}
            playing={linePlaying}
            setPlaying={setLinePlaying}
            fps={lineFps}
            setFps={setLineFps}
            method={lineMethod}
            setMethod={setLineMethod}
            scale={lineScale}
            setScale={setLineScale}
            alphaCutoff={lineAlphaCutoff}
            setAlphaCutoff={setLineAlphaCutoff}
            sharpen={lineSharpen}
            setSharpen={setLineSharpen}
            colorCount={lineColorCount}
            setColorCount={setLineColorCount}
            zoom={lineZoom}
            setZoom={setLineZoom}
            sourceCanvasRef={lineSourceCanvasRef}
            processedCanvasRef={lineProcessedCanvasRef}
            current={lineCurrent}
            processedCount={lineProcessed.length}
            sourceBytes={lineSourceBytes}
            processedBytes={lineProcessedBytes}
            loadFiles={loadLineFiles}
            processFrames={processLineCleaner}
            downloadTar={downloadLineTar}
          />
        )}

      </div>
    </main>
  );
}

function SourcePanel({
  upload,
  uploadFiles,
  videoRef,
  mediaUrl,
}: {
  upload: SpriteUpload | null;
  uploadFiles: (files: File[]) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  mediaUrl: string;
}) {
  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    void uploadFiles(Array.from(event.dataTransfer.files || []));
  };
  const info = uploadInfo(upload);
  const hasUpload = Boolean(upload);
  const fpsLabel = mediaType(upload) === "image_sequence"
    ? `${info.frame_count || 0} 张`
    : info.fps ? `${Number(info.fps).toFixed(2)} fps` : "-";
  const durationLabel = info.duration
    ? formatSeconds(info.duration)
    : mediaType(upload) === "image" ? "图片" : "-";
  return (
    <Panel title="导入素材">
      <label
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
        className="group flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-white/12 bg-white/[0.03] px-3 py-2.5 text-left transition duration-200 hover:border-sky-300/30 hover:bg-white/[0.06]"
      >
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-sky-200 transition duration-200 group-hover:bg-white/[0.14]">
          <Upload className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-white/85">拖入文件或点击选择</p>
          <p className="truncate text-[11px] leading-4 text-white/35">视频、GIF、图片序列</p>
        </div>
        <input
          type="file"
          multiple
          accept=".mp4,.mov,.mkv,.webm,.gif,.png,.jpg,.jpeg,.webp,.bmp,video/*,image/*"
          className="hidden"
          onChange={(event) => void uploadFiles(Array.from(event.target.files || []))}
        />
      </label>
      {hasUpload && (
        <div className="mt-3 aspect-video overflow-hidden rounded-lg border border-white/10 bg-black/35">
          {mediaType(upload) === "video" ? (
            <video ref={videoRef} src={mediaUrl} muted playsInline loop controls className="h-full w-full object-contain" />
          ) : (
            <img src={mediaUrl} alt="素材预览" className="h-full w-full object-contain" />
          )}
        </div>
      )}
      {hasUpload ? (
        <dl className="mt-3 space-y-1.5 text-xs">
          {[
            ["文件", upload?.display_name || "-"],
            ["类型", mediaType(upload)],
            ["尺寸", info.width && info.height ? `${info.width} × ${info.height}` : "-"],
            ["帧率", fpsLabel],
            ["时长", durationLabel],
          ].map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0 text-white/35">{label}</dt>
              <dd className="min-w-0 truncate text-right text-white/80">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2.5 text-[11px] leading-4 text-white/28">
          支持视频、GIF、图片；多张图片会按文件名排序。
        </p>
      )}
    </Panel>
  );
}

function RangeSlider({
  min,
  max,
  start,
  end,
  onChange,
}: {
  min: number;
  max: number;
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<"start" | "end" | null>(null);

  const span = Math.max(1, max - min);
  const startPct = ((clamp(start, min, max) - min) / span) * 100;
  const endPct = ((clamp(end, min, max) - min) / span) * 100;

  const valueFromClientX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return min;
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    return Math.round(min + ratio * (max - min));
  };

  const applyDrag = (clientX: number) => {
    const value = valueFromClientX(clientX);
    if (draggingRef.current === "start") {
      onChange(clamp(value, min, end), end);
    } else if (draggingRef.current === "end") {
      onChange(start, clamp(value, start, max));
    }
  };

  const beginDrag = (edge: "start" | "end", clientX: number, target: HTMLElement, pointerId: number) => {
    draggingRef.current = edge;
    try {
      target.setPointerCapture(pointerId);
    } catch {
      /* noop */
    }
    applyDrag(clientX);
  };

  const handleTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const value = valueFromClientX(event.clientX);
    const edge = Math.abs(value - start) <= Math.abs(value - end) ? "start" : "end";
    beginDrag(edge, event.clientX, event.currentTarget, event.pointerId);
  };

  const handleHandlePointerDown = (edge: "start" | "end") => (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    beginDrag(edge, event.clientX, event.currentTarget, event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (draggingRef.current) applyDrag(event.clientX);
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = null;
    try {
      (event.target as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      /* noop */
    }
  };

  return (
    <div className="relative flex h-6 select-none items-center px-2">
      <div
        ref={trackRef}
        onPointerDown={handleTrackPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative h-1.5 w-full cursor-pointer rounded-full border border-white/10 bg-zinc-800/80 backdrop-blur-sm"
      >
        <div
          className="absolute inset-y-0 rounded-full bg-white/40 shadow-[0_0_8px_rgba(255,255,255,0.15)]"
          style={{ left: `${startPct}%`, right: `${100 - endPct}%` }}
        />
        <button
          type="button"
          aria-label="起始帧手柄"
          onPointerDown={handleHandlePointerDown("start")}
          className="absolute top-1/2 z-20 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border border-white/15 bg-zinc-900/85 shadow-md shadow-black/50 backdrop-blur-md transition hover:scale-110 active:cursor-grabbing"
          style={{ left: `${startPct}%` }}
        />
        <button
          type="button"
          aria-label="结束帧手柄"
          onPointerDown={handleHandlePointerDown("end")}
          className="absolute top-1/2 z-20 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border border-white/15 bg-zinc-900/85 shadow-md shadow-black/50 backdrop-blur-md transition hover:scale-110 active:cursor-grabbing"
          style={{ left: `${endPct}%` }}
        />
      </div>
    </div>
  );
}

function TimelinePanel({
  upload,
  startFrame,
  endFrame,
  setStartFrame,
  setEndFrame,
}: {
  upload: SpriteUpload;
  startFrame: number;
  endFrame: number;
  setStartFrame: (value: number) => void;
  setEndFrame: (value: number) => void;
}) {
  const count = frameCountForUpload(upload);
  const info = uploadInfo(upload);
  const isVideo = mediaType(upload) === "video";
  const fps = Number(info.fps || 0);
  const duration = Number(info.duration || 0);

  if (mediaType(upload) === "image") {
    return (
      <Panel title="处理范围">
        <p className="text-sm text-white/58">图片不需要选范围。</p>
      </Panel>
    );
  }

  const selectedCount = Math.max(1, endFrame - startFrame + 1);
  const selectedDuration = isVideo && fps > 0 ? selectedCount / fps : 0;
  const startTime = isVideo ? frameToTime(upload, startFrame, "start") : 0;
  const endTime = isVideo ? frameToTime(upload, endFrame, "end") : 0;

  return (
    <Panel title="处理范围">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="开始帧">
            <TextInput type="number" min={1} max={count} value={startFrame} onChange={(event) => setStartFrame(Number(event.target.value))} />
          </Field>
          <Field label="结束帧">
            <TextInput type="number" min={startFrame} max={count} value={endFrame} onChange={(event) => setEndFrame(Number(event.target.value))} />
          </Field>
        </div>

        <RangeSlider
          min={1}
          max={count}
          start={startFrame}
          end={endFrame}
          onChange={(start, end) => {
            setStartFrame(start);
            setEndFrame(end);
          }}
        />

        <div className="flex items-center justify-between text-[11px] text-white/40">
          <span>第 1 帧{isVideo && duration > 0 ? ` · ${formatSeconds(0)}` : ""}</span>
          <span className="text-white/55">
            {isVideo && selectedDuration > 0
              ? `${formatSeconds(startTime)} → ${formatSeconds(endTime)}`
              : `已选 ${selectedCount} 帧`}
          </span>
          <span>第 {count} 帧{isVideo && duration > 0 ? ` · ${formatSeconds(duration)}` : ""}</span>
        </div>
      </div>
    </Panel>
  );
}

function OptionsPanel({
  options,
  setOptions,
  detectedKeyColor,
}: {
  options: ProcessingOptions;
  setOptions: React.Dispatch<React.SetStateAction<ProcessingOptions>>;
  detectedKeyColor?: string;
}) {
  const patch = (value: Partial<ProcessingOptions>) => setOptions((current) => ({ ...current, ...value }));
  const isChroma =
    options.chromaEnabled &&
    (options.matteMode === "chroma" ||
      options.matteMode === "corridorkey" ||
      options.matteMode === "birefnet_chroma");
  const isLuma = options.chromaEnabled && options.matteMode.includes("luma");
  const isCorridor = options.chromaEnabled && options.matteMode.includes("corridorkey");
  const isSlowMatte =
    options.matteMode.includes("birefnet") || options.matteMode.includes("corridorkey");
  return (
    <Panel title="处理参数" className="max-h-[calc(100vh-88px)] overflow-y-auto no-scrollbar">
      <div className="space-y-3">
        <section className="rounded-xl border border-white/8 bg-white/[0.025] p-3 space-y-2.5">
          <SectionLabel>输出</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <Field label="抽帧间隔">
              <TextInput type="number" min={1} value={options.keepEvery} onChange={(event) => patch({ keepEvery: Math.max(1, Number(event.target.value || 1)) })} />
            </Field>
            <Field label="缩放比例">
              <TextInput type="number" min={5} max={200} step={5} value={options.outputScale} onChange={(event) => patch({ outputScale: clamp(Number(event.target.value || 100), 5, 200) })} />
            </Field>
            <Field label="画布">
              <Select value={options.canvasMode} onChange={(event) => patch({ canvasMode: event.target.value as ProcessingOptions["canvasMode"] })}>
                <option value="auto">自适应居中</option>
                <option value="square_bottom">方形底部</option>
                <option value="square_center">方形居中</option>
              </Select>
            </Field>
            <Field label="缩边">
              <TextInput type="number" min={0} value={options.reducePx} onChange={(event) => patch({ reducePx: Math.max(0, Number(event.target.value || 0)) })} />
            </Field>
          </div>
        </section>

        <section className="rounded-xl border border-white/8 bg-white/[0.025] p-3 space-y-2.5">
          <SectionLabel>去背景</SectionLabel>
          <Check checked={options.chromaEnabled} onChange={(checked) => patch({ chromaEnabled: checked })} label="输出透明背景" />
          <Field label="方式">
            <Select value={options.matteMode} disabled={!options.chromaEnabled} onChange={(event) => patch({ matteMode: event.target.value as ProcessingOptions["matteMode"] })}>
              {MATTE_MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
            <span className="text-[11px] leading-4 text-white/36">
              {MATTE_MODE_HELP[options.matteMode]}
            </span>
            {isSlowMatte && (
              <span className="text-[11px] leading-4 text-amber-200/70">
                慢速模式首次会久一点，建议先预览一帧。
              </span>
            )}
          </Field>
          {(isChroma || isCorridor) && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="背景取色">
                <Select value={options.keyMode} onChange={(event) => patch({ keyMode: event.target.value as "auto" | "manual" })}>
                  <option value="auto">自动</option>
                  <option value="manual">手动</option>
                </Select>
              </Field>
              <Field
                label={options.keyMode === "auto" ? "自动背景色" : "背景色"}
                hint={undefined}
              >
                {options.keyMode === "auto" ? (
                  <div className="flex h-9 w-full items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-xs text-white/70">
                    {detectedKeyColor ? (
                      <>
                        <span className="h-5 w-5 rounded-md border border-white/10" style={{ backgroundColor: detectedKeyColor }} />
                        <span>{detectedKeyColor.toUpperCase()}</span>
                      </>
                    ) : (
                      <span className="text-white/30">预览后显示</span>
                    )}
                  </div>
                ) : (
                  <ColorField value={options.manualKeyHex} onChange={(value) => patch({ manualKeyHex: value })} />
                )}
              </Field>
              <Field label="去除强度"><TextInput type="number" value={options.threshold} onChange={(event) => patch({ threshold: Number(event.target.value || 0) })} /></Field>
              <Field label="边缘柔和"><TextInput type="number" value={options.softness} onChange={(event) => patch({ softness: Number(event.target.value || 0) })} /></Field>
            </div>
          )}
          {options.chromaEnabled && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="去绿边"><TextInput type="number" min={0} max={1} step={0.05} value={options.despillStrength} onChange={(event) => patch({ despillStrength: Number(event.target.value || 0) })} /></Field>
              <Field label="收边"><TextInput type="number" min={0} value={options.haloPixels} onChange={(event) => patch({ haloPixels: Number(event.target.value || 0) })} /></Field>
            </div>
          )}
          {isCorridor && (
            <Field label="幕布颜色">
              <Select value={options.corridorkeyScreen} onChange={(event) => patch({ corridorkeyScreen: event.target.value as "auto" | "green" | "blue" })}>
                <option value="auto">自动</option>
                <option value="green">绿色</option>
                <option value="blue">蓝色</option>
              </Select>
            </Field>
          )}
          {isLuma && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="暗部"><TextInput type="number" value={options.lumaBlack} onChange={(event) => patch({ lumaBlack: Number(event.target.value || 0) })} /></Field>
              <Field label="亮部"><TextInput type="number" value={options.lumaWhite} onChange={(event) => patch({ lumaWhite: Number(event.target.value || 0) })} /></Field>
              <Field label="Gamma"><TextInput type="number" step={0.05} value={options.lumaGamma} onChange={(event) => patch({ lumaGamma: Number(event.target.value || 1) })} /></Field>
              <Field label="强度"><TextInput type="number" step={0.05} value={options.lumaStrength} onChange={(event) => patch({ lumaStrength: Number(event.target.value || 1) })} /></Field>
            </div>
          )}
        </section>

        {isChroma && (
          <section className="rounded-xl border border-white/8 bg-white/[0.025] p-3 space-y-2.5">
            <SectionLabel>保护主体</SectionLabel>
            <Check checked={options.foregroundProtectEnabled} onChange={(checked) => patch({ foregroundProtectEnabled: checked })} label="保护相近颜色" />
            <div className="grid grid-cols-2 gap-2">
              <Field label="保护色">
                <ColorField value={options.foregroundProtectHex} disabled={!options.foregroundProtectEnabled} onChange={(value) => patch({ foregroundProtectHex: value })} />
              </Field>
              <Field label="范围">
                <TextInput type="number" min={1} max={120} value={options.foregroundProtectTolerance} disabled={!options.foregroundProtectEnabled} onChange={(event) => patch({ foregroundProtectTolerance: clamp(Number(event.target.value || 34), 1, 120) })} />
              </Field>
              <Field label="强度">
                <TextInput type="number" min={0} max={1} step={0.05} value={options.foregroundProtectStrength} disabled={!options.foregroundProtectEnabled} onChange={(event) => patch({ foregroundProtectStrength: clamp(Number(event.target.value || 1), 0, 1) })} />
              </Field>
            </div>
          </section>
        )}

        <section className="rounded-xl border border-white/8 bg-white/[0.025] p-3 space-y-2">
          <SectionLabel>批量修正</SectionLabel>
          <Check checked={options.batchGreenToBlack} onChange={(checked) => patch({ batchGreenToBlack: checked })} label="绿边变暗" />
          <Check checked={options.batchGreenDesaturate} onChange={(checked) => patch({ batchGreenDesaturate: checked })} label="淡化绿边" />
          <Check checked={options.batchSemiTransparentToBlack} onChange={(checked) => patch({ batchSemiTransparentToBlack: checked })} label="半透明变暗" />
          <Check checked={options.batchSemiTransparentToOpaque} onChange={(checked) => patch({ batchSemiTransparentToOpaque: checked })} label="补实半透明" />
        </section>
      </div>
    </Panel>
  );
}

function PreviewImage({
  title,
  url,
  bgMode = "checkerboard",
  bgColor = "#F6FBF6",
  compact = false,
}: {
  title: string;
  url?: string;
  bgMode?: "checkerboard" | "color";
  bgColor?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const imageUrl = url ? spriteAssetUrl(url) : "";
  const checkerboardClass = "bg-[linear-gradient(45deg,rgba(255,255,255,.08)_25%,transparent_25%),linear-gradient(-45deg,rgba(255,255,255,.08)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,rgba(255,255,255,.08)_75%),linear-gradient(-45deg,transparent_75%,rgba(255,255,255,.08)_75%)] bg-[length:18px_18px] bg-[position:0_0,0_9px,9px_-9px,-9px_0px]";
  const previewBgClass = bgMode === "checkerboard" ? checkerboardClass : "";
  const previewStyle = bgMode === "color" ? { backgroundColor: bgColor } : undefined;

  return (
    <article>
      <div className="mb-2 flex items-center justify-between text-xs text-white/55">
        <span>{title}</span>
        <button
          type="button"
          disabled={!url}
          onClick={() => setOpen(true)}
          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-white/8 bg-white/[0.04] text-white/50 transition hover:bg-white/[0.09] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={`放大查看${title}`}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div
        className={`flex ${compact ? "h-[210px] 2xl:h-[250px]" : "aspect-[4/3]"} items-center justify-center overflow-hidden rounded-lg border border-white/10 ${previewBgClass}`}
        style={previewStyle}
      >
        {imageUrl ? <img src={imageUrl} alt={title} className="h-full w-full object-contain" /> : <span className="text-xs text-white/28">暂无预览</span>}
      </div>
      {open && imageUrl &&
        createPortal(
          <div
            className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/78 p-6 backdrop-blur-xl"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onMouseDown={() => setOpen(false)}
          >
            <div
              className={`relative flex h-full max-h-[88vh] w-full max-w-6xl items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/60 p-4 shadow-2xl shadow-black/50 ${previewBgClass}`}
              style={previewStyle}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="absolute left-4 top-4 rounded-lg border border-white/10 bg-black/55 px-3 py-1.5 text-xs text-white/72 backdrop-blur-md">
                {title}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="absolute right-4 top-4 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-black/55 text-white/70 transition hover:bg-white/10 hover:text-white"
                aria-label="关闭放大预览"
              >
                <X className="h-4 w-4" />
              </button>
              <img src={imageUrl} alt={title} className="max-h-full max-w-full object-contain" />
            </div>
          </div>,
          document.body
        )}
    </article>
  );
}

function FrameGrid({
  job,
  selected,
  order,
  ordered,
  toggleFrame,
}: {
  job: SpriteJob | null;
  selected: Set<number>;
  order: number[];
  ordered: boolean;
  toggleFrame: (index: number, checked: boolean) => void;
}) {
  if (!job) {
    return (
      <div className="flex min-h-[520px] flex-col items-center justify-center gap-3">
        <img src="/sprite-video-lab/empty-frames.svg" alt="" className="h-[200px] w-[200px] object-contain opacity-70" />
        <p className="text-xs text-white/32">处理后会在这里显示帧序列</p>
      </div>
    );
  }
  const orderMap = new Map(order.map((index, idx) => [index, idx + 1]));
  return (
    <div className="grid max-h-[520px] grid-cols-[repeat(auto-fill,minmax(116px,1fr))] gap-2 overflow-y-auto p-1 no-scrollbar">
      {job.frames.map((frame) => {
        const checked = selected.has(frame.index);
        return (
          <label key={frame.index} className={`relative cursor-pointer overflow-hidden rounded-lg border bg-white/[0.04] p-2 transition ${checked ? "border-white/30 bg-white/[0.08] ring-1 ring-white/8" : "border-white/10 hover:border-white/20"}`}>
            <input type="checkbox" checked={checked} onChange={(event) => toggleFrame(frame.index, event.target.checked)} className="sr-only" />
            <span className={`absolute left-2 top-2 z-10 flex h-4 w-4 items-center justify-center rounded-[6px] border transition ${checked ? "border-white/40 bg-white" : "border-white/25 bg-white/[0.04]"}`}>
              {checked && (
                <svg viewBox="0 0 16 16" className="h-3 w-3 text-zinc-900" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3.5 8.5l3 3 6-6.5" />
                </svg>
              )}
            </span>
            {ordered && checked && <span className="absolute right-2 top-2 z-10 rounded-full bg-sky-300 px-1.5 py-0.5 text-[10px] text-black">{orderMap.get(frame.index)}</span>}
            <img src={spriteAssetUrl(frame.thumb_url || frame.url)} alt={frame.name} className="aspect-square w-full rounded-md bg-black/25 object-contain" />
            <div className="mt-2 min-w-0 text-[11px] text-white/52">
              <p className="text-white/75">#{String(frame.index + 1).padStart(3, "0")}</p>
              <p className="truncate">{frame.original_name || frame.name}</p>
            </div>
          </label>
        );
      })}
    </div>
  );
}

function MagicPanel({ magic, exportMagic, busy }: { magic: SpriteMagic | null; exportMagic: (key: MagicVariant["key"]) => void; busy: string }) {
  if (!magic) return null;
  const variantFor = (key: MagicVariant["key"]) => magic.variants?.[key] || (key === "half" ? magic : undefined);
  return (
    <div className="grid grid-cols-3 gap-2">
      {MAGIC_VARIANTS.map((config) => {
        const variant = variantFor(config.key);
        return (
          <div key={config.key} className="rounded-lg border border-sky-200/15 bg-sky-200/[0.055] p-3">
            <div className="mb-2 flex items-center justify-between">
              <strong className="text-xs text-sky-100">{config.label}</strong>
              <span className="text-[11px] text-white/45">{variant?.frame_count || 0} 帧</span>
            </div>
            <div className="mb-3 aspect-square overflow-hidden rounded-md bg-black/25">
              {variant?.frames?.[0] ? <img src={spriteAssetUrl(variant.frames[0].url)} alt={config.label} className="h-full w-full object-contain" /> : null}
            </div>
            <Button disabled={!variant?.frames?.length || busy === `export-magic-${config.key}`} onClick={() => exportMagic(config.key)} className="w-full">
              导出处理后帧
            </Button>
          </div>
        );
      })}
    </div>
  );
}

function ExportPanel({ result, openPath }: { result: SpriteExport | null; openPath: (path?: string) => void }) {
  if (!result) return null;
  const links = [
    ["WebM", result.webm_url || result.video_url, result.webm_name || result.video_name],
    ["MOV", result.mov_url, result.mov_name],
    ["GIF", result.gif_url, result.gif_name],
  ].filter(([, url]) => Boolean(url));
  return (
    <div className="rounded-lg border border-emerald-300/15 bg-emerald-300/[0.055] p-3">
      <div className="mb-3 flex items-center justify-between">
        <strong className="text-sm text-emerald-100">导出完成</strong>
        <span className="text-xs text-white/55">{result.frame_count || 0} 帧</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => openPath(result.frames_dir || result.output_dir)}>
          <FolderOpen className="h-3.5 w-3.5" />
          打开 frames
        </Button>
        {links.map(([label, url, name]) => (
          <a key={label} href={spriteAssetUrl(String(url))} target="_blank" rel="noopener" className="inline-flex h-9 items-center rounded-3xl border border-white/10 bg-white/[0.07] px-3 text-xs text-white/75 transition hover:bg-white/[0.12]">
            {label}: {name}
          </a>
        ))}
      </div>
    </div>
  );
}

function LineCleaner(props: {
  busy: string;
  frames: LineFrame[];
  currentIndex: number;
  setCurrentIndex: (value: number) => void;
  playing: boolean;
  setPlaying: (value: boolean) => void;
  fps: number;
  setFps: (value: number) => void;
  method: "classic" | "realesrgan_anime";
  setMethod: (value: "classic" | "realesrgan_anime") => void;
  scale: number;
  setScale: (value: number) => void;
  alphaCutoff: number;
  setAlphaCutoff: (value: number) => void;
  sharpen: number;
  setSharpen: (value: number) => void;
  colorCount: number;
  setColorCount: (value: number) => void;
  zoom: number;
  setZoom: (value: number) => void;
  sourceCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  processedCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  current?: LineFrame;
  processedCount: number;
  sourceBytes: number;
  processedBytes: number;
  loadFiles: (files: File[]) => void;
  processFrames: () => void;
  downloadTar: () => void;
}) {
  const saving = props.sourceBytes > 0 && props.processedBytes > 0 ? Math.round((1 - props.processedBytes / props.sourceBytes) * 100) : null;
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[340px_minmax(0,1fr)] gap-4 overflow-hidden p-4">
      <aside className="space-y-4 overflow-y-auto pr-1 no-scrollbar">
        <Panel title="线稿清理" kicker="Line Cleaner">
          <div className="space-y-3">
            <FileDrop onFiles={props.loadFiles} label="拖入图片序列" />
            <div className="grid grid-cols-2 gap-2">
              <Meta label="帧数" value={String(props.frames.length)} />
              <Meta label="原体积" value={formatBytes(props.sourceBytes)} />
              <Meta label="新体积" value={formatBytes(props.processedBytes)} />
              <Meta label="节省" value={saving === null ? "-" : `${saving}%`} />
            </div>
          </div>
        </Panel>
        <Panel title="清理设置" kicker="Controls">
          <div className="space-y-3">
            <Field label="播放帧率"><TextInput type="number" min={1} max={60} value={props.fps} onChange={(event) => props.setFps(clamp(Number(event.target.value || 12), 1, 60))} /></Field>
            <Field label="处理方式">
              <Select value={props.method} onChange={(event) => props.setMethod(event.target.value as "classic" | "realesrgan_anime")}>
                <option value="classic">普通缩小</option>
                <option value="realesrgan_anime">Real-ESRGAN anime 先整线再缩小</option>
              </Select>
            </Field>
            <Field label="缩放倍数"><TextInput type="number" min={0.05} max={2} step={0.05} value={props.scale} onChange={(event) => props.setScale(clamp(Number(event.target.value || 0.5), 0.05, 2))} /></Field>
            <Field label={`透明清理 ${props.alphaCutoff}`}><input type="range" min={0} max={80} value={props.alphaCutoff} onChange={(event) => props.setAlphaCutoff(Number(event.target.value))} className="accent-sky-300" /></Field>
            <Field label={`缩小后锐化 ${props.sharpen}%`}><input type="range" min={0} max={220} step={5} value={props.sharpen} onChange={(event) => props.setSharpen(Number(event.target.value))} className="accent-sky-300" /></Field>
            <Field label={`最大颜色数 ${props.colorCount}`}><input type="range" min={16} max={256} step={8} value={props.colorCount} onChange={(event) => props.setColorCount(Number(event.target.value))} className="accent-sky-300" /></Field>
            <div className="flex flex-wrap gap-2">
              <Button disabled={!props.frames.length || props.busy === "line-process"} onClick={props.processFrames} variant="primary">开始清理</Button>
              <Button disabled={!props.processedCount} onClick={() => props.current?.processedUrl && downloadUrl(props.current.processedUrl, "line-cleaned-frame.png")}>下载当前帧</Button>
              <Button disabled={!props.processedCount} onClick={props.downloadTar}>下载序列</Button>
            </div>
          </div>
        </Panel>
      </aside>
      <section className="min-h-0 overflow-y-auto pr-1 no-scrollbar">
        <Panel
          title="动画对比"
          kicker="Viewer"
          action={
            <div className="flex gap-2">
              <Button disabled={!props.frames.length} onClick={() => props.setPlaying(!props.playing)}>{props.playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{props.playing ? "暂停" : "播放"}</Button>
              <Button disabled={!props.frames.length} onClick={() => props.setCurrentIndex(0)}><RotateCcw className="h-3.5 w-3.5" />重置</Button>
              <Button disabled={!props.frames.length} onClick={() => props.setZoom(clamp(props.zoom - 0.25, 0.25, 4))}>-</Button>
              <Button disabled={!props.frames.length} onClick={() => props.setZoom(clamp(props.zoom + 0.25, 0.25, 4))}>+ {Math.round(props.zoom * 100)}%</Button>
            </div>
          }
        >
          <div className="mb-3 flex items-center justify-between text-xs text-white/58">
            <span>{props.current ? `#${String(props.currentIndex + 1).padStart(3, "0")} / ${props.frames.length}` : "#000"}</span>
            <span className="truncate">{props.current?.name || "-"}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <figure className="min-h-0">
              <figcaption className="mb-2 text-xs text-white/52">原图</figcaption>
              <canvas ref={props.sourceCanvasRef} className="aspect-square w-full rounded-lg border border-white/10 bg-black/35" />
            </figure>
            <figure>
              <figcaption className="mb-2 text-xs text-white/52">处理后</figcaption>
              <canvas ref={props.processedCanvasRef} className="aspect-square w-full rounded-lg border border-white/10 bg-black/35" />
            </figure>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto rounded-lg border border-white/10 bg-black/15 p-2 no-scrollbar">
            {props.frames.map((frame, index) => (
              <button key={frame.name + index} onClick={() => props.setCurrentIndex(index)} className={`h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-white/[0.04] ${index === props.currentIndex ? "border-sky-300/55" : "border-white/10"}`}>
                <img src={frame.sourceUrl} alt={frame.name} className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
        </Panel>
      </section>
    </div>
  );
}

function FileDrop({ onFiles, label }: { onFiles: (files: File[]) => void; label: string }) {
  return (
    <label
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onFiles(Array.from(event.dataTransfer.files || []));
      }}
      className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 bg-white/[0.045] px-4 text-center transition hover:bg-white/[0.08]"
    >
      <Upload className="h-6 w-6 text-sky-200/70" />
      <span className="text-sm text-white/78">{label}</span>
      <input type="file" multiple accept=".png,.jpg,.jpeg,.webp,.bmp,image/*" className="hidden" onChange={(event) => onFiles(Array.from(event.target.files || []))} />
    </label>
  );
}

function FileButton({ onFiles, label, icon, multiple = false, accent = false }: { onFiles: (files: File[]) => void; label: string; icon?: React.ReactNode; multiple?: boolean; accent?: boolean }) {
  return (
    <label
      className={`inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-3xl border px-3 text-xs font-medium shadow-lg shadow-black/20 backdrop-blur-xl transition hover:-translate-y-0.5 ${
        accent
          ? "border-orange-200/25 bg-[linear-gradient(135deg,rgba(251,146,60,0.34),rgba(12,12,14,0.82))] text-orange-50 hover:border-orange-200/40"
          : "border-white/10 bg-white/[0.07] text-white/80 hover:bg-white/[0.12]"
      }`}
    >
      {icon}
      {label}
      <input type="file" multiple={multiple} accept=".png,.jpg,.jpeg,.webp,.bmp,image/*" className="hidden" onChange={(event: ChangeEvent<HTMLInputElement>) => onFiles(Array.from(event.target.files || []))} />
    </label>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-white/[0.045] p-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-white/32">{label}</p>
      <strong className="mt-1 block truncate text-xs font-medium text-white/78">{value}</strong>
    </div>
  );
}

function EmptyStage({ label }: { label: string }) {
  return <div className="flex h-full w-full items-center justify-center text-sm text-white/28">{label}</div>;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败"));
    image.src = url;
  });
}

function tarHeader(name: string, size: number): Uint8Array {
  const header = new Uint8Array(new ArrayBuffer(512));
  const write = (value: string, offset: number, length: number) => {
    for (let index = 0; index < Math.min(value.length, length); index += 1) {
      header[offset + index] = value.charCodeAt(index) & 0xff;
    }
  };
  const writeOctal = (value: number, offset: number, length: number) => {
    write(value.toString(8).padStart(length - 1, "0").slice(-(length - 1)) + "\0", offset, length);
  };
  write(name.slice(0, 100), 0, 100);
  writeOctal(0o644, 100, 8);
  writeOctal(0, 108, 8);
  writeOctal(0, 116, 8);
  writeOctal(size, 124, 12);
  writeOctal(Math.floor(Date.now() / 1000), 136, 12);
  for (let index = 148; index < 156; index += 1) header[index] = 32;
  header[156] = "0".charCodeAt(0);
  write("ustar", 257, 6);
  write("00", 263, 2);
  let checksum = 0;
  for (const byte of header) checksum += byte;
  write(checksum.toString(8).padStart(6, "0"), 148, 6);
  header[154] = 0;
  header[155] = 32;
  return header;
}
