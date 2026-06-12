"use client";

import dynamic from "next/dynamic";

const FreeCanvas = dynamic(
  () => import("@/widgets/free-canvas").then((module) => module.FreeCanvas),
  {
    ssr: false,
    loading: () => (
      <main className="flex h-screen w-screen items-center justify-center bg-[#02070b] text-sm text-white/45">
        <span className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 shadow-2xl shadow-black/30 backdrop-blur-xl">
          正在加载画布...
        </span>
      </main>
    ),
  },
);

export default function CanvasPage() {
  return <FreeCanvas />;
}
