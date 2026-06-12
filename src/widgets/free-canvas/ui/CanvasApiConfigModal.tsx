export function CanvasApiConfigModal({
  panelClassName,
  endpoint,
  apiKey,
  onEndpointChange,
  onApiKeyChange,
  onClose,
}: {
  panelClassName: string;
  endpoint: string;
  apiKey: string;
  onEndpointChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
      <section className={`w-full max-w-md rounded-[28px] p-5 ${panelClassName}`}>
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-white/90">API 配置</h2>
            <p className="mt-1 text-sm text-white/45">用于后续接入 AI 绘图、语音等服务。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1 text-white/45 transition hover:bg-white/[0.1] hover:text-white/80"
          >
            关闭
          </button>
        </div>

        <label className="block">
          <span className="mb-2 block text-xs font-medium text-white/55">接口地址</span>
          <input
            value={endpoint}
            onChange={(event) => onEndpointChange(event.target.value)}
            className="h-11 w-full rounded-2xl border border-white/10 bg-black/[0.22] px-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-accent/70"
            placeholder="https://api.example.com/generate"
          />
        </label>
        <label className="mt-4 block">
          <span className="mb-2 block text-xs font-medium text-white/55">API Key</span>
          <input
            value={apiKey}
            onChange={(event) => onApiKeyChange(event.target.value)}
            className="h-11 w-full rounded-2xl border border-white/10 bg-black/[0.22] px-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-accent/70"
            placeholder="sk-..."
            type="password"
          />
        </label>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 h-11 w-full rounded-full border border-white/[0.14] bg-white/[0.13] text-sm font-medium text-white transition hover:bg-white/[0.18]"
        >
          保存配置
        </button>
      </section>
    </div>
  );
}
