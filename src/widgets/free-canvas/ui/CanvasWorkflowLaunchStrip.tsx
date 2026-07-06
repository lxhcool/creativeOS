import { Bot } from "lucide-react";
import type { CanvasWorkflowStarterConfig } from "@/features/canvas-workflows";

export function CanvasWorkflowLaunchStrip({
  workflowLabel,
  starters,
  onFocusAssistant,
}: {
  workflowLabel: string;
  starters: CanvasWorkflowStarterConfig[];
  onFocusAssistant: (starter?: CanvasWorkflowStarterConfig) => void;
}) {
  return (
    <section className="fixed left-[104px] right-5 top-[88px] z-20">
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-[#02070b]/[0.78] px-3 py-2 text-[12px] font-medium text-white/62 shadow-2xl shadow-black/30 backdrop-blur-2xl">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.1] text-white/80">
          <Bot className="h-3.5 w-3.5" />
        </span>
        <span>{workflowLabel}</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => onFocusAssistant()}
          className="flex h-[118px] w-[178px] shrink-0 cursor-pointer flex-col items-center justify-center rounded-[18px] border border-dashed border-white/[0.16] bg-white/[0.055] text-white/66 shadow-2xl shadow-black/20 backdrop-blur-xl transition hover:border-white/[0.24] hover:bg-white/[0.1] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/15"
        >
          <span className="text-3xl leading-none">+</span>
          <span className="mt-2 text-[13px] font-semibold">开始创作</span>
        </button>
        {starters.map((starter) => (
          <button
            key={starter.id}
            type="button"
            onClick={() => onFocusAssistant(starter)}
            className="group relative h-[118px] w-[280px] shrink-0 overflow-hidden rounded-[18px] border border-white/[0.11] bg-white/[0.07] px-5 py-4 text-left text-white shadow-2xl shadow-black/25 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-white/[0.18] hover:bg-white/[0.1] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/15"
          >
            <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-[30px] border border-white/[0.12] bg-white/[0.08] rotate-[-5deg] transition group-hover:bg-white/[0.12]" />
            <div className="relative">
              <div className="text-[13px] font-semibold text-white/92">
                {starter.label}
              </div>
              <div className="mt-3 line-clamp-2 max-w-[210px] text-[12px] leading-5 text-white/48">
                {starter.description}
              </div>
              <div className="mt-3 text-[11px] text-white/34">
                点击生成方向
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
