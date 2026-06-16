import { NextRequest } from "next/server";
import { getSpriteVideoBackendUrl } from "@/server/sprite-video-backend";

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
    const backendUrl = await getSpriteVideoBackendUrl();
    const response = await fetch(`${backendUrl}${workPath}`, { headers, cache: "no-store" });
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
