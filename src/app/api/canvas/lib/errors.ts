export function toCanvasGenerationErrorMessage(error: unknown, kind: "image" | "video"): string {
  const fallback = kind === "image" ? "图片生成失败，请稍后重试。" : "视频生成失败，请稍后重试。";
  if (!(error instanceof Error)) return fallback;

  const message = error.message.trim();
  if (!message) return fallback;
  const readableAggregateReason = extractReadableAggregateReason(message);
  if (readableAggregateReason) return readableAggregateReason;

  if (/insufficient_user_quota|额度不足|quota/i.test(message)) {
    return "图片生成额度不足，请检查图像服务账户余额或切换其他图像服务。";
  }

  if (/超时/.test(message)) {
    return kind === "image"
      ? "图片生成超时，请稍后重试或检查图像生成服务状态。"
      : "视频生成超时，请稍后重试或检查视频生成服务状态。";
  }

  if (/没有返回图片数据|没有返回.*数据|No image|empty/i.test(message)) {
    return kind === "image"
      ? "图片生成服务没有返回可用图片，请稍后重试。"
      : "视频生成服务没有返回可用视频，请稍后重试。";
  }

  if (/All image generation models failed|All video generation models failed|Attempted:|Reasons:|prov_[A-Za-z0-9]+:/.test(message)) {
    return kind === "image"
      ? "图片生成服务暂时不可用，请稍后重试或切换可用的图像模型。"
      : "视频生成服务暂时不可用，请稍后重试或切换可用的视频模型。";
  }

  if (/model_not_found|No available channel|not found/i.test(message)) {
    return kind === "image"
      ? "当前图像模型暂时不可用，请切换可用的图像模型。"
      : "当前视频模型暂时不可用，请切换可用的视频模型。";
  }

  return sanitizeProviderDetails(message);
}

function extractReadableAggregateReason(message: string): string | undefined {
  const reasons = message.match(/Reasons:\s*(.+)$/)?.[1];
  if (!reasons) return undefined;

  const details = reasons
    .split(/\s+\|\s+/)
    .map((reason) => sanitizeProviderDetails(reason.replace(/^prov_[A-Za-z0-9]+:[^:]+:\s*/, "")))
    .filter(Boolean);

  if (details.length === 0) return undefined;
  return details[0];
}

function sanitizeProviderDetails(message: string): string {
  const cleaned = message
    .replace(/prov_[A-Za-z0-9]+:/g, "")
    .replace(/insufficient_user_quota/gi, "额度不足")
    .replace(/\bOpenAI API error\s*/gi, "")
    .replace(/\bAPI error\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (/No available channel for model .* under group/i.test(cleaned)) {
    return "图像代理的参考图生图通道配置异常，请检查代理是否支持当前图像模型的图生图能力。";
  }
  if (/EADDRNOTAVAIL|ECONNRESET|ECONNREFUSED|UND_ERR_SOCKET|upstream_error/i.test(cleaned)) {
    return "图像代理连接上游失败，请稍后重试或检查本地图像代理状态。";
  }
  if (/Headers Timeout|UND_ERR_HEADERS_TIMEOUT|fetch failed/i.test(cleaned)) {
    return "图像代理长时间没有返回结果，请检查参考图生图通道是否正常。";
  }

  return cleaned;
}
