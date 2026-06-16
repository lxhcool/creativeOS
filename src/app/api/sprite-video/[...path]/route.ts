import { NextRequest } from "next/server";
import { getSpriteVideoBackendUrl } from "@/server/sprite-video-backend";

export const runtime = "nodejs";

async function proxySpriteVideoRequest(
  request: NextRequest,
  pathParts: string[],
): Promise<Response> {
  const path = `/${pathParts.join("/")}`;
  const apiPath = `${path.startsWith("/api/") ? path : `/api${path}`}${request.nextUrl.search}`;
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const range = request.headers.get("range");
  if (range) headers.set("range", range);

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: "no-store",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  try {
    const backendUrl = await getSpriteVideoBackendUrl();
    const response = await fetch(`${backendUrl}${apiPath}`, init);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Sprite Video Lab backend is not reachable.",
        scope: "creativeOS internal sprite worker",
      },
      { status: 502 },
    );
  }
}

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxySpriteVideoRequest(request, path);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxySpriteVideoRequest(request, path);
}
