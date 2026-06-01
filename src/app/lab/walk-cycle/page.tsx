import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { WalkCyclePreview } from "@/components/lab/WalkCyclePreview";

export default function WalkCycleLabPage() {
  return (
    <main className="min-h-screen bg-[#02070b] px-6 py-10 text-white sm:px-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-white/35">Lab</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[0.04em] text-white sm:text-5xl">
              Walk Cycle Validation
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/60 sm:text-base">
              独立验证页，只测试一件事：Canvas2D 中能否稳定播放一个自然的原地火柴人行走循环。
            </p>
          </div>

          <Link
            href="/"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-4 text-xs font-medium text-white/80 transition hover:bg-white/[0.14] hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回首页
          </Link>
        </div>

        <section className="grid gap-6 lg:grid-cols-[440px_minmax(0,1fr)]">
          <WalkCyclePreview />

          <div className="rounded-[28px] border border-white/10 bg-white/[0.06] p-6 shadow-2xl shadow-black/20">
            <h2 className="text-lg font-semibold text-white/90">验证范围</h2>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-white/60">
              <li>原地 walk cycle，自动循环播放</li>
              <li>周期约 1.28 秒，强调完整重心转换和游戏角色节奏</li>
              <li>程序化骨骼步态，不依赖外部素材或第三方动画 runtime</li>
              <li>目标是自然感，不是 UI 完成度</li>
            </ul>

            <h2 className="mt-8 text-lg font-semibold text-white/90">当前判断标准</h2>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-white/60">
              <li>左右脚交替明显，不是简单摆腿</li>
              <li>手臂反向摆动，身体有轻微起伏</li>
              <li>循环首尾衔接不突兀</li>
              <li>后续可以自然扩展成 Skeleton / Animation / Preview 数据链</li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
