import { agentPlanSchema, type AgentPlan } from "@/services/game-assets";
import type { AgentProvider, GameAssetPlanInput } from "./types";

export interface DifyAgentProviderConfig {
  endpoint: string;
  apiKey: string;
  workflowId?: string;
}

interface DifyWorkflowResponse {
  data?: {
    outputs?: unknown;
  };
  outputs?: unknown;
}

export class DifyAgentProvider implements AgentProvider {
  private readonly config: DifyAgentProviderConfig;

  constructor(config: DifyAgentProviderConfig) {
    this.config = config;
  }

  async runGameAssetPlan(
    input: GameAssetPlanInput,
    signal?: AbortSignal,
  ): Promise<AgentPlan> {
    const response = await fetch(this.config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workflow_id: this.config.workflowId,
        inputs: input,
        response_mode: "blocking",
        user: input.workspaceId,
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Dify workflow request failed: ${response.status}`);
    }

    const payload = await response.json() as DifyWorkflowResponse;
    return agentPlanSchema.parse(extractPlan(payload));
  }
}

function extractPlan(payload: DifyWorkflowResponse): unknown {
  const outputs = payload.data?.outputs ?? payload.outputs;
  if (typeof outputs === "string") {
    return JSON.parse(outputs);
  }

  if (isRecord(outputs) && "agentPlan" in outputs) {
    const agentPlan = outputs.agentPlan;
    return typeof agentPlan === "string" ? JSON.parse(agentPlan) : agentPlan;
  }

  return outputs;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

