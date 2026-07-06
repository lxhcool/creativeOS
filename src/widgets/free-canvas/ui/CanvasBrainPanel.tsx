import { ImagePlus } from "lucide-react";
import type { CanvasSelectOption } from "../model/types";

export type CanvasBrainChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: Array<{
    id: string;
    label: string;
    command: string;
  }>;
};

export function CanvasBrainPanel({
  panelClassName,
  prominent = false,
  messages,
  input,
  loading,
  modelValue,
  modelOptions,
  attachmentCount,
  canSend,
  onInputChange,
  onModelChange,
  onClearMessages,
  onUploadImage,
  onSubmit,
  onAction,
  title = "画布大脑",
  subtitle = "统筹素材、关系和生成任务",
  placeholder = "描述目标，我来协调画布素材和生成任务",
  workingMessage = "正在执行...",
}: {
  panelClassName: string;
  prominent?: boolean;
  messages: CanvasBrainChatMessage[];
  input: string;
  loading: boolean;
  modelValue: string;
  modelOptions: CanvasSelectOption[];
  attachmentCount: number;
  canSend: boolean;
  onInputChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onClearMessages: () => void;
  onUploadImage: () => void;
  onSubmit: () => void;
  onAction?: (action: NonNullable<CanvasBrainChatMessage["actions"]>[number]) => void;
  title?: string;
  subtitle?: string;
  placeholder?: string;
  workingMessage?: string;
}) {
  return (
    <section
      className={`fixed right-5 flex max-w-[calc(100vw-40px)] flex-col rounded-[28px] ${
        prominent
          ? "bottom-28 z-40 h-[min(680px,calc(100vh-144px))] w-[620px]"
          : "bottom-24 z-30 h-[560px] w-[520px]"
      } ${panelClassName}`}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-white/90">{title}</h2>
          <p className="text-xs text-white/40">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onClearMessages}
          className="rounded-full px-3 py-1 text-xs text-white/45 transition hover:bg-white/[0.1] hover:text-white/80"
        >
          清空
        </button>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-white/10 px-4 py-3">
        <label className="min-w-0">
          <span className="mb-1 block text-[11px] text-white/38">大脑模型</span>
          <select
            value={modelValue}
            disabled={modelOptions.length === 0 || loading}
            onChange={(event) => onModelChange(event.target.value)}
            className="h-9 w-full rounded-full border border-white/10 bg-black/[0.22] px-3 text-xs font-medium text-white/76 outline-none transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:text-white/35"
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
        </label>
        <button
          type="button"
          onClick={onUploadImage}
          disabled={loading}
          className="mt-5 flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-3 text-xs font-medium text-white/68 transition hover:bg-white/[0.12] hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ImagePlus className="h-4 w-4" />
          上传图片
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {attachmentCount > 0 && (
          <div className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs leading-5 text-white/50">
            已附加 {attachmentCount} 个画布素材，下一次发送会优先参考。
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`rounded-xl px-3 py-2 text-sm leading-6 ${
              message.role === "user"
                ? "ml-8 border border-white/[0.14] bg-white/[0.12] text-white/90"
                : "mr-8 border border-white/10 bg-white/[0.08] text-white/72"
            }`}
          >
            {message.content}
            {message.actions && message.actions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {message.actions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => onAction?.(action)}
                    disabled={loading}
                    className="h-8 cursor-pointer rounded-full border border-white/[0.12] bg-white/[0.1] px-3 text-[12px] font-semibold text-white/82 transition-colors duration-200 hover:bg-white/[0.16] hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="mr-8 rounded-xl border border-white/10 bg-white/[0.08] px-3 py-2 text-sm text-white/45">
            {workingMessage}
          </div>
        )}
      </div>

      <div className="border-t border-white/10 p-3">
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
          className="h-20 w-full resize-none rounded-2xl border border-white/10 bg-black/[0.22] px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/25 focus:bg-black/[0.3]"
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSend}
          className="mt-2 h-10 w-full rounded-full border border-white/[0.14] bg-white/[0.13] text-sm font-medium text-white shadow-lg shadow-black/20 transition hover:bg-white/[0.18] disabled:cursor-not-allowed disabled:opacity-45"
        >
          发送
        </button>
      </div>
    </section>
  );
}
