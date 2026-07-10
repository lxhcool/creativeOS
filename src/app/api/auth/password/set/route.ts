import { NextResponse } from "next/server";
import { getSession } from "@/lib/session-store";
import { hashPassword, setUserPassword } from "@/lib/user-store";

/**
 * POST /api/auth/password/set
 *
 * Set or change password for the currently logged-in user.
 * Requires a valid session.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, message: "请先登录" },
        { status: 401 },
      );
    }

    const { password } = (await request.json()) as { password?: string };

    if (!password || password.length < 6) {
      return NextResponse.json(
        { success: false, message: "密码至少需要6个字符" },
        { status: 400 },
      );
    }

    const { hash, salt } = await hashPassword(password);
    await setUserPassword(session.userId, hash, salt);

    return NextResponse.json({ success: true, message: "密码设置成功" });
  } catch (err) {
    console.error("[password/set]", err);
    return NextResponse.json(
      { success: false, message: "服务器内部错误" },
      { status: 500 },
    );
  }
}
