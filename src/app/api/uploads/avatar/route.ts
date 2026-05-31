import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session-store";

export const runtime = "nodejs";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export async function POST(request: Request) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { success: false, message: "请先登录" },
        { status: 401 },
      );
    }

    const formData = await request.formData();
    const avatar = formData.get("avatar");

    if (!(avatar instanceof File)) {
      return NextResponse.json(
        { success: false, message: "请选择头像文件" },
        { status: 400 },
      );
    }

    const extension = ALLOWED_TYPES.get(avatar.type);
    if (!extension) {
      return NextResponse.json(
        { success: false, message: "仅支持 JPG、PNG 或 WebP 图片" },
        { status: 400 },
      );
    }

    if (avatar.size > MAX_AVATAR_BYTES) {
      return NextResponse.json(
        { success: false, message: "头像文件请控制在 2MB 以内" },
        { status: 400 },
      );
    }

    const uploadDir = path.join(
      process.cwd(),
      "public",
      "uploads",
      "avatars",
    );
    await mkdir(uploadDir, { recursive: true });

    const filename = `${session.userId}-${Date.now()}-${randomUUID()}.${extension}`;
    const filePath = path.join(uploadDir, filename);
    const buffer = Buffer.from(await avatar.arrayBuffer());
    await writeFile(filePath, buffer);

    return NextResponse.json({
      success: true,
      avatarUrl: `/uploads/avatars/${filename}`,
    });
  } catch (error) {
    console.error("[uploads/avatar]", error);
    return NextResponse.json(
      { success: false, message: "头像上传失败" },
      { status: 500 },
    );
  }
}
