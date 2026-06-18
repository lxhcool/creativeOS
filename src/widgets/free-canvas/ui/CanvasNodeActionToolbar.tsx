import { Scissors, Sparkles } from "lucide-react";
import type { CanvasActionDefinition } from "@/features/canvas-actions";

type Props = {
  frame: { left: number; top: number };
  actions: CanvasActionDefinition[];
  onAction: (action: CanvasActionDefinition) => void;
};

export function CanvasNodeActionToolbar({ frame, actions, onAction }: Props) {
  if (actions.length === 0) return null;

  return (
    <div
      className="fixed z-30 flex h-12 items-center gap-1 rounded-full border border-white/10 bg-[#1d1d1d]/95 px-3 text-white shadow-2xl shadow-black/40 backdrop-blur-2xl"
      style={{
        left: frame.left,
        top: frame.top,
        transform: "translateX(-50%)",
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={() => onAction(action)}
          className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full px-3 text-sm font-semibold text-white/88 transition hover:bg-white/[0.08] hover:text-white"
        >
          <Sparkles className="h-4 w-4" />
          {action.label}
        </button>
      ))}
      <span className="mx-1 h-7 w-px bg-white/10" />
      <button
        type="button"
        disabled
        className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-semibold text-white/34"
      >
        <Scissors className="h-4 w-4" />
        裁剪
      </button>
    </div>
  );
}
