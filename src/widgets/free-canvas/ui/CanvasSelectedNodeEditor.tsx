import type { MouseEvent } from "react";
import type {
  CanvasElement,
} from "@/entities/canvas/model/types";
import type { CanvasModelOption } from "@/features/canvas-brain";
import type { CanvasExecutionOptions } from "../lib/textGeneration";
import {
  CanvasNodeEditorPanel,
  type CanvasNodeGenerateOptions,
} from "./CanvasNodeEditorPanel";

type EditorFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function CanvasSelectedNodeEditor(params: {
  element: CanvasElement | null;
  frame: EditorFrame | null;
  elements: CanvasElement[];
  modelOptions: CanvasModelOption[];
  modelValue: string;
  disabled: boolean;
  onPatchElement: (id: string, updates: Partial<CanvasElement>) => void;
  onContextMenu: (id: string, event: MouseEvent<HTMLElement>) => void;
  onGenerate: (
    element: CanvasElement,
    instructionOverride?: string,
    options?: CanvasExecutionOptions,
  ) => Promise<void>;
}) {
  const {
    element,
    frame,
  } = params;
  if (!element || element.kind === "processor" || !frame) return null;

  return (
    <CanvasNodeEditorPanel
      element={element}
      frame={frame}
      modelOptions={params.modelOptions}
      modelValue={params.modelValue}
      onTextChange={(text) =>
        params.onPatchElement(element.id, { text } as Partial<CanvasElement>)
      }
      onPromptChange={(prompt) =>
        params.onPatchElement(element.id, { prompt })
      }
      onModelChange={(modelRef) =>
        params.onPatchElement(element.id, { modelRef })
      }
      disabled={params.disabled}
      onContextMenu={
        element.status === "generating"
          ? undefined
          : (event) => params.onContextMenu(element.id, event)
      }
      onGenerate={(options?: CanvasNodeGenerateOptions) => {
        const instruction = options?.instruction?.trim();
        const elementForGeneration =
          element.kind === "text" && options?.sourceText !== undefined
            ? {
                ...element,
                text: options.sourceText,
              }
            : element;
        const baseElements =
          element.kind === "text" && options?.sourceText !== undefined
            ? params.elements.map((item) =>
                item.id === element.id
                  ? ({
                      ...item,
                      text: options.sourceText,
                    } as CanvasElement)
                  : item,
              )
            : undefined;
        const executionOptions =
          element.kind === "text" && instruction && options?.placement
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

        void params.onGenerate(
          elementForGeneration,
          instruction || undefined,
          executionOptions,
        );
      }}
    />
  );
}
