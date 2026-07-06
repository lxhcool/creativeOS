import {
  isCanvasEdge,
  isCanvasElement,
} from "@/entities/canvas/lib/factory";
import type {
  CanvasAssistantMessage,
  CanvasElement,
  CanvasProjectExport,
  CanvasTextElement,
  CanvasViewport,
  CanvasWorkflowType,
} from "@/entities/canvas/model/types";
import { getCanvasWorkflowStrategy } from "@/features/canvas-workflows";
import { MAX_SCALE, MIN_SCALE } from "../model/constants";
import type { CanvasFlowDirection } from "./geometry";
import { clamp } from "./geometry";

const CANVAS_PROJECT_INDEX_KEY = "creativeos.canvas.projects.v1";
const CANVAS_ACTIVE_PROJECT_ID_KEY = "creativeos.canvas.activeProjectId.v1";
const CANVAS_PROJECT_STORAGE_PREFIX = "creativeos.canvas.project.v1.";
const CANVAS_SAVE_HISTORY_PREFIX = "creativeos.canvas.saveHistory.v1.";
const CANVAS_FLOW_DIRECTION_KEY = "creativeos.canvas.flowDirection.v1";
export const CANVAS_SAVE_HISTORY_LIMIT = 12;

export type CanvasProjectRecord = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  nodeCount: number;
  edgeCount: number;
  workflowType?: CanvasWorkflowType;
};

export type CanvasSaveHistoryItem = {
  id: string;
  name: string;
  savedAt: string;
  nodeCount: number;
  edgeCount: number;
  payload: CanvasProjectExport;
};

export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function createCanvasProjectPayload(params: {
  elements: CanvasElement[];
  edges: CanvasProjectExport["edges"];
  viewport: CanvasViewport;
  workflowType?: CanvasWorkflowType;
  assistantMessages?: CanvasAssistantMessage[];
}): CanvasProjectExport {
  return {
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    workflowType: params.workflowType || "free",
    viewport: params.viewport,
    elements: params.elements,
    edges: params.edges,
    assistantMessages: params.assistantMessages,
  };
}

export function getNormalizedWorkflowType(value: unknown): CanvasWorkflowType {
  return value === "novel" || value === "video" || value === "image" ? value : "free";
}

export function createBlankCanvasProjectPayload(
  workflowType: CanvasWorkflowType = "free",
): CanvasProjectExport {
  const initial = getCanvasWorkflowStrategy(workflowType).initNodes();

  return createCanvasProjectPayload({
    workflowType,
    elements: initial.elements,
    edges: initial.edges,
    viewport: initial.viewport,
  });
}

