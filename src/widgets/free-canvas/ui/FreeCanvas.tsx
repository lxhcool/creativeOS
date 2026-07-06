"use client";

import {
  Bot,
  Eye,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Konva from "konva";
import {
  Layer,
  Rect,
  Stage,
} from "react-konva";
import {
  createImageElement,
  createMediaElement,
  createTextElement,
} from "@/entities/canvas/lib/factory";
import {
  buildWorkflowStarterCommand,
} from "@/features/canvas-workflows";
import {
  getCanvasNodeEditorFrame,
  getCanvasNodeEditorTitle,
} from "../lib/editor";
import {
  getTextNodeSize,
  getViewportForElements,
  type CanvasFlowDirection,
  useViewportSize,
} from "../lib/geometry";
import {
  shouldIgnoreCanvasLayoutEdge,
} from "../lib/textResultLayout";
import {
  runCanvasAssistantCommand,
  type CanvasAssistantCommandOverride,
} from "../lib/assistantCommandRunner";
import {
  readCanvasFlowDirection,
  writeCanvasFlowDirection,
} from "../lib/canvasProjectStorage";
import { useCanvasDocument } from "../lib/useCanvasDocument";
import { useCanvasActionRunner } from "../lib/useCanvasActionRunner";
import { useCanvasModelSelection } from "../lib/useCanvasModelSelection";
import { useCanvasRenderWindow } from "../lib/useCanvasRenderWindow";
import { useCanvasWorkflowRuntime } from "../lib/useCanvasWorkflowRuntime";
import { useCanvasAssetController } from "../lib/useCanvasAssetController";
import { useCanvasProjectController } from "../lib/useCanvasProjectController";
import { useCanvasInteractionController } from "../lib/useCanvasInteractionController";
import { useCanvasGenerationController } from "../lib/useCanvasGenerationController";
import {
  darkPanel,
  DOT_GRID_SIZE,
  MIN_SCALE,
  SCALE_OPTIONS,
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
import { CanvasWorkflowLaunchStrip } from "./CanvasWorkflowLaunchStrip";
import {
  getTextNodeBadge,
  MemoCanvasElementNode,
} from "./CanvasElementNode";
import {
  CanvasConfirmModal,
  CanvasNodeContextMenu,
  CanvasProjectNameModal,
  CanvasSaveHistoryModal,
  CanvasTextPreviewModal,
  CanvasWorkflowGroupNode,
} from "./CanvasShellOverlays";
import type {
  CanvasEdge,
  CanvasElement,
  CanvasTemplateElement,
  CanvasTextElement,
  CanvasTextRole,
  CanvasViewport,
} from "@/entities/canvas/model/types";
import { CanvasAnchorNavigator } from "./CanvasAnchorNavigator";

type AiMessage = CanvasBrainChatMessage;

const AUTO_LAYOUT_COLUMN_GAP = 360;
const AUTO_LAYOUT_ROW_GAP = 180;
const AUTO_LAYOUT_SIBLING_GAP = 92;

const PROCESSOR_NODE_WIDTH = 880;
const PROCESSOR_NODE_HEIGHT = 720;
const FRAME_LIST_TEMPLATE_WIDTH = 760;
const FRAME_LIST_TEMPLATE_HEIGHT = 520;
function getMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getCanvasLayoutEdgeWeight(params: {
  edge: CanvasEdge;
  target?: CanvasElement;
}): number {
  if (params.target?.kind === "text") {
    const relationKind = (params.target as CanvasTextElement).meta?.relationKind;
    if (relationKind === "sequence") return 0;
  }

  return 1;
}

function getCanvasElementSortValue(
  element: CanvasElement,
  direction: CanvasFlowDirection,
): number {
  if (direction === "vertical") {
    return element.x * 100000 + element.y;
  }

  return element.y * 100000 + element.x;
}

function layoutCanvasComponentElements(params: {
  elements: CanvasElement[];
  edges: CanvasEdge[];
  direction: CanvasFlowDirection;
}): CanvasElement[] {
  if (params.elements.length <= 1) return params.elements;

  const componentElementIds = new Set(params.elements.map((element) => element.id));
  const elementById = new Map(params.elements.map((element) => [element.id, element]));
  const ranks = new Map(params.elements.map((element) => [element.id, 0]));

  for (let index = 0; index < params.elements.length - 1; index += 1) {
    let changed = false;

    params.edges.forEach((edge) => {
      if (
        !componentElementIds.has(edge.sourceId) ||
        !componentElementIds.has(edge.targetId)
      ) {
        return;
      }

      const sourceRank = ranks.get(edge.sourceId) ?? 0;
      const targetRank = ranks.get(edge.targetId) ?? 0;
      const weight = getCanvasLayoutEdgeWeight({
        edge,
        target: elementById.get(edge.targetId),
      });
      const nextTargetRank = sourceRank + weight;

      if (nextTargetRank > targetRank) {
        ranks.set(edge.targetId, nextTargetRank);
        changed = true;
      }
    });

    if (!changed) break;
  }

  const minRank = Math.min(...Array.from(ranks.values()));
  const normalizedRankValues = Array.from(
    new Set(Array.from(ranks.values()).map((rank) => rank - minRank)),
  ).sort((a, b) => a - b);
  const rankIndexByValue = new Map(
    normalizedRankValues.map((rank, index) => [rank, index]),
  );
  const elementsByRank = new Map<number, CanvasElement[]>();

  params.elements.forEach((element) => {
    const rank = rankIndexByValue.get((ranks.get(element.id) ?? 0) - minRank) ?? 0;
    const rankedElements = elementsByRank.get(rank) || [];
    rankedElements.push(element);
    elementsByRank.set(rank, rankedElements);
  });

  const sortedRanks = Array.from(elementsByRank.keys()).sort((a, b) => a - b);
  const componentLeft = Math.min(...params.elements.map((element) => element.x));
  const componentTop = Math.min(...params.elements.map((element) => element.y));
  const nextElements = new Map<string, CanvasElement>();

  if (params.direction === "vertical") {
    let y = componentTop;

    sortedRanks.forEach((rank) => {
      const rankedElements = (elementsByRank.get(rank) || []).sort(
        (a, b) =>
          getCanvasElementSortValue(a, params.direction) -
          getCanvasElementSortValue(b, params.direction),
      );
      const rowHeight = Math.max(...rankedElements.map((element) => element.height));
      let x = componentLeft;

      rankedElements.forEach((element) => {
        nextElements.set(element.id, {
          ...element,
          x,
          y: y + rowHeight / 2 - element.height / 2,
        } as CanvasElement);
        x += element.width + AUTO_LAYOUT_SIBLING_GAP;
      });

      y += rowHeight + AUTO_LAYOUT_ROW_GAP;
    });

    return params.elements.map((element) => nextElements.get(element.id) || element);
  }

  let x = componentLeft;

  sortedRanks.forEach((rank) => {
    const rankedElements = (elementsByRank.get(rank) || []).sort(
      (a, b) =>
        getCanvasElementSortValue(a, params.direction) -
        getCanvasElementSortValue(b, params.direction),
    );
    const columnWidth = Math.max(...rankedElements.map((element) => element.width));
    let y = componentTop;

    rankedElements.forEach((element) => {
      nextElements.set(element.id, {
        ...element,
        x: x + columnWidth / 2 - element.width / 2,
        y,
      } as CanvasElement);
      y += element.height + 88;
    });

    x += columnWidth + AUTO_LAYOUT_COLUMN_GAP;
  });

  return params.elements.map((element) => nextElements.get(element.id) || element);
}

function layoutCanvasElementsForDirection(params: {
  elements: CanvasElement[];
  edges: CanvasEdge[];
  direction: CanvasFlowDirection;
}): CanvasElement[] {
  if (params.elements.length <= 1) return params.elements;

  const elementById = new Map(params.elements.map((element) => [element.id, element]));
  const layoutEdges = params.edges.filter((edge) => {
    const source = elementById.get(edge.sourceId);
    const target = elementById.get(edge.targetId);
    if (!source || !target || source.id === target.id) return false;
    return !shouldIgnoreCanvasLayoutEdge({ edge, target });
  });
  const neighborsById = new Map<string, Set<string>>(
    params.elements.map((element) => [element.id, new Set<string>()]),
  );

  layoutEdges.forEach((edge) => {
    neighborsById.get(edge.sourceId)?.add(edge.targetId);
    neighborsById.get(edge.targetId)?.add(edge.sourceId);
  });

  const visited = new Set<string>();
  const components: CanvasElement[][] = [];

  params.elements
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .forEach((element) => {
      if (visited.has(element.id)) return;

      const queue = [element.id];
      const componentIds: string[] = [];
      visited.add(element.id);

      for (let index = 0; index < queue.length; index += 1) {
        const id = queue[index]!;
        componentIds.push(id);
        neighborsById.get(id)?.forEach((neighborId) => {
          if (visited.has(neighborId)) return;
          visited.add(neighborId);
          queue.push(neighborId);
        });
      }

      components.push(
        componentIds
          .map((id) => elementById.get(id))
          .filter((item): item is CanvasElement => Boolean(item)),
      );
    });

  const layoutedById = new Map<string, CanvasElement>();

  components.forEach((componentElements) => {
    const componentElementIds = new Set(componentElements.map((element) => element.id));
    const componentEdges = layoutEdges.filter(
      (edge) =>
        componentElementIds.has(edge.sourceId) && componentElementIds.has(edge.targetId),
    );

    layoutCanvasComponentElements({
      elements: componentElements,
      edges: componentEdges,
      direction: params.direction,
    }).forEach((element) => layoutedById.set(element.id, element));
  });

  return params.elements.map((element) => layoutedById.get(element.id) || element);
}

export function FreeCanvas() {
  const size = useViewportSize();
  const stageRef = useRef<Konva.Stage>(null);

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
    setEdges,
    setElements,
    setSelectedEdgeId,
    setSelectedId,
    undo,
    updateElement,
  } = useCanvasDocument();
  const [viewport, setViewport] = useState<CanvasViewport>({
    x: 0,
    y: 0,
    scale: 1,
  });
  const [flowDirection, setFlowDirectionState] = useState<CanvasFlowDirection>(
    readCanvasFlowDirection,
  );
  const [apiConfigOpen, setApiConfigOpen] = useState(false);
  const [apiEndpoint, setApiEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [brainModelRef, setBrainModelRef] = useState("");
  const [brainAttachmentIds, setBrainAttachmentIds] = useState<string[]>([]);
  const [clearCanvasConfirmOpen, setClearCanvasConfirmOpen] = useState(false);
  const [canvasSaveStatus, setCanvasSaveStatus] = useState<string | null>(null);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([
    {
      id: getMessageId(),
      role: "assistant",
      content: "我是画布大脑。可以选择素材、协调上下文，并把你的意图转成画布操作。",
    },
  ]);
  const canvasSaveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedElement = selectedId
    ? elements.find((element) => element.id === selectedId) || null
    : null;

  const setFlowDirection = useCallback(
    (direction: CanvasFlowDirection) => {
      if (direction === flowDirection) return;

      setFlowDirectionState(direction);
      writeCanvasFlowDirection(direction);
      if (elements.length <= 1) return;

      commitCanvas((current) => ({
        elements: layoutCanvasElementsForDirection({
          elements: current.elements,
          edges: current.edges,
          direction,
        }),
        edges: current.edges,
      }));
    },
    [commitCanvas, elements.length, flowDirection],
  );
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

  const appendAiMessage = useCallback((
    role: AiMessage["role"],
    message: string | Pick<AiMessage, "content" | "actions">,
  ) => {
    const content = typeof message === "string" ? message : message.content;
    const actions = typeof message === "string" ? undefined : message.actions;

    setAiMessages((current) => [
      ...current,
      {
        id: getMessageId(),
        role,
        content,
        actions,
      },
    ]);
  }, []);
  const showCanvasSaveStatus = useCallback((message: string) => {
    setCanvasSaveStatus(message);
    if (canvasSaveStatusTimerRef.current) {
      clearTimeout(canvasSaveStatusTimerRef.current);
    }
    canvasSaveStatusTimerRef.current = setTimeout(() => {
      setCanvasSaveStatus(null);
      canvasSaveStatusTimerRef.current = null;
    }, 2400);
  }, []);

  const {
    canvasProjects,
    currentProject,
    currentProjectId,
    currentWorkflowType,
    saveHistory,
    saveHistoryOpen,
    setSaveHistoryOpen,
    projectNameOpen,
    setProjectNameOpen,
    projectNameDraft,
    setProjectNameDraft,
    projectWorkflowDraft,
    setProjectWorkflowDraft,
    deleteProjectConfirmOpen,
    setDeleteProjectConfirmOpen,
    createCurrentCanvasPayload,
    persistProjectRecord,
    addCanvasSaveHistory,
    restoreCanvasProject,
    saveCurrentCanvas,
    deleteCanvasSaveHistoryItem,
    downloadCanvasProject,
    openCanvasProject,
    deleteCurrentCanvasProject,
    submitProjectName,
  } = useCanvasProjectController({
    elements,
    edges,
    viewport,
    aiMessages,
    commitCanvas,
    setElements,
    setEdges,
    setViewport,
    setSelectedId,
    setSelectedEdgeId,
    setDraftEdge,
    setChatOpen,
    setAiMessages,
    showCanvasSaveStatus,
  });

  const {
    strategy: workflowStrategy,
    toolbarConfig,
    anchorConfig,
    aiAssistantConfig,
    starters: workflowStarters,
    isFixedWorkflow,
    groups: workflowGroups,
    readiness: textWorkflowReadiness,
    activeAnchorId,
    navigateToAnchor: navigateToWorkflowAnchor,
  } = useCanvasWorkflowRuntime({
    workflowType: currentWorkflowType,
    elements,
    selectedElement,
    viewportSize: size,
    onSelectElement: setSelectedId,
    onClearSelectedEdge: () => setSelectedEdgeId(null),
    onViewportChange: setViewport,
    onMessage: (content) => appendAiMessage("assistant", content),
  });
  const effectiveFlowDirection: CanvasFlowDirection = isFixedWorkflow
    ? "vertical"
    : flowDirection;

  const {
    hoveredId,
    nodeContextMenu,
    previewTextElementId,
    panStart,
    setNodeHover,
    clearNodeHover,
    closeNodeContextMenu,
    openNodeContextMenu,
    openNodeDomContextMenu,
    deleteNodeFromContextMenu,
    openTextPreview,
    closeTextPreview,
    handleStartConnection,
    handleWheel,
    setCanvasScale,
    handleStagePointerDown,
    handleStagePointerMove,
    handleStagePointerUp,
  } = useCanvasInteractionController({
    stageRef,
    size,
    viewport,
    setViewport,
    elements,
    edges,
    draftEdge,
    setDraftEdge,
    selectedId,
    selectedEdgeId,
    setSelectedId,
    setSelectedEdgeId,
    selectedElementIsGenerating,
    flowDirection: effectiveFlowDirection,
    commitCanvas,
    deleteElement,
    deleteEdge,
    undo,
    redo,
    isFixedWorkflow,
    workflowType: currentWorkflowType,
    appendAssistantMessage: (content) => appendAiMessage("assistant", content),
  });

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
    flowDirection: effectiveFlowDirection,
    draftSourceId: draftEdge?.sourceId,
  });
  const contextMenuElement = nodeContextMenu
    ? elementById.get(nodeContextMenu.elementId) || null
    : null;
  const previewTextElement =
    previewTextElementId && elementById.get(previewTextElementId)?.kind === "text"
      ? (elementById.get(previewTextElementId) as CanvasTextElement)
      : null;

  const worldCenter = useCallback(() => {
    return {
      x: (size.width / 2 - viewport.x) / viewport.scale,
      y: (size.height / 2 - viewport.y) / viewport.scale,
    };
  }, [size.height, size.width, viewport.scale, viewport.x, viewport.y]);

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

  const {
    imageInputRef,
    brainImageInputRef,
    videoInputRef,
    audioInputRef,
    importInputRef,
    pendingImageTargetRef,
    pendingVideoTargetRef,
    pendingAudioTargetRef,
    requestImageUpload,
    requestVideoUpload,
    requestAudioUpload,
    handleImageFile,
    handleBrainImageFile,
    handleVideoFile,
    handleAudioFile,
    handleImportFile,
  } = useCanvasAssetController({
    elements,
    addElement,
    updateElement,
    worldCenter,
    setBrainAttachmentIds,
    appendAssistantMessage: (content) => appendAiMessage("assistant", content),
    currentProjectId,
    restoreCanvasProject,
    persistProjectRecord,
    addCanvasSaveHistory,
    showCanvasSaveStatus,
  });

  const exportJson = useCallback(() => {
    const payload = createCurrentCanvasPayload();
    downloadCanvasProject(payload);
    if (currentProjectId) {
      persistProjectRecord(currentProjectId, payload);
    }
    showCanvasSaveStatus("已导出本地文件");
  }, [
    createCurrentCanvasPayload,
    currentProjectId,
    downloadCanvasProject,
    persistProjectRecord,
    showCanvasSaveStatus,
  ]);

  const exportPng = useCallback(() => {
    const dataUrl = stageRef.current?.toDataURL({ pixelRatio: 2 });
    if (!dataUrl) return;

    const link = document.createElement("a");
    link.download = "creativeos-canvas.png";
    link.href = dataUrl;
    link.click();
  }, []);

  const {
    pendingTextSourceIds,
    generateFromSelectedNode,
  } = useCanvasGenerationController({
    elements,
    edges,
    flowDirection: effectiveFlowDirection,
    getModelEntryByRef,
    getModelEntryForKind,
    getResolvedBrainModelEntry,
    commitCanvas,
    patchElementDraft,
    setSelectedId,
    appendAssistantMessage: (content) => appendAiMessage("assistant", content),
  });

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

  const submitAiCommand = async (override?: CanvasAssistantCommandOverride) => {
    const command = (override?.command ?? chatInput).trim();
    if (!command || aiLoading) return;

    if (!override) {
      setChatInput("");
    }
    const display = override?.display || command;
    appendAiMessage("user", display);
    const plannedHistory: AiMessage[] = [
      ...aiMessages,
      {
        id: getMessageId(),
        role: "user",
        content: display,
      },
    ];

    setAiLoading(true);
    try {
      await runCanvasAssistantCommand({
        command,
        display,
        history: plannedHistory,
        workflowStrategy,
        elements,
        edges,
        selectedElement,
        brainAttachmentIds,
        activeBrainModelEntry: getModelEntryByRef(resolvedBrainModelRef, "text"),
        center: worldCenter,
        appendAssistantMessage: (message) => appendAiMessage("assistant", message),
        clearBrainAttachments: () => setBrainAttachmentIds([]),
        addElement,
        commitCanvas,
        setSelectedId,
        generateFromSelectedNode,
      });
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

          {workflowGroups.map((group) => (
            <CanvasWorkflowGroupNode key={group.id} group={group} />
          ))}

          {visibleEdges.map(({ edge, source, target }) => (
            <MemoCanvasEdgeNode
              key={edge.id}
              source={source}
              target={target}
              groups={workflowGroups}
              direction={effectiveFlowDirection}
              selected={edge.id === selectedEdgeId}
              onSelect={() => {
                setSelectedEdgeId(edge.id);
                setSelectedId(null);
              }}
              onDelete={() => deleteEdge(edge.id)}
            />
          ))}

          {draftEdge && <DraftEdgeNode edge={draftEdge} direction={effectiveFlowDirection} />}

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
            if (element.kind === "text" && element.meta?.workflowLocked) return null;

            return (
              <CanvasConnectionHandle
                key={`handle_${element.id}`}
                element={element}
                direction={effectiveFlowDirection}
                onHover={() => setNodeHover(element.id)}
                onLeave={() => clearNodeHover(element.id)}
                onStartConnection={(event) => handleStartConnection(element, event)}
              />
            );
          })}
        </Layer>
      </Stage>

      {isFixedWorkflow && elements.length === 0 && (
        <CanvasWorkflowLaunchStrip
          workflowLabel={workflowStrategy.label}
          starters={workflowStarters}
          onFocusAssistant={(starter) => {
            setChatOpen(true);
            if (starter) {
              void submitAiCommand({
                command: buildWorkflowStarterCommand({
                  workflowLabel: workflowStrategy.label,
                  starter,
                }),
                display: starter.label,
              });
            }
          }}
        />
      )}

      {visibleElements.map((element) => {
        if (
          element.kind !== "text" ||
          element.text.trim().length === 0 ||
          element.status === "generating"
        ) {
          return null;
        }

        const frame = getCanvasNodeEditorFrame(element, viewport, size);

        return (
          <button
            key={`preview_button_${element.id}`}
            type="button"
            className="fixed z-[90] flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-white/[0.1] bg-[#02070b]/[0.86] text-white/62 shadow-[0_10px_26px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-xl transition-colors duration-200 hover:bg-white/[0.12] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/18"
            style={{
              left: Math.min(size.width - 40, Math.max(12, frame.left + frame.width - 42)),
              top: Math.min(size.height - 40, Math.max(12, frame.top + 12)),
            }}
            aria-label="预览内容"
            title="预览内容"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              openTextPreview(element);
            }}
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        );
      })}

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

      {selectedElement &&
        selectedElement.kind !== "processor" &&
        !(selectedElement.kind === "text" && selectedElement.meta?.workflowLocked) &&
        selectedEditorFrame && (
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
          disabled={pendingTextSourceIds.has(selectedElement.id)}
          workflowReadiness={textWorkflowReadiness}
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
                    actionId: options.actionId,
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

      {selectedElement &&
        selectedElement.kind === "text" &&
        selectedElement.meta?.workflowLocked &&
        selectedEditorFrame && (
          <div
            className="fixed z-[92] rounded-3xl border border-white/10 bg-[#02070b]/[0.9] p-3 text-white shadow-[0_24px_70px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-2xl"
            style={{
              left: Math.min(
                size.width - Math.min(560, selectedEditorFrame.width) - 16,
                Math.max(16, selectedEditorFrame.left),
              ),
              top:
                selectedEditorFrame.top + selectedEditorFrame.height + 14 + 132 < size.height
                  ? selectedEditorFrame.top + selectedEditorFrame.height + 14
                  : Math.max(16, selectedEditorFrame.top - 146),
              width: Math.min(560, Math.max(360, selectedEditorFrame.width)),
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
          >
            <textarea
              value={selectedElement.prompt || ""}
              onChange={(event) =>
                patchElementDraft(selectedElement.id, { prompt: event.target.value })
              }
              placeholder="补充要求：告诉 AI 这次怎么调整"
              className="h-16 w-full resize-none rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm leading-5 text-white outline-none placeholder:text-white/28 focus:border-white/22 focus:bg-white/[0.08]"
            />
            <div className="mt-2 flex items-center gap-2">
              <select
                value={selectedElement.modelRef || selectedModelValue}
                disabled={modelOptions.length === 0 || pendingTextSourceIds.has(selectedElement.id)}
                onChange={(event) =>
                  patchElementDraft(selectedElement.id, { modelRef: event.target.value })
                }
                className="h-10 min-w-0 flex-1 rounded-full border border-white/10 bg-white/[0.06] px-3 text-sm font-semibold text-white/72 outline-none disabled:cursor-not-allowed disabled:opacity-45"
                aria-label="选择文本模型"
              >
                {modelOptions.length === 0 ? (
                  <option value="">未配置文本模型</option>
                ) : (
                  modelOptions.map((option) => (
                    <option key={option.ref} value={option.ref}>
                      {option.label}
                    </option>
                  ))
                )}
              </select>
              <button
                type="button"
                disabled={
                  pendingTextSourceIds.has(selectedElement.id) ||
                  modelOptions.length === 0 ||
                  !selectedElement.prompt?.trim()
                }
                onClick={() => {
                  const instruction = selectedElement.prompt?.trim();
                  if (!instruction) return;

                  void generateFromSelectedNode(selectedElement, instruction, {
                    resultTextRole: selectedElement.textRole,
                    generationMode: "single",
                    actionId: "workflow_node_revise",
                    actionLabel: "调整",
                    doneMessage: "当前节点已更新。",
                    intentOverride: {
                      outputKind: "text",
                      placement: "update_current",
                      instruction,
                    },
                  });
                }}
                className="h-10 shrink-0 cursor-pointer rounded-full border border-white/[0.14] bg-white/[0.13] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.2] disabled:cursor-not-allowed disabled:opacity-45"
              >
                更新
              </button>
            </div>
          </div>
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
          title={getTextNodeBadge(previewTextElement).title}
          color={getTextNodeBadge(previewTextElement).color}
          content={previewTextElement.text.trim() || "暂无内容"}
          onClose={closeTextPreview}
        />
      )}

      <CanvasSideToolbar
        onAddTextRole={addTextRole}
        onAddImage={addImagePlaceholder}
        onAddVideo={addVideoPlaceholder}
        onAddAudio={addAudioPlaceholder}
        onImport={() => importInputRef.current?.click()}
        onOpenApiConfig={() => setApiConfigOpen(true)}
        textRoles={toolbarConfig.textRoles}
        mediaKinds={toolbarConfig.mediaKinds}
        allowImport={toolbarConfig.allowImport}
      />

      <CanvasAnchorNavigator
        anchors={anchorConfig}
        activeAnchorId={activeAnchorId}
        panelClassName={darkPanel}
        onNavigate={navigateToWorkflowAnchor}
      />

      <CanvasTopToolbar
        panelClassName={darkPanel}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        viewport={viewport}
        projects={canvasProjects}
        currentProjectId={currentProjectId}
        scaleOptions={SCALE_OPTIONS}
        onUndo={undo}
        onRedo={redo}
        onClear={() => setClearCanvasConfirmOpen(true)}
        onDeleteProject={() => setDeleteProjectConfirmOpen(true)}
        onOpenProject={openCanvasProject}
        onSaveCanvas={saveCurrentCanvas}
        onExportFile={exportJson}
        onOpenImport={() => importInputRef.current?.click()}
        onOpenSaveHistory={() => setSaveHistoryOpen(true)}
        onExportPng={exportPng}
        onSetCanvasScale={setCanvasScale}
        flowDirection={flowDirection}
        onSetFlowDirection={setFlowDirection}
        showFlowDirection={!isFixedWorkflow}
        saveHistoryCount={saveHistory.length}
      />

      {canvasSaveStatus && (
        <div className="fixed right-5 top-[82px] z-30 rounded-full border border-white/10 bg-[#02070b]/90 px-3.5 py-2 text-[12px] font-medium text-white/76 shadow-2xl shadow-black/35 backdrop-blur-xl">
          {canvasSaveStatus}
        </div>
      )}

      {saveHistoryOpen && (
        <CanvasSaveHistoryModal
          items={saveHistory}
          projectName={currentProject?.name || "当前画布"}
          onClose={() => setSaveHistoryOpen(false)}
          onRestore={(item) => {
            restoreCanvasProject(item.payload, {
              projectId: currentProjectId || undefined,
              useHistory: true,
            });
            if (currentProjectId) {
              persistProjectRecord(currentProjectId, item.payload);
            }
            setSaveHistoryOpen(false);
            showCanvasSaveStatus("已恢复保存记录");
          }}
          onDownload={(item) => downloadCanvasProject(item.payload)}
          onDelete={deleteCanvasSaveHistoryItem}
        />
      )}

      {deleteProjectConfirmOpen && (
        <CanvasConfirmModal
          title="删除画布"
          description={`确定删除画布「${currentProject?.name || "当前画布"}」吗？此操作会同时删除本地画布内容和保存记录，无法恢复。`}
          confirmText="确认删除"
          tone="danger"
          onClose={() => setDeleteProjectConfirmOpen(false)}
          onConfirm={() => {
            setDeleteProjectConfirmOpen(false);
            deleteCurrentCanvasProject();
          }}
        />
      )}

      {clearCanvasConfirmOpen && (
        <CanvasConfirmModal
          title="清空画布内容"
          description="确定清空当前画布里的所有节点和连线吗？画布项目仍会保留。"
          confirmText="确认清空"
          tone="danger"
          onClose={() => setClearCanvasConfirmOpen(false)}
          onConfirm={() => {
            setClearCanvasConfirmOpen(false);
            clearCanvas();
          }}
        />
      )}

      {projectNameOpen && (
        <CanvasProjectNameModal
          value={projectNameDraft}
          onChange={setProjectNameDraft}
          onSubmit={submitProjectName}
          workflowType={projectWorkflowDraft}
          onWorkflowTypeChange={setProjectWorkflowDraft}
          onClose={() => {
            setProjectNameOpen(false);
            setProjectNameDraft("");
            setProjectWorkflowDraft("free");
          }}
        />
      )}

      <button
        type="button"
        onClick={() => setChatOpen((open) => !open)}
        className={
          isFixedWorkflow
            ? "fixed bottom-5 right-5 z-40 flex w-[min(360px,calc(100vw-40px))] cursor-pointer items-center gap-3 rounded-[24px] border border-white/[0.14] bg-[#02070b]/[0.92] px-4 py-3 text-left text-white shadow-[0_24px_70px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl transition hover:-translate-y-0.5 hover:bg-white/[0.1] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/15"
            : "fixed bottom-5 right-5 z-30 flex h-14 w-14 cursor-pointer items-center justify-center rounded-2xl border border-white/10 bg-white/[0.12] text-white shadow-2xl shadow-black/35 backdrop-blur-2xl transition hover:-translate-y-0.5 hover:bg-white/[0.18] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/15"
        }
        aria-label={chatOpen ? "收起 AI 助手" : "打开 AI 助手"}
        aria-expanded={chatOpen}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/[0.12] bg-white/[0.12]">
          <Bot className="h-5 w-5" />
        </span>
        {isFixedWorkflow && (
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-white/92">
              {aiAssistantConfig.title}
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-white/48">
              {chatOpen ? "控制台已打开，继续沟通推进流程" : "打开控制台推进下一阶段"}
            </span>
          </span>
        )}
      </button>

      {chatOpen && (
        <CanvasBrainPanel
          panelClassName={darkPanel}
          prominent={isFixedWorkflow}
          title={aiAssistantConfig.title}
          subtitle={aiAssistantConfig.subtitle}
          placeholder={aiAssistantConfig.placeholder}
          workingMessage={aiAssistantConfig.workingMessage}
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
          onAction={(action) =>
            void submitAiCommand({
              command: action.command,
              display: action.label,
            })
          }
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
