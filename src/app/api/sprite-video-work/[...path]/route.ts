import { NextRequest } from "next/server";
import {
  getSpriteWorkerFailureMessage,
  getSpriteWorkerOrigin,
  resetSpriteWorkerOrigin,
} from "@/server/sprite-worker";

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
        error: getSpriteWorkerFailureMessage(detail),
        scope: "creativeOS internal sprite worker",
      },
      { status: 502 },
    );
  }
}
