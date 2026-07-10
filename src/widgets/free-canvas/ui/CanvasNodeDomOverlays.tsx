import type {
  CanvasElement,
  CanvasProcessorElement,
  CanvasTemplateElement,
  CanvasViewport,
} from "@/entities/canvas/model/types";
import type { CanvasModelEntry } from "@/features/canvas-brain";
import { CanvasProcessorNodeOverlay } from "./CanvasProcessorNodeOverlay";
import { CanvasSequenceTemplateOverlay } from "./CanvasSequenceTemplateOverlay";

export function CanvasNodeDomOverlays(params: {
  processorElements: CanvasProcessorElement[];
  frameSequenceElements: CanvasTemplateElement[];
  viewport: CanvasViewport;
  currentProjectId: string | null;
  imageModelEntry?: CanvasModelEntry;
  onSelectElement: (id: string) => void;
  onMoveElement: (id: string, updates: Partial<CanvasElement>) => void;
  onRunProcessor: (
    element: CanvasProcessorElement,
    config: Record<string, unknown>,
  ) => void;
  onSequencePropsChange: (
    element: CanvasTemplateElement,
    props: Record<string, unknown>,
  ) => void;
  onMessage: (message: string) => void;
}) {
  return (
    <>
      {params.processorElements.map((element) => (
        <CanvasProcessorNodeOverlay
          key={`processor_overlay_${element.id}`}
          element={element}
          viewport={params.viewport}
          onSelect={() => params.onSelectElement(element.id)}
          onMove={(updates) => params.onMoveElement(element.id, updates)}
          onRun={(config) => params.onRunProcessor(element, config)}
        />
      ))}

      {params.frameSequenceElements.map((element) => (
        <CanvasSequenceTemplateOverlay
          key={`sequence_overlay_${element.id}`}
          element={element}
          viewport={params.viewport}
          currentProjectId={params.currentProjectId}
          imageModelEntry={params.imageModelEntry}
          onSelect={() => params.onSelectElement(element.id)}
          onMove={(updates) => params.onMoveElement(element.id, updates)}
          onPropsChange={(props) => params.onSequencePropsChange(element, props)}
          onMessage={params.onMessage}
        />
      ))}
    </>
  );
}
