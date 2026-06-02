import type { AgentProvider, GameAssetPlanInput } from "@/services/agent";
import { ToolExecutor, type ToolExecutionResult } from "./tool-executor";

export interface GenerateGameAssetWorkflowOptions {
  agentProvider: AgentProvider;
  executor?: ToolExecutor;
  input: GameAssetPlanInput;
  signal?: AbortSignal;
}

export async function generateGameAssetWorkflow(
  options: GenerateGameAssetWorkflowOptions,
): Promise<ToolExecutionResult> {
  const planRun = await options.agentProvider.runGameAssetPlan(options.input, options.signal);
  const executor = options.executor ?? new ToolExecutor();
  const result = executor.executePlan(planRun.plan, {
    workspaceId: options.input.workspaceId,
    projectId: options.input.projectId,
    boardName: "游戏资产工作流",
  });

  return {
    ...result,
    planner: {
      source: planRun.source,
      providerId: planRun.providerId,
      modelId: planRun.modelId,
    },
  };
}