export function getCanvasSaveId(): string {
  return `save_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getCanvasProjectId(): string {
  return `canvas_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatCanvasTimestamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function getCanvasProjectFilename(payload: CanvasProjectExport): string {
  const exportedAt = new Date(payload.exportedAt);
  const timestamp = Number.isNaN(exportedAt.getTime())
    ? formatCanvasTimestamp()
    : formatCanvasTimestamp(exportedAt);
  return `creativeos-canvas-${timestamp}.json`;
}

export function getCanvasProjectName(
  payload: CanvasProjectExport,
  fallback = "画布快照",
): string {
  const firstText = payload.elements.find(
    (element): element is CanvasTextElement =>
      element.kind === "text" && Boolean(element.text.trim()),
  );

  if (firstText) {
    const title = firstText.meta?.title || firstText.text.trim().split(/\s+/)[0] || fallback;
    return title.slice(0, 28);
  }

  return fallback;
}

export function getCanvasProjectStorageKey(projectId: string): string {
  return `${CANVAS_PROJECT_STORAGE_PREFIX}${projectId}`;
}

export function getCanvasProjectHistoryKey(projectId: string): string {
  return `${CANVAS_SAVE_HISTORY_PREFIX}${projectId}`;
}

export function createCanvasProjectRecord(params: {
  id: string;
  payload: CanvasProjectExport;
  name?: string;
  previous?: CanvasProjectRecord;
}): CanvasProjectRecord {
  const now = new Date().toISOString();
  const fallbackName = params.previous?.name || "未命名画布";

  return {
    id: params.id,
    name: params.name?.trim() || getCanvasProjectName(params.payload, fallbackName),
    createdAt: params.previous?.createdAt || now,
    updatedAt: now,
    nodeCount: params.payload.elements.length,
    edgeCount: params.payload.edges.length,
    workflowType: getNormalizedWorkflowType(params.payload.workflowType),
  };
}

export function normalizeCanvasProjectExport(
  data: Partial<CanvasProjectExport>,
): CanvasProjectExport {
  const importedElements = Array.isArray(data.elements)
    ? data.elements.filter(isCanvasElement)
    : [];
  const importedElementIds = new Set(importedElements.map((element) => element.id));
  const importedEdges = Array.isArray(data.edges)
    ? data.edges
        .filter(isCanvasEdge)
        .filter(
          (edge) =>
            importedElementIds.has(edge.sourceId) &&
            importedElementIds.has(edge.targetId),
        )
    : [];
  const assistantMessages = Array.isArray(data.assistantMessages)
    ? data.assistantMessages
        .map((message): CanvasAssistantMessage | null => {
          if (!message || typeof message !== "object") return null;
          if (message.role !== "user" && message.role !== "assistant") return null;
          if (typeof message.content !== "string") return null;

          const actions = Array.isArray(message.actions)
            ? message.actions
                .map((action) => {
                  if (!action || typeof action !== "object") return null;
                  if (
                    typeof action.id !== "string" ||
                    typeof action.label !== "string" ||
                    typeof action.command !== "string"
                  ) {
                    return null;
                  }
                  return {
                    id: action.id,
                    label: action.label,
                    command: action.command,
                  };
                })
                .filter((action): action is NonNullable<typeof action> => Boolean(action))
            : undefined;

          return {
            role: message.role,
            content: message.content,
            actions,
          };
        })
        .filter((message): message is CanvasAssistantMessage => Boolean(message))
    : undefined;

  return {
    version: "1.0.0",
    exportedAt:
      typeof data.exportedAt === "string" ? data.exportedAt : new Date().toISOString(),
    viewport: {
      x: typeof data.viewport?.x === "number" ? data.viewport.x : 0,
      y: typeof data.viewport?.y === "number" ? data.viewport.y : 0,
      scale:
        typeof data.viewport?.scale === "number"
          ? clamp(data.viewport.scale, MIN_SCALE, MAX_SCALE)
          : 1,
    },
    workflowType: getNormalizedWorkflowType(data.workflowType),
    elements: importedElements,
    edges: importedEdges,
    assistantMessages,
  };
}

export function readCanvasProjectFromStorage(key: string): CanvasProjectExport | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return normalizeCanvasProjectExport(JSON.parse(raw) as Partial<CanvasProjectExport>);
  } catch (error) {
    console.warn("Failed to read canvas project", error);
    return null;
  }
}

export function writeCanvasProjectToStorage(
  key: string,
  payload: CanvasProjectExport,
): boolean {
  if (typeof window === "undefined") return false;

  try {
    window.localStorage.setItem(key, JSON.stringify(payload));
    return true;
  } catch (error) {
    console.warn("Failed to save canvas project", error);
    return false;
  }
}

export function readCanvasProjectRecords(): CanvasProjectRecord[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(CANVAS_PROJECT_INDEX_KEY);
    if (!raw) return [];
    const items = JSON.parse(raw) as CanvasProjectRecord[];
    if (!Array.isArray(items)) return [];

    return items
      .map((item): CanvasProjectRecord | null => {
        if (!item || typeof item !== "object" || typeof item.id !== "string") {
          return null;
        }

        return {
          id: item.id,
          name:
            typeof item.name === "string" && item.name.trim()
              ? item.name.trim()
              : "未命名画布",
          createdAt:
            typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
          updatedAt:
            typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
          nodeCount: typeof item.nodeCount === "number" ? item.nodeCount : 0,
          edgeCount: typeof item.edgeCount === "number" ? item.edgeCount : 0,
          workflowType: getNormalizedWorkflowType(item.workflowType),
        };
      })
      .filter((item): item is CanvasProjectRecord => Boolean(item));
  } catch (error) {
    console.warn("Failed to read canvas projects", error);
    return [];
  }
}

