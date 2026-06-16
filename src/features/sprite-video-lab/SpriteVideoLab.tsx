"use client";

/* eslint-disable @next/next/no-img-element, react-hooks/refs */

import Link from "next/link";
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
  Wand2,
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

const DEFAULT_OPTIONS: ProcessingOptions = {
  keepEvery: 2,
  outputScale: 100,
  canvasMode: "auto",
  reducePx: 0,
  chromaEnabled: true,
  matteMode: "chroma",
  keyMode: "auto",
  manualKeyHex: "#00ff00",
  threshold: 42,
  softness: 8,
  despillStrength: 0.6,
  haloPixels: 1,
  corridorkeyScreen: "auto",
  lumaBlack: 0,
  lumaWhite: 85,
  lumaGamma: 0.55,
  lumaStrength: 1.7,
  batchGreenToBlack: false,
  batchGreenDesaturate: false,
  batchSemiTransparentToBlack: false,
  batchSemiTransparentToOpaque: false,
};

const MATTE_MODES = [
  ["chroma", "chroma key"],
  ["birefnet", "只用 BiRefNet"],
  ["corridorkey", "只用 CorridorKey"],
  ["luma", "只用 Luma"],
  ["birefnet_corridorkey", "BiRefNet 粗蒙版 / CorridorKey 精修边缘"],
  ["birefnet_corridorkey_key", "BiRefNet 后再用 CorridorKey 收紧抠图"],
  ["birefnet_luma", "BiRefNet 保主体 / Luma 补亮部"],
  ["birefnet_luma_key", "BiRefNet 后再用 Luma 收紧抠图"],
  ["birefnet_luma_corridorkey", "BiRefNet + Luma 合并后 / CorridorKey 精修"],
  ["none", "不抠图，只缩放对齐"],
] as const;

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

function Panel({
  title,
  kicker,
  action,
  children,
  className = "",
}: {
  title: string;
  kicker?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-white/10 bg-white/[0.055] shadow-2xl shadow-black/20 backdrop-blur-2xl ${className}`}>
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          {kicker && <p className="text-[10px] uppercase tracking-[0.2em] text-sky-200/45">{kicker}</p>}
          <h2 className="text-sm font-semibold text-white/88">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-9 w-full rounded-2xl border border-white/10 bg-white/[0.07] px-3 text-xs text-white outline-none transition placeholder:text-white/25 focus:border-white/25 focus:bg-white/[0.1] focus:ring-2 focus:ring-white/10 ${props.className || ""}`}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`h-9 w-full rounded-2xl border border-white/10 bg-[#11181d] px-3 text-xs text-white outline-none transition focus:border-white/25 focus:ring-2 focus:ring-white/10 ${props.className || ""}`}
    />
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
    <label className="flex min-h-8 cursor-pointer items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.045] px-3 text-xs text-white/70">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3.5 w-3.5 accent-sky-300"
      />
      <span>{label}</span>
    </label>
  );
}

