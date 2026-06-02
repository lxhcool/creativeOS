import { NextResponse } from "next/server";
import { z } from "zod";
import {
  DifyAgentProvider,
  ModelGatewayAgentProvider,
  type AgentProvider,
} from "@/services/agent";
import { generateGameAssetWorkflow } from "@/services/game-assets";
import type { ModelGatewayConfig } from "@/services/model";

const modelCapabilitySchema = z.enum([
  "text",
  "tool_calling",
  "json",
  "vision",
  "embedding",
  "streaming",
]);

const gatewayConfigSchema = z.object({
  providers: z.array(z.object({
    id: z.string().min(1),
    name: z.string().optional(),
    type: z.enum(["openai", "anthropic", "google", "openai_compatible"]),
    enabled: z.boolean(),
    baseUrl: z.string().min(1),
    apiKeyEnv: z.string().optional(),
    apiKey: z.string().optional(),
    models: z.array(z.object({
      id: z.string().min(1),
      capabilities: z.array(modelCapabilitySchema).min(1),
      contextWindow: z.number().optional(),
      maxOutputTokens: z.number().optional(),
      costPer1kInput: z.number().optional(),
      costPer1kOutput: z.number().optional(),
    })),
  })),
  routing: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
});

const requestSchema = z.object({
  userPrompt: z.string().min(1),
  workspaceId: z.string().min(1).default("local_workspace"),
  projectId: z.string().min(1).default("local_project"),
  gatewayConfig: gatewayConfigSchema.optional(),
  plannerModelRef: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = requestSchema.parse(body);

    const result = await generateGameAssetWorkflow({
      agentProvider: createAgentProvider(input.gatewayConfig, input.plannerModelRef),
      input,
      signal: request.signal,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Game asset workflow failed.";
    const status = message.includes("No models available") ? 503 : 500;

    return NextResponse.json(
      {
        error: message,
        code: status === 503 ? "MODEL_PROVIDER_NOT_CONFIGURED" : "WORKFLOW_GENERATION_FAILED",
      },
      { status },
    );
  }
}

function createAgentProvider(
  gatewayConfig?: ModelGatewayConfig,
  plannerModelRef?: string,
): AgentProvider {
  const difyEndpoint = process.env["DIFY_WORKFLOW_ENDPOINT"];
  const difyApiKey = process.env["DIFY_API_KEY"];

  if (difyEndpoint && difyApiKey) {
    return new DifyAgentProvider({
      endpoint: difyEndpoint,
      apiKey: difyApiKey,
      workflowId: process.env["DIFY_WORKFLOW_ID"],
    });
  }

  return new ModelGatewayAgentProvider(
    gatewayConfig ? normalizePlannerRouting(gatewayConfig, plannerModelRef) : undefined,
  );
}

function normalizePlannerRouting(
  config: ModelGatewayConfig,
  plannerModelRef?: string,
): ModelGatewayConfig {
  const modelRefs = new Set(
    config.providers.flatMap((provider) =>
      provider.enabled
        ? provider.models
            .filter((model) =>
              model.capabilities.includes("text") &&
              model.capabilities.includes("json"),
            )
            .map((model) => `${provider.id}:${model.id}`)
        : [],
    ),
  );

  const existingPlanner = config.routing["planner"];
  const existingRefs = Array.isArray(existingPlanner)
    ? existingPlanner
    : existingPlanner
      ? [existingPlanner]
      : [];

  return {
    providers: config.providers,
    routing: {
      ...config.routing,
      planner: [
        ...(plannerModelRef ? [plannerModelRef] : []),
        ...existingRefs.filter((ref) => ref !== plannerModelRef),
        ...[...modelRefs].filter((ref) =>
          ref !== plannerModelRef && !existingRefs.includes(ref),
        ),
      ],
    },
  };
}
