import { ImagePlus } from "lucide-react";
import type { CanvasElement } from "@/entities/canvas/model/types";
import type { CanvasSelectOption } from "../model/types";
import {
  getCanvasNodeEditorPlaceholder,
  getCanvasNodeEditorTitle,
} from "../lib/editor";

export function CanvasNodeEditorPanel({
  element,
  frame,
  modelOptions,
  modelValue,
  onTextChange,
  onPromptChange,
  onModelChange,
  onGenerate,
  onDelete,
}: {
  element: CanvasElement;
  frame: { left: number; top: number; width: number };
  modelOptions: CanvasSelectOption[];
  modelValue: string;
  onTextChange: (text: string) => void;
  onPromptChange: (prompt: string) => void;
  onModelChange: (modelRef: string) => void;
  onGenerate: () => void;
  onDelete: () => void;
}) {
  const title = getCanvasNodeEditorTitle(element);
  const isGenerating = element.status === "generating";
  const isFailed = element.status === "failed";

  return (
    <section
      className="fixed z-20 overflow-hidden border border-white/10 bg-black/[0.42] text-white shadow-2xl shadow-black/[0.35] backdrop-blur-2xl"
      style={{
        left: frame.left,
        top: frame.top,
        width: frame.width,
        borderRadius: 18,
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="min-h-[218px] bg-[radial-gradient(90%_90%_at_0%_0%,rgba(255,255,255,0.07),transparent_45%)] p-4">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            className="flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/16 bg-white/[0.035] text-xs font-medium text-white/72 transition hover:bg-white/[0.08] hover:text-white"
          >
            <ImagePlus className="h-5 w-5" />
            {title}
          </button>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-[11px] text-white/42">
              {isGenerating ? "生成中" : isFailed ? "生成失败" : "节点编辑"}
            </span>
            <button
              type="button"
              onClick={onDelete}
              disabled={isGenerating}
              className="rounded-full border border-red-200/10 bg-red-400/[0.08] px-3 py-1 text-[11px] font-medium text-red-100/58 transition hover:bg-red-400/[0.14] hover:text-red-50 disabled:cursor-not-allowed disabled:opacity-35"
            >
              删除
            </button>
          </div>
        </div>

        {element.kind === "text" && (
          <label className="mt-4 block">
            <span className="mb-2 block text-[11px] font-medium text-white/38">
              节点内容
            </span>
            <textarea
              value={element.text}
              onChange={(event) => onTextChange(event.target.value)}
              placeholder="输入你的素材内容"
              className="h-[92px] w-full resize-none rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm leading-5 text-white/82 outline-none transition placeholder:text-white/22 focus:border-white/18 focus:bg-white/[0.06]"
            />
          </label>
        )}

        <textarea
          value={element.prompt || ""}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder={getCanvasNodeEditorPlaceholder(element)}
          className="mt-4 h-[76px] w-full resize-none border-none bg-transparent text-sm leading-6 text-white/82 outline-none placeholder:text-white/22"
        />

        {element.error && (
          <p className="mt-2 truncate text-xs text-red-200/75">{element.error}</p>
        )}

        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-white/8 pt-3">
          <label className="min-w-0 flex-1">
            <span className="sr-only">选择模型</span>
            <select
              value={modelValue}
              disabled={modelOptions.length === 0}
              onChange={(event) => onModelChange(event.target.value)}
              className="h-9 max-w-full rounded-full border border-white/10 bg-white/[0.055] px-3 text-sm font-semibold text-white/82 outline-none transition hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:text-white/35"
            >
              {modelOptions.length === 0 ? (
                <option value="">未配置模型</option>
              ) : (
                modelOptions.map((option) => (
                  <option key={option.ref} value={option.ref}>
                    {option.label}
                  </option>
                ))
              )}
            </select>
          </label>
          <button
            type="button"
            onClick={onGenerate}
            disabled={isGenerating}
            className="h-10 rounded-full border border-white/10 bg-white/[0.08] px-4 text-sm font-semibold text-white/72 transition hover:bg-white/[0.14] hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isGenerating ? "发送中..." : isFailed ? "重试" : "发送"}
          </button>
        </div>
      </div>
    </section>
  );
}
