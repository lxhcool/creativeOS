"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Film, LogOut, Plus, Settings, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  useEffect,
  useState,
} from "react";
import { LoginForm } from "@/components/auth/LoginForm";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { HomeBackgroundCanvas } from "@/components/home/HomeBackgroundCanvas";
import { Modal } from "@/components/ui/Modal";
import { useAuthStore } from "@/stores/useAuthStore";
import type {
  CanvasProjectExport,
  CanvasWorkflowType,
} from "@/entities/canvas/model/types";
import {
  CANVAS_WORKFLOW_OPTIONS,
  getCanvasWorkflowStrategy,
} from "@/features/canvas-workflows";

type AuthMode = "login" | "register" | null;

const CANVAS_PROJECT_INDEX_KEY = "creativeos.canvas.projects.v1";
const CANVAS_ACTIVE_PROJECT_ID_KEY = "creativeos.canvas.activeProjectId.v1";
const CANVAS_PROJECT_STORAGE_PREFIX = "creativeos.canvas.project.v1.";
const CANVAS_SAVE_HISTORY_PREFIX = "creativeos.canvas.saveHistory.v1.";

type CanvasProjectRecord = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  nodeCount: number;
  edgeCount: number;
  workflowType?: CanvasWorkflowType;
};

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

function getCanvasProjectStorageKey(projectId: string): string {
  return `${CANVAS_PROJECT_STORAGE_PREFIX}${projectId}`;
}

function getCanvasProjectHistoryKey(projectId: string): string {
  return `${CANVAS_SAVE_HISTORY_PREFIX}${projectId}`;
}

function createBlankCanvasProjectPayload(
  workflowType: CanvasWorkflowType = "free",
): CanvasProjectExport {
  const initial = getCanvasWorkflowStrategy(workflowType).initNodes();

  return {
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    workflowType,
    viewport: initial.viewport,
    elements: initial.elements,
    edges: initial.edges,
  };
}

function getNormalizedWorkflowType(value: unknown): CanvasWorkflowType {
  return value === "novel" || value === "video" || value === "image" ? value : "free";
}

function readCanvasProjectRecords(): CanvasProjectRecord[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(CANVAS_PROJECT_INDEX_KEY);
    if (!raw) return [];
    const items = JSON.parse(raw) as CanvasProjectRecord[];
    if (!Array.isArray(items)) return [];

    return items
      .filter((item) => item && typeof item.id === "string")
      .map((item) => ({
        id: item.id,
        name:
          typeof item.name === "string" && item.name.trim()
            ? item.name.trim()
            : "未命名画布",
        createdAt:
          typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
        updatedAt:
          typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
        nodeCount: typeof item.nodeCount === "number" ? item.nodeCount : 0,
        edgeCount: typeof item.edgeCount === "number" ? item.edgeCount : 0,
        workflowType: getNormalizedWorkflowType(item.workflowType),
      }))
      .sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  } catch (error) {
    console.warn("Failed to read canvas projects", error);
    return [];
  }
}

function writeCanvasProjectRecords(items: CanvasProjectRecord[]): void {
  window.localStorage.setItem(CANVAS_PROJECT_INDEX_KEY, JSON.stringify(items));
}

