import { spawn, type ChildProcess } from "child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync } from "fs";
import { createServer } from "net";
import { join } from "path";
import { setTimeout as delay } from "timers/promises";

const WORKER_HOST = "127.0.0.1";
const WORKER_START_TIMEOUT_MS = 60_000;
const WORKER_LOG_PATH = join(
  process.cwd(),
  "tools/sprite-video-lab/work/logs/internal-worker.log",
);

declare global {
  var __creativeOsSpriteWorkerProcess: ChildProcess | undefined;
  var __creativeOsSpriteWorkerStarting: Promise<string> | undefined;
  var __creativeOsSpriteWorkerOrigin: string | undefined;
  var __creativeOsSpriteWorkerServerMtime: number | undefined;
}

export function resetSpriteWorkerOrigin(): void {
  stopInternalWorker();
  globalThis.__creativeOsSpriteWorkerOrigin = undefined;
  globalThis.__creativeOsSpriteWorkerStarting = undefined;
  globalThis.__creativeOsSpriteWorkerServerMtime = undefined;
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
  const timer = setTimeout(() => controller.abort(), 1_200);
  try {
    const response = await fetch(`${workerOrigin}/api/app-version`, {
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
  const projectRoot = process.cwd();
  const serverPath = join(projectRoot, "tools/sprite-video-lab/server.py");
  mkdirSync(join(projectRoot, "tools/sprite-video-lab/work/logs"), { recursive: true });
  const logFd = openSync(WORKER_LOG_PATH, "w");
  const child = spawn(
    python,
    [serverPath, "--serve", "--host", WORKER_HOST, "--port", String(port)],
    {
      cwd: projectRoot,
      env: process.env,
      stdio: ["ignore", logFd, logFd],
      detached: false,
    },
  );

  child.once("exit", () => {
    try {
      closeSync(logFd);
    } catch {
      // noop
    }
    if (globalThis.__creativeOsSpriteWorkerProcess === child) {
      globalThis.__creativeOsSpriteWorkerProcess = undefined;
      globalThis.__creativeOsSpriteWorkerOrigin = undefined;
    }
  });
  child.unref();
  globalThis.__creativeOsSpriteWorkerProcess = child;
  globalThis.__creativeOsSpriteWorkerServerMtime = currentServerMtime();
  return child;
}

function stopInternalWorker(): void {
  const existing = globalThis.__creativeOsSpriteWorkerProcess;
  if (existing && existing.exitCode === null && !existing.killed) {
    existing.kill();
  }
  globalThis.__creativeOsSpriteWorkerProcess = undefined;
  globalThis.__creativeOsSpriteWorkerOrigin = undefined;
  globalThis.__creativeOsSpriteWorkerServerMtime = undefined;
}

export async function getSpriteWorkerOrigin(): Promise<string> {
  const existingOrigin = globalThis.__creativeOsSpriteWorkerOrigin;
  if (
    existingOrigin &&
    globalThis.__creativeOsSpriteWorkerServerMtime === currentServerMtime() &&
    (await isWorkerReady(existingOrigin))
  ) {
    return existingOrigin;
  }

  if (!globalThis.__creativeOsSpriteWorkerStarting) {
    globalThis.__creativeOsSpriteWorkerStarting = (async () => {
      const port = await allocateWorkerPort();
      const workerOrigin = `http://${WORKER_HOST}:${port}`;
      globalThis.__creativeOsSpriteWorkerOrigin = workerOrigin;
      stopInternalWorker();
      globalThis.__creativeOsSpriteWorkerOrigin = workerOrigin;
      spawnInternalWorker(port);
      await waitForWorker(workerOrigin);
      return workerOrigin;
    })().finally(() => {
      globalThis.__creativeOsSpriteWorkerStarting = undefined;
    });
  }

  return globalThis.__creativeOsSpriteWorkerStarting;
}

function currentServerMtime(): number {
  try {
    return statSync(join(process.cwd(), "tools/sprite-video-lab/server.py")).mtimeMs;
  } catch {
    return 0;
  }
}

export function getSpriteWorkerLogTail(maxChars = 1600): string {
  try {
    if (!existsSync(WORKER_LOG_PATH)) return "";
    const content = readFileSync(WORKER_LOG_PATH, "utf8");
    return content.slice(-maxChars).trim();
  } catch {
    return "";
  }
}

export function getSpriteWorkerFailureMessage(detail: string): string {
  const interrupted = /fetch failed|ECONNREFUSED|UND_ERR|terminated|aborted/i.test(detail);
  if (!interrupted) return detail || "处理服务暂时不可用。";

  const logTail = getSpriteWorkerLogTail();
  if (!logTail) return "处理服务连接中断，未捕获到处理日志。";
  return `处理服务连接中断。最后日志：${logTail}`;
}
