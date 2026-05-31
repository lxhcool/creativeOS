import { NextResponse } from "next/server";
import { requestEmailCode } from "@/lib/auth-service";
import type { VerificationPurpose } from "@/lib/verification-store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      purpose?: VerificationPurpose;
    };

    const result = await requestEmailCode({
      email: body.email || "",
      purpose: body.purpose || "login",
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, message: result.message || "请求失败" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error("[auth/email/code]", error);
    return NextResponse.json(
      { success: false, message: "服务端发生错误" },
      { status: 500 },
    );
  }
}
