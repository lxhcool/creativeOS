"use client";

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
  getCanvasNodeEditorFrame,
  getCanvasNodeEditorTitle,
} from "../lib/editor";
import {
  getTextNodeSize,
  getViewportForElements,
  type CanvasFlowDirection,
  useViewportSize,
} from "../lib/geometry";
import { layoutCanvasElementsForDirection } from "../lib/canvasAutoLayout";
import {
  readCanvasFlowDirection,
  writeCanvasFlowDirection,
} from "../lib/canvasProjectStorage";
import { useCanvasDocument } from "../lib/useCanvasDocument";
import { useCanvasActionRunner } from "../lib/useCanvasActionRunner";
import { useCanvasModelSelection } from "../lib/useCanvasModelSelection";
import { useCanvasRenderWindow } from "../lib/useCanvasRenderWindow";
import { useCanvasAssetController } from "../lib/useCanvasAssetController";
import { useCanvasProjectController } from "../lib/useCanvasProjectController";
import { useCanvasInteractionController } from "../lib/useCanvasInteractionController";
import { useCanvasGenerationController } from "../lib/useCanvasGenerationController";
import { useCanvasIntentCommandRunner } from "../lib/useCanvasIntentCommandRunner";
import { useCanvasAssetExportController } from "../lib/useCanvasAssetExportController";
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
import { CanvasSelectedNodeEditor } from "./CanvasSelectedNodeEditor";
import { CanvasNodeDomOverlays } from "./CanvasNodeDomOverlays";
import { CanvasApiConfigModal } from "./CanvasApiConfigModal";
import { CanvasSideToolbar } from "./CanvasSideToolbar";
import { CanvasTopToolbar } from "./CanvasTopToolbar";
import { CanvasAssetPanel } from "./CanvasAssetPanel";
import { CanvasIntentInputPanel } from "./CanvasIntentInputPanel";
import { CanvasHiddenFileInputs } from "./CanvasHiddenFileInputs";
import { CanvasTextPreviewButtons } from "./CanvasTextPreviewButtons";
import { CanvasShellOverlayLayer } from "./CanvasShellOverlayLayer";
import {
  MemoCanvasElementNode,
} from "./CanvasElementNode";
import type { CanvasBrainChatMessage } from "../model/types";
import type {
  CanvasElement,
  CanvasTemplateElement,
  CanvasTextElement,
  CanvasTextRole,
  CanvasViewport,
} from "@/entities/canvas/model/types";

type AiMessage = CanvasBrainChatMessage;

const ASSET_TEXT_ROLES: CanvasTextRole[] = [
  "general",
  "article",
  "character_cast",
  "character",
  "character_relation",
  "scene",
  "script",
  "storyboard",
  "prompt",
];

