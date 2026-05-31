import { NextResponse } from "next/server";
import { loginWithEmailCodeAuth } from "@/lib/auth-service";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      code?: string;
    };

    const result = await loginWithEmailCodeAuth(request, {
      email: body.email || "",
      code: body.code || "",
    });

    if (!result.success || !result.payload) {
      return NextResponse.json(
        { success: false, message: result.message || "登录失败" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      user: result.payload.user,
    });
  } catch (error) {
    console.error("[auth/email/verify]", error);
    return NextResponse.json(
      { success: false, message: "服务端发生错误" },
      { status: 500 },
    );
  }
}
