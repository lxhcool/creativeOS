import { NextResponse } from "next/server";
import { destroySession } from "@/lib/session-store";

/**
 * POST /api/auth/logout
 *
 * Destroy the current session and clear the cookie.
 */
export async function POST() {
  try {
    await destroySession();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[auth/logout]", err);
    return NextResponse.json(
      { success: false, message: "退出失败" },
      { status: 500 },
    );
  }
}
