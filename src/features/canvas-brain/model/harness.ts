import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import {
  requestCanvasBrainChat,
  requestCanvasBrainPlan,
} from "../api/client";
import { prepareCanvasBrainAction } from "./action-context";
import type {
  CanvasAssetWorkflowKind,
  CanvasActionIntent,
  CanvasBrainPlan,
  CanvasBrainTurnParams,
  CanvasBrainTurnResult,
} from "./types";

const FALLBACK_CREATE_PATTERN =
  /(生成|创建|新建|写|写一|写个|写出|做一个|做个|制作|产出|出一版|整理成|扩写成|改写成|画|画一|画个|设计|检查|审计|查错|create|generate|make|write|draft|produce)/i;
const FALLBACK_QUESTION_PATTERN =
  /(怎么|如何|为什么|是什么|能不能|可以吗|有哪些|多少|吗|？|\?|讲讲|解释|说明|介绍|配置|流程|区别|建议|weather|today|what|how|why|when|where)/i;
const FALLBACK_REQUEST_PATTERN =
  /(帮我|给我|请|我要|我想|想要|想生成|想写|需要|来一|直接|开始|继续生成|please|can you|i want|make me)/i;

function isExplicitFallbackAction(command: string): boolean {
  return FALLBACK_CREATE_PATTERN.test(command) && !(
    FALLBACK_QUESTION_PATTERN.test(command) &&
    !FALLBACK_REQUEST_PATTERN.test(command)
  );
}

function inferFallbackWorkflow(command: string): {
  outputKind: CanvasActionIntent["outputKind"];
  assetWorkflow?: CanvasAssetWorkflowKind;
} | null {
  if (!isExplicitFallbackAction(command)) return null;

  const text = command.toLowerCase();
  if (/一致性|连续性|前后矛盾|矛盾|冲突检查|查错|检查设定|检查剧情|检查角色|continuity|consistency/.test(text)) {
    return { outputKind: "text", assetWorkflow: "consistency_check" };
  }
  if (/合并.*(章节|增量|更新|台账)|更新.*(角色状态表|伏笔台账|作品圣经)|整理.*(角色状态|伏笔|台账)/.test(text)) {
    return { outputKind: "text", assetWorkflow: "novel_merge_updates" };
  }
  if (
    /生图|生成图片|生成一张图|出图|画出来|画一张|插画|封面|海报|图片|image/.test(
      text,
    )
  ) {
    return { outputKind: "image", assetWorkflow: "image" };
  }
  if (/视频|短片|动画|动起来|video/.test(text)) return { outputKind: "video", assetWorkflow: "video" };
  if (/章节|第[一二三四五六七八九十百\d]+章|chapter/.test(text)) {
    return { outputKind: "text", assetWorkflow: "novel_chapter" };
  }
  if (/小说|长篇|短篇|网文|故事|剧情|novel|fiction/.test(text)) {
    return { outputKind: "text", assetWorkflow: "novel" };
  }
  if (/角色|人物|人设|character/.test(text)) return { outputKind: "text", assetWorkflow: "character" };
  if (/剧本|脚本|对白|script/.test(text)) return { outputKind: "text", assetWorkflow: "script" };
  if (/分镜|镜头|storyboard/.test(text)) return { outputKind: "text", assetWorkflow: "storyboard" };
  if (/文章|长文|稿件|article/.test(text)) return { outputKind: "text", assetWorkflow: "article" };
  if (/音频|音乐|配乐|声音|audio|music/.test(text)) return { outputKind: "audio" };
  if (/润色|扩写|改写|文案|提示词|prompt|文本/.test(text)) return { outputKind: "text" };
  return null;
}

export function sanitizePlannerText(text: string, fallback: string): string {
  if (!/createdSources|sourceIds|outputKind|placement/i.test(text)) return text;
  return fallback;
}

function sanitizeActionSummary(text: string | undefined): string {
  if (!text) return "我已经整理好这次要参考的素材。";
  if (/已.*生成|生成完成|已完成|已经完成|已根据.*生成|已为你.*生成/.test(text)) {
    return "我已经整理好这次要参考的素材，开始执行生成。";
  }
  return sanitizePlannerText(text, "我已经整理好这次要参考的素材。");
}

