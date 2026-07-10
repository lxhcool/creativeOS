"use client";

import {
  ImagePlus,
  Send,
  X,
} from "lucide-react";
import type { CanvasBrainChatMessage } from "../model/types";

type CanvasIntentInputPanelProps = {
  selectedLabel: string | null;
  input: string;
  loading: boolean;
  modelValue: string;
  modelOptions: Array<{ ref: string; label: string }>;
  attachmentCount: number;
  canSend: boolean;
  messages: CanvasBrainChatMessage[];
  onInputChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onClearSelection: () => void;
  onUploadImage: () => void;
  onSubmit: () => void;
  onAction: (action: NonNullable<CanvasBrainChatMessage["actions"]>[number]) => void;
};

export function CanvasIntentInputPanel({
  selectedLabel,
  input,
  loading,
  modelValue,
  modelOptions,
  attachmentCount,
  canSend,
  messages,
  onInputChange,
  onModelChange,
  onClearSelection,
  onUploadImage,
  onSubmit,
  onAction,
}: CanvasIntentInputPanelProps) {
  const recentMessages = messages.slice(-3);
  const placeholder = selectedLabel
    ? "说说想怎么调整这个节点"
    : "说说你想创作什么，或上传参考图";

  return (
    <section className="fixed bottom-5 right-5 z-40 flex w-[min(430px,calc(100vw-40px))] flex-col rounded-[24px] border border-white/[0.12] bg-[#02070b]/[0.92] p-3 text-white shadow-[0_26px_80px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-2xl">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-white/88">
            {selectedLabel ? "调整当前节点" : "创作输入"}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-white/42">
            {selectedLabel ? `基于「${selectedLabel}」继续生成` : "输入意图，判断后执行"}
          </div>
        </div>
        {selectedLabel && (
          <button
            type="button"
            onClick={onClearSelection}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-white/48 transition hover:bg-white/[0.1] hover:text-white"
            aria-label="取消选择"
            title="取消选择"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {recentMessages.length > 0 && (
        <div className="mb-2 max-h-32 space-y-1.5 overflow-y-auto">
          {recentMessages.map((message) => (
            <div
              key={message.id}
              className={`rounded-2xl border px-3 py-2 text-[12px] leading-5 ${
                message.role === "user"
                  ? "border-white/[0.12] bg-white/[0.09] text-white/70"
                  : "border-white/[0.08] bg-white/[0.055] text-white/58"
              }`}
            >
              <div className="line-clamp-2">{message.content}</div>
              {message.actions && message.actions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {message.actions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => onAction(action)}
                      disabled={loading}
                      className="h-7 cursor-pointer rounded-full border border-white/[0.12] bg-white/[0.1] px-2.5 text-[11px] font-medium text-white/78 transition hover:bg-white/[0.16] hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <select
          value={modelValue}
          disabled={modelOptions.length === 0 || loading}
          onChange={(event) => onModelChange(event.target.value)}
          className="h-9 min-w-0 rounded-full border border-white/10 bg-black/[0.2] px-3 text-xs font-medium text-white/70 outline-none disabled:cursor-not-allowed disabled:opacity-45"
          aria-label="选择文本模型"
        >
          {modelOptions.length === 0 ? (
            <option value="">未配置文本模型</option>
          ) : (
            modelOptions.map((option) => (
              <option key={option.ref} value={option.ref}>
                {option.label}
              </option>
            ))
          )}
        </select>
        <button
          type="button"
          onClick={onUploadImage}
          disabled={loading}
          className="flex h-9 cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-3 text-xs font-medium text-white/68 transition hover:bg-white/[0.12] hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ImagePlus className="h-4 w-4" />
          参考图{attachmentCount > 0 ? ` ${attachmentCount}` : ""}
        </button>
      </div>

      <textarea
        value={input}
        onChange={(event) => onInputChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
          }
        }}
        placeholder={placeholder}
        className="h-24 w-full resize-none rounded-2xl border border-white/10 bg-black/[0.22] px-3 py-2 text-sm leading-6 text-white outline-none transition placeholder:text-white/25 focus:border-white/25 focus:bg-black/[0.3]"
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSend}
        className="mt-2 flex h-10 cursor-pointer items-center justify-center gap-2 rounded-full border border-white/[0.14] bg-white/[0.13] text-sm font-medium text-white transition hover:bg-white/[0.18] disabled:cursor-not-allowed disabled:opacity-45"
      >
        <Send className="h-4 w-4" />
        {loading ? "处理中" : "发送"}
      </button>
    </section>
  );
}
