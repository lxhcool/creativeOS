"use client";

import {
  Bot,
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
  createImageElement,
  createMediaElement,
  createTextElement,
  isCanvasEdge,
  isCanvasElement,
} from "@/entities/canvas/lib/factory";
import { getCanvasActionsForElement } from "@/features/canvas-actions";
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
  getConnectorPathData,
  getInputPortPosition,
  getOutputPortPosition,
  getTextNodeSize,
  getViewportForElements,
  isPointInsideElement,
  useViewportSize,
} from "../lib/geometry";
import { useCanvasDocument } from "../lib/useCanvasDocument";
import { useCanvasActionRunner } from "../lib/useCanvasActionRunner";
import { useCanvasModelSelection } from "../lib/useCanvasModelSelection";
import {
  darkPanel,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  DOT_GRID_SIZE,
  MAX_SCALE,
  MIN_SCALE,
  NODE_PADDING,
  NODE_RADIUS,
  PORT_RADIUS,
  SCALE_OPTIONS,
  VIDEO_CONTROLS_HIDE_DELAY,
} from "../model/constants";
import { CanvasNodeEditorPanel } from "./CanvasNodeEditorPanel";
import { CanvasProcessorNodeOverlay } from "./CanvasProcessorNodeOverlay";
import { CanvasSequenceTemplateOverlay } from "./CanvasSequenceTemplateOverlay";
import {
  CanvasBrainPanel,
  type CanvasBrainChatMessage,
} from "./CanvasBrainPanel";
import { CanvasApiConfigModal } from "./CanvasApiConfigModal";
import { CanvasNodeActionToolbar } from "./CanvasNodeActionToolbar";
import { CanvasSideToolbar } from "./CanvasSideToolbar";
import { CanvasTopToolbar } from "./CanvasTopToolbar";
import type {
  CanvasEdge,
  CanvasElement,
  CanvasElementKind,
  CanvasImageElement,
  CanvasMediaElement,
  CanvasProcessorElement,
  CanvasProjectExport,
  CanvasShapeElement,
  CanvasTemplateElement,
  CanvasTextElement,
  CanvasViewport,
} from "@/entities/canvas/model/types";
import type { CanvasDraftEdge } from "../model/types";
import { renderCanvasTemplateContent } from "../templates/registry";

type AiMessage = CanvasBrainChatMessage;

