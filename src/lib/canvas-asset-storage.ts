import {
  createHash,
  createHmac,
  randomUUID,
} from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";

const DATA_URL_PATTERN = /^data:([^;,]+)(;base64)?,(.*)$/s;
const LOCAL_STORAGE_PREFIX = "/uploads/canvas-assets/";
const OBJECT_STORAGE_PREFIX = "canvas-assets/";

const MIME_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

function extensionForMimeType(mimeType: string): string {
  return MIME_EXTENSION[mimeType] || "bin";
}

type CanvasAssetStorageDriver = "local" | "s3" | "r2";

type StoredCanvasAsset = {
  url: string;
  storageKey: string;
  mimeType: string;
  size: number;
};

function getCanvasAssetStorageDriver(): CanvasAssetStorageDriver {
  const driver = process.env.CANVAS_ASSET_STORAGE_DRIVER || "local";
  if (driver === "local" || driver === "s3" || driver === "r2") return driver;
  throw new Error(`不支持的画布资产存储驱动：${driver}`);
}

function getPublicBaseUrl(): string {
  return (process.env.CANVAS_ASSET_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
}

function toPublicAssetUrl(storageKey: string): string {
  const publicBaseUrl = getPublicBaseUrl();
  if (!publicBaseUrl) return storageKey;
  if (storageKey.startsWith("/")) return `${publicBaseUrl}${storageKey}`;
  return `${publicBaseUrl}/${storageKey}`;
}

function isLocalStorageKey(storageKey: string): boolean {
  return storageKey.startsWith(LOCAL_STORAGE_PREFIX);
}

function getLocalStoragePath(storageKey: string): string | null {
  if (!isLocalStorageKey(storageKey)) return null;

  const root = path.join(process.cwd(), "public");
  const filePath = path.join(root, storageKey.replace(/^\/+/, ""));
  const relative = path.relative(root, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return filePath;
}

function getObjectStorageConfig() {
  const endpoint = process.env.CANVAS_ASSET_S3_ENDPOINT?.replace(/\/+$/, "");
  const region = process.env.CANVAS_ASSET_S3_REGION || "auto";
  const bucket = process.env.CANVAS_ASSET_S3_BUCKET;
  const accessKeyId = process.env.CANVAS_ASSET_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CANVAS_ASSET_S3_SECRET_ACCESS_KEY;

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("对象存储配置不完整");
  }

  return {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
  };
}

function hashSha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmacSha256(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function encodeObjectKey(storageKey: string): string {
  return storageKey
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function getAmzDate(date = new Date()): {
  amzDate: string;
  dateStamp: string;
} {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
}

function getSigningKey(params: {
  secretAccessKey: string;
  dateStamp: string;
  region: string;
  service: string;
}): Buffer {
  const dateKey = hmacSha256(`AWS4${params.secretAccessKey}`, params.dateStamp);
  const regionKey = hmacSha256(dateKey, params.region);
  const serviceKey = hmacSha256(regionKey, params.service);
  return hmacSha256(serviceKey, "aws4_request");
}

function signObjectStorageRequest(params: {
  method: "PUT" | "DELETE";
  url: URL;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  payloadHash: string;
  contentType?: string;
}): Headers {
  const { amzDate, dateStamp } = getAmzDate();
  const headers = new Headers();
  headers.set("host", params.url.host);
  headers.set("x-amz-content-sha256", params.payloadHash);
  headers.set("x-amz-date", amzDate);
  if (params.contentType) headers.set("content-type", params.contentType);

  const sortedHeaders = Array.from(headers.entries()).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const canonicalHeaders = sortedHeaders
    .map(([key, value]) => `${key}:${value.trim()}\n`)
    .join("");
  const signedHeaders = sortedHeaders.map(([key]) => key).join(";");
  const canonicalRequest = [
    params.method,
    params.url.pathname,
    params.url.searchParams.toString(),
    canonicalHeaders,
    signedHeaders,
    params.payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${params.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    hashSha256(canonicalRequest),
  ].join("\n");
  const signingKey = getSigningKey({
    secretAccessKey: params.secretAccessKey,
    dateStamp,
    region: params.region,
    service: "s3",
  });
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign)
    .digest("hex");

  headers.set(
    "authorization",
    [
      "AWS4-HMAC-SHA256",
      `Credential=${params.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(", "),
  );

  return headers;
}

function createObjectStorageUrl(params: {
  endpoint: string;
  bucket: string;
  storageKey: string;
}): URL {
  return new URL(
    `${params.endpoint}/${encodeURIComponent(params.bucket)}/${encodeObjectKey(params.storageKey)}`,
  );
}

async function putObjectStorageAsset(params: {
  buffer: Buffer;
  storageKey: string;
  mimeType: string;
}): Promise<void> {
  const config = getObjectStorageConfig();
  const url = createObjectStorageUrl({
    endpoint: config.endpoint,
    bucket: config.bucket,
    storageKey: params.storageKey,
  });
  const payloadHash = hashSha256(params.buffer);
  const headers = signObjectStorageRequest({
    method: "PUT",
    url,
    region: config.region,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    payloadHash,
    contentType: params.mimeType,
  });
  const response = await fetch(url, {
    method: "PUT",
    headers,
    body: new Uint8Array(params.buffer),
  });

  if (!response.ok) {
    throw new Error(`对象存储写入失败：${response.status}`);
  }
}

async function deleteObjectStorageAsset(storageKey: string): Promise<void> {
  const config = getObjectStorageConfig();
  const url = createObjectStorageUrl({
    endpoint: config.endpoint,
    bucket: config.bucket,
    storageKey,
  });
  const payloadHash = hashSha256("");
  const headers = signObjectStorageRequest({
    method: "DELETE",
    url,
    region: config.region,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    payloadHash,
  });
  const response = await fetch(url, {
    method: "DELETE",
    headers,
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`对象存储删除失败：${response.status}`);
  }
}

async function persistCanvasAssetBuffer(params: {
  buffer: Buffer;
  userId: string;
  extension: string;
  mimeType: string;
}): Promise<StoredCanvasAsset> {
  const driver = getCanvasAssetStorageDriver();
  const filename = `${Date.now()}-${randomUUID()}.${params.extension}`;
  const storageKey =
    driver === "local"
      ? `${LOCAL_STORAGE_PREFIX}${params.userId}/${filename}`
      : `${OBJECT_STORAGE_PREFIX}${params.userId}/${filename}`;

  if (driver === "local") {
    const uploadDir = path.join(
      process.cwd(),
      "public",
      "uploads",
      "canvas-assets",
      params.userId,
    );
    await mkdir(uploadDir, { recursive: true });

    const filePath = path.join(uploadDir, filename);
    await writeFile(filePath, params.buffer);
  } else {
    await putObjectStorageAsset({
      buffer: params.buffer,
      storageKey,
      mimeType: params.mimeType,
    });
  }

  return {
    url: toPublicAssetUrl(storageKey),
    storageKey,
    mimeType: params.mimeType,
    size: params.buffer.byteLength,
  };
}

export function isDataUrl(value: string): boolean {
  return DATA_URL_PATTERN.test(value);
}

export function isCanvasStoredAssetUrl(value: string): boolean {
  if (value.startsWith(LOCAL_STORAGE_PREFIX)) return true;
  if (value.startsWith(OBJECT_STORAGE_PREFIX)) return true;

  const publicBaseUrl = getPublicBaseUrl();
  return Boolean(
    publicBaseUrl &&
      (value.startsWith(`${publicBaseUrl}${LOCAL_STORAGE_PREFIX}`) ||
        value.startsWith(`${publicBaseUrl}/${OBJECT_STORAGE_PREFIX}`)),
  );
}

export async function deleteStoredCanvasAsset(storageKey: string): Promise<void> {
  const driver = getCanvasAssetStorageDriver();
  if (driver === "local") {
    const filePath = getLocalStoragePath(storageKey);
    if (!filePath) return;
    await unlink(filePath).catch(() => undefined);
    return;
  }

  await deleteObjectStorageAsset(storageKey);
}

export async function persistCanvasUploadedAsset(params: {
  file: File;
  userId: string;
  extension: string;
  mimeType: string;
}): Promise<StoredCanvasAsset> {
  return persistCanvasAssetBuffer({
    buffer: Buffer.from(await params.file.arrayBuffer()),
    userId: params.userId,
    extension: params.extension,
    mimeType: params.mimeType,
  });
}

export async function persistCanvasDataUrlAsset(params: {
  dataUrl: string;
  userId: string;
  fallbackMimeType?: string;
}): Promise<StoredCanvasAsset> {
  const match = params.dataUrl.match(DATA_URL_PATTERN);
  if (!match) {
    throw new Error("不是有效的 data URL");
  }

  const mimeType = match[1] || params.fallbackMimeType || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || "";
  const buffer = isBase64
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");

  return persistCanvasAssetBuffer({
    buffer,
    userId: params.userId,
    extension: extensionForMimeType(mimeType),
    mimeType,
  });
}
