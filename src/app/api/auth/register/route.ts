import { NextResponse } from "next/server";
import { registerWithPasswordAuth } from "@/lib/auth-service";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      password?: string;
    };

    const result = await registerWithPasswordAuth(request, {
      name: body.name || "",
      email: body.email || "",
      password: body.password || "",
    });

    if (!result.success || !result.payload) {
      return NextResponse.json(
        { success: false, message: result.message || "注册失败" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      user: result.payload.user,
    });
  } catch (error) {
    console.error("[auth/register]", error);
    return NextResponse.json(
      { success: false, message: "服务端发生错误" },
      { status: 500 },
    );
  }
}
