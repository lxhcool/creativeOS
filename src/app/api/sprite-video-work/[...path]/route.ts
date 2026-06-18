import { NextRequest } from "next/server";
import { getSpriteWorkerOrigin, resetSpriteWorkerOrigin } from "@/server/sprite-worker";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const workPath = `/work/${path.join("/")}${request.nextUrl.search}`;
  const headers = new Headers();
  const range = request.headers.get("range");
  if (range) headers.set("range", range);

  try {
    const workerOrigin = await getSpriteWorkerOrigin();
    const response = await fetch(`${workerOrigin}${workPath}`, { headers, cache: "no-store" });
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    resetSpriteWorkerOrigin();
    const detail = error instanceof Error ? error.message : String(error);
    return Response.json(
      {
        ok: false,
        error: /fetch failed|ECONNREFUSED|UND_ERR|terminated|aborted/i.test(detail)
          ? "处理服务连接中断，请重试一次；如果还失败，刷新页面后再处理。"
          : detail || "处理服务暂时不可用。",
        scope: "creativeOS internal sprite worker",
      },
      { status: 502 },
    );
  }
}
