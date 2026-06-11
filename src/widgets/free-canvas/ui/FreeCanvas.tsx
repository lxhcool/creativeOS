"use client";

import {
  Bot,
  Download,
  FileInput,
  Image as ImageIcon,
  Music,
  Redo2,
  Settings,
  Trash2,
  Type,
  Undo2,
  Video,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import {
  Circle,
  Group,
  Image as KonvaImage,
  Layer,
  Path,
  Rect,
  Stage,
  Text,
} from "react-konva";
import {
  createCanvasEdge,
  createCircleElement,
  createImageElement,
  createMediaElement,
  createTextElement,
  isCanvasEdge,
  isCanvasElement,
} from "@/entities/canvas/lib/factory";
import type {
  CanvasEdge,
  CanvasElement,
  CanvasElementKind,
  CanvasImageElement,
  CanvasMediaElement,
  CanvasProjectExport,
  CanvasShapeElement,
  CanvasTextElement,
  CanvasViewport,
} from "@/entities/canvas/model/types";

const MIN_SCALE = 0.18;
const MAX_SCALE = 4;
const DOT_GRID_SIZE = 16;
const HISTORY_LIMIT = 20;
const NODE_PADDING = 8;
const NODE_RADIUS = 8;
const DEFAULT_NODE_WIDTH = 480;
const DEFAULT_NODE_HEIGHT = 300;
const PORT_OFFSET = 10;
const PORT_RADIUS = 5.5;
const SCALE_OPTIONS = [0.5, 0.75, 1, 1.2];
const VIDEO_CONTROLS_HIDE_DELAY = 3000;

type AiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type CanvasSnapshot = {
  elements: CanvasElement[];
  edges: CanvasEdge[];
};

type DraftEdge = {
  sourceId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
};

type CanvasNodeCommonProps = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  draggable: boolean;
  onClick: () => void;
  onTap: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onDragStart: () => void;
  onDragMove: (event: KonvaEventObject<DragEvent>) => void;
  onDragEnd: (event: KonvaEventObject<DragEvent>) => void;
};

type CanvasNodeRendererProps<TElement extends CanvasElement = CanvasElement> = {
  element: TElement;
  selected: boolean;
  dragging: boolean;
  commonProps: CanvasNodeCommonProps;
  onUploadImage: (element: CanvasImageElement) => void;
  onUploadVideo: (element: CanvasMediaElement) => void;
  onUploadAudio: (element: CanvasMediaElement) => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getTextNodeSize(text: string, fontSize: number): {
  width: number;
  height: number;
} {
  const lines = text.split(/\r?\n/);
  const charWidth = fontSize * 0.72;
  const maxContentWidth = 560;
  const minWidth = DEFAULT_NODE_WIDTH;
  const contentPadding = NODE_PADDING * 2;
  const rawWidth =
    Math.max(...lines.map((line) => Math.max(1, Array.from(line).length))) *
    charWidth;
  const width = clamp(rawWidth + contentPadding, minWidth, maxContentWidth);
  const charsPerLine = Math.max(
    1,
    Math.floor((width - NODE_PADDING * 2) / charWidth),
  );
  const visualLineCount = lines.reduce(
    (count, line) =>
      count + Math.max(1, Math.ceil(Array.from(line).length / charsPerLine)),
    0,
  );

  return {
    width,
    height: Math.max(
      DEFAULT_NODE_HEIGHT,
      fontSize * 1.45 + NODE_PADDING * 2,
      visualLineCount * fontSize * 1.32 + NODE_PADDING * 2,
    ),
  };
}

function getMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const darkPanel =
  "border border-white/10 bg-white/[0.07] text-white shadow-2xl shadow-black/[0.32] backdrop-blur-xl";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

function readImageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      });
    };
    image.onerror = () => reject(new Error("图片尺寸读取失败"));
    image.src = src;
  });
}

function readVideoSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const fallbackSize = {
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
    };
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      resolve({
        width: video.videoWidth || DEFAULT_NODE_WIDTH,
        height: video.videoHeight || DEFAULT_NODE_HEIGHT,
      });
      video.src = "";
      video.load();
    };
    video.onerror = () => {
      resolve(fallbackSize);
      video.src = "";
      video.load();
    };
    video.src = src;
  });
}

function getMediaNodeSize(intrinsicWidth: number, intrinsicHeight: number): {
  width: number;
  height: number;
} {
  const safeWidth = Math.max(1, intrinsicWidth);
  const safeHeight = Math.max(1, intrinsicHeight);
  const maxContentWidth = 720;
  const maxContentHeight = 480;
  const minContentWidth = 180;
  const minContentHeight = 120;
  const fitScale = Math.min(
    maxContentWidth / safeWidth,
    maxContentHeight / safeHeight,
  );
  const minScale = Math.max(
    minContentWidth / safeWidth,
    minContentHeight / safeHeight,
  );
  const scale = Math.max(Math.min(fitScale, 1), Math.min(minScale, fitScale));

  return {
    width: safeWidth * scale + NODE_PADDING * 2,
    height: safeHeight * scale + NODE_PADDING * 2,
  };
}

const getImageNodeSize = getMediaNodeSize;
const getVideoNodeSize = getMediaNodeSize;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  );
}

function useViewportSize() {
  const [size, setSize] = useState({ width: 1280, height: 720 });

  useEffect(() => {
    const update = () => {
      setSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return size;
}

function useHtmlImage(src?: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }

    const nextImage = new window.Image();
    nextImage.onload = () => setImage(nextImage);
    nextImage.src = src;
  }, [src]);

  return image;
}

function useHtmlVideo(src?: string) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [coverReady, setCoverReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    if (!src) {
      setVideo(null);
      setCoverReady(false);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    const nextVideo = document.createElement("video");
    videoRef.current = nextVideo;
    nextVideo.src = src;
    nextVideo.muted = true;
    nextVideo.loop = true;
    nextVideo.playsInline = true;
    nextVideo.preload = "metadata";
    const markCoverReady = () => {
      setCoverReady(true);
      setVideo(nextVideo);
    };
    nextVideo.onloadeddata = () => {
      markCoverReady();
    };
    const syncTime = () => setCurrentTime(nextVideo.currentTime || 0);
    const syncDuration = () =>
      setDuration(Number.isFinite(nextVideo.duration) ? nextVideo.duration : 0);
    const prepareCover = () => {
      syncDuration();
      try {
        nextVideo.currentTime = Math.min(0.05, Math.max(0, nextVideo.duration || 0));
      } catch {
        markCoverReady();
      }
    };
    nextVideo.addEventListener("timeupdate", syncTime);
    nextVideo.addEventListener("loadedmetadata", syncDuration);
    nextVideo.addEventListener("loadedmetadata", prepareCover);
    nextVideo.addEventListener("durationchange", syncDuration);
    nextVideo.addEventListener("seeked", markCoverReady);
    nextVideo.onplay = () => setIsPlaying(true);
    nextVideo.onpause = () => setIsPlaying(false);

    return () => {
      nextVideo.pause();
      nextVideo.removeEventListener("timeupdate", syncTime);
      nextVideo.removeEventListener("loadedmetadata", syncDuration);
      nextVideo.removeEventListener("loadedmetadata", prepareCover);
      nextVideo.removeEventListener("durationchange", syncDuration);
      nextVideo.removeEventListener("seeked", markCoverReady);
      nextVideo.src = "";
      nextVideo.load();
      videoRef.current = null;
      setCoverReady(false);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    };
  }, [src]);

  const toggle = useCallback(() => {
    const currentVideo = videoRef.current;
    if (!currentVideo) return;

    if (currentVideo.paused) {
      void currentVideo.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      currentVideo.pause();
      setIsPlaying(false);
    }
  }, []);

  const seekToRatio = useCallback(
    (ratio: number) => {
      const currentVideo = videoRef.current;
      if (!currentVideo || duration <= 0) return;
      currentVideo.currentTime = clamp(ratio, 0, 1) * duration;
      setCurrentTime(currentVideo.currentTime);
    },
    [duration],
  );

  const toggleMute = useCallback(() => {
    const currentVideo = videoRef.current;
    if (!currentVideo) return;
    currentVideo.muted = !currentVideo.muted;
    setMuted(currentVideo.muted);
  }, []);

  return {
    coverReady,
    currentTime,
    duration,
    isPlaying,
    muted,
    progress: duration > 0 ? currentTime / duration : 0,
    seekToRatio,
    toggle,
    toggleMute,
    video,
  };
}

