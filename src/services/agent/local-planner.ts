import type { AgentPlan } from "@/services/game-assets";
import type { AgentProvider, GameAssetPlanInput } from "./types";

export class LocalGameAssetPlanner implements AgentProvider {
  async runGameAssetPlan(input: GameAssetPlanInput): Promise<AgentPlan> {
    const lowerPrompt = input.userPrompt.toLowerCase();
    const wantsScene = /scene|forest|background|场景|森林|背景/.test(lowerPrompt);
    const kind = inferCharacterKind(lowerPrompt);

    return {
      version: "1",
      intent: "create_game_asset_workflow",
      summary: `Create a ${kind} character workflow${wantsScene ? " with a simple scene" : ""}.`,
      tools: [
        {
          name: "createCharacter",
          input: {
            kind,
            style: "stickman",
            description: input.userPrompt,
            tags: [kind, "mvp"],
          },
        },
        {
          name: "createSkeleton",
          input: {
            rig: "humanoid_2d",
            proportion: "stickman",
          },
        },
        {
          name: "createAnimation",
          input: {
            actions: ["idle", "walk", "attack"],
          },
        },
        ...(wantsScene
          ? [{
              name: "createScene" as const,
              input: {
                name: "Scene",
                description: input.userPrompt,
                background: lowerPrompt.includes("forest") || lowerPrompt.includes("森林")
                  ? "forest"
                  : "plain",
              },
            }]
          : []),
        {
          name: "createPreview",
          input: {
            runtime: "canvas2d",
          },
        },
      ],
    };
  }
}

function inferCharacterKind(prompt: string): string {
  if (/archer|bow|弓|弓箭/.test(prompt)) return "archer";
  if (/knight|sword|剑|骑士/.test(prompt)) return "knight";
  if (/mage|wizard|法师|魔法/.test(prompt)) return "mage";
  return "adventurer";
}

