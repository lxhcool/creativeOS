const API_PREFIX = "/api/sprite-video";

export function spriteAssetUrl(url?: string): string {
  if (!url) return "";
  if (url.startsWith("/work/")) return url.replace(/^\/work\//, "/api/sprite-video-work/");
  if (url.startsWith("/media/upload/")) {
    return url.replace(/^\/media\/upload\//, "/api/sprite-video-media/");
  }
  return url;
}

export async function spriteApi<T>(
  path: string,
  options: Omit<RequestInit, "body"> & {
    body?: BodyInit | Record<string, unknown> | null;
  } = {},
): Promise<T> {
  const { body, ...requestOptions } = options;
  const init: RequestInit = { ...requestOptions };
  if (body && !(body instanceof FormData)) {
    init.headers = {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    };
    init.body = JSON.stringify(body);
  } else {
    init.body = body;
  }

  let response: Response;
  try {
    response = await fetch(`${API_PREFIX}${path}`, init);
  } catch (error) {
    throw new Error(
      `请求失败：${error instanceof Error ? error.message : String(error)}。请确认 Sprite Video Lab 后端已启动。`,
    );
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 180);
    throw new Error(`接口未返回 JSON（HTTP ${response.status}）。${detail}`);
  }

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data as T;
}

export function isSupportedImage(file: File): boolean {
  return /\.(png|jpe?g|webp|bmp)$/i.test(file.name) || file.type.startsWith("image/");
}

export function isSupportedMedia(file: File): boolean {
  return (
    /\.(mp4|mov|mkv|webm|gif|png|jpe?g|webp|bmp)$/i.test(file.name) ||
    file.type.startsWith("video/") ||
    file.type.startsWith("image/")
  );
}

export function sortFiles(files: File[]): File[] {
  return [...files].sort((a, b) =>
    (a.webkitRelativePath || a.name).localeCompare(
      b.webkitRelativePath || b.name,
      undefined,
      { numeric: true, sensitivity: "base" },
    ),
  );
}

export function downloadUrl(url: string, filename?: string): void {
  const link = document.createElement("a");
  link.href = spriteAssetUrl(url);
  if (filename) link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function formatBytes(bytes?: number): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatSeconds(value?: number): string {
  const seconds = Math.max(0, Number(value || 0));
  return `${seconds.toFixed(seconds >= 10 ? 1 : 2)}s`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