function useHtmlAudio(src?: string) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (!src) {
      audioRef.current?.pause();
      audioRef.current = null;
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setMuted(false);
      return;
    }

    const audio = new Audio(src);
    audio.preload = "metadata";
    audioRef.current = audio;

    const syncTime = () => setCurrentTime(audio.currentTime || 0);
    const syncDuration = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", syncTime);
    audio.addEventListener("loadedmetadata", syncDuration);
    audio.addEventListener("durationchange", syncDuration);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", syncTime);
      audio.removeEventListener("loadedmetadata", syncDuration);
      audio.removeEventListener("durationchange", syncDuration);
      audio.removeEventListener("ended", handleEnded);
      audioRef.current = null;
    };
  }, [src]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      void audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, []);

  const seekToRatio = useCallback(
    (ratio: number) => {
      const audio = audioRef.current;
      if (!audio || duration <= 0) return;
      audio.currentTime = clamp(ratio, 0, 1) * duration;
      setCurrentTime(audio.currentTime);
    },
    [duration],
  );

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setMuted(audio.muted);
  }, []);

  return {
    currentTime,
    duration,
    isPlaying,
    muted,
    progress: duration > 0 ? currentTime / duration : 0,
    seekToRatio,
    toggle,
    toggleMute,
  };
}

function getOutputPortPosition(element: CanvasElement): { x: number; y: number } {
  return {
    x: element.x + element.width + PORT_OFFSET,
    y: element.y + element.height / 2,
  };
}

function getInputPortPosition(element: CanvasElement): { x: number; y: number } {
  return {
    x: element.x - PORT_OFFSET,
    y: element.y + element.height / 2,
  };
}

function formatMediaTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function isPointInsideElement(
  point: { x: number; y: number },
  element: CanvasElement,
): boolean {
  return (
    point.x >= element.x &&
    point.x <= element.x + element.width &&
    point.y >= element.y &&
    point.y <= element.y + element.height
  );
}

function getConnectorPathData(
  from: { x: number; y: number },
  to: { x: number; y: number },
): string {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const sameDirection = deltaX >= 0;
  const bend = sameDirection
    ? clamp(Math.abs(deltaX) * 0.45, 96, 260)
    : clamp(Math.abs(deltaX) * 0.32 + Math.abs(deltaY) * 0.18, 120, 300);
  const sourceControlX = from.x + bend;
  const targetControlX = sameDirection ? to.x - bend : to.x - bend;

  return [
    `M ${from.x} ${from.y}`,
    `C ${sourceControlX} ${from.y}`,
    `${targetControlX} ${to.y}`,
    `${to.x} ${to.y}`,
  ].join(" ");
}

