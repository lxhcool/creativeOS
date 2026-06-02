import { NextResponse } from "next/server";
import { z } from "zod";
import {
  DifyAgentProvider,
  ModelGatewayAgentProvider,
  type AgentProvider,
} from "@/services/agent";
import { generateGameAssetWorkflow } from "@/services/game-assets";

const requestSchema = z.object({
  userPrompt: z.string().min(1),
  workspaceId: z.string().min(1).default("local_workspace"),
  projectId: z.string().min(1).default("local_project"),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = requestSchema.parse(body);

    const result = await generateGameAssetWorkflow({
      agentProvider: createAgentProvider(),
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

function createAgentProvider(): AgentProvider {
  const difyEndpoint = process.env["DIFY_WORKFLOW_ENDPOINT"];
  const difyApiKey = process.env["DIFY_API_KEY"];

  if (difyEndpoint && difyApiKey) {
    return new DifyAgentProvider({
      endpoint: difyEndpoint,
      apiKey: difyApiKey,
      workflowId: process.env["DIFY_WORKFLOW_ID"],
    });
  }

  return new ModelGatewayAgentProvider();
}
