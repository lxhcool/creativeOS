import type { CanvasWorkflowAnchorConfig } from "@/features/canvas-workflows";

export function CanvasAnchorNavigator({
  anchors,
  activeAnchorId,
  panelClassName,
  onNavigate,
}: {
  anchors: CanvasWorkflowAnchorConfig;
  activeAnchorId?: string;
  panelClassName: string;
  onNavigate: (anchorId: string) => void;
}) {
  if (anchors.length === 0) return null;

  return (
    <nav
      className={`fixed left-1/2 top-5 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full p-1.5 ${panelClassName}`}
      aria-label="工作流锚点导航"
    >
      {anchors.map((anchor) => (
        <button
          key={anchor.id}
          type="button"
          onClick={() => onNavigate(anchor.id)}
          className={`h-8 cursor-pointer rounded-full px-3 text-xs font-semibold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/15 ${
            activeAnchorId === anchor.id
              ? "bg-white/[0.14] text-white"
              : "text-white/55 hover:bg-white/[0.08] hover:text-white/86"
          }`}
        >
          {anchor.label}
        </button>
      ))}
    </nav>
  );
}
