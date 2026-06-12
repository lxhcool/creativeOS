import { createTextElement } from "@/entities/canvas/lib/factory";
import type {
  CanvasElement,
  CanvasTextElement,
} from "@/entities/canvas/model/types";
import { buildFallbackMaterialText } from "../lib/fallback";
import { hasConcreteAsset } from "../lib/material";
import type {
  CanvasActionIntent,
  CanvasBrainActionPlan,
  CanvasBrainMessage,
} from "./types";

type Position = {
  x: number;
  y: number;
};

export type PreparedCanvasBrainAction =
  | {
      kind: "ready";
      createdSourceElements: CanvasTextElement[];
      elements: CanvasElement[];
      sourceElements: CanvasElement[];
      sourceIds: string[];
      targetElement: CanvasElement;
      instruction: string;
      intent: CanvasActionIntent;
    }
  | {
      kind: "clarification";
      message: string;
    };

function createTextSourceNode(params: {
  text: string;
  position: Position;
}): CanvasTextElement {
  const element = createTextElement(params.position);
  return {
    ...element,
    text: params.text,
  };
}

function getCoordinatorTargetElement(elements: CanvasElement[]): CanvasElement | null {
  return (
    elements.find((element) => element.status === "generating") ||
    [...elements].reverse().find((element) => hasConcreteAsset(element)) ||
    [...elements].reverse().find((element) => element.kind === "text") ||
    [...elements].reverse()[0] ||
    null
  );
}

export function prepareCanvasBrainAction(params: {
  command: string;
  history: CanvasBrainMessage[];
  elements: CanvasElement[];
  selectedElement: CanvasElement | null;
  focusIds: string[];
  plan: CanvasBrainActionPlan;
  center: Position;
}): PreparedCanvasBrainAction {
  const normalizedCreatedSources =
    params.plan.createdSources.length === 0 &&
    params.plan.outputKind !== "text" &&
    params.plan.sourceIds.length === 0 &&
    params.focusIds.length === 0
      ? [
          {
            kind: "text" as const,
            content: buildFallbackMaterialText({
              command: params.command,
              history: params.history,
            }),
          },
        ]
      : params.plan.createdSources;

  const createdSourceElements = normalizedCreatedSources.map((source, index) =>
    createTextSourceNode({
      text: source.content,
      position: {
        x: params.center.x + index * 520,
        y: params.center.y,
      },
    }),
  );
  const elements = [...params.elements, ...createdSourceElements];

  const sourceElements = [
    ...params.plan.sourceIds
      .map((id) => params.elements.find((element) => element.id === id))
      .filter((element): element is CanvasElement => Boolean(element)),
    ...params.focusIds
      .map((id) => params.elements.find((element) => element.id === id))
      .filter((element): element is CanvasElement => Boolean(element)),
    ...createdSourceElements,
  ];
  const uniqueSourceElements = Array.from(
    new Map(sourceElements.map((element) => [element.id, element])).values(),
  );
  const plannedTarget =
    params.selectedElement ||
    uniqueSourceElements[0] ||
    null;

  if (!plannedTarget && params.elements.length > 1 && params.plan.outputKind !== "text") {
    return {
      kind: "clarification",
      message: "我没有从画布关系里确定要使用哪组素材，请先选中相关节点，或把相关节点连起来。",
    };
  }

  const targetElement = plannedTarget || getCoordinatorTargetElement(elements);
  if (!targetElement) {
    return {
      kind: "clarification",
      message: "我还没有找到可以承接这次操作的素材。",
    };
  }

  return {
    kind: "ready",
    createdSourceElements,
    elements,
    sourceElements: uniqueSourceElements,
    sourceIds: uniqueSourceElements.map((element) => element.id),
    targetElement,
    instruction: params.plan.instruction,
    intent: {
      outputKind: params.plan.outputKind,
      placement: params.plan.placement,
      instruction: params.plan.instruction,
    },
  };
}
