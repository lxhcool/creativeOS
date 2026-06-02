import { agentPlanSchema } from "@/services/game-assets";
import { getModelGateway, ModelGateway, type ModelGatewayConfig } from "@/services/model";
import type { AgentPlanRun, AgentProvider, GameAssetPlanInput } from "./types";

const SYSTEM_PROMPT = `
你是 CreativeOS 的游戏资产工作流 Planner。
你的任务是理解用户输入，并输出 AgentPlan JSON。

重要规则：
- 只输出 JSON，不要输出 markdown。
- 你只负责规划工具调用，不负责创建项目状态。
- 不要规划 AI 生图能力。
- 第一阶段用程序化骨架和 Canvas2D 预览代替图片资产。
- 必须至少包含 createCharacter、createSkeleton、createAnimation、createPreview。
- 如果用户提到场景、背景、森林、城镇、房间等环境，加入 createScene。
- 如果用户明确要求多个角色或角色与场景组合，仍然输出可执行的工具序列。
`.trim();

const SCHEMA_DESCRIPTION = `
AgentPlan:
{
  "version": "1",
  "intent": "create_game_asset_workflow",
  "summary": "short English summary",
  "tools": [
    {
      "name": "createCharacter",
      "input": {
        "kind": "archer | knight | mage | adventurer | other lowercase kind",
        "style": "stickman",
        "description": "user-facing character description",
        "name": "optional display name",
        "tags": ["optional", "tags"]
      }
    },
    {
      "name": "createSkeleton",
      "input": {
        "rig": "humanoid_2d",
        "proportion": "stickman | chibi | standard"
      }
    },
    {
      "name": "createAnimation",
      "input": {
        "actions": ["idle", "walk", "attack"]
      }
    },
    {
      "name": "createScene",
      "input": {
        "name": "Scene name",
        "description": "scene description",
        "background": "plain | forest | town | room | other simple background label"
      }
    },
    {
      "name": "createPreview",
      "input": { "runtime": "canvas2d" }
    }
  ]
}
`.trim();

export class ModelGatewayAgentProvider implements AgentProvider {
  private readonly config?: ModelGatewayConfig;

  constructor(config?: ModelGatewayConfig) {
    this.config = config;
  }

  async runGameAssetPlan(
    input: GameAssetPlanInput,
    signal?: AbortSignal,
  ): Promise<AgentPlanRun> {
    const gateway = this.config ? new ModelGateway(this.config) : getModelGateway();
    const result = await gateway.generateJson({
      task: "planner",
      schema: agentPlanSchema,
      schemaDescription: SCHEMA_DESCRIPTION,
      systemPrompt: SYSTEM_PROMPT,
      prompt: buildPrompt(input),
      temperature: 0.2,
      maxTokens: 3000,
      signal,
    });

    return {
      plan: result.data,
      source: "model_gateway",
      providerId: result.providerId,
      modelId: result.modelId,
    };
  }
}

function buildPrompt(input: GameAssetPlanInput): string {
  return [
    `workspaceId: ${input.workspaceId}`,
    `projectId: ${input.projectId}`,
    `userPrompt: ${input.userPrompt}`,
  ].join("\n");
}
