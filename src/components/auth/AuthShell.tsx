"use client";

import Link from "next/link";
import type { ReactNode } from "react";

interface AuthShellProps {
  title: string;
  description: string;
  footer: ReactNode;
  children: ReactNode;
}

export function AuthShell({
  title,
  description,
  footer,
  children,
}: AuthShellProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#02070b] p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="rounded-xl bg-white/[0.14] px-3 py-2 text-sm font-semibold text-white backdrop-blur-2xl border border-white/10">
              CO
            </span>
            <div className="text-left">
              <h1 className="text-3xl font-bold text-white/90">CreativeOS</h1>
              <p className="text-sm text-white/40">AI 驱动的创作空间</p>
            </div>
          </Link>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/[0.07] p-6 shadow-2xl shadow-black/40 backdrop-blur-2xl">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-white/90">{title}</h2>
            <p className="mt-2 text-sm text-white/50">{description}</p>
          </div>
          {children}
        </div>

        <div className="mt-4 text-center text-sm text-white/40">{footer}</div>
      </div>
    </div>
  );
}
