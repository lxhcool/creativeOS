import { NextResponse } from "next/server";
import { loginWithPasswordAuth } from "@/lib/auth-service";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
    };

    const result = await loginWithPasswordAuth(request, {
      email: body.email || "",
      password: body.password || "",
    });

    if (!result.success || !result.payload) {
      return NextResponse.json(
        { success: false, message: result.message || "登录失败" },
        { status: 401 },
      );
    }

    return NextResponse.json({
      success: true,
      user: result.payload.user,
    });
  } catch (error) {
    console.error("[auth/password/login]", error);
    return NextResponse.json(
      { success: false, message: "服务端发生错误" },
      { status: 500 },
    );
  }
}
