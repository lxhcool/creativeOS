"use client";

import { FormEvent, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import type { ToolExecutionResult } from "@/services/game-assets";

const NODE_LABELS: Record<string, string> = {
  character: "角色",
  skeleton: "骨架",
  animation: "动画",
  scene: "场景",
  preview: "预览",
  compositionPreview: "组合预览",
};

export function GameAssetWorkflowPanel() {
  const [prompt, setPrompt] = useState("生成一个弓箭手和森林场景");
  const [result, setResult] = useState<ToolExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/game-assets/workflows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userPrompt: prompt,
            workspaceId: "local_workspace",
            projectId: "local_project",
          }),
        });

        if (!response.ok) {
          throw new Error(`生成失败：${response.status}`);
        }

        const data = await response.json() as ToolExecutionResult;
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "生成失败");
      }
    });
  }

  return (
    <section className="relative min-h-screen overflow-hidden bg-[#11100d] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(251,191,36,0.16),transparent_28%),radial-gradient(circle_at_75%_12%,rgba(56,189,248,0.14),transparent_32%),linear-gradient(135deg,#11100d_0%,#17140f_52%,#10141a_100%)]" />
      <div className="relative grid min-h-screen grid-cols-[360px_1fr] gap-0">
        <aside className="border-r border-white/10 bg-black/24 p-6 backdrop-blur-2xl">
          <p className="text-xs uppercase tracking-[0.32em] text-amber-200/60">
            Game Asset Studio
          </p>
          <h1 className="mt-4 text-3xl leading-tight text-white">
            游戏资产工作流
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/55">
            当前走正式产品逻辑：大模型 / Agent 负责理解输入并规划 AgentPlan，本地 Tool Executor 负责生成骨架资产、节点和 Canvas2D 预览。
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <label className="block text-sm text-white/70" htmlFor="asset-prompt">
              输入资产需求
            </label>
            <textarea
              id="asset-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="min-h-32 w-full resize-none rounded-3xl border border-white/10 bg-white/[0.07] p-4 text-sm leading-6 text-white outline-none transition focus:border-amber-200/40 focus:bg-white/[0.1]"
              placeholder="例如：生成一个弓箭手和森林场景"
            />
            <Button
              type="submit"
              variant="primary"
              loading={isPending}
              disabled={!prompt.trim()}
              className="w-full"
            >
              生成工作流
            </Button>
          </form>

          {error && (
            <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
              {error}
            </div>
          )}

          <ModelRuleNote />
        </aside>

        <main className="overflow-auto p-8">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm text-white/45">Board</p>
              <h2 className="text-2xl text-white">
                {result?.board.name ?? "等待生成"}
              </h2>
            </div>
            {result && (
              <div className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-white/60">
                {result.createdAssetIds.length} 个资产 · {result.board.nodes.length} 个节点
              </div>
            )}
          </div>

          {result ? <WorkflowBoard result={result} /> : <EmptyBoard />}
        </main>
      </div>
    </section>
  );
}

function WorkflowBoard({ result }: { result: ToolExecutionResult }) {
  return (
    <div className="relative min-h-[640px] min-w-[980px] rounded-[2rem] border border-white/10 bg-black/20 p-8 shadow-2xl shadow-black/30">
      <svg className="pointer-events-none absolute inset-0 h-full w-full">
        {result.board.edges.map((edge) => {
          const source = result.board.nodes.find((node) => node.id === edge.source);
          const target = result.board.nodes.find((node) => node.id === edge.target);
          if (!source || !target) return null;

          const startX = source.position.x + 220;
          const startY = source.position.y + 78;
          const endX = target.position.x + 12;
          const endY = target.position.y + 78;
          const midX = (startX + endX) / 2;

          return (
            <path
              key={edge.id}
              d={`M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`}
              fill="none"
              stroke="rgba(251, 191, 36, 0.46)"
              strokeWidth="2"
            />
          );
        })}
      </svg>

      {result.board.nodes.map((node) => (
        <article
          key={node.id}
          className="absolute w-56 rounded-3xl border border-white/10 bg-[#171717]/90 p-4 shadow-xl shadow-black/30 backdrop-blur"
          style={{
            left: node.position.x,
            top: node.position.y,
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full bg-amber-200/12 px-3 py-1 text-xs text-amber-100">
              {NODE_LABELS[node.type] ?? node.type}
            </span>
            <span className="text-xs text-emerald-200">{node.status}</span>
          </div>
          <h3 className="mt-4 text-base text-white">{node.title}</h3>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/42">
            {node.assetIds.join(", ")}
          </p>
          <div className="mt-4 h-1.5 rounded-full bg-white/10">
            <div className="h-full w-full rounded-full bg-gradient-to-r from-amber-200 to-sky-300" />
          </div>
        </article>
      ))}
    </div>
  );
}

function EmptyBoard() {
  return (
    <div className="flex min-h-[640px] items-center justify-center rounded-[2rem] border border-dashed border-white/12 bg-black/16">
      <div className="max-w-md text-center">
        <p className="text-lg text-white/70">输入一句话，生成第一条游戏资产链。</p>
        <p className="mt-3 text-sm leading-6 text-white/40">
          结果会包含 Character、Skeleton、Animation、Scene、Preview 等资产，并在 Board 中显示节点和连线。
        </p>
      </div>
    </div>
  );
}

function ModelRuleNote() {
  return (
    <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.05] p-4 text-xs leading-5 text-white/48">
      <p className="font-medium text-white/70">模型选择规则</p>
      <p className="mt-2">
        如果配置了 Dify，Planner 由 Dify 工作流决定模型；否则走 CreativeOS Model Gateway 的 `planner` 路由链。当前阶段不调用生图模型。
      </p>
    </div>
  );
}
