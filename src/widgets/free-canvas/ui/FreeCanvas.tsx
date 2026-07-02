"use client";

import {
  Bot,
  Eye,
  Trash2,
  X,
} from "lucide-react";
import {
  type MouseEvent as ReactMouseEvent,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import {
  Circle,
  Group,
  Image as KonvaImage,
  Layer,
  Rect,
  Stage,
  Text,
} from "react-konva";
import {
  createCanvasEdge,
  createImageElement,
  createMediaElement,
  createTextElement,
  isCanvasEdge,
  isCanvasElement,
} from "@/entities/canvas/lib/factory";
import {
  executeCanvasBrainMediaGeneration,
  executeCanvasBrainTextNode,
  getCanvasEditorModelKind,
  getCanvasBrainDoneMessage,
  getCanvasBrainFailureMessage,
  getCanvasBrainGeneratingMessage,
  getCanvasBrainMediaNodeSize,
  getCanvasBrainMissingModelMessage,
  getCanvasBrainReadyElementPatch,
  getCanvasBrainTextDoneMessage,
  getCanvasBrainTextGeneratingMessage,
  getCanvasReferenceImageUrls,
  getCanvasModelKindForOutput,
  hasConcreteAsset,
  readBrowserImageSize,
  readBrowserVideoSize,
  resolveCanvasExecutionSources,
  runCanvasBrainTurn,
  type CanvasActionIntent,
} from "@/features/canvas-brain";
import {
  appendResultNode,
  appendResultNodeFromSources,
  createResultPlaceholder,
  createTextResultNode,
} from "@/entities/canvas/lib/workflow";
import {
  getCanvasTextRole,
  getCanvasTextRoleConfig,
} from "@/entities/canvas/lib/textRoles";
import {
  getCanvasNodeEditorFrame,
  getCanvasNodeEditorTitle,
} from "../lib/editor";
import {
  formatMediaTime,
  useHtmlAudio,
  useHtmlImage,
  useHtmlVideo,
} from "../lib/media";
import {
  clamp,
  getOutputPortPosition,
  getTextNodeSize,
  getViewportForElements,
  isPointInsideElement,
  useViewportSize,
} from "../lib/geometry";
import { useCanvasDocument } from "../lib/useCanvasDocument";
import { useCanvasActionRunner } from "../lib/useCanvasActionRunner";
import { useCanvasModelSelection } from "../lib/useCanvasModelSelection";
import { useCanvasRenderWindow } from "../lib/useCanvasRenderWindow";
import {
  darkPanel,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  DOT_GRID_SIZE,
  MAX_SCALE,
  MIN_SCALE,
  NODE_PADDING,
  NODE_RADIUS,
  SCALE_OPTIONS,
  VIDEO_CONTROLS_HIDE_DELAY,
} from "../model/constants";
import {
  CanvasConnectionHandle,
  DraftEdgeNode,
  MemoCanvasEdgeNode,
} from "./CanvasConnectors";
import {
  CanvasNodeEditorPanel,
  type CanvasNodeGenerateOptions,
} from "./CanvasNodeEditorPanel";
import { CanvasProcessorNodeOverlay } from "./CanvasProcessorNodeOverlay";
import { CanvasSequenceTemplateOverlay } from "./CanvasSequenceTemplateOverlay";
import {
  CanvasBrainPanel,
  type CanvasBrainChatMessage,
} from "./CanvasBrainPanel";
import { CanvasApiConfigModal } from "./CanvasApiConfigModal";
import { CanvasSideToolbar } from "./CanvasSideToolbar";
import { CanvasTopToolbar } from "./CanvasTopToolbar";
import type {
  CanvasEdge,
  CanvasElement,
  CanvasImageElement,
  CanvasMediaElement,
  CanvasProcessorElement,
  CanvasProjectExport,
  CanvasShapeElement,
  CanvasTemplateElement,
  CanvasTextElement,
  CanvasTextMeta,
  CanvasTextRole,
  CanvasViewport,
} from "@/entities/canvas/model/types";
import { renderCanvasTemplateContent } from "../templates/registry";

type AiMessage = CanvasBrainChatMessage;

type CanvasExecutionOptions = {
  extraSourceIds?: string[];
  extraSourceElements?: CanvasElement[];
  intentOverride?: CanvasActionIntent;
  resultTextRole?: CanvasTextRole;
  generationMode?: "single" | "collaborative";
  baseElements?: CanvasElement[];
  baseEdges?: CanvasEdge[];
  actionLabel?: string;
};

type CanvasNodeContextMenuState = {
  elementId: string;
  x: number;
  y: number;
} | null;

const PROCESSOR_NODE_WIDTH = 880;
const PROCESSOR_NODE_HEIGHT = 720;
const FRAME_LIST_TEMPLATE_WIDTH = 760;
const FRAME_LIST_TEMPLATE_HEIGHT = 520;

type CanvasNodeCommonProps = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  draggable: boolean;
  onClick?: () => void;
  onTap?: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onContextMenu?: (event: KonvaEventObject<MouseEvent>) => void;
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
  onPreview?: () => void;
};

type CanvasNodeBadge = {
  title: string;
  color: string;
};

type CanvasElementNodeProps = {
  element: CanvasElement;
  selected: boolean;
  dragging: boolean;
  onSelect: () => void;
  onHover: () => void;
  onLeave: () => void;
  onContextMenu: (event: KonvaEventObject<MouseEvent>) => void;
  onDragStart: () => void;
  onPreviewChange: (updates: Partial<CanvasElement>) => void;
  onChange: (updates: Partial<CanvasElement>) => void;
  onUploadImage: (element: CanvasImageElement) => void;
  onUploadVideo: (element: CanvasMediaElement) => void;
  onUploadAudio: (element: CanvasMediaElement) => void;
  onPreview: (element: CanvasTextElement) => void;
};

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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

const readImageSize = readBrowserImageSize;

function readVideoSize(src: string): Promise<{ width: number; height: number }> {
  return readBrowserVideoSize(src, {
    width: DEFAULT_NODE_WIDTH,
    height: DEFAULT_NODE_HEIGHT,
  });
}

function getMediaNodeSize(intrinsicWidth: number, intrinsicHeight: number): {
  width: number;
  height: number;
} {
  return getCanvasBrainMediaNodeSize({
    intrinsicSize: {
      width: intrinsicWidth,
      height: intrinsicHeight,
    },
    padding: NODE_PADDING,
  });
}

const getImageNodeSize = getMediaNodeSize;
const getVideoNodeSize = getMediaNodeSize;

const TEXT_ROLE_BADGE_COLORS: Record<CanvasTextRole, string> = {
  general: "#e5e7eb",
  article: "#34d399",
  novel_setup: "#fbbf24",
  novel_outline: "#a78bfa",
  novel_chapter_outline: "#f472b6",
  novel_chapter: "#fb7185",
  character: "#f59e0b",
  script: "#c084fc",
  storyboard: "#4ade80",
  prompt: "#facc15",
};

function getTextNodeBadge(element: CanvasTextElement): CanvasNodeBadge {
  const role = getCanvasTextRole(element.textRole);
  const config = getCanvasTextRoleConfig(role);

  return {
    title: element.meta?.title || config.title,
    color: TEXT_ROLE_BADGE_COLORS[role],
  };
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  );
}

function mergeElementsWithUpdates(params: {
  currentElements: CanvasElement[];
  plannedElements: CanvasElement[];
  updatesById?: Map<string, Partial<CanvasElement>>;
}): CanvasElement[] {
  const plannedById = new Map(
    params.plannedElements.map((element) => [element.id, element]),
  );
  const updatesById = params.updatesById || new Map<string, Partial<CanvasElement>>();
  const currentIds = new Set(params.currentElements.map((element) => element.id));
  const merged = params.currentElements.map((element) =>
    updatesById.has(element.id)
      ? ({ ...element, ...updatesById.get(element.id) } as CanvasElement)
      : element,
  );

  params.plannedElements.forEach((plannedElement) => {
    if (currentIds.has(plannedElement.id)) return;
    merged.push({
      ...plannedElement,
      ...(updatesById.get(plannedElement.id) || {}),
    } as CanvasElement);
  });

  return merged.filter((element) => plannedById.has(element.id) || currentIds.has(element.id));
}

function createCanvasAgentRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getNextTextResultVersion(params: {
  elements: CanvasElement[];
  sourceId: string;
  resultTextRole: CanvasTextRole;
}): number {
  const versions = params.elements
    .filter((element): element is CanvasTextElement => element.kind === "text")
    .filter(
      (element) =>
        element.meta?.sourceNodeId === params.sourceId &&
        getCanvasTextRole(element.textRole) === params.resultTextRole,
    )
    .map((element) => element.meta?.version || 1);

  return versions.length > 0 ? Math.max(...versions) + 1 : 1;
}

function getNextTextChapterNo(params: {
  source: CanvasElement;
  resultTextRole: CanvasTextRole;
  instruction: string;
}): number | undefined {
  if (
    params.resultTextRole !== "novel_chapter" &&
    params.resultTextRole !== "novel_chapter_outline"
  ) {
    return undefined;
  }
  if (params.source.kind !== "text") return undefined;

  const sourceChapterNo = params.source.meta?.chapterNo;
  if (/下一章|下章|next chapter/i.test(params.instruction)) {
    return typeof sourceChapterNo === "number" ? sourceChapterNo + 1 : undefined;
  }
  if (typeof sourceChapterNo === "number") return sourceChapterNo;
  return 1;
}

function getCanvasTextResultSiblingSlot(index: number): number {
  if (index === 0) return 0;
  const magnitude = Math.ceil(index / 2);
  return index % 2 === 1 ? magnitude : -magnitude;
}

function getCanvasHierarchicalTextResultPosition(params: {
  elements: CanvasElement[];
  edges: CanvasEdge[];
  source: CanvasElement;
}): { x: number; y: number } {
  const directChildIds = new Set(
    params.edges
      .filter((edge) => edge.sourceId === params.source.id)
      .map((edge) => edge.targetId),
  );
  const childCount = params.elements.filter(
    (element): element is CanvasTextElement =>
      element.kind === "text" &&
      element.id !== params.source.id &&
      (element.meta?.parentNodeId === params.source.id ||
        element.meta?.sourceNodeId === params.source.id ||
        directChildIds.has(element.id)),
  ).length;
  const slot = getCanvasTextResultSiblingSlot(childCount);
  const verticalStep = Math.max(params.source.height, DEFAULT_NODE_HEIGHT) + 88;

  return {
    x: params.source.x + params.source.width + 360,
    y: params.source.y + params.source.height / 2 + slot * verticalStep,
  };
}

