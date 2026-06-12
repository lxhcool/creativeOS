import type {
  ModelEntry,
  VideoInput,
  VideoOutput,
} from "./types";
import { resolveModelEndpoint } from "./image-generation";

type RawVideoResponse = {
  data?: Array<{
    url?: string;
    b64_json?: string;
    video_url?: string;
  }>;
  url?: string;
  video_url?: string;
  choices?: Array<{
    message?: {
      content?: unknown;
      videos?: Array<{
        video_url?: {
          url?: string;
        };
        url?: string;
      }>;
    };
  }>;
  error?: unknown;
  message?: string;
};

const VIDEO_GENERATION_TIMEOUT_MS = 180_000;

export async function generateOpenAICompatibleVideo(params: {
  providerId: string;
  baseUrl: string;
  apiKey: string;
  modelId: string;
  model: ModelEntry | undefined;
  input: VideoInput;
  signal?: AbortSignal;
  includeAuthHeader?: boolean;
}): Promise<VideoOutput> {
  const endpoint = resolveModelEndpoint({
    baseUrl: params.baseUrl,
    endpoint: params.model?.endpoint,
    fallbackEndpoint: "/videos/generations",
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VIDEO_GENERATION_TIMEOUT_MS);
  const signal = params.signal || controller.signal;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: buildHeaders({
        apiKey: params.apiKey,
        includeAuthHeader: params.includeAuthHeader ?? true,
      }),
      body: JSON.stringify(
        buildVideoRequestBody({
          endpoint,
          modelId: params.modelId,
          prompt: params.input.prompt,
          options: {
            ...parseModelOptions(params.model?.options),
            ...params.input.options,
          },
        }),
      ),
      signal,
    });

    const payload = await parseVideoResponse(response);
    if (!response.ok) {
      throw new Error(extractErrorMessage(payload));
    }

    const video = extractVideoFromResponse(payload);
    if (video.b64Json) {
      return {
        src: `data:video/mp4;base64,${video.b64Json}`,
        mimeType: "video/mp4",
        modelId: params.modelId,
        providerId: params.providerId,
      };
    }

    if (video.url) {
      return {
        src: video.url.startsWith("data:")
          ? video.url
          : await urlToDataUrl(video.url),
        mimeType: video.url.startsWith("data:")
          ? video.url.slice(5, video.url.indexOf(";")) || "video/mp4"
          : "video/mp4",
        modelId: params.modelId,
        providerId: params.providerId,
      };
    }

    throw new Error("视频生成接口没有返回视频数据。");
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("视频生成超时，请稍后重试或检查视频模型服务状态。");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildHeaders(params: {
  apiKey: string;
  includeAuthHeader: boolean;
}): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (params.includeAuthHeader && params.apiKey && params.apiKey !== "not-needed") {
    headers["Authorization"] = `Bearer ${params.apiKey}`;
  }

  return headers;
}

function parseModelOptions(options?: string): Record<string, unknown> {
  if (!options?.trim()) return {};

  const parsed = JSON.parse(options) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }

  return parsed as Record<string, unknown>;
}

function isChatEndpoint(url: string): boolean {
  return /\/chat\/completions\/?$/i.test(url);
}

function buildVideoRequestBody(params: {
  endpoint: string;
  modelId: string;
  prompt: string;
  options: Record<string, unknown>;
}): Record<string, unknown> {
  if (isChatEndpoint(params.endpoint)) {
    return {
      model: params.modelId,
      messages: [
        {
          role: "user",
          content: params.prompt,
        },
      ],
      ...params.options,
    };
  }

  return {
    model: params.modelId,
    prompt: params.prompt,
    ...params.options,
  };
}

async function parseVideoResponse(response: Response): Promise<RawVideoResponse> {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as RawVideoResponse;
  } catch {
    return { message: text.slice(0, 500) };
  }
}

function extractErrorMessage(payload: RawVideoResponse): string {
  const error = payload.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string") return maybeMessage;
  }
  if (typeof payload.message === "string") return payload.message;
  return "视频生成请求失败。";
}

function extractUrlFromContent(content: unknown): string | undefined {
  if (typeof content === "string") {
    const markdownMatch = content.match(/\[[^\]]*]\(([^)]+)\)/);
    if (markdownMatch?.[1]) return markdownMatch[1];

    const urlMatch = content.match(/https?:\/\/\S+/);
    if (urlMatch?.[0]) return urlMatch[0].replace(/[),.]+$/, "");
    return undefined;
  }

  if (Array.isArray(content)) {
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const entry = part as {
        video_url?: { url?: string };
        url?: string;
      };
      if (entry.video_url?.url) return entry.video_url.url;
      if (entry.url) return entry.url;
    }
  }

  return undefined;
}

function extractVideoFromResponse(payload: RawVideoResponse): {
  b64Json?: string;
  url?: string;
} {
  const item = payload.data?.[0];
  if (item?.b64_json || item?.url || item?.video_url) {
    return {
      b64Json: item.b64_json,
      url: item.url || item.video_url,
    };
  }

  if (payload.url || payload.video_url) {
    return { url: payload.url || payload.video_url };
  }

  const message = payload.choices?.[0]?.message;
  const messageVideo = message?.videos?.[0];
  const videoUrl = messageVideo?.video_url?.url || messageVideo?.url;
  if (videoUrl) return { url: videoUrl };

  const contentUrl = extractUrlFromContent(message?.content);
  if (contentUrl) return { url: contentUrl };

  return {};
}

async function urlToDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`视频下载失败：${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "video/mp4";
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}
