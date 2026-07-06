import {
  executeCanvasBrainMediaGeneration,
  getCanvasBrainDoneMessage,
  getCanvasBrainFailureMessage,
  getCanvasBrainGeneratingMessage,
  getCanvasReferenceImageUrls,
  hasConcreteAsset,
  resolveCanvasExecutionSources,
  type CanvasModelEntry,
} from "@/features/canvas-brain";
import type {
  CanvasElement,
  CanvasImageElement,
  CanvasMediaElement,
  CanvasTemplateElement,
} from "@/entities/canvas/model/types";
import {
  appendResultNode,
  createResultPlaceholder,
} from "@/entities/canvas/lib/workflow";
import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  NODE_PADDING,
} from "../model/constants";
import type { CanvasSnapshot } from "../model/types";
import type { CanvasFlowDirection } from "./geometry";
import { getCanvasGenericResultPosition } from "./textResultLayout";

type CanvasCommitInput =
  | { elements?: CanvasElement[]; edges?: CanvasSnapshot["edges"] }
  | ((current: CanvasSnapshot) => {
      elements?: CanvasElement[];
      edges?: CanvasSnapshot["edges"];
    });

export async function runCanvasMediaNodeGeneration(params: {
  element: CanvasImageElement | CanvasMediaElement | CanvasTemplateElement;
  prompt: string;
  modelRef: string;
  modelEntry: CanvasModelEntry;
  elements: CanvasElement[];
  edges: CanvasSnapshot["edges"];
  flowDirection: CanvasFlowDirection;
  commitCanvas: (next: CanvasCommitInput) => void;
  patchElementDraft: (id: string, updates: Partial<CanvasElement>) => void;
  setSelectedId: (id: string | null) => void;
  appendAiMessage: (content: string) => void;
  getResolvedBrainModelEntry: () => CanvasModelEntry | undefined;
}): Promise<void> {
  const {
    element,
    prompt,
    modelRef,
    modelEntry,
    elements,
    edges,
    flowDirection,
    commitCanvas,
    patchElementDraft,
    setSelectedId,
    appendAiMessage,
    getResolvedBrainModelEntry,
  } = params;

  const mediaSourceElements = resolveCanvasExecutionSources({
    targetId: element.id,
    elements,
    edges,
  });

  if (element.kind === "image" || element.kind === "video") {
    const shouldCreateResult = hasConcreteAsset(element);
    const resultNode = shouldCreateResult
      ? createResultPlaceholder({
          source: element,
          kind: element.kind,
          prompt,
          modelRef,
          position: getCanvasGenericResultPosition(element, flowDirection),
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
        getCanvasBrainGeneratingMessage({
          kind: element.kind,
          hasMaterialContext: false,
        }),
      );
      const patch = await executeCanvasBrainMediaGeneration({
        kind: element.kind,
        prompt,
        referenceImageUrls:
          element.kind === "image"
            ? getCanvasReferenceImageUrls([element, ...mediaSourceElements])
            : undefined,
        provider: modelEntry.provider!,
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
        getCanvasBrainDoneMessage({
          kind: element.kind,
          createdResult: shouldCreateResult,
        }),
      );
    } catch (error) {
      const detail =
        error instanceof Error
          ? error.message
          : element.kind === "image"
            ? "图片生成失败"
            : "视频生成失败";
      const message = getCanvasBrainFailureMessage({
        kind: element.kind,
        detail,
      });
      patchElementDraft(resultNode.id, {
        status: "failed",
        error: message,
      } as Partial<CanvasElement>);
      appendAiMessage(message);
    }
    return;
  }

  if (element.kind === "audio") {
    const resultNode = createResultPlaceholder({
      source: element,
      kind: "audio",
      prompt,
      modelRef,
      position: getCanvasGenericResultPosition(element, flowDirection),
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
    appendAiMessage("我已经准备好一个新的音频素材位置。");
    return;
  }

  appendAiMessage("模板节点会通过动作面板处理，暂不支持直接发送生成。");
}