export function FreeCanvas() {
  const size = useViewportSize();
  const stageRef = useRef<Konva.Stage>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const brainImageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const pendingImageTargetRef = useRef<string | null>(null);
  const pendingVideoTargetRef = useRef<string | null>(null);
  const pendingAudioTargetRef = useRef<string | null>(null);
  const hoverClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    addElement,
    beginElementDrag,
    clearCanvas,
    commitCanvas,
    deleteEdge,
    deleteElement,
    draftEdge,
    draggingElementId,
    edges,
    elements,
    finishElementDrag,
    future,
    patchElementDraft,
    past,
    previewUpdateElement,
    redo,
    selectedEdgeId,
    selectedId,
    setDraftEdge,
    setSelectedEdgeId,
    setSelectedId,
    undo,
    updateElement,
  } = useCanvasDocument();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
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
  const [brainModelRef, setBrainModelRef] = useState("");
  const [brainAttachmentIds, setBrainAttachmentIds] = useState<string[]>([]);
  const [nodeContextMenu, setNodeContextMenu] =
    useState<CanvasNodeContextMenuState>(null);
  const [previewTextElementId, setPreviewTextElementId] = useState<string | null>(null);
  const [pendingTextSourceIds, setPendingTextSourceIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([
    {
      id: getMessageId(),
      role: "assistant",
      content: "我是画布大脑。可以选择素材、协调上下文，并把你的意图转成画布操作。",
    },
  ]);
  const {
    elementById,
    frameSequenceOverlayElements,
    processorOverlayElements,
    visibleEdges,
    visibleElements,
  } = useCanvasRenderWindow({
    elements,
    edges,
    viewport,
    size,
    selectedId,
    selectedEdgeId,
    hoveredId,
    draggingElementId,
    draftSourceId: draftEdge?.sourceId,
  });
  const selectedElement = selectedId ? elementById.get(selectedId) || null : null;
  const contextMenuElement = nodeContextMenu
    ? elementById.get(nodeContextMenu.elementId) || null
    : null;
  const previewTextElement =
    previewTextElementId && elementById.get(previewTextElementId)?.kind === "text"
      ? (elementById.get(previewTextElementId) as CanvasTextElement)
      : null;
  const selectedElementIsGenerating = selectedElement?.status === "generating";
  const selectedEditorFrame = selectedElement
    ? getCanvasNodeEditorFrame(selectedElement, viewport, size)
    : null;
  const {
    brainModelOptions,
    getModelEntryByRef,
    getModelEntryForKind,
    getResolvedBrainModelEntry,
    hasBrainModel,
    modelOptions,
    resolvedBrainModelRef,
    selectedModelValue,
  } = useCanvasModelSelection({
    brainModelRef,
    selectedElement,
  });

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

  const closeNodeContextMenu = useCallback(() => {
    setNodeContextMenu(null);
  }, []);

  const openNodeContextMenu = useCallback(
    (elementId: string, event: KonvaEventObject<MouseEvent>) => {
      event.evt.preventDefault();
      event.cancelBubble = true;
      setSelectedId(elementId);
      setSelectedEdgeId(null);
      setNodeContextMenu({
        elementId,
        x: event.evt.clientX,
        y: event.evt.clientY,
      });
    },
    [setSelectedEdgeId, setSelectedId],
  );

  const openNodeDomContextMenu = useCallback(
    (elementId: string, event: ReactMouseEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setSelectedId(elementId);
      setSelectedEdgeId(null);
      setNodeContextMenu({
        elementId,
        x: event.clientX,
        y: event.clientY,
      });
    },
    [setSelectedEdgeId, setSelectedId],
  );

  const deleteNodeFromContextMenu = useCallback(() => {
    if (!nodeContextMenu) return;
    deleteElement(nodeContextMenu.elementId);
    setPreviewTextElementId((current) =>
      current === nodeContextMenu.elementId ? null : current,
    );
    setNodeContextMenu(null);
  }, [deleteElement, nodeContextMenu]);

  const openTextPreview = useCallback((element: CanvasTextElement) => {
    if (element.status === "generating") return;
    setPreviewTextElementId(element.id);
    setNodeContextMenu(null);
  }, []);

  const worldCenter = useCallback(() => {
    return {
      x: (size.width / 2 - viewport.x) / viewport.scale,
      y: (size.height / 2 - viewport.y) / viewport.scale,
    };
  }, [size.height, size.width, viewport.scale, viewport.x, viewport.y]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      if (event.key === "Escape") {
        setNodeContextMenu(null);
        return;
      }

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

      if ((event.key === "Backspace" || event.key === "Delete") && selectedEdgeId) {
        event.preventDefault();
        deleteEdge(selectedEdgeId);
        setNodeContextMenu(null);
        return;
      }

      if ((event.key === "Backspace" || event.key === "Delete") && selectedId) {
        event.preventDefault();
        deleteElement(selectedId);
        setNodeContextMenu(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteEdge, deleteElement, redo, selectedEdgeId, selectedId, undo]);

  const addTextRole = useCallback((textRole: CanvasTextRole = "general") => {
    const center = worldCenter();
    const element = createTextElement(center, { textRole });
    const size = getTextNodeSize(element.text, element.fontSize);
    addElement({
      ...element,
      x: center.x - size.width / 2,
      y: center.y - size.height / 2,
      width: size.width,
      height: size.height,
    });
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
      setSelectedEdgeId(null);
      setDraftEdge({
        sourceId: element.id,
        from,
        to,
      });
    },
    [
      setDraftEdge,
      setSelectedEdgeId,
      setSelectedId,
      viewport.scale,
      viewport.x,
      viewport.y,
    ],
  );

  const handleWheel = useCallback(
    (event: KonvaEventObject<WheelEvent>) => {
      event.evt.preventDefault();
      closeNodeContextMenu();
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
    [closeNodeContextMenu, viewport],
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
      closeNodeContextMenu();
      if (!isPanTarget(event.target)) return;
      const pointer = stageRef.current?.getPointerPosition();
      if (!pointer) return;

      if (!selectedElementIsGenerating) {
        setSelectedId(null);
      }
      setSelectedEdgeId(null);
      setDraftEdge(null);
      setPanStart({
        pointerX: pointer.x,
        pointerY: pointer.y,
        viewport,
      });
    },
    [
      selectedElementIsGenerating,
      setDraftEdge,
      setSelectedEdgeId,
      setSelectedId,
      viewport,
      closeNodeContextMenu,
    ],
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
  }, [draftEdge, panStart, setDraftEdge, viewport.scale, viewport.x, viewport.y]);

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
  }, [commitCanvas, draftEdge, edges, elements, setDraftEdge]);

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

  const handleBrainImageFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      const src = await readFileAsDataUrl(file);
      const imageSize = await readImageSize(src);
      const nodeSize = getImageNodeSize(imageSize.width, imageSize.height);
      const center = worldCenter();
      const element = {
        ...createImageElement({
          position: {
            x: center.x - 260,
            y: center.y,
          },
          src,
          label: file.name,
        }),
        x: center.x - 260 - nodeSize.width / 2,
        y: center.y - nodeSize.height / 2,
        width: nodeSize.width,
        height: nodeSize.height,
      };

      addElement(element);
      setBrainAttachmentIds((current) =>
        Array.from(new Set([...current, element.id])),
      );
      appendAiMessage("assistant", `已把「${file.name}」添加为画布图片素材，下一次发送会优先参考它。`);
    },
    [addElement, appendAiMessage, worldCenter],
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
      setSelectedEdgeId(null);
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
    [
      commitCanvas,
      handleAudioFile,
      handleImageFile,
      handleVideoFile,
      setDraftEdge,
      setSelectedEdgeId,
      setSelectedId,
    ],
  );

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

  const generateFromSelectedNode = useCallback(
    async (
      element: CanvasElement,
      instructionOverride?: string,
      options?: CanvasExecutionOptions,
    ) => {
      const prompt = (instructionOverride ?? element.prompt)?.trim();

      if (!prompt) {
        appendAiMessage("assistant", `请先在${getCanvasNodeEditorTitle(element)}节点下方输入生成描述。`);
        return;
      }

      if (element.kind === "text") {
        const workingElements = options?.baseElements || elements;
        const workingEdges = options?.baseEdges || edges;
        const sourceElements = resolveCanvasExecutionSources({
          targetId: element.id,
          elements: workingElements,
          edges: workingEdges,
          extraSourceIds: options?.extraSourceIds,
          extraSourceElements: options?.extraSourceElements,
        });
        const modelEntry = getModelEntryByRef(element.modelRef, "text");
        const modelRef = modelEntry?.ref || "";

        if (!modelRef || !modelEntry?.model || !modelEntry.provider) {
          const message = "未配置可用文本模型，请先在模型设置中启用一个文本模型。";
          patchElementDraft(element.id, {
            status: "failed",
            error: message,
          } as Partial<CanvasElement>);
          appendAiMessage("assistant", message);
          return;
        }

        const shouldCreatePendingTextResult =
          options?.intentOverride?.outputKind === "text" &&
          options.intentOverride.placement === "create_result";
        const pendingTextRole =
          options?.resultTextRole ||
          (element.kind === "text"
            ? getCanvasTextRole(element.textRole)
            : "general");
        const pendingTextVersion = shouldCreatePendingTextResult
          ? getNextTextResultVersion({
              elements: workingElements,
              sourceId: element.id,
              resultTextRole: pendingTextRole,
            })
          : undefined;
        const pendingTextRoleConfig = getCanvasTextRoleConfig(pendingTextRole);
        const pendingSourceRole =
          element.kind === "text" ? getCanvasTextRole(element.textRole) : undefined;
        const pendingTextPrompt =
          options?.intentOverride?.instruction || prompt;
        const pendingTextTitle =
          pendingTextRole === "character" && options?.actionLabel
            ? options.actionLabel
            : pendingTextRoleConfig.title;
        const pendingTextBaseMeta: CanvasTextMeta | undefined =
          shouldCreatePendingTextResult
            ? {
                title:
                  pendingTextVersion && pendingTextVersion > 1
                    ? `${pendingTextTitle} v${pendingTextVersion}`
                    : pendingTextTitle,
                chapterNo: getNextTextChapterNo({
                  source: element,
                  resultTextRole: pendingTextRole,
                  instruction: pendingTextPrompt,
                }),
                version: pendingTextVersion,
                sourceNodeId: element.id,
                sourceRole: pendingSourceRole,
                parentNodeId: element.id,
                sourceRunId: createCanvasAgentRunId(),
              }
            : undefined;
        const pendingTextResultNode = shouldCreatePendingTextResult
          ? ({
              ...createTextResultNode({
                source: element,
                text: "",
                prompt: pendingTextPrompt,
                modelRef,
                position: getCanvasHierarchicalTextResultPosition({
                  elements: workingElements,
                  edges: workingEdges,
                  source: element,
                }),
                textRole: pendingTextRole,
                meta: pendingTextBaseMeta,
              }),
              status: "generating",
            } satisfies CanvasTextElement)
          : null;
        const pendingTextSourceId = pendingTextResultNode ? element.id : null;

        if (pendingTextResultNode) {
          setPendingTextSourceIds((current) => {
            const next = new Set(current);
            next.add(element.id);
            return next;
          });
          commitCanvas((current) =>
            appendResultNodeFromSources({
              elements: mergeElementsWithUpdates({
                currentElements: current.elements,
                plannedElements: workingElements,
              }),
              edges: current.edges,
              sources: [element],
              result: pendingTextResultNode,
            }),
          );
        } else {
          patchElementDraft(element.id, {
            status: "generating",
            error: undefined,
            modelRef,
          } as Partial<CanvasElement>);
        }

        try {
          appendAiMessage(
            "assistant",
            getCanvasBrainTextGeneratingMessage({
              generationMode: options?.generationMode,
            }),
          );
          const execution = await executeCanvasBrainTextNode({
            prompt,
            element,
            sourceElements,
            provider: modelEntry.provider,
            model: modelEntry.model,
            intentOverride: options?.intentOverride,
            resultTextRole: options?.resultTextRole,
            generationMode: options?.generationMode,
          });

          if (execution.kind === "empty-material") {
            const errorMessage = "当前节点没有可用于生成的素材内容。";
            const updates = new Map<string, Partial<CanvasElement>>([
              [
                element.id,
                {
                  status: "failed",
                  error: errorMessage,
                } as Partial<CanvasElement>,
              ],
            ]);
            if (pendingTextResultNode) {
              updates.set(pendingTextResultNode.id, {
                status: "failed",
                error: errorMessage,
              } as Partial<CanvasElement>);
            }
            commitCanvas((current) => ({
              elements: mergeElementsWithUpdates({
                currentElements: current.elements,
                plannedElements: workingElements,
                updatesById: updates,
              }),
              edges: current.edges,
            }));
            appendAiMessage("assistant", execution.message);
            return;
          }

          if (execution.kind === "media") {
            const intent = execution.intent;

            const outputModelEntry = getModelEntryForKind(
              getCanvasModelKindForOutput(intent.outputKind),
            );

            if (!outputModelEntry?.provider) {
              const message = getCanvasBrainMissingModelMessage(intent.outputKind);
              patchElementDraft(element.id, {
                status: "failed",
                error: message,
              } as Partial<CanvasElement>);
              appendAiMessage("assistant", message);
              return;
            }

            const resultNode = createResultPlaceholder({
              source: element,
              kind: intent.outputKind,
              prompt: execution.visiblePrompt,
              modelRef: outputModelEntry.ref,
            });

            commitCanvas((current) =>
              appendResultNodeFromSources({
                elements: mergeElementsWithUpdates({
                  currentElements: current.elements,
                  plannedElements: workingElements,
                  updatesById: new Map([
                    [element.id, getCanvasBrainReadyElementPatch(modelRef)],
                  ]),
                }),
                edges: current.edges,
                sources: [element, ...sourceElements],
                result: resultNode,
              }),
            );
            setSelectedId(resultNode.id);

            if (intent.outputKind === "image") {
              try {
                appendAiMessage(
                  "assistant",
                  getCanvasBrainGeneratingMessage({
                    kind: "image",
                    hasMaterialContext: true,
                  }),
                );
                const patch = await executeCanvasBrainMediaGeneration({
                  kind: "image",
                  prompt: execution.generationPrompt,
                  referenceImageUrls: getCanvasReferenceImageUrls([
                    element,
                    ...sourceElements,
                  ]),
                  provider: outputModelEntry.provider,
                  model: outputModelEntry.model,
                  promptProvider: getResolvedBrainModelEntry()?.provider,
                  promptModel: getResolvedBrainModelEntry()?.model,
                  element: resultNode,
                  padding: NODE_PADDING,
                  fallbackSize: {
                    width: DEFAULT_NODE_WIDTH,
                    height: DEFAULT_NODE_HEIGHT,
                  },
                });

                patchElementDraft(resultNode.id, patch);
                appendAiMessage(
                  "assistant",
                  getCanvasBrainDoneMessage({
                    kind: "image",
                    createdResult: true,
                  }),
                );
              } catch (error) {
                const detail = error instanceof Error ? error.message : "图片生成失败";
                const message = getCanvasBrainFailureMessage({
                  kind: "image",
                  detail,
                });
                patchElementDraft(resultNode.id, {
                  status: "failed",
                  error: message,
                } as Partial<CanvasElement>);
                appendAiMessage("assistant", message);
              }
              return;
            }

            if (intent.outputKind === "video") {
              try {
                appendAiMessage(
                  "assistant",
                  getCanvasBrainGeneratingMessage({
                    kind: "video",
                    hasMaterialContext: true,
                  }),
                );
                const patch = await executeCanvasBrainMediaGeneration({
                  kind: "video",
                  prompt: execution.generationPrompt,
                  provider: outputModelEntry.provider,
                  model: outputModelEntry.model,
                  element: resultNode,
                  padding: NODE_PADDING,
                  fallbackSize: {
                    width: DEFAULT_NODE_WIDTH,
                    height: DEFAULT_NODE_HEIGHT,
                  },
                });

                patchElementDraft(resultNode.id, patch);
                appendAiMessage(
                  "assistant",
                  getCanvasBrainDoneMessage({
                    kind: "video",
                    createdResult: true,
                  }),
                );
              } catch (error) {
                const detail = error instanceof Error ? error.message : "视频生成失败";
                const message = getCanvasBrainFailureMessage({
                  kind: "video",
                  detail,
                });
                patchElementDraft(resultNode.id, {
                  status: "failed",
                  error: message,
                } as Partial<CanvasElement>);
                appendAiMessage("assistant", message);
              }
              return;
            }

            appendAiMessage("assistant", "我已为这次创作准备好新的结果素材。");
            return;
          }

          if (execution.shouldUpdateCurrent) {
            const previousText = element.kind === "text" ? element.text : "";
            const previousRevisions =
              element.kind === "text" ? element.meta?.revisions || [] : [];
            const shouldSaveRevision =
              element.kind === "text" &&
              previousText.trim().length > 0 &&
              previousText !== execution.content;
            const nextTextMeta =
              element.kind === "text"
                ? {
                    ...(element.meta || {}),
                    ...(execution.meta || {}),
                    revisions: shouldSaveRevision
                      ? [
                          {
                            id: `rev_${Date.now()}`,
                            text: previousText,
                            createdAt: new Date().toISOString(),
                            label: options?.actionLabel
                              ? `${options.actionLabel}前`
                              : "上一版",
                            modelRef,
                          },
                          ...previousRevisions,
                        ].slice(0, 8)
                      : previousRevisions,
                  }
                : execution.meta;

            commitCanvas((current) => ({
              elements: mergeElementsWithUpdates({
                currentElements: current.elements,
                plannedElements: workingElements,
                updatesById: new Map([
                  [
                    element.id,
                    {
                      text: execution.content,
                      meta: nextTextMeta,
                      ...getCanvasBrainReadyElementPatch(modelRef),
                    },
                  ],
                ]),
              }),
              edges: current.edges,
            }));
            appendAiMessage("assistant", getCanvasBrainTextDoneMessage(false));
            return;
          }

          if (pendingTextResultNode) {
            commitCanvas((current) => ({
              elements: mergeElementsWithUpdates({
                currentElements: current.elements,
                plannedElements: workingElements,
                updatesById: new Map([
                  [element.id, getCanvasBrainReadyElementPatch(modelRef)],
                  [
                    pendingTextResultNode.id,
                    {
                      text: execution.content,
                      meta: {
                        ...(pendingTextBaseMeta || {}),
                        ...(execution.meta || {}),
                        title:
                          execution.meta?.title ||
                          pendingTextBaseMeta?.title ||
                          pendingTextRoleConfig.title,
                      },
                      status: "done",
                      error: undefined,
                    } as Partial<CanvasElement>,
                  ],
                ]),
              }),
              edges: current.edges,
            }));
            setSelectedId(pendingTextResultNode.id);
            appendAiMessage("assistant", getCanvasBrainTextDoneMessage(true));
            return;
          }

          const resultTextRole = pendingTextRole;
          const resultVersion = getNextTextResultVersion({
            elements: workingElements,
            sourceId: element.id,
            resultTextRole,
          });
          const resultRoleConfig = getCanvasTextRoleConfig(resultTextRole);
          const sourceRole = pendingSourceRole;
          const resultNode = createTextResultNode({
            source: element,
            text: execution.content,
            prompt: execution.intent.instruction || prompt,
            modelRef,
            position: getCanvasHierarchicalTextResultPosition({
              elements: workingElements,
              edges: workingEdges,
              source: element,
            }),
            textRole: resultTextRole,
            meta: {
              ...(execution.meta || {}),
              title:
                execution.meta?.title ||
                (resultVersion > 1
                  ? `${resultRoleConfig.title} v${resultVersion}`
                  : resultRoleConfig.title),
              chapterNo: getNextTextChapterNo({
                source: element,
                resultTextRole,
                instruction: execution.intent.instruction || prompt,
              }),
              version: resultVersion,
              sourceNodeId: element.id,
              sourceRole,
              parentNodeId: element.id,
              sourceRunId: createCanvasAgentRunId(),
            },
          });
          commitCanvas((current) =>
            appendResultNodeFromSources({
              elements: mergeElementsWithUpdates({
                currentElements: current.elements,
                plannedElements: workingElements,
                updatesById: new Map([
                  [element.id, getCanvasBrainReadyElementPatch(modelRef)],
                ]),
              }),
              edges: current.edges,
              sources: [element],
              result: resultNode,
            }),
          );
          setSelectedId(resultNode.id);
          appendAiMessage("assistant", getCanvasBrainTextDoneMessage(true));
        } catch (error) {
          const message = error instanceof Error ? error.message : "文本生成失败";
          const updates = new Map<string, Partial<CanvasElement>>([
            [
              element.id,
              {
                status: "failed",
                error: message,
              } as Partial<CanvasElement>,
            ],
          ]);
          if (pendingTextResultNode) {
            updates.set(pendingTextResultNode.id, {
              status: "failed",
              error: message,
            } as Partial<CanvasElement>);
          }
          commitCanvas((current) => ({
            elements: mergeElementsWithUpdates({
              currentElements: current.elements,
              plannedElements: workingElements,
              updatesById: updates,
            }),
            edges: current.edges,
          }));
          appendAiMessage("assistant", message);
        } finally {
          if (pendingTextSourceId) {
            setPendingTextSourceIds((current) => {
              const next = new Set(current);
              next.delete(pendingTextSourceId);
              return next;
            });
          }
        }
        return;
      }

      const elementModelKind = getCanvasEditorModelKind(element);
      const modelEntry = getModelEntryByRef(element.modelRef, elementModelKind);
      const modelRef = modelEntry?.ref || "";

      if (!modelRef || !modelEntry?.model || !modelEntry.provider) {
        const message = `当前节点没有可用模型，请先为${getCanvasNodeEditorTitle(element)}节点配置或选择模型。`;
        patchElementDraft(element.id, {
          status: "failed",
          error: message,
        } as Partial<CanvasElement>);
        appendAiMessage("assistant", message);
        return;
      }
      const mediaSourceElements = resolveCanvasExecutionSources({
        targetId: element.id,
        elements,
        edges,
      });

      if (element.kind === "image") {
        const shouldCreateResult = hasConcreteAsset(element);
        const resultNode = shouldCreateResult
          ? createResultPlaceholder({
              source: element,
              kind: "image",
              prompt,
              modelRef,
            })
          : element;

        if (shouldCreateResult) {
          commitCanvas((current) =>
            appendResultNode({
              elements: current.elements,
              edges: current.edges,
              source: element,
              result: resultNode,
            }),
          );
          setSelectedId(resultNode.id);
        } else {
          patchElementDraft(element.id, {
            status: "generating",
            error: undefined,
            prompt,
            modelRef,
          } as Partial<CanvasElement>);
        }

        try {
          appendAiMessage(
            "assistant",
            getCanvasBrainGeneratingMessage({
              kind: "image",
              hasMaterialContext: false,
            }),
          );
          const patch = await executeCanvasBrainMediaGeneration({
            kind: "image",
            prompt,
            referenceImageUrls: getCanvasReferenceImageUrls([
              element,
              ...mediaSourceElements,
            ]),
            provider: modelEntry.provider,
            model: modelEntry.model,
            promptProvider: getResolvedBrainModelEntry()?.provider,
            promptModel: getResolvedBrainModelEntry()?.model,
            element: resultNode,
            padding: NODE_PADDING,
            fallbackSize: {
              width: DEFAULT_NODE_WIDTH,
              height: DEFAULT_NODE_HEIGHT,
            },
          });

          patchElementDraft(resultNode.id, patch);
          appendAiMessage(
            "assistant",
            getCanvasBrainDoneMessage({
              kind: "image",
              createdResult: shouldCreateResult,
            }),
          );
        } catch (error) {
          const detail = error instanceof Error ? error.message : "图片生成失败";
          const message = getCanvasBrainFailureMessage({
            kind: "image",
            detail,
          });
          patchElementDraft(resultNode.id, {
            status: "failed",
            error: message,
          } as Partial<CanvasElement>);
          appendAiMessage("assistant", message);
        }
        return;
      }

      if (element.kind === "video") {
        const shouldCreateResult = hasConcreteAsset(element);
        const resultNode = shouldCreateResult
          ? createResultPlaceholder({
              source: element,
              kind: "video",
              prompt,
              modelRef,
            })
          : element;

        if (shouldCreateResult) {
          commitCanvas((current) =>
            appendResultNode({
              elements: current.elements,
              edges: current.edges,
              source: element,
              result: resultNode,
            }),
          );
          setSelectedId(resultNode.id);
        } else {
          patchElementDraft(element.id, {
            status: "generating",
            error: undefined,
            prompt,
            modelRef,
          } as Partial<CanvasElement>);
        }

        try {
          appendAiMessage(
            "assistant",
            getCanvasBrainGeneratingMessage({
              kind: "video",
              hasMaterialContext: false,
            }),
          );
          const patch = await executeCanvasBrainMediaGeneration({
            kind: "video",
            prompt,
            provider: modelEntry.provider,
            model: modelEntry.model,
            element: resultNode,
            padding: NODE_PADDING,
            fallbackSize: {
              width: DEFAULT_NODE_WIDTH,
              height: DEFAULT_NODE_HEIGHT,
            },
          });

          patchElementDraft(resultNode.id, patch);
          appendAiMessage(
            "assistant",
            getCanvasBrainDoneMessage({
              kind: "video",
              createdResult: shouldCreateResult,
            }),
          );
        } catch (error) {
          const detail = error instanceof Error ? error.message : "视频生成失败";
          const message = getCanvasBrainFailureMessage({
            kind: "video",
            detail,
          });
          patchElementDraft(resultNode.id, {
            status: "failed",
            error: message,
          } as Partial<CanvasElement>);
          appendAiMessage("assistant", message);
        }
        return;
      }

      if (element.kind === "audio") {
        const resultNode = createResultPlaceholder({
          source: element,
          kind: "audio",
          prompt,
          modelRef,
        });
        commitCanvas((current) =>
          appendResultNode({
            elements: current.elements,
            edges: current.edges,
            source: element,
            result: resultNode,
          }),
        );
        setSelectedId(resultNode.id);
        appendAiMessage("assistant", "我已经准备好一个新的音频素材位置。");
        return;
      }

      if (element.kind === "template") {
        appendAiMessage("assistant", "模板节点会通过动作面板处理，暂不支持直接发送生成。");
      }
    },
    [
      appendAiMessage,
      commitCanvas,
      edges,
      elements,
      getModelEntryForKind,
      getModelEntryByRef,
      getResolvedBrainModelEntry,
      patchElementDraft,
      setSelectedId,
    ],
  );

  const { runProcessor } = useCanvasActionRunner({
    elements,
    edges,
    commitCanvas,
    patchElementDraft,
    setSelectedId,
    appendMessage: (content) => appendAiMessage("assistant", content),
    onWorkflowCreated: (workflowElements) => {
      const nextViewport = getViewportForElements(workflowElements, size, {
        minScale: MIN_SCALE,
        maxScale: 1,
        padding: 96,
      });
      if (nextViewport) setViewport(nextViewport);
    },
  });

  const updateSequenceTemplateProps = useCallback(
    (sourceElement: CanvasTemplateElement, nextProps: Record<string, unknown>) => {
      const jobId = typeof nextProps["jobId"] === "string" ? nextProps["jobId"] : undefined;
      commitCanvas((current) => {
        const nextElements = current.elements.map((element) => {
          if (element.kind !== "template") return element;
          if (
            element.id !== sourceElement.id &&
            (!jobId ||
              element.props?.["jobId"] !== jobId ||
              (element.templateId !== "sequence-viewer" && element.templateId !== "frame-sequence-list"))
          ) {
            return element;
          }

          return {
            ...element,
            props: {
              ...(element.props || {}),
              ...nextProps,
            },
          } as CanvasElement;
        });

        return {
          elements: nextElements,
          edges: current.edges,
        };
      });
    },
    [commitCanvas],
  );

  useEffect(() => {
    elements.forEach((element) => {
      if (element.kind !== "processor") return;
      if (
        element.width >= PROCESSOR_NODE_WIDTH &&
        element.height >= PROCESSOR_NODE_HEIGHT
      ) {
        return;
      }

      patchElementDraft(element.id, {
        x: element.x + element.width / 2 - PROCESSOR_NODE_WIDTH / 2,
        y: element.y + element.height / 2 - PROCESSOR_NODE_HEIGHT / 2,
        width: PROCESSOR_NODE_WIDTH,
        height: PROCESSOR_NODE_HEIGHT,
      } as Partial<CanvasElement>);
    });
  }, [elements, patchElementDraft]);

  useEffect(() => {
    elements.forEach((element) => {
      if (element.kind !== "template" || element.templateId !== "frame-sequence-list") return;
      if (
        element.width >= FRAME_LIST_TEMPLATE_WIDTH &&
        element.height >= FRAME_LIST_TEMPLATE_HEIGHT
      ) {
        return;
      }

      patchElementDraft(element.id, {
        x: element.x + element.width / 2 - FRAME_LIST_TEMPLATE_WIDTH / 2,
        y: element.y + element.height / 2 - FRAME_LIST_TEMPLATE_HEIGHT / 2,
        width: FRAME_LIST_TEMPLATE_WIDTH,
        height: FRAME_LIST_TEMPLATE_HEIGHT,
      } as Partial<CanvasElement>);
    });
  }, [elements, patchElementDraft]);

  const submitAiCommand = async () => {
    const command = chatInput.trim();
    if (!command || aiLoading) return;

    setChatInput("");
    appendAiMessage("user", command);
    const plannedHistory: AiMessage[] = [
      ...aiMessages,
      {
        id: getMessageId(),
        role: "user",
        content: command,
      },
    ];

    setAiLoading(true);
    try {
      let plannedInstruction = command;
      let targetElement: CanvasElement | null = null;
      let plannedIntent: CanvasActionIntent | undefined;
      let plannedSourceIds: string[] = [];
      let plannedSourceElements: CanvasElement[] = [];
      let plannedElements = elements;
      const activeBrainModelEntry = getModelEntryByRef(resolvedBrainModelRef, "text");
      const focusIds = Array.from(
        new Set([
          ...(selectedElement ? [selectedElement.id] : []),
          ...brainAttachmentIds.filter((id) =>
            elements.some((element) => element.id === id),
          ),
        ]),
      );

      if (activeBrainModelEntry?.model && activeBrainModelEntry.provider) {
        const brainResult = await runCanvasBrainTurn({
          command,
          history: plannedHistory,
          elements,
          edges,
          focusIds,
          selectedElement,
          center: worldCenter(),
          provider: activeBrainModelEntry.provider,
          model: activeBrainModelEntry.model,
        });

        if (brainResult.kind === "chat" || brainResult.kind === "clarification") {
          appendAiMessage("assistant", brainResult.message);
          return;
        }

        const preparedAction = brainResult.action;

        if (preparedAction.createdSourceElements.length > 0) {
          commitCanvas((current) => ({
            elements: mergeElementsWithUpdates({
              currentElements: current.elements,
              plannedElements: preparedAction.elements,
            }),
            edges: current.edges,
          }));
        }

        plannedElements = preparedAction.elements;
        plannedSourceElements = preparedAction.sourceElements;
        targetElement = preparedAction.targetElement;
        plannedInstruction = preparedAction.instruction;
        plannedIntent = preparedAction.intent;
        plannedSourceIds = preparedAction.sourceIds;
        appendAiMessage("assistant", brainResult.summary);
        setBrainAttachmentIds([]);
      }

      if (!targetElement && !activeBrainModelEntry) {
        appendAiMessage("assistant", "请先在右下角选择可用的文本模型作为画布大脑。");
        return;
      }

      if (targetElement) {
        setSelectedId(targetElement.id);
        appendAiMessage(
          "assistant",
          selectedElement
            ? "我会参考你选中的素材继续处理。"
            : "我会参考画布里最相关的素材继续处理。",
        );
        await generateFromSelectedNode(targetElement, plannedInstruction, {
          extraSourceIds: plannedSourceIds?.filter((id) => id !== targetElement.id),
          extraSourceElements: plannedSourceElements.filter(
            (source) => source.id !== targetElement.id,
          ),
          intentOverride: plannedIntent,
          baseElements: plannedElements,
          baseEdges: edges,
        });
        setBrainAttachmentIds([]);
        return;
      }

      const center = worldCenter();
      const element = {
        ...createTextElement(center),
        text: "",
        prompt: command,
      };
      addElement(element);
      appendAiMessage("assistant", "我先把你的想法整理成一个文本素材。");
      await generateFromSelectedNode(element, plannedInstruction);
    } catch (error) {
      const message = error instanceof Error ? error.message : "画布大脑执行失败";
      appendAiMessage("assistant", message);
    } finally {
      setAiLoading(false);
    }
  };

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

          {visibleEdges.map(({ edge, source, target }) => (
            <MemoCanvasEdgeNode
              key={edge.id}
              source={source}
              target={target}
              selected={edge.id === selectedEdgeId}
              onSelect={() => {
                setSelectedEdgeId(edge.id);
                setSelectedId(null);
              }}
              onDelete={() => deleteEdge(edge.id)}
            />
          ))}

          {draftEdge && <DraftEdgeNode edge={draftEdge} />}

          {visibleElements.map((element) => (
            <MemoCanvasElementNode
              key={element.id}
              element={element}
              selected={element.id === selectedId || element.id === draftEdge?.sourceId}
              onSelect={() => {
                setSelectedId(element.id);
                setSelectedEdgeId(null);
              }}
              onHover={() => setNodeHover(element.id)}
              onLeave={() => clearNodeHover(element.id)}
              onContextMenu={(event) => openNodeContextMenu(element.id, event)}
              dragging={element.id === draggingElementId}
              onDragStart={() => beginElementDrag(element.id)}
              onPreviewChange={(updates) => previewUpdateElement(element.id, updates)}
              onChange={(updates) => finishElementDrag(element.id, updates)}
              onUploadImage={requestImageUpload}
              onUploadVideo={requestVideoUpload}
              onUploadAudio={requestAudioUpload}
              onPreview={openTextPreview}
            />
          ))}

          {visibleElements.map((element) => {
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

      {processorOverlayElements.map((element) => (
          <CanvasProcessorNodeOverlay
            key={`processor_overlay_${element.id}`}
            element={element}
            viewport={viewport}
            onSelect={() => {
              setSelectedId(element.id);
              setSelectedEdgeId(null);
            }}
            onMove={(updates) =>
              patchElementDraft(element.id, updates as Partial<CanvasElement>)
            }
            onRun={(config) => void runProcessor(element, config)}
          />
      ))}

      {frameSequenceOverlayElements.map((element) => (
          <CanvasSequenceTemplateOverlay
            key={`sequence_overlay_${element.id}`}
            element={element}
            viewport={viewport}
            imageModelEntry={getModelEntryForKind("image")}
            onSelect={() => {
              setSelectedId(element.id);
              setSelectedEdgeId(null);
            }}
            onMove={(updates) =>
              patchElementDraft(element.id, updates as Partial<CanvasElement>)
            }
            onPropsChange={(props) =>
              updateSequenceTemplateProps(element, props)
            }
            onMessage={(message) => appendAiMessage("assistant", message)}
          />
      ))}

      {selectedElement && selectedElement.kind !== "processor" && selectedEditorFrame && (
        <CanvasNodeEditorPanel
          element={selectedElement}
          frame={selectedEditorFrame}
          modelOptions={modelOptions}
          modelValue={selectedModelValue}
          onTextChange={(text) =>
            patchElementDraft(selectedElement.id, { text } as Partial<CanvasElement>)
          }
          onPromptChange={(prompt) =>
            patchElementDraft(selectedElement.id, { prompt })
          }
          onModelChange={(modelRef) =>
            patchElementDraft(selectedElement.id, { modelRef })
          }
          onRestorePreviousText={
            selectedElement.kind === "text"
              ? () => {
                  const [previousRevision, ...remainingRevisions] =
                    selectedElement.meta?.revisions || [];
                  if (!previousRevision) return;

                  patchElementDraft(selectedElement.id, {
                    text: previousRevision.text,
                    status: "done",
                    error: undefined,
                    meta: {
                      ...(selectedElement.meta || {}),
                      revisions: remainingRevisions,
                    },
                  } as Partial<CanvasElement>);
              }
              : undefined
          }
          onOpenPreview={
            selectedElement.kind === "text"
              ? () => openTextPreview(selectedElement)
              : undefined
          }
          disabled={pendingTextSourceIds.has(selectedElement.id)}
          onContextMenu={
            selectedElement.status === "generating"
              ? undefined
              : (event) => openNodeDomContextMenu(selectedElement.id, event)
          }
          onGenerate={(options?: CanvasNodeGenerateOptions) => {
            const instruction = options?.instruction?.trim();
            const elementForGeneration =
              selectedElement.kind === "text" && options?.sourceText !== undefined
                ? {
                    ...selectedElement,
                    text: options.sourceText,
                  }
                : selectedElement;
            const baseElements =
              selectedElement.kind === "text" && options?.sourceText !== undefined
                ? elements.map((element) =>
                    element.id === selectedElement.id
                      ? ({
                          ...element,
                          text: options.sourceText,
                        } as CanvasElement)
                      : element,
                  )
                : undefined;
            const executionOptions =
                  selectedElement.kind === "text" && instruction && options?.placement
                ? {
                    baseElements,
                    resultTextRole: options.resultTextRole,
                    generationMode: options.generationMode,
                    actionLabel: options.actionLabel,
                    intentOverride: {
                      outputKind: "text" as const,
                      placement: options.placement,
                      instruction,
                    },
                  }
                : undefined;

            void generateFromSelectedNode(
              elementForGeneration,
              instruction || undefined,
              executionOptions,
            );
          }}
        />
      )}

      {nodeContextMenu && contextMenuElement && (
        <CanvasNodeContextMenu
          x={nodeContextMenu.x}
          y={nodeContextMenu.y}
          viewportWidth={size.width}
          viewportHeight={size.height}
          title={getCanvasNodeEditorTitle(contextMenuElement)}
          canPreview={contextMenuElement.kind === "text"}
          onPreview={
            contextMenuElement.kind === "text"
              ? () => openTextPreview(contextMenuElement)
              : undefined
          }
          onDelete={deleteNodeFromContextMenu}
          onClose={closeNodeContextMenu}
        />
      )}

      {previewTextElement && (
        <CanvasTextPreviewModal
          element={previewTextElement}
          onClose={() => setPreviewTextElementId(null)}
        />
      )}

      <CanvasSideToolbar
        onAddTextRole={addTextRole}
        onAddImage={addImagePlaceholder}
        onAddVideo={addVideoPlaceholder}
        onAddAudio={addAudioPlaceholder}
        onImport={() => importInputRef.current?.click()}
        onOpenApiConfig={() => setApiConfigOpen(true)}
      />

      <CanvasTopToolbar
        panelClassName={darkPanel}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        viewport={viewport}
        scaleOptions={SCALE_OPTIONS}
        onUndo={undo}
        onRedo={redo}
        onClear={clearCanvas}
        onExportJson={exportJson}
        onExportPng={exportPng}
        onSetCanvasScale={setCanvasScale}
      />

      <button
        type="button"
        onClick={() => setChatOpen((open) => !open)}
        className="fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.12] text-white shadow-2xl shadow-black/35 backdrop-blur-2xl transition hover:-translate-y-0.5 hover:bg-white/[0.18]"
        aria-label="打开 AI 助手"
      >
        <Bot className="h-6 w-6" />
      </button>

      {chatOpen && (
        <CanvasBrainPanel
          panelClassName={darkPanel}
          messages={aiMessages}
          input={chatInput}
          loading={aiLoading}
          modelValue={resolvedBrainModelRef}
          modelOptions={brainModelOptions}
          attachmentCount={brainAttachmentIds.length}
          canSend={!aiLoading && Boolean(chatInput.trim()) && hasBrainModel}
          onInputChange={setChatInput}
          onModelChange={setBrainModelRef}
          onClearMessages={() => setAiMessages([])}
          onUploadImage={() => brainImageInputRef.current?.click()}
          onSubmit={() => void submitAiCommand()}
        />
      )}

      {apiConfigOpen && (
        <CanvasApiConfigModal
          panelClassName={darkPanel}
          endpoint={apiEndpoint}
          apiKey={apiKey}
          onEndpointChange={setApiEndpoint}
          onApiKeyChange={setApiKey}
          onClose={() => setApiConfigOpen(false)}
        />
      )}

      <input
        ref={brainImageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(event) => {
          void handleBrainImageFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
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

function CanvasNodeContextMenu({
  x,
  y,
  viewportWidth,
  viewportHeight,
  title,
  canPreview,
  onPreview,
  onDelete,
  onClose,
}: {
  x: number;
  y: number;
  viewportWidth: number;
  viewportHeight: number;
  title: string;
  canPreview?: boolean;
  onPreview?: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const menuWidth = 184;
  const menuHeight = canPreview ? 140 : 96;
  const left = Math.min(Math.max(8, x), Math.max(8, viewportWidth - menuWidth - 8));
  const top = Math.min(Math.max(8, y), Math.max(8, viewportHeight - menuHeight - 8));

  useEffect(() => {
    const handlePointerDown = () => onClose();

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [onClose]);

  return (
    <div
      className="fixed z-[90] w-[184px] overflow-hidden rounded-xl border border-white/[0.1] bg-[#02070b]/[0.94] p-1.5 text-white shadow-[0_24px_70px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-2xl"
      style={{ left, top }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="truncate px-2.5 pb-1.5 pt-1 text-[11px] font-medium text-white/42">
        {title}
      </div>
      {canPreview && onPreview && (
        <button
          type="button"
          onClick={onPreview}
          className="flex h-10 w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 text-left text-[12px] font-semibold text-white/78 transition-colors duration-200 hover:bg-white/[0.1] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/15"
        >
          <Eye className="h-4 w-4 shrink-0" />
          预览内容
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        className="flex h-10 w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 text-left text-[12px] font-semibold text-rose-100/90 transition-colors duration-200 hover:bg-rose-400/[0.14] hover:text-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-200/20"
      >
        <Trash2 className="h-4 w-4 shrink-0" />
        删除节点
      </button>
    </div>
  );
}

function CanvasTextPreviewModal({
  element,
  onClose,
}: {
  element: CanvasTextElement;
  onClose: () => void;
}) {
  const badge = getTextNodeBadge(element);
  const content = element.text.trim() || "暂无内容";

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/42 px-5 py-7 backdrop-blur-[6px]"
      onMouseDown={onClose}
    >
      <section
        className="flex h-[min(480px,calc(100vh-56px))] min-h-[min(400px,calc(100vh-56px))] w-[min(768px,calc(100vw-40px))] min-w-[min(600px,calc(100vw-40px))] flex-col overflow-hidden rounded-[18px] border border-white/[0.1] bg-[#02070b]/[0.96] text-white shadow-[0_28px_80px_rgba(0,0,0,0.58),inset_0_1px_0_rgba(255,255,255,0.07)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-white/[0.08] px-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="h-2 w-2 shrink-0 rounded-full shadow-[0_0_14px_currentColor]"
              style={{ color: badge.color, backgroundColor: badge.color }}
            />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-white/88">
                {badge.title}
              </div>
              <div className="text-[11px] text-white/38">
                {content.length} 字
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-white/58 transition-colors duration-200 hover:bg-white/[0.1] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/15"
            aria-label="关闭预览"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 [scrollbar-color:rgba(255,255,255,0.22)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5">
          <article className="mx-auto max-w-[58ch] whitespace-pre-wrap text-[14px] leading-7 text-white/84">
            {content}
          </article>
        </div>
      </section>
    </div>
  );
}

function CanvasElementNode({
  element,
  selected,
  dragging,
  onSelect,
  onHover,
  onLeave,
  onContextMenu,
  onDragStart,
  onPreviewChange,
  onChange,
  onUploadImage,
  onUploadVideo,
  onUploadAudio,
  onPreview,
}: CanvasElementNodeProps) {
  const dragPreviewFrameRef = useRef<number | null>(null);
  const dragPreviewUpdatesRef = useRef<Partial<CanvasElement> | null>(null);

  useEffect(() => {
    return () => {
      if (dragPreviewFrameRef.current !== null) {
        cancelAnimationFrame(dragPreviewFrameRef.current);
      }
    };
  }, []);

  const schedulePreviewChange = useCallback(
    (updates: Partial<CanvasElement>) => {
      dragPreviewUpdatesRef.current = updates;
      if (dragPreviewFrameRef.current !== null) return;

      dragPreviewFrameRef.current = requestAnimationFrame(() => {
        dragPreviewFrameRef.current = null;
        const pendingUpdates = dragPreviewUpdatesRef.current;
        dragPreviewUpdatesRef.current = null;
        if (pendingUpdates) {
          onPreviewChange(pendingUpdates);
        }
      });
    },
    [onPreviewChange],
  );

  const commonProps: CanvasNodeCommonProps = {
    id: element.id,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    rotation: element.rotation,
    draggable: true,
    onClick: element.status === "generating" ? undefined : onSelect,
    onTap: element.status === "generating" ? undefined : onSelect,
    onMouseEnter: onHover,
    onMouseLeave: onLeave,
    onContextMenu:
      element.status === "generating"
        ? undefined
        : onContextMenu,
    onDragStart,
    onDragMove: (event: KonvaEventObject<DragEvent>) => {
      schedulePreviewChange({
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

  const rendererProps = {
    selected,
    dragging,
    commonProps,
    onUploadImage,
    onUploadVideo,
    onUploadAudio,
  };

  switch (element.kind) {
    case "text":
      return (
        <CanvasTextNode
          {...rendererProps}
          element={element}
          onPreview={() => onPreview(element)}
        />
      );
    case "shape":
      return <CanvasShapeNode {...rendererProps} element={element} />;
    case "image":
      return <CanvasImageNode {...rendererProps} element={element} />;
    case "video":
    case "audio":
      return <CanvasMediaNode {...rendererProps} element={element} />;
    case "template":
      return <CanvasTemplateNode {...rendererProps} element={element} />;
    case "processor":
      return <CanvasProcessorNode {...rendererProps} element={element} />;
    default:
      return null;
  }
}

const MemoCanvasElementNode = memo(
  CanvasElementNode,
  (previous, next) =>
    previous.element === next.element &&
    previous.selected === next.selected &&
    previous.dragging === next.dragging,
);

function CanvasTextNode({
  element,
  selected,
  dragging,
  commonProps,
  onPreview,
}: CanvasNodeRendererProps<CanvasTextElement>) {
  const badge = getTextNodeBadge(element);
  const showGeneratingPreview =
    element.status === "generating" &&
    element.text.trim().length === 0 &&
    Boolean(element.meta?.sourceNodeId);

  return (
    <CanvasNodeShell
      commonProps={commonProps}
      width={element.width}
      height={element.height}
      selected={selected}
      dragging={dragging}
      badge={badge}
      onDblClick={onPreview}
      onDblTap={onPreview}
    >
      {showGeneratingPreview ? (
        <CanvasTextGeneratingPreview
          width={element.width}
          height={element.height}
          title={badge.title}
        />
      ) : element.status === "failed" ? (
        <Text
          x={NODE_PADDING + 8}
          y={NODE_PADDING + 18}
          width={Math.max(24, element.width - NODE_PADDING * 2 - 16)}
          text={element.error || "生成失败"}
          fill="#fecaca"
          fontSize={14}
          lineHeight={1.5}
          fontStyle="600"
          align="left"
          verticalAlign="top"
          wrap="char"
          ellipsis
        />
      ) : !selected && (
        <Group
          clipX={NODE_PADDING + 8}
          clipY={NODE_PADDING + 8}
          clipWidth={Math.max(24, element.width - NODE_PADDING * 2 - 16)}
          clipHeight={Math.max(24, element.height - NODE_PADDING * 2 - 16)}
        >
          <Text
            x={NODE_PADDING + 8}
            y={NODE_PADDING + 8}
            width={Math.max(24, element.width - NODE_PADDING * 2 - 16)}
            height={Math.max(24, element.height - NODE_PADDING * 2 - 16)}
            text={element.text}
            fill="#f8fafc"
            fontSize={14}
            lineHeight={1.45}
            fontStyle="400"
            align="left"
            verticalAlign="top"
            wrap="char"
            ellipsis
          />
        </Group>
      )}
    </CanvasNodeShell>
  );
}

function CanvasTextGeneratingPreview({
  width,
  height,
  title,
}: {
  width: number;
  height: number;
  title: string;
}) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTick((current) => (current + 1) % 4);
    }, 420);

    return () => window.clearInterval(timer);
  }, []);

  const dots = ".".repeat(tick || 1);
  const contentWidth = Math.max(24, width - NODE_PADDING * 2 - 16);
  const lineWidths = [0.82, 0.94, 0.68, 0.88, 0.52];

  return (
    <Group>
      <Text
        x={NODE_PADDING + 8}
        y={NODE_PADDING + 14}
        width={contentWidth}
        text={`${title}生成中${dots}`}
        fill="rgba(255,255,255,0.76)"
        fontSize={14}
        fontStyle="600"
        wrap="none"
        ellipsis
      />
      {lineWidths.map((ratio, index) => {
        const active = (tick + index) % 4 === 0;

        return (
          <Rect
            key={`${ratio}_${index}`}
            x={NODE_PADDING + 8}
            y={NODE_PADDING + 52 + index * 25}
            width={contentWidth * ratio}
            height={10}
            fill={active ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)"}
            cornerRadius={5}
          />
        );
      })}
      <Text
        x={NODE_PADDING + 8}
        y={Math.max(NODE_PADDING + 178, height - NODE_PADDING - 42)}
        width={contentWidth}
        text="创作组正在处理，请稍等"
        fill="rgba(255,255,255,0.38)"
        fontSize={12}
        wrap="none"
        ellipsis
      />
    </Group>
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
        text={
          element.status === "generating"
            ? "生成中..."
            : element.status === "failed"
              ? element.error || "生成失败"
              : element.label
        }
        align="center"
        fill={element.status === "failed" ? "#fecaca" : "#f8fafc"}
        fontSize={18}
        fontStyle="600"
        ellipsis
        wrap="none"
      />
      {!isAudio && !element.src && element.status !== "generating" && (
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
        text={
          element.status === "generating"
            ? "生成中..."
            : element.status === "failed"
              ? element.error || "生成失败"
              : element.label || "图像素材"
        }
        align="center"
        fill={element.status === "failed" ? "#fecaca" : "#f8fafc"}
        fontSize={16}
        fontStyle="600"
        ellipsis
        wrap="none"
      />
      {element.status !== "generating" && (
        <CanvasUploadButton
          x={element.width / 2 - 68}
          y={element.height / 2}
          label="上传图片"
          onClick={() => onUploadImage(element)}
        />
      )}
    </CanvasNodeShell>
  );
}

function CanvasTemplateNode({
  element,
  selected,
  dragging,
  commonProps,
}: CanvasNodeRendererProps<CanvasTemplateElement>) {
  const content = renderCanvasTemplateContent(element);

  return (
    <CanvasNodeShell
      commonProps={commonProps}
      width={element.width}
      height={element.height}
      selected={selected}
      dragging={dragging}
    >
      {content || (
        <Text
          x={NODE_PADDING}
          y={element.height / 2 - 10}
          width={Math.max(24, element.width - NODE_PADDING * 2)}
          text={element.title || "未知模板"}
          align="center"
          fill="rgba(255,255,255,0.55)"
          fontSize={14}
          fontStyle="600"
          listening={false}
        />
      )}
    </CanvasNodeShell>
  );
}

function CanvasProcessorNode({
  element,
  selected,
  dragging,
  commonProps,
}: CanvasNodeRendererProps<CanvasProcessorElement>) {
  const statusText =
    element.status === "generating"
      ? "处理中"
      : element.status === "failed"
        ? "处理失败"
        : "可重新生成";
  const keepEvery = Number(element.config.keepEvery || 2);
  const matteMode = String(element.config.matteMode || "chroma");

  return (
    <CanvasNodeShell
      commonProps={commonProps}
      width={element.width}
      height={element.height}
      selected={selected}
      dragging={dragging}
    >
      <Text
        x={24}
        y={28}
        width={Math.max(24, element.width - 48)}
        text={element.title}
        fill="#f8fafc"
        fontSize={18}
        fontStyle="700"
        listening={false}
      />
      <Text
        x={24}
        y={64}
        width={Math.max(24, element.width - 48)}
        text={`${statusText} · ${matteMode} · 每 ${keepEvery} 帧`}
        fill={element.status === "failed" ? "#fecaca" : "rgba(255,255,255,0.58)"}
        fontSize={13}
        fontStyle="600"
        listening={false}
      />
      <Rect
        x={24}
        y={112}
        width={Math.max(24, element.width - 48)}
        height={88}
        fill="rgba(255,255,255,0.04)"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={1}
        cornerRadius={8}
        listening={false}
      />
      <Text
        x={40}
        y={142}
        width={Math.max(24, element.width - 80)}
        text={element.error || "选中节点可调整抠图参数并重新生成"}
        align="center"
        fill="rgba(255,255,255,0.42)"
        fontSize={13}
        fontStyle="600"
        listening={false}
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
  badge,
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
  badge?: CanvasNodeBadge;
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
      {badge && (
        <Group x={2} y={-24} listening={false}>
          <Circle
            x={5}
            y={10}
            radius={5}
            fill={badge.color}
            shadowColor={badge.color}
            shadowBlur={8}
            shadowOpacity={0.4}
          />
          <Text
            x={17}
            y={3}
            width={Math.max(80, width - 24)}
            text={badge.title}
            fill="rgba(255,255,255,0.74)"
            fontSize={12}
            fontStyle="600"
            wrap="none"
            ellipsis
            listening={false}
          />
        </Group>
      )}
      <Rect
        width={width}
        height={height}
        fill="#111214"
        stroke={selected ? "rgba(255,255,255,0.34)" : "rgba(255,255,255,0.06)"}
        strokeWidth={selected ? 1.5 : 1}
        cornerRadius={NODE_RADIUS}
        shadowColor="rgba(0,0,0,0.45)"
        shadowBlur={selected && !dragging ? 16 : 0}
        shadowOffsetY={selected && !dragging ? 10 : 0}
        shadowOpacity={selected && !dragging ? 0.32 : 0}
      />
      {selected && (
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
      )}
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
