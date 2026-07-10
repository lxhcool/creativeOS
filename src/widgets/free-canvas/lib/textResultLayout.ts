import {
  getCanvasTextRole,
} from "@/entities/canvas/lib/textRoles";
import type {
  CanvasEdge,
  CanvasElement,
  CanvasTextElement,
  CanvasTextResultRelationKind,
  CanvasTextRole,
} from "@/entities/canvas/model/types";
import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
} from "../model/constants";
import type { CanvasFlowDirection } from "./geometry";

export function getNextTextResultVersion(params: {
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

export function findReusableFailedTextResult(params: {
  elements: CanvasElement[];
  edges: CanvasEdge[];
  sourceId: string;
  resultTextRole: CanvasTextRole;
  instruction: string;
}): CanvasTextElement | undefined {
  const directChildIds = new Set(
    params.edges
      .filter((edge) => edge.sourceId === params.sourceId)
      .map((edge) => edge.targetId),
  );
  const normalizedInstruction = params.instruction.trim();

  return params.elements
    .filter((element): element is CanvasTextElement => element.kind === "text")
    .toReversed()
    .find((element) => {
      const isSourceChild =
        element.meta?.sourceNodeId === params.sourceId ||
        element.meta?.parentNodeId === params.sourceId ||
        directChildIds.has(element.id);
      const sameInstruction =
        !normalizedInstruction ||
        (element.prompt || "").trim() === normalizedInstruction;

      return (
        element.status === "failed" &&
        isSourceChild &&
        getCanvasTextRole(element.textRole) === params.resultTextRole &&
        sameInstruction
      );
    });
}

export function getNextTextChapterNo(params: {
  source: CanvasElement;
  resultTextRole: CanvasTextRole;
  instruction: string;
}): number | undefined {
  void params;
  return undefined;
}

function getCanvasTextResultSiblingSlot(index: number): number {
  if (index === 0) return 0;
  const magnitude = Math.ceil(index / 2);
  return index % 2 === 1 ? magnitude : -magnitude;
}

const TEXT_RESULT_COLUMN_GAP = 360;
const TEXT_RESULT_ROW_GAP = 180;
const TEXT_RESULT_SUPPORT_GAP = 92;

function getCanvasHierarchicalTextResultPosition(params: {
  elements: CanvasElement[];
  edges: CanvasEdge[];
  source: CanvasElement;
  flowDirection?: CanvasFlowDirection;
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
  const siblingStep = Math.max(params.source.height, DEFAULT_NODE_HEIGHT) + 88;

  if (params.flowDirection === "vertical") {
    const horizontalStep = DEFAULT_NODE_WIDTH + 96;

    return {
      x: params.source.x + params.source.width / 2 + slot * horizontalStep,
      y:
        params.source.y +
        params.source.height +
        TEXT_RESULT_ROW_GAP +
        DEFAULT_NODE_HEIGHT / 2,
    };
  }

  return {
    x: params.source.x + params.source.width + TEXT_RESULT_COLUMN_GAP,
    y: params.source.y + params.source.height / 2 + slot * siblingStep,
  };
}

type CanvasTextResultLayoutKind =
  | "hierarchical"
  | "sequence"
  | "support"
  | "chapter_draft";

export function getCanvasTextResultRelationKind(params: {
  source: CanvasElement;
  resultTextRole: CanvasTextRole;
  actionId?: string;
}): CanvasTextResultRelationKind {
  if (params.source.kind !== "text") return "child";

  const sourceRole = getCanvasTextRole(params.source.textRole);
  const isCharacterSupport =
    sourceRole === "character_cast" &&
    (params.resultTextRole === "character_relation" ||
      params.resultTextRole === "character");

  if (isCharacterSupport) return "support";
  return "child";
}

export function getCanvasTextResultParentNodeId(params: {
  source: CanvasElement;
  relationKind: CanvasTextResultRelationKind;
}): string {
  if (params.relationKind === "sequence" && params.source.kind === "text") {
    return params.source.meta?.parentNodeId || params.source.id;
  }

  return params.source.id;
}

function getCanvasTextResultLayoutKind(params: {
  source: CanvasElement;
  resultTextRole: CanvasTextRole;
  actionId?: string;
}): CanvasTextResultLayoutKind {
  if (params.source.kind !== "text") return "hierarchical";

  const relationKind = getCanvasTextResultRelationKind(params);

  if (relationKind === "sequence") return "sequence";
  if (relationKind === "support") return "support";
  return "hierarchical";
}

function getCanvasSequentialTextResultPosition(params: {
  elements: CanvasElement[];
  edges: CanvasEdge[];
  source: CanvasElement;
  resultTextRole: CanvasTextRole;
  flowDirection?: CanvasFlowDirection;
}): { x: number; y: number } {
  const sourceRole =
    params.source.kind === "text" ? getCanvasTextRole(params.source.textRole) : "general";
  const directChildIds = new Set(
    params.edges
      .filter((edge) => edge.sourceId === params.source.id)
      .map((edge) => edge.targetId),
  );
  const existingSequenceCount = params.elements.filter(
    (element): element is CanvasTextElement =>
      element.kind === "text" &&
      element.id !== params.source.id &&
      getCanvasTextRole(element.textRole) === params.resultTextRole &&
      element.meta?.sourceRole === sourceRole &&
      (element.meta?.sourceNodeId === params.source.id ||
        element.meta?.parentNodeId === params.source.id ||
        directChildIds.has(element.id)),
  ).length;
  const slot = getCanvasTextResultSiblingSlot(existingSequenceCount);

  if (params.flowDirection === "vertical") {
    return {
      x: params.source.x + params.source.width / 2 + slot * 72,
      y:
        params.source.y +
        params.source.height +
        TEXT_RESULT_ROW_GAP +
        DEFAULT_NODE_HEIGHT / 2,
    };
  }

  return {
    x: params.source.x + params.source.width + TEXT_RESULT_COLUMN_GAP,
    y: params.source.y + params.source.height / 2 + slot * 56,
  };
}

function getCanvasSupportTextResultPosition(params: {
  elements: CanvasElement[];
  edges: CanvasEdge[];
  source: CanvasElement;
  resultTextRole: CanvasTextRole;
  flowDirection?: CanvasFlowDirection;
}): { x: number; y: number } {
  const directChildIds = new Set(
    params.edges
      .filter((edge) => edge.sourceId === params.source.id)
      .map((edge) => edge.targetId),
  );
  const supportCount = params.elements.filter((element): element is CanvasTextElement => {
    if (element.kind !== "text" || element.id === params.source.id) return false;
    const role = getCanvasTextRole(element.textRole);
    const isSupportRole = role === "character_relation" || role === "character";
    if (!isSupportRole) return false;

    return (
      element.meta?.parentNodeId === params.source.id ||
      element.meta?.sourceNodeId === params.source.id ||
      directChildIds.has(element.id)
    );
  }).length;
  const supportStep = DEFAULT_NODE_WIDTH + TEXT_RESULT_SUPPORT_GAP;

  if (params.flowDirection === "vertical") {
    const slot = getCanvasTextResultSiblingSlot(supportCount);

    return {
      x: params.source.x + params.source.width / 2 + slot * supportStep,
      y:
        params.source.y +
        params.source.height +
        TEXT_RESULT_ROW_GAP +
        DEFAULT_NODE_HEIGHT / 2,
    };
  }

  return {
    x: params.source.x + params.source.width / 2 + supportCount * supportStep,
    y:
      params.source.y +
      params.source.height +
      TEXT_RESULT_ROW_GAP +
      DEFAULT_NODE_HEIGHT / 2,
  };
}

function getCanvasChapterDraftTextResultPosition(params: {
  elements: CanvasElement[];
  edges: CanvasEdge[];
  source: CanvasElement;
  flowDirection?: CanvasFlowDirection;
}): { x: number; y: number } {
  const directChildIds = new Set(
    params.edges
      .filter((edge) => edge.sourceId === params.source.id)
      .map((edge) => edge.targetId),
  );
  const draftCount = params.elements.filter(
    (element): element is CanvasTextElement =>
      element.kind === "text" &&
      element.id !== params.source.id &&
      (element.meta?.parentNodeId === params.source.id ||
        element.meta?.sourceNodeId === params.source.id ||
        directChildIds.has(element.id)),
  ).length;
  const slot = getCanvasTextResultSiblingSlot(draftCount);

  return {
    x: params.source.x + params.source.width / 2 + slot * 72,
    y:
      params.source.y +
      params.source.height +
      TEXT_RESULT_ROW_GAP +
      DEFAULT_NODE_HEIGHT / 2,
  };
}

export function getCanvasTextResultPosition(params: {
  elements: CanvasElement[];
  edges: CanvasEdge[];
  source: CanvasElement;
  resultTextRole: CanvasTextRole;
  actionId?: string;
  flowDirection?: CanvasFlowDirection;
}): { x: number; y: number } {
  const layoutKind = getCanvasTextResultLayoutKind({
    source: params.source,
    resultTextRole: params.resultTextRole,
    actionId: params.actionId,
  });

  if (layoutKind === "sequence") {
    return getCanvasSequentialTextResultPosition(params);
  }
  if (layoutKind === "support") {
    return getCanvasSupportTextResultPosition(params);
  }
  if (layoutKind === "chapter_draft") {
    return getCanvasChapterDraftTextResultPosition(params);
  }

  return getCanvasHierarchicalTextResultPosition(params);
}

export function getCanvasGenericResultPosition(
  source: CanvasElement,
  flowDirection: CanvasFlowDirection,
): { x: number; y: number } {
  if (flowDirection === "vertical") {
    return {
      x: source.x + source.width / 2,
      y: source.y + source.height + TEXT_RESULT_ROW_GAP + DEFAULT_NODE_HEIGHT / 2,
    };
  }

  return {
    x: source.x + source.width + TEXT_RESULT_COLUMN_GAP,
    y: source.y + source.height / 2,
  };
}

export function shouldIgnoreCanvasLayoutEdge(params: {
  edge: CanvasEdge;
  target?: CanvasElement;
}): boolean {
  void params;
  return false;
}
