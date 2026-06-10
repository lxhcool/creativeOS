"use client";

import Link from "next/link";
import Image from "next/image";
import { LogOut, Palette, Settings } from "lucide-react";
import { useState } from "react";
import { LoginForm } from "@/components/auth/LoginForm";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { HomeBackgroundCanvas } from "@/components/home/HomeBackgroundCanvas";
import { Modal } from "@/components/ui/Modal";
import { useAuthStore } from "@/stores/useAuthStore";

type AuthMode = "login" | "register" | null;

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

export default function Home() {
  const [authMode, setAuthMode] = useState<AuthMode>(null);
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const isAuthenticated = status === "authenticated";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#02070b] text-white">
      <HomeBackgroundCanvas />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_55%_35%,transparent_0,rgba(0,0,0,0.36)_48%,rgba(0,0,0,0.78)_100%)]" />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.45),transparent_45%,rgba(0,0,0,0.25))]" />

      <div className="relative z-10 flex min-h-screen flex-col px-5 pt-[30px] pb-5 sm:px-8 lg:px-12">
        <header className="flex items-start justify-between">
          <Link href="/" className="inline-flex items-center cursor-pointer">
            <Image
              src="/logo-text.png"
              alt="CreativeOS"
              height={28}
              width={204}
              priority
              className="h-5 w-auto"
            />
          </Link>

          <div className="relative">
              <nav className="flex items-center gap-2">
                {isAuthenticated && (
                  <Link
                    href="/settings/providers"
                    className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-4 text-xs font-medium text-white/[0.85] shadow-lg shadow-black/20 backdrop-blur-2xl transition cursor-pointer hover:bg-white/[0.14] hover:text-white"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    模型配置
                  </Link>
                )}
                {isAuthenticated ? (
                  <>
                    <Link
                      href="/settings/profile"
                      className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-2.5 pr-4 text-xs font-medium text-white/[0.85] shadow-lg shadow-black/20 backdrop-blur-2xl transition cursor-pointer hover:bg-white/[0.14] hover:text-white"
                    >
                      <span
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.12] text-[11px] text-white"
                        style={
                          user?.avatarUrl
                            ? {
                                backgroundImage: `url(${user.avatarUrl})`,
                                backgroundPosition: "center",
                                backgroundSize: "cover",
                              }
                            : undefined
                        }
                      >
                        {!user?.avatarUrl &&
                          getTextAvatarLabel(user?.name || user?.email || "")}
                      </span>
                      用户中心
                    </Link>
                    <button
                      type="button"
                      onClick={() => void logout()}
                      className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-4 text-xs font-medium text-white/80 shadow-lg shadow-black/20 backdrop-blur-2xl transition cursor-pointer hover:bg-white/[0.14] hover:text-white"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      退出
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAuthMode("login")}
                    className="rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 text-xs font-medium text-white/[0.85] shadow-lg shadow-black/20 backdrop-blur-2xl transition cursor-pointer hover:bg-white/[0.14] hover:text-white"
                  >
                    登录
                  </button>
                )}
              </nav>

              <div
                className="absolute right-0 w-[380px] rounded-[28px] border border-white/10 bg-white/[0.08] p-5 shadow-2xl shadow-black/[0.35] backdrop-blur-2xl"
                style={{ top: "calc(100% + 48px)" }}
              >
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white/90">快捷入口</h2>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-white/[0.35]">
                    Quick
                  </span>
                </div>
              </div>
            </div>
        </header>

        <section className="flex flex-1 items-center w-full">
          <div className="max-w-xl">
            <h1 className="text-4xl font-semibold tracking-[0.04em] text-white drop-shadow-2xl sm:text-6xl">
              {isAuthenticated ? "欢迎回来" : "开始创作"}
            </h1>
            <p className="mt-5 max-w-md text-sm leading-7 text-white/[0.62] sm:text-base">
              释放灵感，创造无限可能。
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/canvas"
                className="group inline-flex h-11 items-center gap-2 rounded-3xl border border-white/[0.14] bg-white/[0.13] px-5 text-sm font-medium text-white shadow-2xl shadow-black/25 backdrop-blur-2xl transition cursor-pointer hover:-translate-y-0.5 hover:bg-white/[0.18]"
              >
                <Palette className="h-4 w-4 text-sky-200" />
                自由画布
              </Link>
            </div>
          </div>
        </section>
      </div>

      <Modal
        open={authMode !== null}
        onClose={() => setAuthMode(null)}
        title={authMode === "register" ? "创建账号" : "登录 CreativeOS"}
        maxWidth="max-w-[418px]"
      >
        {authMode === "register" ? (
          <div className="space-y-4">
            <RegisterForm onSuccess={() => setAuthMode(null)} />
            <p className="text-center text-sm text-white/40">
              已经有账号？{" "}
              <button
                type="button"
                className="text-white/70 hover:text-white cursor-pointer transition-colors"
                onClick={() => setAuthMode("login")}
              >
                立即登录
              </button>
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <LoginForm onSuccess={() => setAuthMode(null)} />
            <p className="text-center text-sm text-white/40">
              还没有账号？{" "}
              <button
                type="button"
                className="text-white/70 hover:text-white cursor-pointer transition-colors"
                onClick={() => setAuthMode("register")}
              >
                立即注册
              </button>
            </p>
          </div>
        )}
      </Modal>
    </main>
  );
}