type CanvasExecutionOptions = {
  extraSourceIds?: string[];
  extraSourceElements?: CanvasElement[];
  intentOverride?: CanvasActionIntent;
  baseElements?: CanvasElement[];
  baseEdges?: CanvasEdge[];
};

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

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  );
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
    commitElements,
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
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([
    {
      id: getMessageId(),
      role: "assistant",
      content: "我是画布大脑。可以选择素材、协调上下文，并把你的意图转成画布操作。",
    },
  ]);
  const selectedElement =
    selectedId !== null
      ? elements.find((element) => element.id === selectedId) || null
      : null;
  const selectedElementActions = selectedElement
    ? getCanvasActionsForElement(selectedElement)
    : [];
  const selectedElementIsGenerating = selectedElement?.status === "generating";
  const selectedEditorFrame = selectedElement
    ? getCanvasNodeEditorFrame(selectedElement, viewport, size)
    : null;
  const selectedToolbarFrame = selectedElement
    ? {
        left: viewport.x + (selectedElement.x + selectedElement.width / 2) * viewport.scale,
        top: Math.max(16, viewport.y + selectedElement.y * viewport.scale - 64),
      }
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

  const worldCenter = useCallback(() => {
    return {
      x: (size.width / 2 - viewport.x) / viewport.scale,
      y: (size.height / 2 - viewport.y) / viewport.scale,
    };
  }, [size.height, size.width, viewport.scale, viewport.x, viewport.y]);

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

      if ((event.key === "Backspace" || event.key === "Delete") && selectedEdgeId) {
        event.preventDefault();
        deleteEdge(selectedEdgeId);
        return;
      }

      if ((event.key === "Backspace" || event.key === "Delete") && selectedId) {
        event.preventDefault();
        deleteElement(selectedId);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteEdge, deleteElement, redo, selectedEdgeId, selectedId, undo]);

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
          appendAiMessage("assistant", "请先配置可用的文本模型。");
          return;
        }

        patchElementDraft(element.id, {
          status: "generating",
          error: undefined,
          modelRef,
        } as Partial<CanvasElement>);

        try {
          const execution = await executeCanvasBrainTextNode({
            prompt,
            element,
            sourceElements,
            provider: modelEntry.provider,
            model: modelEntry.model,
            intentOverride: options?.intentOverride,
          });

          if (execution.kind === "empty-material") {
            patchElementDraft(element.id, {
              status: "failed",
              error: "当前节点没有可用于生成的素材内容。",
            } as Partial<CanvasElement>);
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
            const next = appendResultNodeFromSources({
              elements: workingElements.map((entry) =>
                entry.id === element.id
                  ? ({ ...entry, ...getCanvasBrainReadyElementPatch(modelRef) } as CanvasElement)
                  : entry,
              ),
              edges: workingEdges,
              sources: [element, ...sourceElements],
              result: resultNode,
            });

            commitCanvas(next);
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
            commitElements(
              workingElements.map((entry) =>
                entry.id === element.id
                  ? ({
                      ...entry,
                      text: execution.content,
                      ...getCanvasBrainReadyElementPatch(modelRef),
                    } as CanvasElement)
                  : entry,
              ),
            );
            appendAiMessage("assistant", getCanvasBrainTextDoneMessage(false));
            return;
          }

          const resultNode = createTextResultNode({
            source: element,
            text: execution.content,
            prompt: execution.intent.instruction || prompt,
            modelRef,
          });
          const next = appendResultNodeFromSources({
            elements: workingElements.map((entry) =>
              entry.id === element.id
                ? ({ ...entry, ...getCanvasBrainReadyElementPatch(modelRef) } as CanvasElement)
                : entry,
            ),
            edges: workingEdges,
            sources: [element, ...sourceElements],
            result: resultNode,
          });

          commitCanvas(next);
          setSelectedId(resultNode.id);
          appendAiMessage("assistant", getCanvasBrainTextDoneMessage(true));
        } catch (error) {
          const message = error instanceof Error ? error.message : "文本生成失败";
          patchElementDraft(element.id, {
            status: "failed",
            error: message,
          } as Partial<CanvasElement>);
          appendAiMessage("assistant", message);
        }
        return;
      }

      const elementModelKind = getCanvasEditorModelKind(element);
      const modelEntry = getModelEntryByRef(element.modelRef, elementModelKind);
      const modelRef = modelEntry?.ref || "";

      if (!modelRef || !modelEntry?.model || !modelEntry.provider) {
        appendAiMessage("assistant", `请先为${getCanvasNodeEditorTitle(element)}节点配置或选择模型。`);
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
          commitCanvas(appendResultNode({ elements, edges, source: element, result: resultNode }));
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
          commitCanvas(appendResultNode({ elements, edges, source: element, result: resultNode }));
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
        commitCanvas(appendResultNode({ elements, edges, source: element, result: resultNode }));
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
      commitElements,
      edges,
      elements,
      getModelEntryForKind,
      getModelEntryByRef,
      getResolvedBrainModelEntry,
      patchElementDraft,
      setSelectedId,
    ],
  );

  const { runAction, runProcessor } = useCanvasActionRunner({
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
      const nextElements = elements.map((element) => {
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

      commitElements(nextElements);
    },
    [commitElements, elements],
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
          commitCanvas({
            elements: preparedAction.elements,
            edges,
          });
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

          {edges.map((edge) => (
            <CanvasEdgeNode
              key={edge.id}
              edge={edge}
              elements={elements}
              selected={edge.id === selectedEdgeId}
              onSelect={() => {
                setSelectedEdgeId(edge.id);
                setSelectedId(null);
              }}
              onDelete={() => deleteEdge(edge.id)}
            />
          ))}

          {draftEdge && <DraftEdgeNode edge={draftEdge} />}

          {elements.map((element) => (
            <CanvasElementNode
              key={element.id}
              element={element}
              selected={element.id === selectedId || element.id === draftEdge?.sourceId}
              onSelect={() => {
                setSelectedId(element.id);
                setSelectedEdgeId(null);
              }}
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

      {elements.map((element) =>
        element.kind === "processor" ? (
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
        ) : null,
      )}

      {elements.map((element) =>
        element.kind === "template" && element.templateId === "frame-sequence-list" ? (
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
        ) : null,
      )}

      {selectedElement && selectedToolbarFrame && (
        <CanvasNodeActionToolbar
          frame={selectedToolbarFrame}
          actions={selectedElementActions}
          onAction={(action) => void runAction(action, selectedElement)}
        />
      )}

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
          onGenerate={() => void generateFromSelectedNode(selectedElement)}
          onDelete={() => deleteElement(selectedElement.id)}
        />
      )}

      <CanvasSideToolbar
        onAddText={addText}
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
  selected,
  onSelect,
  onDelete,
}: {
  edge: CanvasEdge;
  elements: CanvasElement[];
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
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
      opacity={selected ? 0.96 : 0.72}
      selected={selected}
      showEndpoints
      onSelect={onSelect}
      onDelete={onDelete}
    />
  );
}

function DraftEdgeNode({ edge }: { edge: CanvasDraftEdge }) {
  return (
    <FlowingConnector
      from={edge.from}
      to={edge.to}
      opacity={0.9}
      selected={false}
      showEndpoints
    />
  );
}

function FlowingConnector({
  from,
  to,
  opacity,
  selected,
  showEndpoints,
  onSelect,
  onDelete,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  opacity: number;
  selected: boolean;
  showEndpoints: boolean;
  onSelect?: () => void;
  onDelete?: () => void;
}) {
  const pathRef = useRef<Konva.Path>(null);
  const midpoint = {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2,
  };
  const handleSelect = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    event.cancelBubble = true;
    onSelect?.();
  };
  const handleDelete = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    event.cancelBubble = true;
    onDelete?.();
  };

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
    <Group listening={Boolean(onSelect)}>
      {onSelect && (
        <Path
          data={getConnectorPathData(from, to)}
          stroke="rgba(255,255,255,0.001)"
          strokeWidth={16}
          lineCap="round"
          lineJoin="round"
          onMouseDown={handleSelect}
          onTouchStart={handleSelect}
        />
      )}
      <Path
        ref={pathRef}
        data={getConnectorPathData(from, to)}
        stroke={selected ? "rgba(250,204,21,0.95)" : `rgba(255,255,255,${opacity})`}
        strokeWidth={selected ? 2.4 : 1.6}
        dash={selected ? [4, 6] : [2, 6]}
        lineCap="round"
        lineJoin="round"
        shadowColor={selected ? "rgba(250,204,21,0.38)" : "rgba(255,255,255,0.22)"}
        shadowBlur={selected ? 8 : 4}
        listening={false}
      />
      {selected && onDelete && (
        <Group
          x={midpoint.x - 13}
          y={midpoint.y - 13}
          onMouseDown={handleDelete}
          onTouchStart={handleDelete}
        >
          <Rect
            width={26}
            height={26}
            fill="rgba(8,10,12,0.82)"
            stroke="rgba(250,204,21,0.48)"
            strokeWidth={1}
            cornerRadius={8}
            shadowColor="rgba(0,0,0,0.42)"
            shadowBlur={12}
          />
          <Text
            width={26}
            height={26}
            text="×"
            align="center"
            verticalAlign="middle"
            fill="rgba(255,255,255,0.86)"
            fontSize={17}
            fontStyle="700"
            listening={false}
          />
        </Group>
      )}
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
  template: (props) => (
    <CanvasTemplateNode
      {...props}
      element={props.element as CanvasTemplateElement}
    />
  ),
  processor: (props) => (
    <CanvasProcessorNode
      {...props}
      element={props.element as CanvasProcessorElement}
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
        x={NODE_PADDING + 8}
        y={NODE_PADDING + 8}
        width={Math.max(24, element.width - NODE_PADDING * 2 - 16)}
        height={Math.max(24, element.height - NODE_PADDING * 2 - 16)}
        text={element.text}
        fill="#f8fafc"
        fontSize={14}
        lineHeight={1.35}
        fontStyle="400"
        align="left"
        verticalAlign="top"
        wrap="word"
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
