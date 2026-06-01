import type { AgentPlan } from "@/services/game-assets";

export interface GameAssetPlanInput {
  userPrompt: string;
  workspaceId: string;
  projectId: string;
}

export interface AgentProvider {
  runGameAssetPlan(input: GameAssetPlanInput, signal?: AbortSignal): Promise<AgentPlan>;
}