function buildFallbackActionPlan(
  params: CanvasBrainTurnParams,
  fallback: {
    outputKind: CanvasActionIntent["outputKind"];
    assetWorkflow?: CanvasAssetWorkflowKind;
  },
): CanvasBrainPlan {
  return {
    mode: "action",
    intentType: params.selectedElement ? "modify_asset" : "create_asset",
    confidence: 0.72,
    assetWorkflow: fallback.assetWorkflow,
    sourceIds: params.focusIds,
    createdSources: [],
    outputKind: fallback.outputKind,
    placement: fallback.outputKind === "text" ? "update_current" : "create_result",
    instruction: params.command,
    summary: "我已经整理好这次要参考的素材，开始执行生成。",
  };
}

const BrainState = Annotation.Root({
  params: Annotation<CanvasBrainTurnParams>,
  plan: Annotation<CanvasBrainPlan | undefined>,
  result: Annotation<CanvasBrainTurnResult | undefined>,
});

function ensureActionPlan(
  plan: CanvasBrainPlan,
  params: CanvasBrainTurnParams,
): CanvasBrainTurnResult {
  if ((plan.confidence ?? 1) < 0.65 || plan.intentType === "unclear") {
    return {
      kind: "clarification",
      message: plan.question || "我还不确定要处理什么，可以说清楚要生成、修改或询问的对象。",
    };
  }

  if (!plan.outputKind || !plan.placement || !plan.instruction) {
    return {
      kind: "chat",
      message: "我还没有理解要怎么处理画布，可以换个说法。",
    };
  }

  const instruction = sanitizePlannerText(plan.instruction, params.command);
  const actionPlan = {
    ...plan,
    outputKind: plan.outputKind,
    placement: plan.placement,
    instruction,
  };
  const action = prepareCanvasBrainAction({
    command: params.command,
    history: params.history,
    elements: params.elements,
    selectedElement: params.selectedElement,
    focusIds: params.focusIds,
    plan: actionPlan,
    center: params.center,
  });

  if (action.kind === "clarification") {
    return {
      kind: "clarification",
      message: action.message,
    };
  }

  return {
    kind: "action",
    plan: actionPlan,
    action,
    summary: sanitizeActionSummary(plan.summary),
  };
}

const brainGraph = new StateGraph(BrainState)
  .addNode("requestPlan", async (state) => {
    try {
      const plan = await requestCanvasBrainPlan({
        prompt: state.params.command,
        history: state.params.history,
        elements: state.params.elements,
        edges: state.params.edges,
        focusIds: state.params.focusIds,
        projectId: state.params.projectId,
        provider: state.params.provider,
        model: state.params.model,
      });

      return { plan };
    } catch {
      const fallback = inferFallbackWorkflow(state.params.command);
      if (!fallback) {
        const message = await requestCanvasBrainChat({
          prompt: state.params.command,
          history: state.params.history,
          elements: state.params.elements,
          focusIds: state.params.focusIds,
          provider: state.params.provider,
          model: state.params.model,
        });

        return {
          result: {
            kind: "chat",
            message,
          } satisfies CanvasBrainTurnResult,
        };
      }

      return {
        plan: buildFallbackActionPlan(state.params, fallback),
      };
    }
  })
  .addNode("resolveTurn", (state) => {
    if (state.result) return {};
    const plan = state.plan;
    if (!plan) {
      return {
        result: {
          kind: "chat",
          message: "我还没有理解你的意思，可以换个说法。",
        } satisfies CanvasBrainTurnResult,
      };
    }

    if (plan.mode === "chat") {
      return {
        result: {
          kind: "chat",
          message: plan.response || plan.summary || "我在，你可以继续说。",
        } satisfies CanvasBrainTurnResult,
      };
    }

    if (plan.needsClarification) {
      return {
        result: {
          kind: "clarification",
          message: plan.question || "我找到了多个可能相关的素材，请先选中要使用的节点。",
        } satisfies CanvasBrainTurnResult,
      };
    }

    return {
      result: ensureActionPlan(plan, state.params),
    };
  })
  .addEdge(START, "requestPlan")
  .addEdge("requestPlan", "resolveTurn")
  .addEdge("resolveTurn", END)
  .compile();

export async function runCanvasBrainTurn(
  params: CanvasBrainTurnParams,
): Promise<CanvasBrainTurnResult> {
  const result = await brainGraph.invoke(
    { params },
    {
      configurable: {
        thread_id: getCanvasBrainThreadId(params),
      },
    },
  );

  if (!result.result) {
    return {
      kind: "chat",
      message: "我还没有理解你的意思，可以换个说法。",
    };
  }

  return result.result;
}

function getCanvasBrainThreadId(params: CanvasBrainTurnParams): string {
  return params.projectId
    ? `canvas:${params.projectId}`
    : "canvas:unsaved";
}
