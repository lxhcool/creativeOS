import type {
  ImageInput,
  ImageOutput,
  ModelEntry,
  ModelProviderConfig,
} from "./types";

type RawImageResponse = {
  data?: Array<{
    b64_json?: string;
    url?: string;
    image_url?: string | {
      url?: string;
    };
  }>;
  choices?: Array<{
    message?: {
      content?: unknown;
      images?: Array<{
        image_url?: {
          url?: string;
        };
        url?: string;
      }>;
    };
  }>;
  error?: unknown;
  message?: string;
};

const DEFAULT_IMAGE_GENERATION_TIMEOUT_MS: number | null = null;
const CONTROL_OPTION_KEYS = new Set([
  "timeoutMs",
  "referenceImageUrls",
  "referenceImageField",
  "referenceImageFallbackFields",
  "imageAdapter",
  "imageEditEndpoint",
  "fallbackToTextImageOnReferenceFailure",
]);

export function resolveModelEndpoint(params: {
  baseUrl: string;
  endpoint?: string;
  fallbackEndpoint: string;
}): string {
  const baseUrl = params.baseUrl.replace(/\/+$/, "");
  const endpoint = params.endpoint?.trim();

  if (!endpoint) return `${baseUrl}${params.fallbackEndpoint}`;
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  return `${baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
}

export async function generateOpenAICompatibleImage(params: {
  providerId: string;
  baseUrl: string;
  apiKey: string;
  modelId: string;
  model: ModelEntry | undefined;
  input: ImageInput;
  signal?: AbortSignal;
  includeAuthHeader?: boolean;
}): Promise<ImageOutput> {
  const endpoint = resolveModelEndpoint({
    baseUrl: params.baseUrl,
    endpoint: params.model?.endpoint,
    fallbackEndpoint: "/images/generations",
  });
  const options = {
    ...parseModelOptions(params.model?.options),
    ...params.input.options,
  };
  const referenceImageUrls = getReferenceImageUrls(options, params.input.referenceImageUrls);
  const timeoutMs = getImageGenerationTimeoutMs(options);
  const controller = new AbortController();
  const timeout =
    timeoutMs === null ? null : setTimeout(() => controller.abort(), timeoutMs);
  const abortFromParent = () => controller.abort();
  params.signal?.addEventListener("abort", abortFromParent, { once: true });

  try {
    const result = await fetchImageGeneration({
      endpoint,
      apiKey: params.apiKey,
      includeAuthHeader: params.includeAuthHeader ?? true,
      modelId: params.modelId,
      prompt: params.input.prompt,
      referenceImageUrls,
      options,
      signal: controller.signal,
    });

    const payload = result.payload;

    const image = extractImageFromResponse(payload);
    if (image.b64Json) {
      return {
        src: `data:image/png;base64,${image.b64Json}`,
        mimeType: "image/png",
        modelId: params.modelId,
        providerId: params.providerId,
      };
    }

    if (image.url) {
      return {
        src: image.url,
        mimeType: image.url.startsWith("data:")
          ? image.url.slice(5, image.url.indexOf(";")) || "image/png"
          : "image/png",
        modelId: params.modelId,
        providerId: params.providerId,
      };
    }

    throw new Error("图片生成接口没有返回图片数据。");
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("图片生成超时，请稍后重试或检查图像模型服务状态。");
    }

    throw error;
  } finally {
    if (timeout !== null) clearTimeout(timeout);
    params.signal?.removeEventListener("abort", abortFromParent);
  }
}

function buildHeaders(params: {
  apiKey: string;
  includeAuthHeader: boolean;
  contentType?: "json" | "multipart";
}): Record<string, string> {
  const headers: Record<string, string> = {
  };

  if (params.contentType !== "multipart") {
    headers["Content-Type"] = "application/json";
  }

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

function getImageGenerationTimeoutMs(options: Record<string, unknown>): number | null {
  const rawTimeoutMs = options["timeoutMs"];

  if (rawTimeoutMs === undefined || rawTimeoutMs === null) {
    return DEFAULT_IMAGE_GENERATION_TIMEOUT_MS;
  }
  if (rawTimeoutMs === 0 || rawTimeoutMs === false || rawTimeoutMs === "never") {
    return null;
  }
  if (typeof rawTimeoutMs !== "number" || !Number.isFinite(rawTimeoutMs)) {
    return DEFAULT_IMAGE_GENERATION_TIMEOUT_MS;
  }

  return Math.max(rawTimeoutMs, 30_000);
}

function getReferenceImageUrls(
  options: Record<string, unknown>,
  inputReferenceImageUrls?: string[],
): string[] {
  const rawReferenceImageUrls = options["referenceImageUrls"];

  const optionReferenceImageUrls = Array.isArray(rawReferenceImageUrls)
    ? rawReferenceImageUrls.filter((url): url is string => typeof url === "string" && url.trim().length > 0)
    : [];

  return Array.from(
    new Set([
      ...(inputReferenceImageUrls || []),
      ...optionReferenceImageUrls,
    ].map((url) => url.trim()).filter(Boolean)),
  );
}

function isChatEndpoint(url: string): boolean {
  return /\/chat\/completions\/?$/i.test(url);
}

type ImageFetchResult = {
  payload: RawImageResponse;
};

async function fetchImageGeneration(params: {
  endpoint: string;
  apiKey: string;
  includeAuthHeader: boolean;
  modelId: string;
  prompt: string;
  referenceImageUrls: string[];
  options: Record<string, unknown>;
  signal: AbortSignal;
}): Promise<ImageFetchResult> {
  const attempts = await buildImageRequestAttempts(params);
  const failures: string[] = [];

  for (const attempt of attempts) {
    const response = await fetch(attempt.endpoint, {
      method: "POST",
      headers: buildHeaders({
        apiKey: params.apiKey,
        includeAuthHeader: params.includeAuthHeader,
        contentType: attempt.contentType,
      }),
      body: await attempt.buildBody(),
      signal: params.signal,
    });
    const payload = await parseImageResponse(response);

    if (response.ok) return { payload };

    const detail = extractErrorMessage(payload);
    failures.push(`${attempt.label}返回 ${response.status}: ${detail}`);
    console.warn(
      `[ImageGeneration] ${attempt.label} failed (${response.status}) at ${attempt.endpoint}: ${detail}`,
    );

    if (!shouldTryNextReferenceFormat(response)) {
      break;
    }
  }

  throw new Error(
    failures.length > 0
      ? failures.join("；")
      : "图片生成请求失败，没有收到有效响应。",
  );
}

function shouldTryNextReferenceFormat(response: Response): boolean {
  return response.status === 400 || response.status === 422;
}

type ImageRequestAttempt = {
  label: string;
  endpoint: string;
  buildBody: () => BodyInit | Promise<BodyInit>;
  contentType: "json" | "multipart";
};

async function buildImageRequestAttempts(params: {
  endpoint: string;
  modelId: string;
  prompt: string;
  referenceImageUrls: string[];
  options: Record<string, unknown>;
}): Promise<ImageRequestAttempt[]> {
  if (isChatEndpoint(params.endpoint)) {
    return [
      {
        label: "多模态图片模型",
        endpoint: params.endpoint,
        buildBody: () => JSON.stringify(buildImageRequestBody(params)),
        contentType: "json",
      },
    ];
  }

  if (params.referenceImageUrls.length === 0) {
    return [
      {
        label: "文生图",
        endpoint: params.endpoint,
        buildBody: () => JSON.stringify(buildImageRequestBody(params)),
        contentType: "json",
      },
    ];
  }

  const editEndpoint = getImageEditEndpoint(params.endpoint, params.options);
  const primaryImageField = getReferenceImageField(params.options);
  const secondaryImageField = primaryImageField === "image[]" ? "image" : "image[]";
  const attempts: ImageRequestAttempt[] = [
    {
      label: "参考图生图",
      endpoint: editEndpoint,
      buildBody: () => buildImageEditFormData({ ...params, imageField: primaryImageField }),
      contentType: "multipart",
    },
  ];

  if (shouldTryReferenceFallbackFields(params.options)) {
    attempts.push({
      label: "参考图生图兼容格式",
      endpoint: editEndpoint,
      buildBody: () => buildImageEditFormData({ ...params, imageField: secondaryImageField }),
      contentType: "multipart",
    });
  }

  if (shouldFallbackToTextImage(params.options)) {
    attempts.push({
      label: "文生图降级",
      endpoint: params.endpoint,
      buildBody: () =>
        JSON.stringify(buildImageRequestBody({
          ...params,
          referenceImageUrls: [],
        })),
      contentType: "json",
    });
  }

  return attempts;
}

function getImageEditEndpoint(endpoint: string, options: Record<string, unknown>): string {
  const customEndpoint = options["imageEditEndpoint"];
  if (typeof customEndpoint === "string" && customEndpoint.trim()) {
    if (/^https?:\/\//i.test(customEndpoint)) return customEndpoint.trim();
    const base = endpoint.replace(/\/images\/generations\/?$/i, "");
    return `${base}${customEndpoint.startsWith("/") ? customEndpoint : `/${customEndpoint}`}`;
  }
  if (/\/images\/edits\/?$/i.test(endpoint)) return endpoint;
  if (/\/images\/generations\/?$/i.test(endpoint)) {
    return endpoint.replace(/\/images\/generations\/?$/i, "/images/edits");
  }
  return endpoint.replace(/\/+$/, "") + "/edits";
}

function getReferenceImageField(options: Record<string, unknown>): "image" | "image[]" {
  return options["referenceImageField"] === "image" ? "image" : "image[]";
}

function shouldTryReferenceFallbackFields(options: Record<string, unknown>): boolean {
  return options["referenceImageFallbackFields"] !== false;
}

function shouldFallbackToTextImage(options: Record<string, unknown>): boolean {
  return options["fallbackToTextImageOnReferenceFailure"] === true;
}

async function buildImageEditFormData(params: {
  modelId: string;
  prompt: string;
  referenceImageUrls: string[];
  options: Record<string, unknown>;
  imageField: "image" | "image[]";
}): Promise<FormData> {
  const formData = new FormData();
  formData.append("model", params.modelId);
  formData.append("prompt", params.prompt);

  for (const [key, value] of Object.entries(params.options)) {
    if (value === undefined || value === null) continue;
    if (key === "model" || key === "prompt" || CONTROL_OPTION_KEYS.has(key)) continue;
    formData.append(key, typeof value === "string" ? value : JSON.stringify(value));
  }

  const images = await Promise.all(
    params.referenceImageUrls.map((url, index) => imageUrlToFile(url, index)),
  );
  for (const image of images) {
    formData.append(params.imageField, image);
  }

  return formData;
}

async function imageUrlToFile(url: string, index: number): Promise<File> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("参考图读取失败。");
  }

  const blob = await response.blob();
  const mimeType = blob.type || getMimeTypeFromDataUrl(url) || "image/png";
  const extension = mimeType.includes("jpeg")
    ? "jpg"
    : mimeType.includes("webp")
      ? "webp"
      : "png";
  return new File([blob], `reference-${index + 1}.${extension}`, {
    type: mimeType,
  });
}

function getMimeTypeFromDataUrl(url: string): string | undefined {
  const match = url.match(/^data:([^;,]+)/);
  return match?.[1];
}

function buildImageRequestBody(params: {
  endpoint: string;
  modelId: string;
  prompt: string;
  referenceImageUrls: string[];
  options: Record<string, unknown>;
}): Record<string, unknown> {
  if (isChatEndpoint(params.endpoint)) {
    return {
      model: params.modelId,
      messages: [
        {
          role: "user",
          content:
            params.referenceImageUrls.length > 0
              ? [
                  {
                    type: "text",
                    text: params.prompt,
                  },
                  ...params.referenceImageUrls.map((url) => ({
                    type: "image_url",
                    image_url: {
                      url,
                    },
                  })),
                ]
              : params.prompt,
        },
      ],
      ...stripControlOptions(params.options),
    };
  }

  const body: Record<string, unknown> = {
    model: params.modelId,
    prompt: params.prompt,
    ...stripControlOptions(params.options),
  };

  return body;
}

function stripControlOptions(options: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(options).filter(([key]) => !CONTROL_OPTION_KEYS.has(key)),
  );
}

async function parseImageResponse(response: Response): Promise<RawImageResponse> {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as RawImageResponse;
  } catch {
    return { message: text.slice(0, 500) };
  }
}

function extractErrorMessage(payload: RawImageResponse): string {
  const error = payload.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string") return maybeMessage;
  }
  if (typeof payload.message === "string") return payload.message;
  return "图片生成请求失败。";
}

function extractImageUrlFromContent(content: unknown): string | undefined {
  if (typeof content === "string") {
    const markdownMatch = content.match(/!\[[^\]]*]\(([^)]+)\)/);
    if (markdownMatch?.[1]) return markdownMatch[1];

    const urlMatch = content.match(/https?:\/\/\S+/);
    if (urlMatch?.[0]) return urlMatch[0].replace(/[),.]+$/, "");
    return undefined;
  }

  if (Array.isArray(content)) {
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const entry = part as {
        image_url?: { url?: string };
        url?: string;
      };
      if (entry.image_url?.url) return entry.image_url.url;
      if (entry.url) return entry.url;
    }
  }

  return undefined;
}

function extractImageFromResponse(payload: RawImageResponse): {
  b64Json?: string;
  url?: string;
} {
  const image = payload.data?.[0];
  if (image?.b64_json || image?.url || image?.image_url) {
    const imageUrl =
      typeof image.image_url === "string"
        ? image.image_url
        : image.image_url?.url;
    return { b64Json: image.b64_json, url: image.url || imageUrl };
  }

  const message = payload.choices?.[0]?.message;
  const messageImage = message?.images?.[0];
  const imageUrl = messageImage?.image_url?.url || messageImage?.url;
  if (imageUrl) return { url: imageUrl };

  const contentUrl = extractImageUrlFromContent(message?.content);
  if (contentUrl) return { url: contentUrl };

  return {};
}

export type ImageProviderRuntimeConfig = Pick<
  ModelProviderConfig,
  "id" | "baseUrl" | "apiKey"
>;
