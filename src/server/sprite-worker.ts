import { spawn, type ChildProcess } from "child_process";
import { createServer } from "net";
import { setTimeout as delay } from "timers/promises";

const WORKER_HOST = "127.0.0.1";
const WORKER_START_TIMEOUT_MS = 10_000;

declare global {
  var __creativeOsSpriteWorkerProcess: ChildProcess | undefined;
  var __creativeOsSpriteWorkerStarting: Promise<string> | undefined;
  var __creativeOsSpriteWorkerOrigin: string | undefined;
}

export function resetSpriteWorkerOrigin(): void {
  globalThis.__creativeOsSpriteWorkerOrigin = undefined;
  globalThis.__creativeOsSpriteWorkerStarting = undefined;
}

function allocateWorkerPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, WORKER_HOST, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("无法分配 Sprite 处理引擎端口。")));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function isWorkerReady(workerOrigin: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 600);
  try {
    const response = await fetch(`${workerOrigin}/api/runtime-info`, {
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

async function waitForWorker(workerOrigin: string): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < WORKER_START_TIMEOUT_MS) {
    if (await isWorkerReady(workerOrigin)) return;
    await delay(250);
  }
  throw new Error("Sprite 处理引擎启动超时。");
}

function spawnInternalWorker(port: number): ChildProcess {
  const python = process.env.CREATIVEOS_SPRITE_WORKER_PYTHON || "python3";
  const serverPath = "tools/sprite-video-lab/server.py";
  const child = spawn(
    python,
    [serverPath, "--serve", "--host", WORKER_HOST, "--port", String(port)],
    {
      env: process.env,
      stdio: "ignore",
      detached: false,
    },
  );

  child.once("exit", () => {
    if (globalThis.__creativeOsSpriteWorkerProcess === child) {
      globalThis.__creativeOsSpriteWorkerProcess = undefined;
      globalThis.__creativeOsSpriteWorkerOrigin = undefined;
    }
  });
  child.unref();
  globalThis.__creativeOsSpriteWorkerProcess = child;
  return child;
}

export async function getSpriteWorkerOrigin(): Promise<string> {
  const existingOrigin = globalThis.__creativeOsSpriteWorkerOrigin;
  if (existingOrigin && (await isWorkerReady(existingOrigin))) return existingOrigin;

  if (!globalThis.__creativeOsSpriteWorkerStarting) {
    globalThis.__creativeOsSpriteWorkerStarting = (async () => {
      const port = await allocateWorkerPort();
      const workerOrigin = `http://${WORKER_HOST}:${port}`;
      globalThis.__creativeOsSpriteWorkerOrigin = workerOrigin;
      const existing = globalThis.__creativeOsSpriteWorkerProcess;
      if (!existing || existing.exitCode !== null || existing.killed) {
        spawnInternalWorker(port);
      }
      await waitForWorker(workerOrigin);
      return workerOrigin;
    })().finally(() => {
      globalThis.__creativeOsSpriteWorkerStarting = undefined;
    });
  }

  return globalThis.__creativeOsSpriteWorkerStarting;
}
