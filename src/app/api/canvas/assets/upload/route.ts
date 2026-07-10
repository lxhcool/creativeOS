import { createCanvasAssetFileRecord } from "@/lib/canvas-asset-file-store";
import { persistCanvasUploadedAsset } from "@/lib/canvas-asset-storage";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session-store";

export const runtime = "nodejs";

const MAX_CANVAS_ASSET_BYTES = 120 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/svg+xml", "svg"],
  ["video/mp4", "mp4"],
  ["video/webm", "webm"],
  ["video/quicktime", "mov"],
  ["audio/mpeg", "mp3"],
  ["audio/wav", "wav"],
  ["audio/ogg", "ogg"],
  ["audio/mp4", "m4a"],
]);

function getExtension(file: File): string | null {
  const byType = ALLOWED_TYPES.get(file.type);
  if (byType) return byType;

  const nameExtension = file.name.split(".").pop()?.toLowerCase();
  if (!nameExtension) return null;

  if (["jpg", "jpeg", "png", "webp", "gif", "svg", "mp4", "webm", "mov", "mp3", "wav", "ogg", "m4a"].includes(nameExtension)) {
    return nameExtension === "jpeg" ? "jpg" : nameExtension;
  }

  return null;
}

function getAssetKind(type: string): "image" | "video" | "audio" | "file" {
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  return "file";
}

export async function POST(request: Request) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: "请先登录后再上传资产" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const projectIdValue = formData.get("projectId");
    const projectId = typeof projectIdValue === "string" && projectIdValue
      ? projectIdValue
      : null;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请选择要上传的文件" }, { status: 400 });
    }

    if (file.size > MAX_CANVAS_ASSET_BYTES) {
      return NextResponse.json({ error: "文件请控制在 120MB 以内" }, { status: 400 });
    }

    const extension = getExtension(file);
    if (!extension) {
      return NextResponse.json({ error: "暂不支持该文件类型" }, { status: 400 });
    }

    const assetKind = getAssetKind(file.type);
    const stored = await persistCanvasUploadedAsset({
      file,
      userId: session.userId,
      extension,
      mimeType: file.type || "application/octet-stream",
    });

    await createCanvasAssetFileRecord({
      ownerId: `user:${session.userId}`,
      projectId,
      url: stored.url,
      storageKey: stored.storageKey,
      kind: assetKind,
      mimeType: stored.mimeType,
      size: stored.size,
      originalName: file.name,
    });

    return NextResponse.json({
      url: stored.url,
      name: file.name,
      size: stored.size,
      type: stored.mimeType,
      kind: assetKind,
    });
  } catch (error) {
    console.error("[canvas/assets/upload]", error);
    return NextResponse.json({ error: "资产上传失败" }, { status: 500 });
  }
}
