"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  Check,
  ImageOff,
  Loader2,
  Mail,
  Save,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent,
} from "react";
import { HomeBackgroundCanvas } from "@/components/home/HomeBackgroundCanvas";
import { uploadAvatar } from "@/services/auth/client";
import { useAuthStore } from "@/stores/useAuthStore";

const MAX_SOURCE_BYTES = 6 * 1024 * 1024;
const CROP_SIZE = 260;
const OUTPUT_SIZE = 512;

function getTextAvatarLabel(value: string): string {
  const text = value.trim();
  if (!text) return "C";

  const namePart = text.includes("@") ? text.split("@")[0] || text : text;
  const words = namePart.split(/[\s._-]+/).filter(Boolean);

  if (words.length >= 2) {
    return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
  }

  return Array.from(namePart).slice(0, 2).join("").toUpperCase();
}

function getImageDisplaySize(image: HTMLImageElement, zoom: number) {
  const aspect = image.naturalWidth / image.naturalHeight;
  const baseWidth = aspect > 1 ? CROP_SIZE * aspect : CROP_SIZE;
  const baseHeight = aspect > 1 ? CROP_SIZE : CROP_SIZE / aspect;

  return {
    width: baseWidth * zoom,
    height: baseHeight * zoom,
  };
}

function clampOffset(
  image: HTMLImageElement | null,
  zoom: number,
  offset: { x: number; y: number },
) {
  if (!image) return offset;

  const display = getImageDisplaySize(image, zoom);
  const maxX = Math.max(0, (display.width - CROP_SIZE) / 2);
  const maxY = Math.max(0, (display.height - CROP_SIZE) / 2);

  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.y)),
  };
}

async function createCroppedAvatar(
  image: HTMLImageElement,
  zoom: number,
  offset: { x: number; y: number },
): Promise<Blob> {
  const display = getImageDisplaySize(image, zoom);
  const imageLeft = CROP_SIZE / 2 - display.width / 2 + offset.x;
  const imageTop = CROP_SIZE / 2 - display.height / 2 + offset.y;
  const sx = ((0 - imageLeft) / display.width) * image.naturalWidth;
  const sy = ((0 - imageTop) / display.height) * image.naturalHeight;
  const sw = (CROP_SIZE / display.width) * image.naturalWidth;
  const sh = (CROP_SIZE / display.height) * image.naturalHeight;

  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器不支持头像裁剪");

  context.drawImage(image, sx, sy, sw, sh, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("头像裁剪失败"));
          return;
        }
        resolve(blob);
      },
      "image/webp",
      0.9,
    );
  });
}