export default function SpriteVideoLab() {
  const [mode, setMode] = useState<WorkbenchMode>("sprite");
  const [status, setStatus] = useState("等待导入素材。");
  const [tone, setTone] = useState<Tone>("idle");
  const [busy, setBusy] = useState("");
  const [path, setPath] = useState("");
  const [upload, setUpload] = useState<SpriteUpload | null>(null);
  const [options, setOptions] = useState<ProcessingOptions>(DEFAULT_OPTIONS);
  const [startFrame, setStartFrame] = useState(1);
  const [endFrame, setEndFrame] = useState(1);
  const [preview, setPreview] = useState<SpritePreview | null>(null);
  const [previewBgMode, setPreviewBgMode] = useState<"checkerboard" | "color">("checkerboard");
  const [previewBg, setPreviewBg] = useState("#F6FBF6");
  const [job, setJob] = useState<SpriteJob | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [selectionOrder, setSelectionOrder] = useState<number[]>([]);
  const [orderedSelection, setOrderedSelection] = useState(false);
  const [reverse, setReverse] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
  const [intervalMs, setIntervalMs] = useState(100);
  const [animationBg, setAnimationBg] = useState("#F6FBF6");
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
  const selectedForPreview = useMemo(
    () => selectedFrames(job, selected, orderedSelection, selectionOrder, reverse),
    [job, orderedSelection, reverse, selected, selectionOrder],
  );

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

  async function importPath() {
    if (!path.trim()) {
      setMessage("先填写本地视频、GIF、图片或序列帧路径。", "warn");
      return;
    }
    await runBusy("import-path", async () => {
      setMessage("正在导入本地路径...");
      const data = await spriteApi<{ ok: true; upload: SpriteUpload }>("/import-path", {
        method: "POST",
        body: { path: path.trim() },
      });
      applyUpload(data.upload);
      setMessage(`已导入 ${data.upload.display_name}。`, "success");
    });
  }

  async function uploadFiles(files: File[]) {
    if (!files.length) return;
    const sorted = sortFiles(files);
    if (sorted.length > 1 && !sorted.every(isSupportedImage)) {
      setMessage("多文件导入只支持图片序列帧。", "warn");
      return;
    }
    if (sorted.length === 1 && !isSupportedMedia(sorted[0]!)) {
      setMessage("只支持视频、GIF、单张图片或 PNG/JPG/WebP/BMP 序列。", "warn");
      return;
    }
    await runBusy("upload", async () => {
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
      setMessage("先导入素材，再预览参数。", "warn");
      return;
    }
    const sampleTime =
      currentMediaType === "video"
        ? clamp(videoRef.current?.currentTime || frameToTime(upload, startFrame, "start"), frameToTime(upload, startFrame, "start"), frameToTime(upload, endFrame, "end"))
        : 0;
    await runBusy("preview", async () => {
      setMessage("正在生成单帧参数预览...");
      const data = await spriteApi<{ ok: true; preview: SpritePreview }>("/preview-frame", {
        method: "POST",
        body: payload({ sample_time: sampleTime, sample_frame: startFrame }),
      });
      setPreview(data.preview);
      setMessage("单帧预览已更新。", "success");
    });
  }

  async function processSource() {
    if (!upload) {
      setMessage("先导入素材，再开始处理。", "warn");
      return;
    }
    await runBusy("process", async () => {
      setMessage("正在处理区间并生成透明帧...");
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
      setMessage(`处理完成，共 ${data.job.frame_count} 帧。`, "success");
    });
  }

  async function importAnimation(files: File[]) {
    const images = sortFiles(files).filter(isSupportedImage);
    if (!images.length) {
      setMessage("请选择 PNG / JPG / WebP / BMP 序列帧。", "warn");
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

  async function postprocessPreview(kind: "green-to-black" | "green-desaturate" | "semitransparent-to-black" | "semitransparent-to-opaque") {
    if (!preview?.preview_id) {
      setMessage("先生成单帧预览，再做后处理。", "warn");
      return;
    }
    const routeMap = {
      "green-to-black": "/preview-green-to-black",
      "green-desaturate": "/preview-green-desaturate",
      "semitransparent-to-black": "/preview-semitransparent-to-black",
      "semitransparent-to-opaque": "/preview-semitransparent-to-opaque",
    };
    await runBusy(kind, async () => {
      const data = await spriteApi<{ ok: true; preview: SpritePreview }>(routeMap[kind], {
        method: "POST",
        body: { preview_id: preview.preview_id, threshold: 42, dominance: 24, alpha_min: 1, alpha_max: 254 },
      });
      setPreview(data.preview);
      setMessage("预览后处理已完成。", "success");
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
      setMessage("至少选择一帧再导出。", "warn");
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
      setMessage("导出完成，已生成 frames、WebM、MOV 和 GIF。", "success");
    });
  }

  async function runMagic() {
    if (!job || selectedForPreview.length === 0) {
      setMessage("至少选择一帧再运行 MAGIC。", "warn");
      return;
    }
    await runBusy("magic", async () => {
      setMessage("MAGIC 正在运行 Real-ESRGAN anime 并生成 1/2、1/4、1/8 三档...");
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
      setMessage("请导入 PNG / JPG / WebP / BMP 序列帧。", "warn");
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
      setMessage("先导入序列帧。", "warn");
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
      setMessage("正在处理线稿序列...");
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
      setMessage("线稿清理处理完成。", "success");
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
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-black/20 px-5 backdrop-blur-2xl">
          <div className="flex items-center gap-3">
            <Link href="/" className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.07] text-white/70 transition hover:bg-white/[0.13] hover:text-white">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-sky-200/45">CreativeOS Tool</p>
              <h1 className="text-base font-semibold tracking-wide text-white/90">Sprite 资产处理台</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant={mode === "sprite" ? "primary" : "secondary"} onClick={() => setMode("sprite")}>
              <Film className="h-3.5 w-3.5" />
              Sprite 处理
            </Button>
            <Button variant={mode === "line-cleaner" ? "primary" : "secondary"} onClick={() => setMode("line-cleaner")}>
              <Eraser className="h-3.5 w-3.5" />
              线稿清理
            </Button>
          </div>
        </header>

        {mode === "sprite" ? (
          <div className="grid min-h-0 flex-1 grid-cols-[420px_minmax(0,1fr)] gap-4 overflow-hidden p-4">
            <aside className="min-h-0 space-y-4 overflow-y-auto pr-1">
              <SourcePanel
                path={path}
                setPath={setPath}
                busy={busy}
                upload={upload}
                uploadFiles={uploadFiles}
                importPath={importPath}
              />
              {upload && (
                <TimelinePanel
                  upload={upload}
                  startFrame={startFrame}
                  endFrame={endFrame}
                  setStartFrame={(value) => setStartFrame(clamp(Math.round(value), 1, uploadFrameCount))}
                  setEndFrame={(value) => setEndFrame(clamp(Math.round(value), startFrame, uploadFrameCount))}
                />
              )}
              <OptionsPanel options={options} setOptions={setOptions} />
            </aside>

            <section className="min-h-0 space-y-4 overflow-y-auto pr-1">
              <div className="grid grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-4">
                <Panel
                  title="源画面预览"
                  kicker="Preview"
                  action={upload && <span className="text-xs text-white/42">{currentMediaType === "video" ? "静音循环预览" : "静态源素材"}</span>}
                >
                  <div className="aspect-video overflow-hidden rounded-lg border border-white/10 bg-black/35">
                    {!upload ? (
                      <EmptyStage label="等待导入素材" />
                    ) : currentMediaType === "video" ? (
                      <video ref={videoRef} src={mediaUrl} muted playsInline loop controls className="h-full w-full object-contain" />
                    ) : (
                      <img src={mediaUrl} alt="源素材预览" className="h-full w-full object-contain" />
                    )}
                  </div>
                </Panel>

                <Panel
                  title="套用参数预览"
                  kicker="Compare"
                  action={
                    <Button disabled={!upload || busy === "preview"} onClick={previewFrame} variant="primary">
                      {busy === "preview" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                      预览当前帧
                    </Button>
                  }
                >
                  <div className="grid grid-cols-2 gap-3">
                    <PreviewImage title="原始抽帧" url={preview?.source_url} />
                    <PreviewImage title="套用参数后" url={preview?.processed_url} bgMode={previewBgMode} bgColor={previewBg} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <Field label="结果背景">
                      <Select value={previewBgMode} onChange={(event) => setPreviewBgMode(event.target.value as "checkerboard" | "color")}>
                        <option value="checkerboard">棋盘格</option>
                        <option value="color">纯色</option>
                      </Select>
                    </Field>
                    <Field label="背景色">
                      <TextInput type="color" value={previewBg} onChange={(event) => setPreviewBg(event.target.value)} />
                    </Field>
                    <Button disabled={!preview} onClick={() => postprocessPreview("green-to-black")}>绿边转黑</Button>
                    <Button disabled={!preview} onClick={() => postprocessPreview("green-desaturate")}>绿边去饱和</Button>
                    <Button disabled={!preview} onClick={() => postprocessPreview("semitransparent-to-black")}>半透明转黑</Button>
                    <Button disabled={!preview} onClick={() => postprocessPreview("semitransparent-to-opaque")}>半透明转不透明</Button>
                    <Button disabled={!preview?.processed_url} onClick={() => preview?.processed_url && downloadUrl(preview.processed_url, "sprite-preview.png")}>
                      <Download className="h-3.5 w-3.5" />
                      下载预览
                    </Button>
                  </div>
                </Panel>
              </div>

              <Panel
                title="帧检查与导出"
                kicker="Review"
                action={
                  <div className="flex gap-2">
                    <FileButton onFiles={importAnimation} multiple label="导入帧序列" icon={<ImagePlus className="h-3.5 w-3.5" />} />
                    <Button disabled={!upload || busy === "process"} onClick={processSource} variant="primary">
                      {busy === "process" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      开始处理区间
                    </Button>
                  </div>
                }
              >
                <div className="grid grid-cols-[330px_minmax(0,1fr)] gap-4">
                  <div className="space-y-3">
                    <div className="relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]" style={{ backgroundColor: animationBg }}>
                      <canvas ref={animationCanvasRef} width={512} height={512} className="h-full w-full" />
                      {!selectedForPreview.length && <EmptyStage label="还没有帧" />}
                    </div>
                    <div className="flex items-center justify-between text-xs text-white/60">
                      <strong className="text-white/80">
                        当前 {selectedForPreview[currentPreviewIndex] ? `#${String(selectedForPreview[currentPreviewIndex]!.index + 1).padStart(3, "0")}` : "-"}
                      </strong>
                      <span>{selectedForPreview.length ? `${currentPreviewIndex + 1} / ${selectedForPreview.length}` : "0 / 0"}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button disabled={selectedForPreview.length <= 1} onClick={() => setPlaying((value) => !value)}>
                        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        {playing ? "暂停预览" : "播放预览"}
                      </Button>
                      <Button disabled={!selectedForPreview.length} onClick={() => setCurrentPreviewIndex(0)}>
                        <RotateCcw className="h-3.5 w-3.5" />
                        重播
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="背景">
                        <TextInput type="color" value={animationBg} onChange={(event) => setAnimationBg(event.target.value)} />
                      </Field>
                      <Field label="间隔 ms">
                        <TextInput type="number" min={20} max={5000} value={intervalMs} onChange={(event) => setIntervalMs(clamp(Number(event.target.value || 100), 20, 5000))} />
                      </Field>
                    </div>
                    <Check checked={reverse} onChange={setReverse} label="反向动画预览和导出" />
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={!job || !selectedForPreview.length || busy === "export"} onClick={exportFrames} variant="primary">导出选中帧</Button>
                      <Button variant={magicResizeMode === "hard" ? "magic" : "secondary"} onClick={() => setMagicResizeMode("hard")}>硬</Button>
                      <Button variant={magicResizeMode === "soft" ? "magic" : "secondary"} onClick={() => setMagicResizeMode("soft")}>软</Button>
                      <Button disabled={!job || !selectedForPreview.length || busy === "magic"} onClick={runMagic} variant="magic">MAGIC</Button>
                    </div>
                  </div>

                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-sm text-white/82">已选 {selected.size} / {job?.frame_count || 0} 帧</strong>
                      <div className="flex flex-wrap gap-2">
                        <Button disabled={!job} onClick={() => selectBy(() => true)}>全选</Button>
                        <Button disabled={!job} onClick={() => selectBy(() => false)}>全不选</Button>
                        <Button disabled={!job} onClick={() => selectBy((frame) => (frame.index + 1) % 2 === 1)}>奇数帧</Button>
                        <Button disabled={!job} onClick={() => selectBy((frame) => (frame.index + 1) % 2 === 0)}>偶数帧</Button>
                        <Button disabled={!job} onClick={() => job && selectBy((frame) => !selected.has(frame.index))}>反选</Button>
                        <Button disabled={!job} variant={orderedSelection ? "primary" : "secondary"} onClick={() => setOrderedSelection((value) => !value)}>按选序</Button>
                        <Button disabled={!job?.processed_dir} onClick={() => openPath(job?.processed_dir)}>
                          <FolderOpen className="h-3.5 w-3.5" />
                          处理目录
                        </Button>
                      </div>
                    </div>

                    <FrameGrid job={job} selected={selected} order={selectionOrder} ordered={orderedSelection} toggleFrame={toggleFrame} />
                    <MagicPanel magic={magic} exportMagic={exportMagic} busy={busy} />
                    <ExportPanel result={exportResult} openPath={openPath} />
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

        <footer className="flex h-10 shrink-0 items-center gap-2 border-t border-white/10 bg-black/25 px-5 text-xs backdrop-blur-2xl">
          <span className={`h-2 w-2 rounded-full ${tone === "error" ? "bg-red-400" : tone === "warn" ? "bg-amber-300" : tone === "success" ? "bg-emerald-300" : "bg-sky-300"}`} />
          <span className="truncate text-white/64">{status}</span>
          {busy && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-white/45" />}
        </footer>
      </div>
    </main>
  );
}

function SourcePanel({
  path,
  setPath,
  busy,
  upload,
  uploadFiles,
  importPath,
}: {
  path: string;
  setPath: (value: string) => void;
  busy: string;
  upload: SpriteUpload | null;
  uploadFiles: (files: File[]) => void;
  importPath: () => void;
}) {
  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    void uploadFiles(Array.from(event.dataTransfer.files || []));
  };
  const info = uploadInfo(upload);
  return (
    <Panel title="导入源素材" kicker="Input">
      <div className="space-y-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <TextInput value={path} onChange={(event) => setPath(event.target.value)} placeholder="/Users/me/take_01.mp4 或 D:\\media\\take_01.mp4" />
          <Button disabled={busy === "import-path"} onClick={importPath} variant="primary">导入</Button>
        </div>
        <label
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
          className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 bg-white/[0.045] px-4 text-center transition hover:bg-white/[0.08]"
        >
          <Upload className="h-6 w-6 text-sky-200/70" />
          <span className="text-sm text-white/78">拖入文件或点击选择</span>
          <span className="text-xs leading-5 text-white/38">MP4 / MOV / MKV / WebM / GIF / PNG / JPG / WebP / BMP，多图会按文件名组成序列</span>
          <input
            type="file"
            multiple
            accept=".mp4,.mov,.mkv,.webm,.gif,.png,.jpg,.jpeg,.webp,.bmp,video/*,image/*"
            className="hidden"
            onChange={(event) => void uploadFiles(Array.from(event.target.files || []))}
          />
        </label>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Meta label="素材" value={upload?.display_name || "未导入"} />
          <Meta label="类型" value={upload ? mediaType(upload) : "-"} />
          <Meta label="尺寸" value={info.width && info.height ? `${info.width} x ${info.height}` : "-"} />
          <Meta label="帧率/数量" value={mediaType(upload) === "image_sequence" ? `${info.frame_count || 0} 张` : info.fps ? `${Number(info.fps).toFixed(2)} fps` : "-"} />
          <Meta label="时长" value={info.duration ? formatSeconds(info.duration) : mediaType(upload) === "image" ? "单张图片" : "-"} />
        </div>
      </div>
    </Panel>
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
  if (mediaType(upload) === "image") {
    return (
      <Panel title="截取区间" kicker="Timeline">
        <p className="text-sm text-white/58">单张图片模式，无需调整区间。</p>
      </Panel>
    );
  }
  return (
    <Panel title="截取区间" kicker="Timeline" action={<span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs text-white/55">{Math.max(1, endFrame - startFrame + 1)} 帧</span>}>
      <div className="space-y-3">
        <Field label="起始帧">
          <TextInput type="number" min={1} max={count} value={startFrame} onChange={(event) => setStartFrame(Number(event.target.value))} />
          <input type="range" min={1} max={count} value={startFrame} onChange={(event) => setStartFrame(Number(event.target.value))} className="w-full accent-sky-300" />
        </Field>
        <Field label="结束帧">
          <TextInput type="number" min={startFrame} max={count} value={endFrame} onChange={(event) => setEndFrame(Number(event.target.value))} />
          <input type="range" min={1} max={count} value={endFrame} onChange={(event) => setEndFrame(Number(event.target.value))} className="w-full accent-sky-300" />
        </Field>
      </div>
    </Panel>
  );
}

function OptionsPanel({
  options,
  setOptions,
}: {
  options: ProcessingOptions;
  setOptions: React.Dispatch<React.SetStateAction<ProcessingOptions>>;
}) {
  const patch = (value: Partial<ProcessingOptions>) => setOptions((current) => ({ ...current, ...value }));
  const isChroma = options.chromaEnabled && (options.matteMode === "chroma" || options.matteMode === "corridorkey");
  const isLuma = options.chromaEnabled && options.matteMode.includes("luma");
  const isCorridor = options.chromaEnabled && options.matteMode.includes("corridorkey");
  return (
    <Panel title="抠图算法与输出" kicker="Matte">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Field label="保留每 N 帧">
            <TextInput type="number" min={1} value={options.keepEvery} onChange={(event) => patch({ keepEvery: Math.max(1, Number(event.target.value || 1)) })} />
          </Field>
          <Field label="输出尺寸 %">
            <TextInput type="number" min={5} max={200} step={5} value={options.outputScale} onChange={(event) => patch({ outputScale: clamp(Number(event.target.value || 100), 5, 200) })} />
          </Field>
          <Field label="画布布局">
            <Select value={options.canvasMode} onChange={(event) => patch({ canvasMode: event.target.value as ProcessingOptions["canvasMode"] })}>
              <option value="auto">自动宽度，居中</option>
              <option value="square_bottom">方形画布，底部对齐</option>
              <option value="square_center">方形画布，居中</option>
            </Select>
          </Field>
          <Field label="画布边距">
            <TextInput type="number" min={0} value={options.reducePx} onChange={(event) => patch({ reducePx: Math.max(0, Number(event.target.value || 0)) })} />
          </Field>
        </div>
        <Check checked={options.chromaEnabled} onChange={(checked) => patch({ chromaEnabled: checked })} label="启用抠背景并输出透明 PNG" />
        <Field label="算法">
          <Select value={options.matteMode} disabled={!options.chromaEnabled} onChange={(event) => patch({ matteMode: event.target.value as ProcessingOptions["matteMode"] })}>
            {MATTE_MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </Field>
        {(isChroma || isCorridor) && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="取色方式">
              <Select value={options.keyMode} onChange={(event) => patch({ keyMode: event.target.value as "auto" | "manual" })}>
                <option value="auto">自动取背景色</option>
                <option value="manual">手动指定颜色</option>
              </Select>
            </Field>
            <Field label="背景色">
              <TextInput type="color" value={options.manualKeyHex} onChange={(event) => patch({ manualKeyHex: event.target.value })} />
            </Field>
            <Field label="阈值"><TextInput type="number" value={options.threshold} onChange={(event) => patch({ threshold: Number(event.target.value || 0) })} /></Field>
            <Field label="边缘柔化"><TextInput type="number" value={options.softness} onChange={(event) => patch({ softness: Number(event.target.value || 0) })} /></Field>
          </div>
        )}
        {options.chromaEnabled && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="去溢色"><TextInput type="number" min={0} max={1} step={0.05} value={options.despillStrength} onChange={(event) => patch({ despillStrength: Number(event.target.value || 0) })} /></Field>
            <Field label="Halo 收边"><TextInput type="number" min={0} value={options.haloPixels} onChange={(event) => patch({ haloPixels: Number(event.target.value || 0) })} /></Field>
          </div>
        )}
        {isCorridor && (
          <Field label="CorridorKey 幕布颜色">
            <Select value={options.corridorkeyScreen} onChange={(event) => patch({ corridorkeyScreen: event.target.value as "auto" | "green" | "blue" })}>
              <option value="auto">自动</option>
              <option value="green">绿色</option>
              <option value="blue">蓝色</option>
            </Select>
          </Field>
        )}
        {isLuma && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Luma 黑场"><TextInput type="number" value={options.lumaBlack} onChange={(event) => patch({ lumaBlack: Number(event.target.value || 0) })} /></Field>
            <Field label="Luma 白场"><TextInput type="number" value={options.lumaWhite} onChange={(event) => patch({ lumaWhite: Number(event.target.value || 0) })} /></Field>
            <Field label="Gamma"><TextInput type="number" step={0.05} value={options.lumaGamma} onChange={(event) => patch({ lumaGamma: Number(event.target.value || 1) })} /></Field>
            <Field label="强度"><TextInput type="number" step={0.05} value={options.lumaStrength} onChange={(event) => patch({ lumaStrength: Number(event.target.value || 1) })} /></Field>
          </div>
        )}
        <div className="grid grid-cols-1 gap-2">
          <Check checked={options.batchGreenToBlack} onChange={(checked) => patch({ batchGreenToBlack: checked })} label="批处理：绿色残边转黑" />
          <Check checked={options.batchGreenDesaturate} onChange={(checked) => patch({ batchGreenDesaturate: checked })} label="批处理：绿色残边饱和度归零" />
          <Check checked={options.batchSemiTransparentToBlack} onChange={(checked) => patch({ batchSemiTransparentToBlack: checked })} label="批处理：半透明像素转黑" />
          <Check checked={options.batchSemiTransparentToOpaque} onChange={(checked) => patch({ batchSemiTransparentToOpaque: checked })} label="批处理：半透明像素转不透明" />
        </div>
      </div>
    </Panel>
  );
}

function PreviewImage({ title, url, bgMode = "checkerboard", bgColor = "#F6FBF6" }: { title: string; url?: string; bgMode?: "checkerboard" | "color"; bgColor?: string }) {
  return (
    <article>
      <div className="mb-2 flex items-center justify-between text-xs text-white/55">
        <span>{title}</span>
        <Maximize2 className="h-3.5 w-3.5" />
      </div>
      <div
        className={`flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-white/10 ${bgMode === "checkerboard" ? "bg-[linear-gradient(45deg,rgba(255,255,255,.08)_25%,transparent_25%),linear-gradient(-45deg,rgba(255,255,255,.08)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,rgba(255,255,255,.08)_75%),linear-gradient(-45deg,transparent_75%,rgba(255,255,255,.08)_75%)] bg-[length:18px_18px] bg-[position:0_0,0_9px,9px_-9px,-9px_0px]" : ""}`}
        style={bgMode === "color" ? { backgroundColor: bgColor } : undefined}
      >
        {url ? <img src={spriteAssetUrl(url)} alt={title} className="h-full w-full object-contain" /> : <span className="text-xs text-white/28">等待预览</span>}
      </div>
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
    return <div className="flex min-h-64 items-center justify-center rounded-lg border border-white/10 bg-white/[0.035] text-sm text-white/32">处理后帧会显示在这里</div>;
  }
  const orderMap = new Map(order.map((index, idx) => [index, idx + 1]));
  return (
    <div className="grid max-h-[520px] grid-cols-[repeat(auto-fill,minmax(116px,1fr))] gap-2 overflow-y-auto rounded-lg border border-white/10 bg-black/15 p-2">
      {job.frames.map((frame) => {
        const checked = selected.has(frame.index);
        return (
          <label key={frame.index} className={`relative cursor-pointer overflow-hidden rounded-lg border bg-white/[0.04] p-2 transition ${checked ? "border-sky-300/45 ring-1 ring-sky-300/30" : "border-white/10 hover:border-white/20"}`}>
            <input type="checkbox" checked={checked} onChange={(event) => toggleFrame(frame.index, event.target.checked)} className="absolute left-2 top-2 z-10 h-4 w-4 accent-sky-300" />
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
        <strong className="text-sm text-emerald-100">导出结果</strong>
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
      <aside className="space-y-4 overflow-y-auto pr-1">
        <Panel title="动画帧缩小清理实验" kicker="Line Cleaner">
          <div className="space-y-3">
            <FileDrop onFiles={props.loadFiles} label="拖入透明 PNG / JPG / WebP / BMP 序列帧" />
            <div className="grid grid-cols-2 gap-2">
              <Meta label="帧数" value={String(props.frames.length)} />
              <Meta label="原始体积" value={formatBytes(props.sourceBytes)} />
              <Meta label="处理后体积" value={formatBytes(props.processedBytes)} />
              <Meta label="节省" value={saving === null ? "-" : `${saving}%`} />
            </div>
          </div>
        </Panel>
        <Panel title="处理参数" kicker="Controls">
          <div className="space-y-3">
            <Field label="播放 FPS"><TextInput type="number" min={1} max={60} value={props.fps} onChange={(event) => props.setFps(clamp(Number(event.target.value || 12), 1, 60))} /></Field>
            <Field label="处理路线">
              <Select value={props.method} onChange={(event) => props.setMethod(event.target.value as "classic" | "realesrgan_anime")}>
                <option value="classic">普通缩小 / Lanczos</option>
                <option value="realesrgan_anime">Real-ESRGAN anime 先整线再缩小</option>
              </Select>
            </Field>
            <Field label="输出倍数"><TextInput type="number" min={0.05} max={2} step={0.05} value={props.scale} onChange={(event) => props.setScale(clamp(Number(event.target.value || 0.5), 0.05, 2))} /></Field>
            <Field label={`透明清理 ${props.alphaCutoff}`}><input type="range" min={0} max={80} value={props.alphaCutoff} onChange={(event) => props.setAlphaCutoff(Number(event.target.value))} className="accent-sky-300" /></Field>
            <Field label={`缩小后锐化 ${props.sharpen}%`}><input type="range" min={0} max={220} step={5} value={props.sharpen} onChange={(event) => props.setSharpen(Number(event.target.value))} className="accent-sky-300" /></Field>
            <Field label={`最大颜色数 ${props.colorCount}`}><input type="range" min={16} max={256} step={8} value={props.colorCount} onChange={(event) => props.setColorCount(Number(event.target.value))} className="accent-sky-300" /></Field>
            <div className="flex flex-wrap gap-2">
              <Button disabled={!props.frames.length || props.busy === "line-process"} onClick={props.processFrames} variant="primary">生成对比</Button>
              <Button disabled={!props.processedCount} onClick={() => props.current?.processedUrl && downloadUrl(props.current.processedUrl, "line-cleaned-frame.png")}>下载当前帧</Button>
              <Button disabled={!props.processedCount} onClick={props.downloadTar}>下载 TAR</Button>
            </div>
          </div>
        </Panel>
      </aside>
      <section className="min-h-0 overflow-y-auto pr-1">
        <Panel
          title="同步动画对比"
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
              <figcaption className="mb-2 text-xs text-white/52">原动画</figcaption>
              <canvas ref={props.sourceCanvasRef} className="aspect-square w-full rounded-lg border border-white/10 bg-black/35" />
            </figure>
            <figure>
              <figcaption className="mb-2 text-xs text-white/52">处理后动画</figcaption>
              <canvas ref={props.processedCanvasRef} className="aspect-square w-full rounded-lg border border-white/10 bg-black/35" />
            </figure>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto rounded-lg border border-white/10 bg-black/15 p-2">
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

function FileButton({ onFiles, label, icon, multiple = false }: { onFiles: (files: File[]) => void; label: string; icon?: React.ReactNode; multiple?: boolean }) {
  return (
    <label className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-3xl border border-white/10 bg-white/[0.07] px-3 text-xs font-medium text-white/80 shadow-lg shadow-black/20 backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white/[0.12]">
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