function createCanvasProjectRecord(
  name: string,
  workflowType: CanvasWorkflowType,
): CanvasProjectRecord {
  const now = new Date().toISOString();
  const projectId = getCanvasProjectId();
  const payload = createBlankCanvasProjectPayload(workflowType);

  window.localStorage.setItem(getCanvasProjectStorageKey(projectId), JSON.stringify(payload));
  window.localStorage.setItem(CANVAS_ACTIVE_PROJECT_ID_KEY, projectId);

  return {
    id: projectId,
    name,
    createdAt: now,
    updatedAt: now,
    nodeCount: payload.elements.length,
    edgeCount: payload.edges.length,
    workflowType,
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
  const [canvasNameOpen, setCanvasNameOpen] = useState(false);
  const [canvasName, setCanvasName] = useState("");
  const [selectedWorkflowType, setSelectedWorkflowType] =
    useState<CanvasWorkflowType>("free");
  const [deleteProjectTarget, setDeleteProjectTarget] =
    useState<CanvasProjectRecord | null>(null);
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const isAuthenticated = status === "authenticated";
  const normalizedCanvasName = canvasName.trim();

  useEffect(() => {
    setCanvasProjects(readCanvasProjectRecords());
  }, []);

  const openCanvasProject = (projectId: string) => {
    window.localStorage.setItem(CANVAS_ACTIVE_PROJECT_ID_KEY, projectId);
    router.push("/canvas");
  };

  const deleteCanvasProject = (project: CanvasProjectRecord) => {
    const next = canvasProjects.filter((item) => item.id !== project.id);
    window.localStorage.removeItem(getCanvasProjectStorageKey(project.id));
    window.localStorage.removeItem(getCanvasProjectHistoryKey(project.id));
    if (window.localStorage.getItem(CANVAS_ACTIVE_PROJECT_ID_KEY) === project.id) {
      window.localStorage.removeItem(CANVAS_ACTIVE_PROJECT_ID_KEY);
    }
    writeCanvasProjectRecords(next);
    setCanvasProjects(next);
    setDeleteProjectTarget(null);
  };

  const submitCanvasName = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!normalizedCanvasName) return;

    const record = createCanvasProjectRecord(normalizedCanvasName, selectedWorkflowType);
    const next = [record, ...canvasProjects.filter((project) => project.id !== record.id)];
    writeCanvasProjectRecords(next);
    setCanvasProjects(next);
    setCanvasName("");
    setSelectedWorkflowType("free");
    setCanvasNameOpen(false);
    router.push("/canvas");
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
                              {project.edgeCount} 连线 ·{" "}
                              {getCanvasWorkflowStrategy(project.workflowType).label}
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
                    <div className="text-[13px] font-medium text-white/74">还没有画布</div>
                    <div className="mt-1 text-[12px] leading-5 text-white/42">
                      新建一个画布后，这里会显示最近创作记录。
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
                onClick={() => setCanvasNameOpen(true)}
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
        open={canvasNameOpen}
        onClose={() => {
          setCanvasNameOpen(false);
          setCanvasName("");
          setSelectedWorkflowType("free");
        }}
        title="新建画布"
        maxWidth="max-w-[420px]"
      >
        <form onSubmit={submitCanvasName} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs font-medium text-white/55">画布名称</span>
            <input
              value={canvasName}
              onChange={(event) => setCanvasName(event.target.value)}
              autoFocus
              className="h-11 w-full rounded-2xl border border-white/10 bg-black/[0.22] px-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-white/25"
              placeholder="例如：大明重生小说设定"
              maxLength={40}
            />
          </label>
          <div>
            <span className="mb-2 block text-xs font-medium text-white/55">创作工作流</span>
            <div className="grid gap-2">
              {CANVAS_WORKFLOW_OPTIONS.map((option) => (
                <button
                  key={option.type}
                  type="button"
                  onClick={() => setSelectedWorkflowType(option.type)}
                  className={`cursor-pointer rounded-2xl border px-3 py-2 text-left transition ${
                    selectedWorkflowType === option.type
                      ? "border-white/20 bg-white/[0.13] text-white"
                      : "border-white/10 bg-white/[0.055] text-white/70 hover:bg-white/[0.1] hover:text-white"
                  }`}
                >
                  <span className="block text-sm font-semibold">{option.label}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-white/42">
                    {option.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={!normalizedCanvasName}
            className="h-11 w-full cursor-pointer rounded-full border border-white/[0.14] bg-white/[0.13] text-sm font-medium text-white transition hover:bg-white/[0.18] disabled:cursor-not-allowed disabled:opacity-40"
          >
            创建并进入
          </button>
        </form>
      </Modal>

      <Modal
        open={Boolean(deleteProjectTarget)}
        onClose={() => setDeleteProjectTarget(null)}
        title="删除画布"
        maxWidth="max-w-[420px]"
      >
        <div className="space-y-5">
          <p className="text-sm leading-6 text-white/62">
            确定删除画布「{deleteProjectTarget?.name}」吗？此操作会同时删除本地画布内容和保存记录，无法恢复。
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