export default function ProfilePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropImageRef = useRef<HTMLImageElement>(null);
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const updateProfile = useAuthStore((state) => state.updateProfile);

  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [cropSource, setCropSource] = useState("");
  const [cropFit, setCropFit] = useState<"width" | "height">("height");
  const [cropZoom, setCropZoom] = useState(1);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{
    pointerId: number;
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (status === "anonymous") {
      router.replace("/");
    }
  }, [router, status]);

  useEffect(() => {
    if (!user) return;
    setName(user.name || user.email.split("@")[0] || "");
    setAvatarUrl(user.avatarUrl || "");
  }, [user]);

  useEffect(() => {
    setCropOffset((current) =>
      clampOffset(cropImageRef.current, cropZoom, current),
    );
  }, [cropSource, cropZoom]);

  const hasChanges = useMemo(() => {
    if (!user) return false;
    return name.trim() !== (user.name || "") || avatarUrl !== (user.avatarUrl || "");
  }, [avatarUrl, name, user]);

  const textAvatarLabel = getTextAvatarLabel(name || user?.email || "CreativeOS");

  const handleAvatarFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage({ type: "error", text: "请选择图片文件" });
      return;
    }

    if (file.size > MAX_SOURCE_BYTES) {
      setMessage({ type: "error", text: "原图请控制在 6MB 以内" });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCropSource(String(reader.result || ""));
      setCropZoom(1);
      setCropOffset({ x: 0, y: 0 });
      setMessage(null);
    };
    reader.readAsDataURL(file);
  };

  const handleCropPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart({
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offsetX: cropOffset.x,
      offsetY: cropOffset.y,
    });
  };

  const handleCropPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragStart || event.pointerId !== dragStart.pointerId) return;

    const nextOffset = {
      x: dragStart.offsetX + event.clientX - dragStart.x,
      y: dragStart.offsetY + event.clientY - dragStart.y,
    };
    setCropOffset(clampOffset(cropImageRef.current, cropZoom, nextOffset));
  };

  const handleCropPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragStart?.pointerId === event.pointerId) {
      setDragStart(null);
    }
  };

  const handleConfirmCrop = async () => {
    if (!cropImageRef.current) return;

    setUploading(true);
    setMessage(null);

    try {
      const blob = await createCroppedAvatar(
        cropImageRef.current,
        cropZoom,
        cropOffset,
      );
      const result = await uploadAvatar(blob);

      if (!result.success || !result.avatarUrl) {
        setMessage({
          type: "error",
          text: result.message || "头像上传失败",
        });
        return;
      }

      setAvatarUrl(result.avatarUrl);
      setCropSource("");
      setMessage({ type: "success", text: "头像已上传，记得保存资料" });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "头像处理失败",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setMessage({ type: "error", text: "请输入昵称" });
      return;
    }

    setSaving(true);
    setMessage(null);
    const result = await updateProfile({
      name: name.trim(),
      avatarUrl,
    });
    setSaving(false);

    setMessage({
      type: result.success ? "success" : "error",
      text: result.success ? "资料已保存" : result.message || "保存失败",
    });
  };

  if (status !== "authenticated" || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg-primary">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <main className="relative h-screen overflow-hidden bg-[#02070b] text-white">
      <HomeBackgroundCanvas />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_55%_35%,transparent_0,rgba(0,0,0,0.36)_48%,rgba(0,0,0,0.8)_100%)]" />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.5),transparent_48%,rgba(0,0,0,0.25))]" />

      <div className="relative z-10 flex h-full flex-col px-5 pt-[30px] pb-5 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center">
            <Image
              src="/logo-text.png"
              alt="CreativeOS"
              height={28}
              width={204}
              priority
              className="h-5 w-auto"
            />
          </Link>

          <Link
            href="/"
            className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-4 text-xs font-medium text-white/[0.82] shadow-lg shadow-black/20 backdrop-blur-2xl transition hover:bg-white/[0.14] hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回首页
          </Link>
        </header>

        <section className="flex min-h-0 flex-1 items-center">
          <div className="w-full max-w-4xl">
            <div className="mb-8 max-w-xl">
              <p className="text-xs uppercase tracking-[0.28em] text-white/35">
                Account
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-[0.04em] text-white drop-shadow-2xl sm:text-6xl">
                用户中心
              </h1>
            </div>

            <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
              <section className="rounded-[28px] border border-white/10 bg-white/[0.08] p-5 shadow-2xl shadow-black/[0.35] backdrop-blur-2xl">
                <div className="flex flex-col items-center text-center">
                  <div
                    className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/[0.09] text-4xl font-semibold text-white shadow-2xl shadow-black/30"
                    style={
                      avatarUrl
                        ? {
                            backgroundImage: `url(${avatarUrl})`,
                            backgroundPosition: "center",
                            backgroundSize: "cover",
                          }
                        : undefined
                    }
                  >
                    {!avatarUrl && textAvatarLabel}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute bottom-2 right-2 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white shadow-xl backdrop-blur-xl transition hover:bg-white/20"
                      aria-label="上传并裁剪头像"
                    >
                      <Camera className="h-4 w-4" />
                    </button>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarFile}
                  />

                  <h2 className="mt-5 max-w-full truncate text-xl font-semibold text-white">
                    {name || user.email}
                  </h2>
                  <p className="mt-2 flex max-w-full items-center gap-2 truncate text-xs text-white/45">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </p>

                  <div className="mt-5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-4 text-xs font-medium text-white/75 transition hover:bg-white/15 hover:text-white"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      上传头像
                    </button>
                    <button
                      type="button"
                      onClick={() => setAvatarUrl("")}
                      className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-black/[0.16] px-4 text-xs font-medium text-white/65 transition hover:bg-white/10 hover:text-white"
                    >
                      <ImageOff className="h-3.5 w-3.5" />
                      移除
                    </button>
                  </div>
                </div>
              </section>

              <section className="rounded-[28px] border border-white/10 bg-white/[0.08] p-5 shadow-2xl shadow-black/[0.35] backdrop-blur-2xl sm:p-6">
                <div className="space-y-5">
                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 text-xs font-medium text-white/65">
                      <UserRound className="h-3.5 w-3.5" />
                      昵称
                    </span>
                    <input
                      value={name}
                      maxLength={32}
                      onChange={(event) => {
                        setName(event.target.value);
                        setMessage(null);
                      }}
                      className="h-12 w-full rounded-2xl border border-white/10 bg-black/[0.22] px-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-accent/70 focus:bg-black/[0.3]"
                      placeholder="输入你的昵称"
                    />
                  </label>

                  <div>
                    <span className="mb-2 flex items-center gap-2 text-xs font-medium text-white/65">
                      <Camera className="h-3.5 w-3.5" />
                      当前头像
                    </span>
                    <div className="flex h-12 items-center rounded-2xl border border-white/10 bg-black/[0.22] px-4 text-xs text-white/45">
                      <span className="truncate">
                        {avatarUrl || `未上传头像，将显示文字头像 ${textAvatarLabel}`}
                      </span>
                    </div>
                  </div>

                  {message && (
                    <div
                      className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-xs ${
                        message.type === "success"
                          ? "border-emerald-300/15 bg-emerald-300/10 text-emerald-200"
                          : "border-red-300/15 bg-red-300/10 text-red-200"
                      }`}
                    >
                      {message.type === "success" ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <ImageOff className="h-4 w-4" />
                      )}
                      {message.text}
                    </div>
                  )}

                  <div className="flex flex-wrap justify-end gap-3 pt-2">
                    <Link
                      href="/settings/providers"
                      className="inline-flex h-11 items-center justify-center rounded-full border border-white/10 bg-black/[0.16] px-5 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
                    >
                      模型配置
                    </Link>
                    <button
                      type="button"
                      onClick={() => void handleSave()}
                      disabled={saving || !hasChanges}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/[0.14] bg-white/[0.13] px-5 text-sm font-medium text-white shadow-2xl shadow-black/25 transition hover:-translate-y-0.5 hover:bg-white/[0.18] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      保存资料
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </section>
      </div>

      {cropSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5 backdrop-blur-xl">
          <section className="w-full max-w-[420px] rounded-[28px] border border-white/10 bg-[#111820]/90 p-5 shadow-2xl shadow-black/50">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">裁剪头像</h2>
              <button
                type="button"
                onClick={() => setCropSource("")}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/70 transition hover:bg-white/15 hover:text-white"
                aria-label="关闭裁剪器"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div
              className="relative mx-auto h-[260px] w-[260px] touch-none overflow-hidden rounded-[24px] border border-white/15 bg-black/30"
              onPointerDown={handleCropPointerDown}
              onPointerMove={handleCropPointerMove}
              onPointerUp={handleCropPointerUp}
              onPointerCancel={handleCropPointerUp}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={cropImageRef}
                src={cropSource}
                alt="待裁剪头像"
                draggable={false}
                onLoad={() =>
                  {
                    const image = cropImageRef.current;
                    if (image) {
                      setCropFit(
                        image.naturalWidth / image.naturalHeight > 1
                          ? "height"
                          : "width",
                      );
                    }
                    setCropOffset((current) =>
                      clampOffset(cropImageRef.current, cropZoom, current),
                    );
                  }
                }
                className="absolute left-1/2 top-1/2 max-w-none select-none"
                style={{
                  width: cropFit === "width" ? "260px" : "auto",
                  height: cropFit === "height" ? "260px" : "auto",
                  transform: `translate(-50%, -50%) translate(${cropOffset.x}px, ${cropOffset.y}px) scale(${cropZoom})`,
                }}
              />
              <div className="pointer-events-none absolute inset-0 border-[999px] border-black/25" />
              <div className="pointer-events-none absolute inset-0 rounded-[24px] ring-1 ring-inset ring-white/30" />
            </div>

            <label className="mt-5 block">
              <span className="mb-2 block text-xs text-white/55">缩放</span>
              <input
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={cropZoom}
                onChange={(event) => setCropZoom(Number(event.target.value))}
                className="w-full accent-sky-300"
              />
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCropSource("")}
                className="inline-flex h-10 items-center justify-center rounded-full border border-white/10 bg-black/[0.2] px-4 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmCrop()}
                disabled={uploading}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-white/[0.14] bg-white/[0.14] px-4 text-sm font-medium text-white shadow-xl transition hover:bg-white/[0.2] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                上传头像
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