export function FreeCanvas() {
  const size = useViewportSize();
  const stageRef = useRef<Konva.Stage>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const pendingImageTargetRef = useRef<string | null>(null);
  const pendingVideoTargetRef = useRef<string | null>(null);
  const pendingAudioTargetRef = useRef<string | null>(null);
  const dragSnapshotRef = useRef<CanvasElement[] | null>(null);
  const hoverClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);
  const [past, setPast] = useState<CanvasSnapshot[]>([]);
  const [future, setFuture] = useState<CanvasSnapshot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [draftEdge, setDraftEdge] = useState<DraftEdge | null>(null);
  const [draggingElementId, setDraggingElementId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<CanvasViewport>({
    x: 0,
    y: 0,
    scale: 1,
  });
  const [panStart, setPanStart] = useState<{
    pointerX: number;
    pointerY: number;
    viewport: CanvasViewport;
  } | null>(null);
  const [apiConfigOpen, setApiConfigOpen] = useState(false);
  const [apiEndpoint, setApiEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([
    {
      id: getMessageId(),
      role: "assistant",
      content: "可以让我添加圆形、删除图片、整理画布，或把蓝色文本改成红色。",
    },
  ]);

  useEffect(() => {
    return () => {
      if (hoverClearTimerRef.current) {
        clearTimeout(hoverClearTimerRef.current);
      }
    };
  }, []);

  const setNodeHover = useCallback((id: string) => {
    if (hoverClearTimerRef.current) {
      clearTimeout(hoverClearTimerRef.current);
      hoverClearTimerRef.current = null;
    }
    setHoveredId(id);
  }, []);

  const clearNodeHover = useCallback((id: string) => {
    if (hoverClearTimerRef.current) {
      clearTimeout(hoverClearTimerRef.current);
    }

    hoverClearTimerRef.current = setTimeout(() => {
      setHoveredId((current) => (current === id ? null : current));
      hoverClearTimerRef.current = null;
    }, 120);
  }, []);

  const worldCenter = useCallback(() => {
    return {
      x: (size.width / 2 - viewport.x) / viewport.scale,
      y: (size.height / 2 - viewport.y) / viewport.scale,
    };
  }, [size.height, size.width, viewport.scale, viewport.x, viewport.y]);

  const commitCanvas = useCallback(
    (next: { elements?: CanvasElement[]; edges?: CanvasEdge[] }) => {
      setPast((current) => [
        ...current.slice(-(HISTORY_LIMIT - 1)),
        { elements, edges },
      ]);
      setElements(next.elements ?? elements);
      setEdges(next.edges ?? edges);
      setFuture([]);
    },
    [edges, elements],
  );

  const commitElements = useCallback(
    (nextElements: CanvasElement[]) => {
      const nextElementIds = new Set(nextElements.map((element) => element.id));
      commitCanvas({
        elements: nextElements,
        edges: edges.filter(
          (edge) =>
            nextElementIds.has(edge.sourceId) && nextElementIds.has(edge.targetId),
        ),
      });
    },
    [commitCanvas, edges],
  );

  const updateElement = useCallback(
    (id: string, updates: Partial<CanvasElement>) => {
      commitElements(
        elements.map((element) =>
          element.id === id ? ({ ...element, ...updates } as CanvasElement) : element,
        ),
      );
    },
    [commitElements, elements],
  );

  const previewUpdateElement = useCallback(
    (id: string, updates: Partial<CanvasElement>) => {
      setElements((current) =>
        current.map((element) =>
          element.id === id ? ({ ...element, ...updates } as CanvasElement) : element,
        ),
      );
    },
    [],
  );

  const beginElementDrag = useCallback((id: string) => {
    dragSnapshotRef.current = elements;
    setDraggingElementId(id);
  }, [elements]);

  const finishElementDrag = useCallback(
    (id: string, updates: Partial<CanvasElement>) => {
      const snapshot = dragSnapshotRef.current;
      dragSnapshotRef.current = null;
      setDraggingElementId(null);

      if (!snapshot) {
        updateElement(id, updates);
        return;
      }

      const nextElements = snapshot.map((element) =>
        element.id === id ? ({ ...element, ...updates } as CanvasElement) : element,
      );

      setPast((current) => [
        ...current.slice(-(HISTORY_LIMIT - 1)),
        { elements: snapshot, edges },
      ]);
      setElements(nextElements);
      setFuture([]);
    },
    [edges, updateElement],
  );

  const undo = useCallback(() => {
    setPast((currentPast) => {
      const previous = currentPast[currentPast.length - 1];
      if (!previous) return currentPast;

      setFuture((currentFuture) => [{ elements, edges }, ...currentFuture]);
      setElements(previous.elements);
      setEdges(previous.edges);
      setSelectedId(null);
      setDraftEdge(null);
      return currentPast.slice(0, -1);
    });
  }, [edges, elements]);

  const redo = useCallback(() => {
    setFuture((currentFuture) => {
      const next = currentFuture[0];
      if (!next) return currentFuture;

      setPast((currentPast) =>
        [...currentPast, { elements, edges }].slice(-HISTORY_LIMIT),
      );
      setElements(next.elements);
      setEdges(next.edges);
      setSelectedId(null);
      setDraftEdge(null);
      return currentFuture.slice(1);
    });
  }, [edges, elements]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }

      if ((event.key === "Backspace" || event.key === "Delete") && selectedId) {
        event.preventDefault();
        commitElements(elements.filter((element) => element.id !== selectedId));
        setSelectedId(null);
        setDraftEdge(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [commitElements, elements, redo, selectedId, undo]);

  const addElement = useCallback(
    (element: CanvasElement) => {
      commitElements([...elements, element]);
      setSelectedId(element.id);
    },
    [commitElements, elements],
  );

  const addText = useCallback(() => {
    const center = worldCenter();
    const element = createTextElement(center);
    const size = getTextNodeSize(element.text, element.fontSize);
    addElement({
      ...element,
      x: center.x - size.width / 2,
      y: center.y - size.height / 2,
      width: size.width,
      height: size.height,
    });
  }, [addElement, worldCenter]);

  const addCircle = useCallback(() => {
    addElement(createCircleElement(worldCenter()));
  }, [addElement, worldCenter]);

  const addImagePlaceholder = useCallback(() => {
    addElement(
      createImageElement({
        position: worldCenter(),
        label: "图像素材",
      }),
    );
  }, [addElement, worldCenter]);

  const addVideoPlaceholder = useCallback(() => {
    addElement(createMediaElement({ kind: "video", position: worldCenter() }));
  }, [addElement, worldCenter]);

  const addAudioPlaceholder = useCallback(() => {
    addElement(createMediaElement({ kind: "audio", position: worldCenter() }));
  }, [addElement, worldCenter]);

  const handleStartConnection = useCallback(
    (element: CanvasElement, event: KonvaEventObject<MouseEvent | TouchEvent>) => {
      event.cancelBubble = true;
      const pointer = stageRef.current?.getPointerPosition();
      const from = getOutputPortPosition(element);
      const to = pointer
        ? {
            x: (pointer.x - viewport.x) / viewport.scale,
            y: (pointer.y - viewport.y) / viewport.scale,
          }
        : from;

      setSelectedId(null);
      setDraftEdge({
        sourceId: element.id,
        from,
        to,
      });
    },
    [viewport.scale, viewport.x, viewport.y],
  );

  const handleWheel = useCallback(
    (event: KonvaEventObject<WheelEvent>) => {
      event.evt.preventDefault();
      const stage = stageRef.current;
      const pointer = stage?.getPointerPosition();
      if (!pointer) return;

      const scaleBy = 1.08;
      const oldScale = viewport.scale;
      const direction = event.evt.deltaY > 0 ? -1 : 1;
      const nextScale = clamp(
        direction > 0 ? oldScale * scaleBy : oldScale / scaleBy,
        MIN_SCALE,
        MAX_SCALE,
      );
      const mousePointTo = {
        x: (pointer.x - viewport.x) / oldScale,
        y: (pointer.y - viewport.y) / oldScale,
      };

      setViewport({
        x: pointer.x - mousePointTo.x * nextScale,
        y: pointer.y - mousePointTo.y * nextScale,
        scale: nextScale,
      });
    },
    [viewport],
  );

  const setCanvasScale = useCallback(
    (nextScale: number) => {
      const clampedScale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      const anchor = {
        x: size.width / 2,
        y: size.height / 2,
      };
      const worldPoint = {
        x: (anchor.x - viewport.x) / viewport.scale,
        y: (anchor.y - viewport.y) / viewport.scale,
      };

      setViewport({
        x: anchor.x - worldPoint.x * clampedScale,
        y: anchor.y - worldPoint.y * clampedScale,
        scale: clampedScale,
      });
    },
    [size.height, size.width, viewport],
  );

  const isPanTarget = (target: Konva.Node): boolean => {
    return target === target.getStage() || target.name() === "grid";
  };

  const handleStagePointerDown = useCallback(
    (event: KonvaEventObject<MouseEvent>) => {
      if (!isPanTarget(event.target)) return;
      const pointer = stageRef.current?.getPointerPosition();
      if (!pointer) return;

      setSelectedId(null);
      setDraftEdge(null);
      setPanStart({
        pointerX: pointer.x,
        pointerY: pointer.y,
        viewport,
      });
    },
    [viewport],
  );

  const handleStagePointerMove = useCallback(() => {
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;

    if (draftEdge) {
      setDraftEdge({
        ...draftEdge,
        to: {
          x: (pointer.x - viewport.x) / viewport.scale,
          y: (pointer.y - viewport.y) / viewport.scale,
        },
      });
      return;
    }

    if (!panStart) return;

    setViewport({
      ...panStart.viewport,
      x: panStart.viewport.x + pointer.x - panStart.pointerX,
      y: panStart.viewport.y + pointer.y - panStart.pointerY,
    });
  }, [draftEdge, panStart, viewport.scale, viewport.x, viewport.y]);

  const handleStagePointerUp = useCallback(() => {
    if (draftEdge) {
      const target = elements.find(
        (element) =>
          element.id !== draftEdge.sourceId &&
          isPointInsideElement(draftEdge.to, element),
      );

      if (target) {
        const exists = edges.some(
          (edge) =>
            edge.sourceId === draftEdge.sourceId && edge.targetId === target.id,
        );

        if (!exists) {
          commitCanvas({
            edges: [
              ...edges,
              createCanvasEdge({
                sourceId: draftEdge.sourceId,
                targetId: target.id,
              }),
            ],
          });
        }
      }

      setDraftEdge(null);
      return;
    }

    setPanStart(null);
  }, [commitCanvas, draftEdge, edges, elements]);

  const requestImageUpload = useCallback((element: CanvasImageElement) => {
    pendingImageTargetRef.current = element.id;
    imageInputRef.current?.click();
  }, []);

  const requestVideoUpload = useCallback((element: CanvasMediaElement) => {
    pendingVideoTargetRef.current = element.id;
    videoInputRef.current?.click();
  }, []);

  const requestAudioUpload = useCallback((element: CanvasMediaElement) => {
    pendingAudioTargetRef.current = element.id;
    audioInputRef.current?.click();
  }, []);

  const handleImageFile = useCallback(
    async (file: File | undefined, targetId?: string | null) => {
      if (!file) return;
      const src = await readFileAsDataUrl(file);
      const imageSize = await readImageSize(src);
      const nodeSize = getImageNodeSize(imageSize.width, imageSize.height);

      if (targetId) {
        const target = elements.find(
          (element) => element.id === targetId && element.kind === "image",
        );
        if (!target) return;

        updateElement(target.id, {
          src,
          label: file.name,
          x: target.x + target.width / 2 - nodeSize.width / 2,
          y: target.y + target.height / 2 - nodeSize.height / 2,
          width: nodeSize.width,
          height: nodeSize.height,
        } as Partial<CanvasElement>);
        return;
      }

      const center = worldCenter();
      addElement(
        {
          ...createImageElement({
            position: center,
            src,
            label: file.name,
          }),
          x: center.x - nodeSize.width / 2,
          y: center.y - nodeSize.height / 2,
          width: nodeSize.width,
          height: nodeSize.height,
        },
      );
    },
    [addElement, elements, updateElement, worldCenter],
  );

  const handleVideoFile = useCallback(
    async (file: File | undefined, targetId?: string | null) => {
      if (!file) return;
      const src = await readFileAsDataUrl(file);
      const videoSize = await readVideoSize(src);
      const nodeSize = getVideoNodeSize(videoSize.width, videoSize.height);

      if (targetId) {
        const target = elements.find(
          (element) => element.id === targetId && element.kind === "video",
        );
        if (!target) return;

        updateElement(target.id, {
          src,
          label: file.name,
          x: target.x + target.width / 2 - nodeSize.width / 2,
          y: target.y + target.height / 2 - nodeSize.height / 2,
          width: nodeSize.width,
          height: nodeSize.height,
        } as Partial<CanvasElement>);
        return;
      }

      const center = worldCenter();
      addElement(
        {
          ...createMediaElement({
            kind: "video",
            position: center,
            src,
            label: file.name,
          }),
          x: center.x - nodeSize.width / 2,
          y: center.y - nodeSize.height / 2,
          width: nodeSize.width,
          height: nodeSize.height,
        },
      );
    },
    [addElement, elements, updateElement, worldCenter],
  );

  const handleAudioFile = useCallback(
    async (file: File | undefined, targetId?: string | null) => {
      if (!file) return;
      const src = await readFileAsDataUrl(file);

      if (targetId) {
        const target = elements.find(
          (element) => element.id === targetId && element.kind === "audio",
        );
        if (!target) return;

        updateElement(target.id, {
          src,
          label: file.name,
        } as Partial<CanvasElement>);
        return;
      }

      addElement(
        createMediaElement({
          kind: "audio",
          position: worldCenter(),
          src,
          label: file.name,
        }),
      );
    },
    [addElement, elements, updateElement, worldCenter],
  );

  const handleImportFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;

      if (file.type.startsWith("image/")) {
        await handleImageFile(file);
        return;
      }

      if (file.type.startsWith("video/")) {
        await handleVideoFile(file);
        return;
      }

      if (file.type.startsWith("audio/")) {
        await handleAudioFile(file);
        return;
      }

      if (!file.name.toLowerCase().endsWith(".json")) return;

      const text = await file.text();
      const data = JSON.parse(text) as Partial<CanvasProjectExport>;
      const importedElements = Array.isArray(data.elements)
        ? data.elements.filter(isCanvasElement)
        : [];
      const importedElementIds = new Set(
        importedElements.map((element) => element.id),
      );
      const importedEdges = Array.isArray(data.edges)
        ? data.edges
            .filter(isCanvasEdge)
            .filter(
              (edge) =>
                importedElementIds.has(edge.sourceId) &&
                importedElementIds.has(edge.targetId),
            )
        : [];

      commitCanvas({ elements: importedElements, edges: importedEdges });
      setSelectedId(null);
      setDraftEdge(null);
      if (data.viewport) {
        setViewport({
          x: typeof data.viewport.x === "number" ? data.viewport.x : 0,
          y: typeof data.viewport.y === "number" ? data.viewport.y : 0,
          scale:
            typeof data.viewport.scale === "number"
              ? clamp(data.viewport.scale, MIN_SCALE, MAX_SCALE)
              : 1,
        });
      }
    },
    [commitCanvas, handleAudioFile, handleImageFile, handleVideoFile],
  );

  const clearCanvas = useCallback(() => {
    if (elements.length === 0) return;
    if (!window.confirm("确认清空画布上的所有元素？")) return;

    commitCanvas({ elements: [], edges: [] });
    setSelectedId(null);
    setDraftEdge(null);
  }, [commitCanvas, elements.length]);

  const exportJson = useCallback(() => {
    const payload: CanvasProjectExport = {
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      viewport,
      elements,
      edges,
    };

    downloadFile(
      "creativeos-canvas.json",
      JSON.stringify(payload, null, 2),
      "application/json",
    );
  }, [edges, elements, viewport]);

  const exportPng = useCallback(() => {
    const dataUrl = stageRef.current?.toDataURL({ pixelRatio: 2 });
    if (!dataUrl) return;

    const link = document.createElement("a");
    link.download = "creativeos-canvas.png";
    link.href = dataUrl;
    link.click();
  }, []);

  const arrangeElements = useCallback(() => {
    if (elements.length === 0) return;
    const center = worldCenter();
    const columns = Math.max(1, Math.ceil(Math.sqrt(elements.length)));
    const gapX = 340;
    const gapY = 220;
    const startX = center.x - ((columns - 1) * gapX) / 2;
    const rows = Math.ceil(elements.length / columns);
    const startY = center.y - ((rows - 1) * gapY) / 2;

    commitElements(
      elements.map((element, index) => ({
        ...element,
        x: startX + (index % columns) * gapX - element.width / 2,
        y: startY + Math.floor(index / columns) * gapY - element.height / 2,
        rotation: 0,
      })),
    );
  }, [commitElements, elements, worldCenter]);

  const appendAiMessage = useCallback((role: AiMessage["role"], content: string) => {
    setAiMessages((current) => [
      ...current,
      {
        id: getMessageId(),
        role,
        content,
      },
    ]);
  }, []);

  const runAiCommand = useCallback(
    (command: string) => {
      const normalized = command.toLowerCase();

      if (
        (normalized.includes("圆") || normalized.includes("circle")) &&
        (normalized.includes("添加") || normalized.includes("生成") || normalized.includes("add"))
      ) {
        addCircle();
        appendAiMessage("assistant", "已在画布中心添加一个圆形。");
        return;
      }

      if (
        (normalized.includes("删") || normalized.includes("delete")) &&
        (normalized.includes("图片") || normalized.includes("image"))
      ) {
        commitElements(elements.filter((element) => element.kind !== "image"));
        appendAiMessage("assistant", "已删除画布中的全部图片元素。");
        return;
      }

      if (
        normalized.includes("排列") ||
        normalized.includes("整理") ||
        normalized.includes("arrange")
      ) {
        arrangeElements();
        appendAiMessage("assistant", "已按网格自动整理当前画布元素。");
        return;
      }

      if (
        (normalized.includes("蓝") || normalized.includes("blue")) &&
        (normalized.includes("红") || normalized.includes("red")) &&
        (normalized.includes("文本") || normalized.includes("text"))
      ) {
        commitElements(
          elements.map((element) =>
            element.kind === "text" &&
            ["#2563eb", "#1d4ed8", "blue"].includes(element.fill.toLowerCase())
              ? { ...element, fill: "#ef4444" }
              : element,
          ),
        );
        appendAiMessage("assistant", "已把蓝色文本改成红色。");
        return;
      }

      if (
        (normalized.includes("生成") || normalized.includes("create")) &&
        (normalized.includes("图") || normalized.includes("image"))
      ) {
        addElement(
          createImageElement({
            position: worldCenter(),
            label: apiEndpoint ? "AI 图像素材" : "AI 图像素材（未配置 API）",
          }),
        );
        appendAiMessage(
          "assistant",
          apiEndpoint
            ? "已创建 AI 图像素材。后续可接入配置的绘图 API。"
            : "已创建 AI 图像素材；请在 API 配置里填写绘图接口后再接真实生成。",
        );
        return;
      }

      appendAiMessage("assistant", "当前支持：添加圆形、删除图片、自动排列、蓝色文本改红色、生成图像素材。");
    },
    [
      addCircle,
      addElement,
      apiEndpoint,
      appendAiMessage,
      arrangeElements,
      commitElements,
      elements,
      worldCenter,
    ],
  );

  const submitAiCommand = useCallback(async () => {
    const command = chatInput.trim();
    if (!command || aiLoading) return;

    setChatInput("");
    appendAiMessage("user", command);
    setAiLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 260));
    runAiCommand(command);
    setAiLoading(false);
  }, [aiLoading, appendAiMessage, chatInput, runAiCommand]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#02070b] text-white">
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(148,163,184,0.18) 0 0.85px, transparent 0.95px)",
          backgroundPosition: `${viewport.x}px ${viewport.y}px`,
          backgroundSize: `${DOT_GRID_SIZE * viewport.scale}px ${DOT_GRID_SIZE * viewport.scale}px`,
        }}
      />
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        onWheel={handleWheel}
        onMouseDown={handleStagePointerDown}
        onMouseMove={handleStagePointerMove}
        onMouseUp={handleStagePointerUp}
        onMouseLeave={handleStagePointerUp}
        className={`relative z-10 ${panStart ? "cursor-grabbing" : "cursor-default"}`}
      >
        <Layer x={viewport.x} y={viewport.y} scaleX={viewport.scale} scaleY={viewport.scale}>
          <Rect
            name="grid"
            x={-100000}
            y={-100000}
            width={200000}
            height={200000}
            fill="rgba(255,255,255,0.001)"
          />

          {edges.map((edge) => (
            <CanvasEdgeNode key={edge.id} edge={edge} elements={elements} />
          ))}

          {draftEdge && <DraftEdgeNode edge={draftEdge} />}

          {elements.map((element) => (
            <CanvasElementNode
              key={element.id}
              element={element}
              selected={element.id === selectedId || element.id === draftEdge?.sourceId}
              onSelect={() => setSelectedId(element.id)}
              onHover={() => setNodeHover(element.id)}
              onLeave={() => clearNodeHover(element.id)}
              dragging={element.id === draggingElementId}
              onDragStart={() => beginElementDrag(element.id)}
              onPreviewChange={(updates) => previewUpdateElement(element.id, updates)}
              onChange={(updates) => finishElementDrag(element.id, updates)}
              onUploadImage={requestImageUpload}
              onUploadVideo={requestVideoUpload}
              onUploadAudio={requestAudioUpload}
            />
          ))}

          {elements.map((element) => {
            const visible =
              element.id === hoveredId ||
              element.id === selectedId ||
              element.id === draftEdge?.sourceId;

            if (!visible) return null;

            return (
              <CanvasConnectionHandle
                key={`handle_${element.id}`}
                element={element}
                onHover={() => setNodeHover(element.id)}
                onLeave={() => clearNodeHover(element.id)}
                onStartConnection={(event) => handleStartConnection(element, event)}
              />
            );
          })}
        </Layer>
      </Stage>

      <aside
        className="fixed z-20 box-border flex w-[68px] flex-col items-center gap-1.5 overflow-hidden border border-white/10 bg-black/[0.28] p-[6px] text-white shadow-2xl shadow-black/[0.28] backdrop-blur-xl"
        style={{ left: 16, top: 48, borderRadius: 12 }}
      >
        <ToolButton icon={<Type className="h-4 w-4" />} label="文本" onClick={addText} />
        <ToolButton
          icon={<ImageIcon className="h-4 w-4" />}
          label="图像"
          onClick={addImagePlaceholder}
        />
        <ToolButton icon={<Video className="h-4 w-4" />} label="视频" onClick={addVideoPlaceholder} />
        <ToolButton icon={<Music className="h-4 w-4" />} label="音乐" onClick={addAudioPlaceholder} />
        <ToolButton
          icon={<FileInput className="h-4 w-4" />}
          label="导入"
          onClick={() => importInputRef.current?.click()}
        />
        <ToolButton
          icon={<Settings className="h-4 w-4" />}
          label="API"
          onClick={() => setApiConfigOpen(true)}
        />
      </aside>

      <div className={`fixed right-5 top-5 z-20 flex items-center gap-2 rounded-2xl p-2 ${darkPanel}`}>
        <IconAction title="撤销" disabled={past.length === 0} onClick={undo}>
          <Undo2 className="h-4 w-4" />
        </IconAction>
        <IconAction title="重做" disabled={future.length === 0} onClick={redo}>
          <Redo2 className="h-4 w-4" />
        </IconAction>
        <IconAction title="清空画布" onClick={clearCanvas}>
          <Trash2 className="h-4 w-4" />
        </IconAction>
        <IconAction title="导出 JSON" onClick={exportJson}>
          <Download className="h-4 w-4" />
        </IconAction>
        <button
          type="button"
          onClick={exportPng}
          className="h-9 rounded-full border border-white/10 bg-white/[0.06] px-3 text-xs font-medium text-white/70 transition hover:bg-white/[0.14] hover:text-white"
        >
          PNG
        </button>
        <label className="relative block">
          <span className="sr-only">画布缩放</span>
          <select
            value={String(SCALE_OPTIONS.includes(viewport.scale) ? viewport.scale : "")}
            onChange={(event) => setCanvasScale(Number(event.target.value))}
            className="h-9 min-w-20 appearance-none rounded-full border border-white/10 bg-black/[0.18] px-4 pr-7 text-center text-xs font-medium text-white/60 outline-none transition hover:bg-white/[0.08] hover:text-white focus:border-white/25"
            aria-label="选择画布缩放比例"
          >
            {!SCALE_OPTIONS.includes(viewport.scale) && (
              <option value="" disabled>
                {Math.round(viewport.scale * 100)}%
              </option>
            )}
            {SCALE_OPTIONS.map((scale) => (
              <option key={scale} value={scale}>
                {Math.round(scale * 100)}%
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-white/35">
            ▾
          </span>
        </label>
      </div>

      <button
        type="button"
        onClick={() => setChatOpen((open) => !open)}
        className="fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.12] text-white shadow-2xl shadow-black/35 backdrop-blur-2xl transition hover:-translate-y-0.5 hover:bg-white/[0.18]"
        aria-label="打开 AI 助手"
      >
        <Bot className="h-6 w-6" />
      </button>

      {chatOpen && (
        <section className={`fixed bottom-24 right-5 z-30 flex h-[500px] w-[360px] max-w-[calc(100vw-40px)] flex-col rounded-[28px] ${darkPanel}`}>
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-white/90">AI 画布助手</h2>
              <p className="text-xs text-white/40">自然语言控制当前画布</p>
            </div>
            <button
              type="button"
              onClick={() => setAiMessages([])}
              className="rounded-full px-3 py-1 text-xs text-white/45 transition hover:bg-white/[0.1] hover:text-white/80"
            >
              清空
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {aiMessages.map((message) => (
              <div
                key={message.id}
                className={`rounded-xl px-3 py-2 text-sm leading-6 ${
                  message.role === "user"
                    ? "ml-8 border border-sky-200/15 bg-sky-300/15 text-sky-50"
                    : "mr-8 border border-white/10 bg-white/[0.08] text-white/72"
                }`}
              >
                {message.content}
              </div>
            ))}
            {aiLoading && (
              <div className="mr-8 rounded-xl border border-white/10 bg-white/[0.08] px-3 py-2 text-sm text-white/45">
                正在执行...
              </div>
            )}
          </div>

          <div className="border-t border-white/10 p-3">
            <textarea
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submitAiCommand();
                }
              }}
              placeholder="例如：在画布中间添加一个圆形"
              className="h-20 w-full resize-none rounded-2xl border border-white/10 bg-black/[0.22] px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-accent/70 focus:bg-black/[0.3]"
            />
            <button
              type="button"
              onClick={() => void submitAiCommand()}
              disabled={aiLoading || !chatInput.trim()}
              className="mt-2 h-10 w-full rounded-full border border-white/[0.14] bg-white/[0.13] text-sm font-medium text-white shadow-lg shadow-black/20 transition hover:bg-white/[0.18] disabled:cursor-not-allowed disabled:opacity-45"
            >
              发送
            </button>
          </div>
        </section>
      )}

      {apiConfigOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <section className={`w-full max-w-md rounded-[28px] p-5 ${darkPanel}`}>
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-white/90">API 配置</h2>
                <p className="mt-1 text-sm text-white/45">用于后续接入 AI 绘图、语音等服务。</p>
              </div>
              <button
                type="button"
                onClick={() => setApiConfigOpen(false)}
                className="rounded-full px-3 py-1 text-white/45 transition hover:bg-white/[0.1] hover:text-white/80"
              >
                关闭
              </button>
            </div>

            <label className="block">
              <span className="mb-2 block text-xs font-medium text-white/55">接口地址</span>
              <input
                value={apiEndpoint}
                onChange={(event) => setApiEndpoint(event.target.value)}
                className="h-11 w-full rounded-2xl border border-white/10 bg-black/[0.22] px-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-accent/70"
                placeholder="https://api.example.com/generate"
              />
            </label>
            <label className="mt-4 block">
              <span className="mb-2 block text-xs font-medium text-white/55">API Key</span>
              <input
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                className="h-11 w-full rounded-2xl border border-white/10 bg-black/[0.22] px-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-accent/70"
                placeholder="sk-..."
                type="password"
              />
            </label>
            <button
              type="button"
              onClick={() => setApiConfigOpen(false)}
              className="mt-5 h-11 w-full rounded-full border border-white/[0.14] bg-white/[0.13] text-sm font-medium text-white transition hover:bg-white/[0.18]"
            >
              保存配置
            </button>
          </section>
        </div>
      )}

      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(event) => {
          const targetId = pendingImageTargetRef.current;
          pendingImageTargetRef.current = null;
          void handleImageFile(event.target.files?.[0], targetId);
          event.target.value = "";
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,.mov,video/*"
        className="hidden"
        onChange={(event) => {
          const targetId = pendingVideoTargetRef.current;
          pendingVideoTargetRef.current = null;
          void handleVideoFile(event.target.files?.[0], targetId);
          event.target.value = "";
        }}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/mpeg,audio/wav,audio/*"
        className="hidden"
        onChange={(event) => {
          const targetId = pendingAudioTargetRef.current;
          pendingAudioTargetRef.current = null;
          void handleAudioFile(event.target.files?.[0], targetId);
          event.target.value = "";
        }}
      />
      <input
        ref={importInputRef}
        type="file"
        accept="image/*,video/*,video/quicktime,.mov,audio/*,application/json,.json"
        className="hidden"
        onChange={(event) => {
          void handleImportFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </main>
  );
}

function CanvasElementNode({
  element,
  selected,
  dragging,
  onSelect,
  onHover,
  onLeave,
  onDragStart,
  onPreviewChange,
  onChange,
  onUploadImage,
  onUploadVideo,
  onUploadAudio,
}: {
  element: CanvasElement;
  selected: boolean;
  dragging: boolean;
  onSelect: () => void;
  onHover: () => void;
  onLeave: () => void;
  onDragStart: () => void;
  onPreviewChange: (updates: Partial<CanvasElement>) => void;
  onChange: (updates: Partial<CanvasElement>) => void;
  onUploadImage: (element: CanvasImageElement) => void;
  onUploadVideo: (element: CanvasMediaElement) => void;
  onUploadAudio: (element: CanvasMediaElement) => void;
}) {
  const commonProps: CanvasNodeCommonProps = {
    id: element.id,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    rotation: element.rotation,
    draggable: true,
    onClick: onSelect,
    onTap: onSelect,
    onMouseEnter: onHover,
    onMouseLeave: onLeave,
    onDragStart,
    onDragMove: (event: KonvaEventObject<DragEvent>) => {
      onPreviewChange({
        x: event.target.x(),
        y: event.target.y(),
      });
    },
    onDragEnd: (event: KonvaEventObject<DragEvent>) => {
      onChange({
        x: event.target.x(),
        y: event.target.y(),
      });
    },
  };

  const renderNode = canvasNodeRenderers[element.kind];
  return renderNode({
    element,
    selected,
    dragging,
    commonProps,
    onUploadImage,
    onUploadVideo,
    onUploadAudio,
  });
}

function CanvasConnectionHandle({
  element,
  onHover,
  onLeave,
  onStartConnection,
}: {
  element: CanvasElement;
  onHover: () => void;
  onLeave: () => void;
  onStartConnection: (event: KonvaEventObject<MouseEvent | TouchEvent>) => void;
}) {
  const input = getInputPortPosition(element);
  const output = getOutputPortPosition(element);

  return (
    <Group listening onMouseEnter={onHover} onMouseLeave={onLeave}>
      <Circle
        x={input.x}
        y={input.y}
        radius={PORT_RADIUS}
        fill="rgba(255,255,255,0.96)"
        stroke="rgba(0,0,0,0.3)"
        strokeWidth={1}
        listening={false}
      />
      <Circle
        x={output.x}
        y={output.y}
        radius={16}
        fill="rgba(255,255,255,0.001)"
        onMouseDown={onStartConnection}
        onTouchStart={onStartConnection}
        draggable={false}
      />
      <Circle
        x={output.x}
        y={output.y}
        radius={PORT_RADIUS}
        fill="rgba(255,255,255,0.96)"
        stroke="rgba(0,0,0,0.3)"
        strokeWidth={1}
        onMouseDown={onStartConnection}
        onTouchStart={onStartConnection}
        draggable={false}
      />
    </Group>
  );
}

function CanvasEdgeNode({
  edge,
  elements,
}: {
  edge: CanvasEdge;
  elements: CanvasElement[];
}) {
  const source = elements.find((element) => element.id === edge.sourceId);
  const target = elements.find((element) => element.id === edge.targetId);

  if (!source || !target) return null;

  const sourcePort = getOutputPortPosition(source);
  const targetPort = getInputPortPosition(target);

  return (
    <FlowingConnector
      from={sourcePort}
      to={targetPort}
      opacity={0.72}
      showEndpoints
    />
  );
}

function DraftEdgeNode({ edge }: { edge: DraftEdge }) {
  return (
    <FlowingConnector
      from={edge.from}
      to={edge.to}
      opacity={0.9}
      showEndpoints
    />
  );
}

function FlowingConnector({
  from,
  to,
  opacity,
  showEndpoints,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  opacity: number;
  showEndpoints: boolean;
}) {
  const pathRef = useRef<Konva.Path>(null);

  useEffect(() => {
    const path = pathRef.current;
    const layer = path?.getLayer();
    if (!path || !layer) return;

    const animation = new Konva.Animation((frame) => {
      path.dashOffset(-((frame?.time || 0) / 42));
    }, layer);
    animation.start();

    return () => {
      animation.stop();
    };
  }, []);

  return (
    <Group listening={false}>
      <Path
        ref={pathRef}
        data={getConnectorPathData(from, to)}
        stroke={`rgba(255,255,255,${opacity})`}
        strokeWidth={1.6}
        dash={[2, 6]}
        lineCap="round"
        lineJoin="round"
        shadowColor="rgba(255,255,255,0.22)"
        shadowBlur={4}
        listening={false}
      />
      {showEndpoints && (
        <>
          <Circle
            x={from.x}
            y={from.y}
            radius={PORT_RADIUS}
            fill="rgba(255,255,255,0.96)"
            listening={false}
          />
          <Circle
            x={to.x}
            y={to.y}
            radius={PORT_RADIUS}
            fill="rgba(255,255,255,0.96)"
            listening={false}
          />
        </>
      )}
    </Group>
  );
}

const canvasNodeRenderers: Record<
  CanvasElementKind,
  (props: CanvasNodeRendererProps) => React.ReactNode
> = {
  text: (props) => (
    <CanvasTextNode
      {...props}
      element={props.element as CanvasTextElement}
    />
  ),
  shape: (props) => (
    <CanvasShapeNode
      {...props}
      element={props.element as CanvasShapeElement}
    />
  ),
  image: (props) => (
    <CanvasImageNode
      {...props}
      element={props.element as CanvasImageElement}
    />
  ),
  video: (props) => (
    <CanvasMediaNode
      {...props}
      element={props.element as CanvasMediaElement}
    />
  ),
  audio: (props) => (
    <CanvasMediaNode
      {...props}
      element={props.element as CanvasMediaElement}
    />
  ),
};

function CanvasTextNode({
  element,
  selected,
  dragging,
  commonProps,
}: CanvasNodeRendererProps<CanvasTextElement>) {
  return (
    <CanvasNodeShell
      commonProps={commonProps}
      width={element.width}
      height={element.height}
      selected={selected}
      dragging={dragging}
    >
      <Text
        x={NODE_PADDING}
        y={NODE_PADDING}
        width={Math.max(24, element.width - NODE_PADDING * 2)}
        height={Math.max(24, element.height - NODE_PADDING * 2)}
        text={element.text}
        fill="#f8fafc"
        fontSize={element.fontSize}
        fontStyle="600"
        align="center"
        verticalAlign="middle"
      />
    </CanvasNodeShell>
  );
}

function CanvasShapeNode({
  element,
  selected,
  dragging,
  commonProps,
}: CanvasNodeRendererProps<CanvasShapeElement>) {
  const contentSize = Math.max(
    24,
    Math.min(element.width, element.height) - NODE_PADDING * 2,
  );

  return (
    <CanvasNodeShell
      commonProps={commonProps}
      width={element.width}
      height={element.height}
      selected={selected}
      dragging={dragging}
    >
      <Rect
        x={(element.width - contentSize) / 2}
        y={(element.height - contentSize) / 2}
        width={contentSize}
        height={contentSize}
        fill={element.fill}
        stroke={element.stroke}
        strokeWidth={1}
        cornerRadius={element.shape === "circle" ? contentSize / 2 : 12}
      />
    </CanvasNodeShell>
  );
}

function CanvasMediaNode({
  element,
  selected,
  dragging,
  commonProps,
  onUploadVideo,
  onUploadAudio,
}: CanvasNodeRendererProps<CanvasMediaElement>) {
  const isAudio = element.kind === "audio";
  const videoState = useHtmlVideo(element.kind === "video" ? element.src : undefined);
  const videoImageRef = useRef<Konva.Image>(null);
  const videoControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [videoControlsVisible, setVideoControlsVisible] = useState(true);
  const hasUploadButton = !element.src;
  const titleY = hasUploadButton ? element.height / 2 - 44 : element.height / 2 - 14;

  const clearVideoControlsTimer = useCallback(() => {
    if (videoControlsTimerRef.current) {
      clearTimeout(videoControlsTimerRef.current);
      videoControlsTimerRef.current = null;
    }
  }, []);

  const revealVideoControls = useCallback(() => {
    if (element.kind !== "video") return;
    setVideoControlsVisible(true);
    clearVideoControlsTimer();

    if (videoState.isPlaying) {
      videoControlsTimerRef.current = setTimeout(() => {
        setVideoControlsVisible(false);
        videoControlsTimerRef.current = null;
      }, VIDEO_CONTROLS_HIDE_DELAY);
    }
  }, [clearVideoControlsTimer, element.kind, videoState.isPlaying]);

  useEffect(() => {
    if (!videoState.isPlaying) {
      clearVideoControlsTimer();
      setVideoControlsVisible(true);
      return;
    }

    revealVideoControls();
    return clearVideoControlsTimer;
  }, [clearVideoControlsTimer, revealVideoControls, videoState.isPlaying]);

  useEffect(() => {
    if (!videoState.video) return;
    const layer = videoImageRef.current?.getLayer();
    if (!layer) return;

    layer.batchDraw();
    if (!videoState.isPlaying) return;

    const animation = new Konva.Animation(() => {
      layer.batchDraw();
    }, layer);
    animation.start();

    return () => {
      animation.stop();
    };
  }, [videoState.coverReady, videoState.isPlaying, videoState.video]);

  if (element.kind === "video" && videoState.video && videoState.coverReady) {
    return (
      <CanvasNodeShell
        commonProps={commonProps}
        width={element.width}
        height={element.height}
        selected={selected}
        dragging={dragging}
        onMouseMove={revealVideoControls}
        onMouseEnter={revealVideoControls}
      >
        <KonvaImage
          ref={videoImageRef}
          x={NODE_PADDING}
          y={NODE_PADDING}
          width={Math.max(24, element.width - NODE_PADDING * 2)}
          height={Math.max(24, element.height - NODE_PADDING * 2)}
          image={videoState.video}
          cornerRadius={NODE_RADIUS}
          listening={false}
          perfectDrawEnabled={false}
        />
        {!videoState.isPlaying && (
          <CanvasCenterPlayButton
            x={element.width / 2 - 28}
            y={element.height / 2 - 28}
            onClick={videoState.toggle}
          />
        )}
        {videoState.isPlaying && videoControlsVisible && (
          <CanvasMediaControlBar
            x={NODE_PADDING + 10}
            y={element.height - NODE_PADDING - 58}
            width={Math.max(260, element.width - NODE_PADDING * 2 - 20)}
            currentTime={videoState.currentTime}
            duration={videoState.duration}
            isPlaying={videoState.isPlaying}
            muted={videoState.muted}
            progress={videoState.progress}
            onSeek={videoState.seekToRatio}
            onToggleMute={videoState.toggleMute}
            onTogglePlay={videoState.toggle}
          />
        )}
      </CanvasNodeShell>
    );
  }

  if (isAudio && element.src) {
    return (
      <CanvasNodeShell
        commonProps={commonProps}
        width={element.width}
        height={element.height}
        selected={selected}
        dragging={dragging}
      >
        <CanvasAudioPlayer element={element} />
      </CanvasNodeShell>
    );
  }

  return (
    <CanvasNodeShell
      commonProps={commonProps}
      width={element.width}
      height={element.height}
      selected={selected}
      dragging={dragging}
    >
      <Text
        x={NODE_PADDING}
        y={titleY}
        width={Math.max(24, element.width - NODE_PADDING * 2)}
        text={element.label}
        align="center"
        fill="#f8fafc"
        fontSize={18}
        fontStyle="600"
      />
      {!isAudio && !element.src && (
        <CanvasUploadButton
          x={element.width / 2 - 68}
          y={element.height / 2}
          label="上传视频"
          onClick={() => onUploadVideo(element)}
        />
      )}
      {isAudio && !element.src && (
        <CanvasUploadButton
          x={element.width / 2 - 68}
          y={element.height / 2}
          label="上传音乐"
          onClick={() => onUploadAudio(element)}
        />
      )}
    </CanvasNodeShell>
  );
}

function CanvasAudioPlayer({ element }: { element: CanvasMediaElement }) {
  const audio = useHtmlAudio(element.src);
  const contentWidth = Math.max(24, element.width - NODE_PADDING * 2);
  const playerWidth = Math.max(300, Math.min(520, contentWidth - 40));
  const playerX = element.width / 2 - playerWidth / 2;
  const playerY = element.height / 2 - 28;

  return (
    <>
      <Text
        x={NODE_PADDING}
        y={playerY - 42}
        width={contentWidth}
        text={element.label}
        align="center"
        fill="#f8fafc"
        fontSize={16}
        fontStyle="600"
        ellipsis
        wrap="none"
      />
      <CanvasMediaControlBar
        x={playerX}
        y={playerY}
        width={playerWidth}
        currentTime={audio.currentTime}
        duration={audio.duration}
        isPlaying={audio.isPlaying}
        muted={audio.muted}
        progress={audio.progress}
        onSeek={audio.seekToRatio}
        onToggleMute={audio.toggleMute}
        onTogglePlay={audio.toggle}
      />
    </>
  );
}

function CanvasMediaControlBar({
  x,
  y,
  width,
  currentTime,
  duration,
  isPlaying,
  muted,
  progress,
  onSeek,
  onToggleMute,
  onTogglePlay,
}: {
  x: number;
  y: number;
  width: number;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  muted: boolean;
  progress: number;
  onSeek: (ratio: number) => void;
  onToggleMute: () => void;
  onTogglePlay: () => void;
}) {
  const height = 48;
  const playSize = 34;
  const trackX = 104;
  const volumeWidth = 34;
  const timeWidth = 42;
  const trackWidth = Math.max(48, width - trackX - timeWidth - volumeWidth - 26);
  const stop = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    event.cancelBubble = true;
  };
  const handleSeek = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    event.cancelBubble = true;
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;

    const absolutePosition = event.target.getAbsolutePosition();
    const absoluteScale = event.target.getAbsoluteScale();
    const ratio = (pointer.x - absolutePosition.x) / (trackWidth * absoluteScale.x);
    onSeek(ratio);
  };

  return (
    <Group
      x={x}
      y={y}
      onMouseDown={stop}
      onTouchStart={stop}
    >
      <Rect
        width={width}
        height={height}
        fill="rgba(8,12,10,0.42)"
        stroke="rgba(255,255,255,0.14)"
        strokeWidth={1}
        cornerRadius={NODE_RADIUS}
        shadowColor="rgba(0,0,0,0.42)"
        shadowBlur={12}
        listening={false}
      />
      <Group
        x={8}
        y={7}
        onClick={(event) => {
          event.cancelBubble = true;
          onTogglePlay();
        }}
        onTap={(event) => {
          event.cancelBubble = true;
          onTogglePlay();
        }}
      >
        <Rect
          width={playSize}
          height={playSize}
          fill="rgba(255,255,255,0.12)"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth={1}
          cornerRadius={NODE_RADIUS}
        />
        <Text
          width={playSize}
          height={playSize}
          text={isPlaying ? "Ⅱ" : "▶"}
          align="center"
          verticalAlign="middle"
          fill="rgba(255,255,255,0.88)"
          fontSize={14}
          fontStyle="600"
          listening={false}
        />
      </Group>
      <Text
        x={50}
        y={16}
        width={46}
        text={formatMediaTime(currentTime)}
        align="left"
        fill="rgba(255,255,255,0.72)"
        fontSize={13}
        fontStyle="600"
        listening={false}
      />
      <Rect
        x={trackX}
        y={21}
        width={trackWidth}
        height={7}
        fill="rgba(255,255,255,0.14)"
        cornerRadius={4}
        listening={false}
      />
      <Rect
        x={trackX}
        y={21}
        width={trackWidth * clamp(progress, 0, 1)}
        height={7}
        fill="rgba(255,255,255,0.72)"
        cornerRadius={4}
        listening={false}
      />
      <Rect
        x={trackX}
        y={14}
        width={trackWidth}
        height={22}
        fill="rgba(255,255,255,0.001)"
        onClick={handleSeek}
        onTap={handleSeek}
      />
      <Text
        x={trackX + trackWidth + 10}
        y={16}
        width={timeWidth}
        text={formatMediaTime(duration)}
        align="left"
        fill="rgba(255,255,255,0.72)"
        fontSize={13}
        fontStyle="600"
        listening={false}
      />
      <Group
        x={width - 42}
        y={7}
        onClick={(event) => {
          event.cancelBubble = true;
          onToggleMute();
        }}
        onTap={(event) => {
          event.cancelBubble = true;
          onToggleMute();
        }}
      >
        <Rect
          width={34}
          height={34}
          fill="rgba(255,255,255,0.08)"
          cornerRadius={NODE_RADIUS}
        />
        <Text
          width={34}
          height={34}
          text={muted ? "×" : "♪"}
          align="center"
          verticalAlign="middle"
          fill="rgba(255,255,255,0.76)"
          fontSize={16}
          fontStyle="600"
          listening={false}
        />
      </Group>
    </Group>
  );
}

function CanvasCenterPlayButton({
  x,
  y,
  onClick,
}: {
  x: number;
  y: number;
  onClick: () => void;
}) {
  const stop = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    event.cancelBubble = true;
  };

  return (
    <Group
      x={x}
      y={y}
      onMouseDown={stop}
      onTouchStart={stop}
      onClick={(event) => {
        event.cancelBubble = true;
        onClick();
      }}
      onTap={(event) => {
        event.cancelBubble = true;
        onClick();
      }}
    >
      <Rect
        width={56}
        height={56}
        fill="rgba(0,0,0,0.42)"
        stroke="rgba(255,255,255,0.16)"
        strokeWidth={1}
        cornerRadius={NODE_RADIUS}
        shadowColor="rgba(0,0,0,0.36)"
        shadowBlur={12}
      />
      <Text
        width={56}
        height={56}
        text="▶"
        align="center"
        verticalAlign="middle"
        fill="rgba(255,255,255,0.92)"
        fontSize={22}
        fontStyle="600"
        listening={false}
      />
    </Group>
  );
}

function CanvasImageNode({
  element,
  commonProps,
  selected,
  dragging,
  onUploadImage,
}: CanvasNodeRendererProps<CanvasImageElement>) {
  const image = useHtmlImage(element.src);

  if (image) {
    return (
      <CanvasNodeShell
        commonProps={commonProps}
        width={element.width}
        height={element.height}
        selected={selected}
        dragging={dragging}
      >
        <KonvaImage
          x={NODE_PADDING}
          y={NODE_PADDING}
          width={Math.max(24, element.width - NODE_PADDING * 2)}
          height={Math.max(24, element.height - NODE_PADDING * 2)}
          image={image}
          cornerRadius={NODE_RADIUS}
          listening={false}
          perfectDrawEnabled={false}
        />
      </CanvasNodeShell>
    );
  }

  const titleY = element.height / 2 - 44;

  return (
    <CanvasNodeShell
      commonProps={commonProps}
      width={element.width}
      height={element.height}
      selected={selected}
      dragging={dragging}
    >
      <Text
        x={NODE_PADDING}
        y={titleY}
        width={Math.max(24, element.width - NODE_PADDING * 2)}
        text={element.label || "图像素材"}
        align="center"
        fill="#f8fafc"
        fontSize={16}
        fontStyle="600"
      />
      <CanvasUploadButton
        x={element.width / 2 - 68}
        y={element.height / 2}
        label="上传图片"
        onClick={() => onUploadImage(element)}
      />
    </CanvasNodeShell>
  );
}

function CanvasUploadButton({
  x,
  y,
  label,
  onClick,
}: {
  x: number;
  y: number;
  label: string;
  onClick: () => void;
}) {
  const stop = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    event.cancelBubble = true;
  };

  return (
    <Group
      x={x}
      y={y}
      onMouseDown={stop}
      onTouchStart={stop}
      onClick={(event) => {
        event.cancelBubble = true;
        onClick();
      }}
      onTap={(event) => {
        event.cancelBubble = true;
        onClick();
      }}
    >
      <Rect
        width={136}
        height={40}
        fill="rgba(255,255,255,0.1)"
        stroke="rgba(255,255,255,0.16)"
        strokeWidth={1}
        cornerRadius={NODE_RADIUS}
      />
      <Text
        width={136}
        height={40}
        text={label}
        align="center"
        verticalAlign="middle"
        fill="rgba(255,255,255,0.84)"
        fontSize={13}
        fontStyle="600"
        listening={false}
      />
    </Group>
  );
}

function CanvasNodeShell({
  commonProps,
  width,
  height,
  selected,
  dragging,
  children,
  onDblClick,
  onDblTap,
  onMouseEnter,
  onMouseLeave,
  onMouseMove,
}: {
  commonProps: Record<string, unknown>;
  width: number;
  height: number;
  selected: boolean;
  dragging: boolean;
  children: React.ReactNode;
  onDblClick?: () => void;
  onDblTap?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onMouseMove?: () => void;
}) {
  const commonMouseEnter = commonProps.onMouseEnter as
    | ((event: KonvaEventObject<MouseEvent>) => void)
    | undefined;
  const commonMouseLeave = commonProps.onMouseLeave as
    | ((event: KonvaEventObject<MouseEvent>) => void)
    | undefined;

  return (
    <Group
      {...commonProps}
      onDblClick={onDblClick}
      onDblTap={onDblTap}
      onMouseEnter={(event) => {
        commonMouseEnter?.(event);
        onMouseEnter?.();
      }}
      onMouseLeave={(event) => {
        commonMouseLeave?.(event);
        onMouseLeave?.();
      }}
      onMouseMove={() => onMouseMove?.()}
    >
      <Rect
        width={width}
        height={height}
        fill="#111214"
        stroke={selected ? "rgba(255,255,255,0.34)" : "rgba(255,255,255,0.06)"}
        strokeWidth={selected ? 1.5 : 1}
        cornerRadius={NODE_RADIUS}
        shadowColor="rgba(0,0,0,0.45)"
        shadowBlur={dragging ? 0 : 18}
        shadowOffsetY={dragging ? 0 : 12}
        shadowOpacity={dragging ? 0 : 0.35}
      />
      <Rect
        width={width}
        height={height}
        fillRadialGradientStartPoint={{ x: 0, y: 0 }}
        fillRadialGradientStartRadius={0}
        fillRadialGradientEndPoint={{ x: 0, y: 0 }}
        fillRadialGradientEndRadius={Math.max(width, height) * 1.2}
        fillRadialGradientColorStops={[
          0,
          "rgba(255,255,255,0.04)",
          0.45,
          "rgba(255,255,255,0)",
          1,
          "rgba(255,255,255,0)",
        ]}
        cornerRadius={NODE_RADIUS}
        listening={false}
      />
      <Rect
        x={NODE_RADIUS}
        y={1}
        width={Math.max(0, width - NODE_RADIUS * 2)}
        height={1}
        fill="rgba(255,255,255,0.03)"
        listening={false}
      />
      {children}
    </Group>
  );
}

function ToolButton({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: React.ReactNode;
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

function IconAction({
  children,
  title,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/65 transition hover:bg-white/[0.14] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  );
}
