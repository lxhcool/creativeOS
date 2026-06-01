import { NextResponse } from "next/server";
import { z } from "zod";
import { LocalGameAssetPlanner } from "@/services/agent";
import { generateGameAssetWorkflow } from "@/services/game-assets";

const requestSchema = z.object({
  userPrompt: z.string().min(1),
  workspaceId: z.string().min(1).default("local_workspace"),
  projectId: z.string().min(1).default("local_project"),
});

export async function POST(request: Request) {
  const body = await request.json();
  const input = requestSchema.parse(body);

  const result = await generateGameAssetWorkflow({
    agentProvider: new LocalGameAssetPlanner(),
    input,
    signal: request.signal,
  });

  return NextResponse.json(result);
}

