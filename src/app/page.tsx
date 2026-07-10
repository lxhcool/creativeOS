"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Film, LogOut, Plus, Settings, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useState,
} from "react";
import { LoginForm } from "@/components/auth/LoginForm";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { HomeBackgroundCanvas } from "@/components/home/HomeBackgroundCanvas";
import { Modal } from "@/components/ui/Modal";
import { useAuthStore } from "@/stores/useAuthStore";
import type { CanvasProjectExport, CanvasProjectRecord } from "@/entities/canvas/model/types";
import {
  createCanvasProject,
  deleteCanvasProject as deleteCanvasProjectRequest,
  listCanvasProjects,
} from "@/entities/canvas/lib/projectApi";

type AuthMode = "login" | "register" | null;

const CANVAS_ACTIVE_PROJECT_ID_KEY = "creativeos.canvas.activeProjectId.v1";

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

function getCanvasProjectId(): string {
  return `canvas_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createBlankCanvasProjectPayload(): CanvasProjectExport {
  return {
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    viewport: {
      x: 0,
      y: 0,
      scale: 1,
    },
    elements: [],
    edges: [],
  };
}

function formatProjectTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function Home() {
  const router = useRouter();
  const [authMode, setAuthMode] = useState<AuthMode>(null);
  const [canvasProjects, setCanvasProjects] = useState<CanvasProjectRecord[]>([]);
  const [deleteProjectTarget, setDeleteProjectTarget] =
    useState<CanvasProjectRecord | null>(null);
  const [projectMessage, setProjectMessage] = useState<string | null>(null);
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const isAuthenticated = status === "authenticated";

  useEffect(() => {
    let disposed = false;

    if (!isAuthenticated) {
      setCanvasProjects([]);
      return () => {
        disposed = true;
      };
    }

    listCanvasProjects()
      .then((projects) => {
        if (!disposed) setCanvasProjects(projects);
      })
      .catch((error) => {
        console.warn("Failed to read canvas projects", error);
      });

    return () => {
      disposed = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!projectMessage) return;

    const timer = window.setTimeout(() => {
      setProjectMessage(null);
    }, 2600);

    return () => window.clearTimeout(timer);
  }, [projectMessage]);

  const openCanvasProject = (projectId: string) => {
    window.localStorage.setItem(CANVAS_ACTIVE_PROJECT_ID_KEY, projectId);
    router.push("/canvas");
  };

  const createIntentCanvas = async () => {
    if (!isAuthenticated) {
      setAuthMode("login");
      setProjectMessage("请先登录");
      return;
    }

    try {
      const projectId = getCanvasProjectId();
      const payload = createBlankCanvasProjectPayload();
      const record = await createCanvasProject({
        id: projectId,
        name: "未命名画布",
        payload,
      });
      window.localStorage.setItem(CANVAS_ACTIVE_PROJECT_ID_KEY, projectId);
      setCanvasProjects((current) => [
        record,
        ...current.filter((project) => project.id !== record.id),
      ]);
      router.push("/canvas");
    } catch (error) {
      console.warn("Failed to create canvas project", error);
      setProjectMessage(error instanceof Error ? error.message : "画布创建失败");
    }
  };

  const deleteCanvasProject = async (project: CanvasProjectRecord) => {
    try {
      await deleteCanvasProjectRequest(project.id);
      const next = canvasProjects.filter((item) => item.id !== project.id);
      if (window.localStorage.getItem(CANVAS_ACTIVE_PROJECT_ID_KEY) === project.id) {
        window.localStorage.removeItem(CANVAS_ACTIVE_PROJECT_ID_KEY);
      }
      setCanvasProjects(next);
      setDeleteProjectTarget(null);
    } catch (error) {
      console.warn("Failed to delete canvas project", error);
      setProjectMessage("画布删除失败");
    }
  };

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
                className="absolute right-0 w-[390px] rounded-[24px] border border-white/10 bg-[#02070b]/70 p-4 shadow-2xl shadow-black/[0.35] backdrop-blur-2xl"
                style={{ top: "calc(100% + 48px)" }}
              >
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white/90">画布记录</h2>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-white/[0.35]">
                    Recent
                  </span>
                </div>
                {canvasProjects.length > 0 ? (
                  <div className="space-y-2">
                    {canvasProjects.slice(0, 5).map((project) => (
                      <div
                        key={project.id}
                        className="group flex w-full items-center justify-between gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.055] p-1.5 transition hover:bg-white/[0.1]"
                      >
                        <button
                          type="button"
                          onClick={() => openCanvasProject(project.id)}
                          className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white/15"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-semibold text-white/86">
                              {project.name}
                            </span>
                            <span className="mt-1 block text-[11px] text-white/42">
                              {formatProjectTime(project.updatedAt)} · {project.nodeCount} 节点 ·{" "}
                              {project.edgeCount} 连线 · {project.assetCount} 资产
                            </span>
                          </span>
                          <ArrowRight className="h-4 w-4 text-white/35 transition group-hover:translate-x-0.5 group-hover:text-white/70" />
                        </button>
                        <button
                          type="button"
                          title="删除画布"
                          aria-label={`删除画布 ${project.name}`}
                          onClick={() => setDeleteProjectTarget(project)}
                          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-white/35 transition hover:bg-rose-400/[0.14] hover:text-rose-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-200/20"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.045] px-4 py-7 text-center">
                    <div className="text-[13px] font-medium text-white/74">
                      {isAuthenticated ? "还没有画布" : "登录后查看画布"}
                    </div>
                    <div className="mt-1 text-[12px] leading-5 text-white/42">
                      {isAuthenticated
                        ? "新建一个画布后，这里会显示最近创作记录。"
                        : "画布记录会按账号保存。"}
                    </div>
                  </div>
                )}
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
              <button
                type="button"
                onClick={() => void createIntentCanvas()}
                className="group inline-flex h-11 items-center gap-2 rounded-3xl border border-white/[0.14] bg-white/[0.13] px-5 text-sm font-medium text-white shadow-2xl shadow-black/25 backdrop-blur-2xl transition cursor-pointer hover:-translate-y-0.5 hover:bg-white/[0.18]"
              >
                <Plus className="h-4 w-4 text-white/72" />
                新建画布
              </button>
              <Link
                href="/sprite-video"
                className="group inline-flex h-11 items-center gap-2 rounded-3xl border border-white/[0.14] bg-white/[0.13] px-5 text-sm font-medium text-white shadow-2xl shadow-black/25 backdrop-blur-2xl transition cursor-pointer hover:-translate-y-0.5 hover:bg-white/[0.18]"
              >
                <Film className="h-4 w-4 text-white/62" />
                Sprite 资产处理
              </Link>
            </div>
          </div>
        </section>
      </div>

      {projectMessage && (
        <div className="fixed right-5 top-[82px] z-30 rounded-full border border-white/10 bg-[#02070b]/90 px-3.5 py-2 text-[12px] font-medium text-white/76 shadow-2xl shadow-black/35 backdrop-blur-xl">
          {projectMessage}
        </div>
      )}

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

      <Modal
        open={Boolean(deleteProjectTarget)}
        onClose={() => setDeleteProjectTarget(null)}
        title="删除画布"
        maxWidth="max-w-[420px]"
      >
        <div className="space-y-5">
          <p className="text-sm leading-6 text-white/62">
            确定删除画布「{deleteProjectTarget?.name}」吗？此操作会同时删除画布内容和保存记录，无法恢复。
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteProjectTarget(null)}
              className="h-10 cursor-pointer rounded-full border border-white/[0.1] bg-white/[0.06] px-4 text-sm font-medium text-white/72 transition hover:bg-white/[0.12] hover:text-white"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                if (deleteProjectTarget) deleteCanvasProject(deleteProjectTarget);
              }}
              className="h-10 cursor-pointer rounded-full border border-rose-200/[0.16] bg-rose-400/[0.14] px-4 text-sm font-medium text-rose-50 transition hover:bg-rose-400/[0.22]"
            >
              确认删除
            </button>
          </div>
        </div>
      </Modal>
    </main>
  );
}
