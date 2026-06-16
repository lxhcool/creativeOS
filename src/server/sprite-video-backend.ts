import { spawn, type ChildProcess } from "child_process";
import { setTimeout as delay } from "timers/promises";

const HOST = "127.0.0.1";
const DEFAULT_PORT = 8895;
const START_TIMEOUT_MS = 10_000;

declare global {
  var __creativeOsSpriteBackendProcess: ChildProcess | undefined;
  var __creativeOsSpriteBackendStarting: Promise<string> | undefined;
}

function configuredBackendUrl(): string | null {
  const value = process.env.SPRITE_VIDEO_LAB_BACKEND_URL?.trim();
  return value ? value.replace(/\/$/, "") : null;
}

function internalPort(): number {
  const raw = Number(process.env.SPRITE_VIDEO_LAB_INTERNAL_PORT || DEFAULT_PORT);
  return Number.isInteger(raw) && raw > 0 && raw < 65536 ? raw : DEFAULT_PORT;
}

function internalBackendUrl(): string {
  return `http://${HOST}:${internalPort()}`;
}

async function isBackendReady(backendUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 600);
  try {
    const response = await fetch(`${backendUrl}/api/runtime-info`, {
      cache: "no-store",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForBackend(backendUrl: string): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < START_TIMEOUT_MS) {
    if (await isBackendReady(backendUrl)) return;
    await delay(250);
  }
  throw new Error("Sprite 处理引擎启动超时。");
}

function spawnInternalBackend(): ChildProcess {
  const python = process.env.SPRITE_VIDEO_LAB_PYTHON || "python3";
  const serverPath = "tools/sprite-video-lab/server.py";
  const child = spawn(
    python,
    [serverPath, "--serve", "--host", HOST, "--port", String(internalPort())],
    {
      env: {
        ...process.env,
        SPRITE_VIDEO_LAB_HOST: HOST,
        SPRITE_VIDEO_LAB_PORT: String(internalPort()),
      },
      stdio: "ignore",
      detached: false,
    },
  );

  child.once("exit", () => {
    if (globalThis.__creativeOsSpriteBackendProcess === child) {
      globalThis.__creativeOsSpriteBackendProcess = undefined;
    }
  });
  child.unref();
  globalThis.__creativeOsSpriteBackendProcess = child;
  return child;
}

export async function getSpriteVideoBackendUrl(): Promise<string> {
  const configured = configuredBackendUrl();
  if (configured) {
    if (!(await isBackendReady(configured))) {
      throw new Error(`配置的 Sprite 处理引擎不可用：${configured}`);
    }
    return configured;
  }

  const backendUrl = internalBackendUrl();
  if (await isBackendReady(backendUrl)) return backendUrl;

  if (!globalThis.__creativeOsSpriteBackendStarting) {
    globalThis.__creativeOsSpriteBackendStarting = (async () => {
      const existing = globalThis.__creativeOsSpriteBackendProcess;
      if (!existing || existing.exitCode !== null || existing.killed) {
        spawnInternalBackend();
      }
      await waitForBackend(backendUrl);
      return backendUrl;
    })().finally(() => {
      globalThis.__creativeOsSpriteBackendStarting = undefined;
    });
  }

  return globalThis.__creativeOsSpriteBackendStarting;
}
