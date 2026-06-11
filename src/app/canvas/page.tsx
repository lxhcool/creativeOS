"use client";

import dynamic from "next/dynamic";

const FreeCanvas = dynamic(
  () => import("@/widgets/free-canvas").then((module) => module.FreeCanvas),
  {
    ssr: false,
    loading: () => (
      <main className="flex h-screen w-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        正在加载画布...
      </main>
    ),
  },
);

export default function CanvasPage() {
  return <FreeCanvas />;
}