export function writeCanvasProjectRecords(items: CanvasProjectRecord[]): boolean {
  if (typeof window === "undefined") return false;

  try {
    window.localStorage.setItem(CANVAS_PROJECT_INDEX_KEY, JSON.stringify(items));
    return true;
  } catch (error) {
    console.warn("Failed to save canvas projects", error);
    return false;
  }
}

export function readActiveCanvasProjectId(): string | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage.getItem(CANVAS_ACTIVE_PROJECT_ID_KEY);
  } catch (error) {
    console.warn("Failed to read active canvas project", error);
    return null;
  }
}

export function writeActiveCanvasProjectId(projectId: string): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(CANVAS_ACTIVE_PROJECT_ID_KEY, projectId);
  } catch (error) {
    console.warn("Failed to save active canvas project", error);
  }
}

export function readCanvasFlowDirection(): CanvasFlowDirection {
  if (typeof window === "undefined") return "horizontal";

  try {
    const value = window.localStorage.getItem(CANVAS_FLOW_DIRECTION_KEY);
    return value === "vertical" ? "vertical" : "horizontal";
  } catch (error) {
    console.warn("Failed to read canvas flow direction", error);
    return "horizontal";
  }
}

export function writeCanvasFlowDirection(direction: CanvasFlowDirection): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(CANVAS_FLOW_DIRECTION_KEY, direction);
  } catch (error) {
    console.warn("Failed to save canvas flow direction", error);
  }
}

export function removeActiveCanvasProjectId(): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(CANVAS_ACTIVE_PROJECT_ID_KEY);
  } catch (error) {
    console.warn("Failed to remove active canvas project", error);
  }
}

export function removeCanvasProjectFromStorage(projectId: string): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(getCanvasProjectStorageKey(projectId));
    window.localStorage.removeItem(getCanvasProjectHistoryKey(projectId));
  } catch (error) {
    console.warn("Failed to remove canvas project", error);
  }
}

export function readCanvasSaveHistory(projectId: string): CanvasSaveHistoryItem[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(getCanvasProjectHistoryKey(projectId));
    if (!raw) return [];
    const items = JSON.parse(raw) as CanvasSaveHistoryItem[];
    if (!Array.isArray(items)) return [];

    return items
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const payload = normalizeCanvasProjectExport(item.payload || {});
        return {
          id: typeof item.id === "string" ? item.id : getCanvasSaveId(),
          name:
            typeof item.name === "string" && item.name.trim()
              ? item.name.trim()
              : getCanvasProjectName(payload),
          savedAt:
            typeof item.savedAt === "string" ? item.savedAt : new Date().toISOString(),
          nodeCount:
            typeof item.nodeCount === "number" ? item.nodeCount : payload.elements.length,
          edgeCount: typeof item.edgeCount === "number" ? item.edgeCount : payload.edges.length,
          payload,
        };
      })
      .filter((item): item is CanvasSaveHistoryItem => Boolean(item))
      .slice(0, CANVAS_SAVE_HISTORY_LIMIT);
  } catch (error) {
    console.warn("Failed to read canvas save history", error);
    return [];
  }
}

export function writeCanvasSaveHistory(
  projectId: string,
  items: CanvasSaveHistoryItem[],
): boolean {
  if (typeof window === "undefined") return false;

  try {
    window.localStorage.setItem(
      getCanvasProjectHistoryKey(projectId),
      JSON.stringify(items.slice(0, CANVAS_SAVE_HISTORY_LIMIT)),
    );
    return true;
  } catch (error) {
    console.warn("Failed to save canvas history", error);
    return false;
  }
}
