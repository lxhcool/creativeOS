import type { ReactNode } from "react";

interface TooltipProps {
  content: string;
  children: ReactNode;
  /** Position relative to children: top, bottom, left, right */
  position?: "top" | "bottom" | "left" | "right";
}

const positionClasses = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
};

export function Tooltip({
  content,
  children,
  position = "top",
}: TooltipProps) {
  return (
    <div className="group relative inline-flex">
      {children}
      <div
        className={`
          pointer-events-none absolute z-40
          invisible opacity-0
          group-hover:visible group-hover:opacity-100
          transition-opacity duration-200
          ${positionClasses[position]}
        `.trim()}
      >
        <div className="rounded-md bg-bg-tertiary px-2.5 py-1.5 text-xs text-text-primary shadow-lg border border-border whitespace-nowrap">
          {content}
        </div>
      </div>
    </div>
  );
}
