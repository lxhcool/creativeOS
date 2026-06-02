import type { AgentPlan } from "@/services/game-assets";

export interface GameAssetPlanInput {
  userPrompt: string;
  workspaceId: string;
  projectId: string;
}

export interface AgentPlanRun {
  plan: AgentPlan;
  source: "dify" | "model_gateway" | "local";
  providerId?: string;
  modelId?: string;
}

export interface AgentProvider {
  runGameAssetPlan(input: GameAssetPlanInput, signal?: AbortSignal): Promise<AgentPlanRun>;
}
