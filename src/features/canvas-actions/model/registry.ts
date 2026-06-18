import type { CanvasElement } from "@/entities/canvas/model/types";
import { videoActions } from "../actions/video";
import type { CanvasActionDefinition } from "./types";

const canvasActions: CanvasActionDefinition[] = [
  ...videoActions,
];

export function getCanvasActionsForElement(
  element: CanvasElement,
): CanvasActionDefinition[] {
  return canvasActions.filter((action) => action.inputKinds.includes(element.kind));
}

export function getCanvasActionById(
  actionId: string,
): CanvasActionDefinition | undefined {
  return canvasActions.find((action) => action.id === actionId);
}
