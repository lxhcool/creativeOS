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
  const plan = await options.agentProvider.runGameAssetPlan(options.input, options.signal);
  const executor = options.executor ?? new ToolExecutor();

  return executor.executePlan(plan, {
    workspaceId: options.input.workspaceId,
    projectId: options.input.projectId,
    boardName: "游戏资产工作流",
  });
}

