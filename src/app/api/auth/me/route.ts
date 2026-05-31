import { NextResponse } from "next/server";
import {
  getCurrentAuthPayload,
  updateCurrentUserProfile,
} from "@/lib/auth-service";
import { getSession } from "@/lib/session-store";

export async function GET() {
  try {
    const payload = await getCurrentAuthPayload();

    if (!payload) {
      return NextResponse.json(
        { authenticated: false, user: null },
        { status: 200 },
      );
    }

    return NextResponse.json(
      {
        authenticated: true,
        user: payload.user,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[auth/me]", error);
    return NextResponse.json(
      { authenticated: false, user: null },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { success: false, message: "请先登录" },
        { status: 401 },
      );
    }

    const body = (await request.json()) as {
      name?: string;
      avatarUrl?: string;
    };
    const result = updateCurrentUserProfile({
      userId: session.userId,
      name: body.name || "",
      avatarUrl: body.avatarUrl,
    });

    if (!result.success || !result.payload) {
      return NextResponse.json(
        { success: false, message: result.message || "保存失败" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      user: result.payload.user,
    });
  } catch (error) {
    console.error("[auth/me:PATCH]", error);
    return NextResponse.json(
      { success: false, message: "服务端发生错误" },
      { status: 500 },
    );
  }
}
