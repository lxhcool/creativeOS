import { useRef, type PointerEvent } from "react";
import type {
  CanvasProcessorElement,
  CanvasViewport,
} from "@/entities/canvas/model/types";
import { CanvasProcessorControls } from "./CanvasProcessorControls";

type Props = {
  element: CanvasProcessorElement;
  viewport: CanvasViewport;
  onSelect: () => void;
  onMove: (updates: Pick<CanvasProcessorElement, "x" | "y">) => void;
  onRun: (config: Record<string, unknown>) => void;
};

type DragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
};

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, button, label"));
}

export function CanvasProcessorNodeOverlay({
  element,
  viewport,
  onSelect,
  onMove,
  onRun,
}: Props) {
  const dragStateRef = useRef<DragState | null>(null);

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    onSelect();
    if (isInteractiveTarget(event.target)) return;

    dragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: element.x,
      startY: element.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    event.stopPropagation();

    onMove({
      x: dragState.startX + (event.clientX - dragState.startClientX) / viewport.scale,
      y: dragState.startY + (event.clientY - dragState.startClientY) / viewport.scale,
    });
  };

  const stopDrag = (event: PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    event.stopPropagation();
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div
      className="absolute z-20 cursor-grab overflow-hidden rounded-lg border border-white/10 bg-[#111214] text-white shadow-2xl shadow-black/40 active:cursor-grabbing"
      style={{
        left: viewport.x + element.x * viewport.scale,
        top: viewport.y + element.y * viewport.scale,
        width: element.width,
        height: element.height,
        transform: `scale(${viewport.scale})`,
        transformOrigin: "top left",
      }}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="flex h-full min-h-0 flex-col p-4">
        <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-white/92">
              {element.title}
            </h3>
            <p className="mt-1 truncate text-[11px] font-semibold text-white/42">
              {element.status === "generating"
                ? "处理中"
                : element.status === "failed"
                  ? "处理失败"
                  : "调整参数后手动处理"}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.045] px-2 py-1 text-[10px] text-white/45">
            processor
          </span>
        </div>
        <CanvasProcessorControls
          element={element}
          mode="node"
          onRun={onRun}
        />
      </div>
    </div>
  );
}
