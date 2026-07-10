import { Eye } from "lucide-react";
import type {
  CanvasElement,
  CanvasTextElement,
  CanvasViewport,
} from "@/entities/canvas/model/types";
import { getCanvasNodeEditorFrame } from "../lib/editor";

export function CanvasTextPreviewButtons(params: {
  elements: CanvasElement[];
  viewport: CanvasViewport;
  viewportSize: { width: number; height: number };
  onPreview: (element: CanvasTextElement) => void;
}) {
  return (
    <>
      {params.elements.map((element) => {
        if (
          element.kind !== "text" ||
          element.text.trim().length === 0 ||
          element.status === "generating"
        ) {
          return null;
        }

        const frame = getCanvasNodeEditorFrame(
          element,
          params.viewport,
          params.viewportSize,
        );

        return (
          <button
            key={`preview_button_${element.id}`}
            type="button"
            className="fixed z-[90] flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-white/[0.1] bg-[#02070b]/[0.86] text-white/62 shadow-[0_10px_26px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-xl transition-colors duration-200 hover:bg-white/[0.12] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/18"
            style={{
              left: Math.min(
                params.viewportSize.width - 40,
                Math.max(12, frame.left + frame.width - 42),
              ),
              top: Math.min(
                params.viewportSize.height - 40,
                Math.max(12, frame.top + 12),
              ),
            }}
            aria-label="预览内容"
            title="预览内容"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              params.onPreview(element);
            }}
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </>
  );
}
