import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import {
  requestCanvasBrainChat,
  requestCanvasBrainPlan,
} from "../api/client";
import { prepareCanvasBrainAction } from "./action-context";
import type {
  CanvasActionIntent,
  CanvasBrainPlan,
  CanvasBrainTurnParams,
  CanvasBrainTurnResult,
} from "./types";

function inferFallbackOutputKind(command: string): CanvasActionIntent["outputKind"] | null {
  const text = command.toLowerCase();
  if (
    /生图|生成图片|生成一张图|出图|画出来|画一张|插画|封面|海报|图片|image/.test(
      text,
    )
  ) {
    return "image";
  }
  if (/视频|短片|动画|动起来|video/.test(text)) return "video";
  if (/音频|音乐|配乐|声音|audio|music/.test(text)) return "audio";
  if (/润色|扩写|改写|剧本|文案|提示词|prompt|文本/.test(text)) return "text";
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
  outputKind: CanvasActionIntent["outputKind"],
): CanvasBrainPlan {
  return {
    mode: "action",
    sourceIds: params.focusIds,
    createdSources: [],
    outputKind,
    placement: outputKind === "text" ? "update_current" : "create_result",
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
        provider: state.params.provider,
        model: state.params.model,
      });

      return { plan };
    } catch {
      const fallbackOutputKind = inferFallbackOutputKind(state.params.command);
      if (!fallbackOutputKind) {
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
        plan: buildFallbackActionPlan(state.params, fallbackOutputKind),
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
      const fallbackOutputKind = inferFallbackOutputKind(state.params.command);
      if (fallbackOutputKind) {
        return {
          result: ensureActionPlan(
            buildFallbackActionPlan(state.params, fallbackOutputKind),
            state.params,
          ),
        };
      }

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
  const result = await brainGraph.invoke({ params });

  if (!result.result) {
    return {
      kind: "chat",
      message: "我还没有理解你的意思，可以换个说法。",
    };
  }

  return result.result;
}