const PROCESSOR_NODE_WIDTH = 880;
const PROCESSOR_NODE_HEIGHT = 720;
const FRAME_LIST_TEMPLATE_WIDTH = 760;
const FRAME_LIST_TEMPLATE_HEIGHT = 520;
function getMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
  const [chatInput, setChatInput] = useState("");
  const [brainModelRef, setBrainModelRef] = useState("");
  const [brainAttachmentIds, setBrainAttachmentIds] = useState<string[]>([]);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [clearCanvasConfirmOpen, setClearCanvasConfirmOpen] = useState(false);
  const [canvasSaveStatus, setCanvasSaveStatus] = useState<string | null>(null);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([
    {
      id: getMessageId(),
      role: "assistant",
      content: "说说你想创作什么。",
    },
  ]);
  const canvasSaveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedElement = selectedId
    ? elements.find((element) => element.id === selectedId) || null
    : null;
  const selectedIntentLabel = selectedElement
    ? getCanvasNodeEditorTitle(selectedElement)
    : null;
  const assetCount = elements.filter((element) => Boolean(element.asset)).length;

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
    saveHistory,
    saveHistoryOpen,
    setSaveHistoryOpen,
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
  } = useCanvasProjectController({
    elements,
    edges,
    viewport,
    aiMessages,
    selectedId,
    commitCanvas,
    setElements,
    setEdges,
    setViewport,
    setSelectedId,
    setSelectedEdgeId,
    setDraftEdge,
    setAiMessages,
    showCanvasSaveStatus,
  });

  const effectiveFlowDirection: CanvasFlowDirection = flowDirection;

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
      void persistProjectRecord(currentProjectId, payload);
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
    locateCanvasElement,
    exportSingleAsset,
    exportAssetManifest,
  } = useCanvasAssetExportController({
    elements,
    edges,
    projectName: currentProject?.name,
    viewportSize: size,
    setSelectedId,
    setSelectedEdgeId,
    setViewport,
    patchElementDraft,
    showCanvasSaveStatus,
  });

  const {
    pendingTextSourceIds,
    generateFromSelectedNode,
  } = useCanvasGenerationController({
    elements,
    edges,
    currentProjectId,
    flowDirection: effectiveFlowDirection,
    getModelEntryByRef,
    getModelEntryForKind,
    getResolvedBrainModelEntry,
    commitCanvas,
    patchElementDraft,
    setSelectedId,
    appendAssistantMessage: (content) => appendAiMessage("assistant", content),
  });

  const { aiLoading, submitAiCommand } = useCanvasIntentCommandRunner({
    chatInput,
    setChatInput,
    aiMessages,
    elements,
    edges,
    selectedElement,
    brainAttachmentIds,
    currentProjectId,
    resolvedBrainModelRef,
    getModelEntryByRef,
    getModelEntryForKind,
    worldCenter,
    appendAiMessage,
    setBrainAttachmentIds,
    commitCanvas,
    patchElementDraft,
    setSelectedId,
    generateFromSelectedNode,
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

      <CanvasTextPreviewButtons
        elements={visibleElements}
        viewport={viewport}
        viewportSize={size}
        onPreview={openTextPreview}
      />

      <CanvasNodeDomOverlays
        processorElements={processorOverlayElements}
        frameSequenceElements={frameSequenceOverlayElements}
        viewport={viewport}
        currentProjectId={currentProjectId}
        imageModelEntry={getModelEntryForKind("image")}
        onSelectElement={(id) => {
          setSelectedId(id);
          setSelectedEdgeId(null);
        }}
        onMoveElement={(id, updates) => patchElementDraft(id, updates)}
        onRunProcessor={(element, config) => void runProcessor(element, config)}
        onSequencePropsChange={updateSequenceTemplateProps}
        onMessage={(message) => appendAiMessage("assistant", message)}
      />

      <CanvasSelectedNodeEditor
        element={selectedElement}
        frame={selectedEditorFrame}
        elements={elements}
        modelOptions={modelOptions}
        modelValue={selectedModelValue}
        disabled={selectedElement ? pendingTextSourceIds.has(selectedElement.id) : false}
        onPatchElement={patchElementDraft}
        onContextMenu={openNodeDomContextMenu}
        onGenerate={generateFromSelectedNode}
      />

      <CanvasShellOverlayLayer
        viewportSize={size}
        nodeContextMenu={nodeContextMenu}
        contextMenuElement={contextMenuElement}
        previewTextElement={previewTextElement}
        canvasSaveStatus={canvasSaveStatus}
        saveHistoryOpen={saveHistoryOpen}
        saveHistory={saveHistory}
        currentProjectName={currentProject?.name || "当前画布"}
        deleteProjectConfirmOpen={deleteProjectConfirmOpen}
        clearCanvasConfirmOpen={clearCanvasConfirmOpen}
        onCloseNodeContextMenu={closeNodeContextMenu}
        onDeleteNodeFromContextMenu={deleteNodeFromContextMenu}
        onOpenTextPreview={openTextPreview}
        onCloseTextPreview={closeTextPreview}
        onExportAsset={(element) => {
          exportSingleAsset(element);
          closeNodeContextMenu();
        }}
        onCloseSaveHistory={() => setSaveHistoryOpen(false)}
        onRestoreSaveHistory={(item) => {
          restoreCanvasProject(item.payload, {
            projectId: currentProjectId || undefined,
            useHistory: true,
          });
          if (currentProjectId) {
            void persistProjectRecord(currentProjectId, item.payload);
          }
          setSaveHistoryOpen(false);
          showCanvasSaveStatus("已恢复保存记录");
        }}
        onDownloadSaveHistory={(item) => downloadCanvasProject(item.payload)}
        onDeleteSaveHistory={deleteCanvasSaveHistoryItem}
        onCloseDeleteProjectConfirm={() => setDeleteProjectConfirmOpen(false)}
        onConfirmDeleteProject={() => {
          setDeleteProjectConfirmOpen(false);
          deleteCurrentCanvasProject();
        }}
        onCloseClearCanvasConfirm={() => setClearCanvasConfirmOpen(false)}
        onConfirmClearCanvas={() => {
          setClearCanvasConfirmOpen(false);
          clearCanvas();
        }}
      />

      <CanvasSideToolbar
        onAddTextRole={addTextRole}
        onAddImage={addImagePlaceholder}
        onAddVideo={addVideoPlaceholder}
        onAddAudio={addAudioPlaceholder}
        onImport={() => importInputRef.current?.click()}
        onOpenApiConfig={() => setApiConfigOpen(true)}
        textRoles={ASSET_TEXT_ROLES}
        mediaKinds={["image", "video", "audio"]}
        allowImport
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
        onToggleAssets={() => setAssetsOpen((current) => !current)}
        onExportFile={exportJson}
        onOpenImport={() => importInputRef.current?.click()}
        onOpenSaveHistory={() => setSaveHistoryOpen(true)}
        onExportPng={exportPng}
        onSetCanvasScale={setCanvasScale}
        flowDirection={flowDirection}
        onSetFlowDirection={setFlowDirection}
        showFlowDirection
        saveHistoryCount={saveHistory.length}
        assetCount={assetCount}
        assetsOpen={assetsOpen}
      />

      <CanvasAssetPanel
        open={assetsOpen}
        elements={elements}
        selectedId={selectedId}
        onClose={() => setAssetsOpen(false)}
        onLocate={locateCanvasElement}
        onExport={exportSingleAsset}
        onExportFormat={exportSingleAsset}
        onExportManifest={() => void exportAssetManifest()}
      />

      <CanvasIntentInputPanel
        selectedLabel={selectedIntentLabel}
        input={chatInput}
        loading={aiLoading}
        modelValue={resolvedBrainModelRef}
        modelOptions={brainModelOptions}
        attachmentCount={brainAttachmentIds.length}
        canSend={!aiLoading && Boolean(chatInput.trim()) && hasBrainModel}
        messages={aiMessages}
        onInputChange={setChatInput}
        onModelChange={setBrainModelRef}
        onClearSelection={() => {
          setSelectedId(null);
          setSelectedEdgeId(null);
        }}
        onUploadImage={() => brainImageInputRef.current?.click()}
        onSubmit={() => void submitAiCommand()}
        onAction={(action) =>
          void submitAiCommand({
            command: action.command,
            display: action.label,
          })
        }
      />

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

      <CanvasHiddenFileInputs
        brainImageInputRef={brainImageInputRef}
        imageInputRef={imageInputRef}
        videoInputRef={videoInputRef}
        audioInputRef={audioInputRef}
        importInputRef={importInputRef}
        pendingImageTargetRef={pendingImageTargetRef}
        pendingVideoTargetRef={pendingVideoTargetRef}
        pendingAudioTargetRef={pendingAudioTargetRef}
        onBrainImageFile={handleBrainImageFile}
        onImageFile={handleImageFile}
        onVideoFile={handleVideoFile}
        onAudioFile={handleAudioFile}
        onImportFile={handleImportFile}
      />
    </main>
  );
}
