import {
  isCanvasEdge,
  isCanvasElement,
} from "@/entities/canvas/lib/factory";
import type {
  CanvasAssistantMessage,
  CanvasAssistantSession,
  CanvasElement,
  CanvasProjectExport,
  CanvasTextElement,
  CanvasViewport,
} from "@/entities/canvas/model/types";
import { MAX_SCALE, MIN_SCALE } from "../model/constants";
import type { CanvasFlowDirection } from "./geometry";
import { clamp } from "./geometry";

const CANVAS_ACTIVE_PROJECT_ID_KEY = "creativeos.canvas.activeProjectId.v1";
const CANVAS_FLOW_DIRECTION_KEY = "creativeos.canvas.flowDirection.v1";

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
  assistantMessages?: CanvasAssistantMessage[];
  assistantSession?: CanvasAssistantSession;
}): CanvasProjectExport {
  return {
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    viewport: params.viewport,
    elements: params.elements,
    edges: params.edges,
    assistantMessages: params.assistantMessages,
    assistantSession: params.assistantSession,
  };
}

export function createBlankCanvasProjectPayload(): CanvasProjectExport {
  return createCanvasProjectPayload({
    elements: [],
    edges: [],
    viewport: {
      x: 0,
      y: 0,
      scale: 1,
    },
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
  const assistantSession =
    data.assistantSession &&
    typeof data.assistantSession === "object" &&
    typeof data.assistantSession.summary === "string" &&
    typeof data.assistantSession.updatedAt === "string"
      ? {
          summary: data.assistantSession.summary,
          lastFocusElementId:
            typeof data.assistantSession.lastFocusElementId === "string"
              ? data.assistantSession.lastFocusElementId
              : undefined,
          updatedAt: data.assistantSession.updatedAt,
        }
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
    elements: importedElements,
    edges: importedEdges,
    assistantMessages,
    assistantSession,
  };
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
