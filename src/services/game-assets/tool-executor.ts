import { generateId } from "@/lib/id";
import {
  agentPlanSchema,
  type AgentPlan,
  type AnimationAction,
  type AnimationAsset,
  type AssetLibrary,
  type Board,
  type BoardEdge,
  type BoardNode,
  type CharacterAsset,
  type CompositionPreviewAsset,
  createEmptyAssetLibrary,
  type Point,
  type PreviewAsset,
  type SceneAsset,
  type SkeletonAsset,
  type ToolCall,
} from "./schemas";

export interface ToolExecutionContext {
  workspaceId?: string;
  projectId?: string;
  boardName?: string;
  now?: string;
}

export interface ToolExecutionResult {
  plan: AgentPlan;
  planner?: {
    source: "dify" | "model_gateway" | "local";
    providerId?: string;
    modelId?: string;
  };
  assets: AssetLibrary;
  board: Board;
  createdAssetIds: string[];
}

interface ExecutionState {
  assets: AssetLibrary;
  nodes: BoardNode[];
  edges: BoardEdge[];
  createdAssetIds: string[];
  latestCharacter?: CharacterAsset;
  latestSkeleton?: SkeletonAsset;
  latestAnimations: AnimationAsset[];
  latestScene?: SceneAsset;
  latestPreview?: PreviewAsset;
}

const DEFAULT_JOINTS: Array<{ id: string; name: string; position: Point }> = [
  { id: "head", name: "Head", position: { x: 0, y: -72 } },
  { id: "neck", name: "Neck", position: { x: 0, y: -52 } },
  { id: "hips", name: "Hips", position: { x: 0, y: 0 } },
  { id: "left_hand", name: "Left Hand", position: { x: -30, y: -24 } },
  { id: "right_hand", name: "Right Hand", position: { x: 30, y: -24 } },
  { id: "left_foot", name: "Left Foot", position: { x: -18, y: 54 } },
  { id: "right_foot", name: "Right Foot", position: { x: 18, y: 54 } },
];

const DEFAULT_BONES = [
  { id: "spine", from: "head", to: "hips" },
  { id: "left_arm", from: "neck", to: "left_hand" },
  { id: "right_arm", from: "neck", to: "right_hand" },
  { id: "left_leg", from: "hips", to: "left_foot" },
  { id: "right_leg", from: "hips", to: "right_foot" },
];

export class ToolExecutor {
  executePlan(rawPlan: unknown, context: ToolExecutionContext = {}): ToolExecutionResult {
    const plan = agentPlanSchema.parse(rawPlan);
    const now = context.now ?? new Date().toISOString();
    const state: ExecutionState = {
      assets: createEmptyAssetLibrary(),
      nodes: [],
      edges: [],
      createdAssetIds: [],
      latestAnimations: [],
    };

    for (const tool of plan.tools) {
      this.executeTool(tool, state, now);
    }

    return {
      plan,
      assets: state.assets,
      board: {
        id: generateId("board"),
        name: context.boardName ?? "默认游戏资产工作流",
        nodes: state.nodes,
        edges: state.edges,
        viewport: { x: 0, y: 0, zoom: 1 },
        createdAt: now,
        updatedAt: now,
      },
      createdAssetIds: state.createdAssetIds,
    };
  }

  private executeTool(tool: ToolCall, state: ExecutionState, now: string): void {
    switch (tool.name) {
      case "createCharacter":
        this.createCharacter(tool.input, state, now);
        return;
      case "createSkeleton":
        this.createSkeleton(tool.input, state, now);
        return;
      case "createAnimation":
        this.createAnimation(tool.input.actions, state, now);
        return;
      case "createScene":
        this.createScene(tool.input, state, now);
        return;
      case "createPreview":
        this.createPreview(state, now);
        return;
      case "createCompositionPreview":
        this.createCompositionPreview(state, now);
        return;
    }
  }

  private createCharacter(
    input: Extract<ToolCall, { name: "createCharacter" }>["input"],
    state: ExecutionState,
    now: string,
  ): void {
    const character: CharacterAsset = {
      id: generateId("char"),
      type: "character",
      name: input.name ?? titleCase(input.kind),
      kind: input.kind,
      style: input.style,
      description: input.description,
      tags: input.tags,
      createdAt: now,
      updatedAt: now,
    };

    state.assets.characters[character.id] = character;
    state.latestCharacter = character;
    state.createdAssetIds.push(character.id);
    state.nodes.push(createNode("character", [character.id], character.name, 0));
  }

  private createSkeleton(
    input: Extract<ToolCall, { name: "createSkeleton" }>["input"],
    state: ExecutionState,
    now: string,
  ): void {
    if (!state.latestCharacter) {
      throw new Error("createSkeleton requires a character asset.");
    }

    const skeleton: SkeletonAsset = {
      id: generateId("skel"),
      type: "skeleton",
      characterId: state.latestCharacter.id,
      rig: input.rig,
      proportion: input.proportion,
      joints: DEFAULT_JOINTS,
      bones: DEFAULT_BONES,
      attachmentPoints: {
        weapon: { x: 34, y: -26 },
        center: { x: 0, y: 0 },
      },
      createdAt: now,
      updatedAt: now,
    };

    state.assets.skeletons[skeleton.id] = skeleton;
    state.latestSkeleton = skeleton;
    state.createdAssetIds.push(skeleton.id);
    state.nodes.push(createNode("skeleton", [skeleton.id], "Humanoid Skeleton", 1));
    connectLatestNodes(state);
  }

  private createAnimation(
    actions: AnimationAction[],
    state: ExecutionState,
    now: string,
  ): void {
    if (!state.latestSkeleton) {
      throw new Error("createAnimation requires a skeleton asset.");
    }

    const animations = actions.map((action) => createAnimationAsset(action, state.latestSkeleton!, now));
    for (const animation of animations) {
      state.assets.animations[animation.id] = animation;
      state.createdAssetIds.push(animation.id);
    }

    state.latestAnimations = animations;
    state.nodes.push(createNode(
      "animation",
      animations.map((animation) => animation.id),
      `Animations: ${actions.join(", ")}`,
      2,
    ));
    connectLatestNodes(state);
  }

  private createScene(
    input: Extract<ToolCall, { name: "createScene" }>["input"],
    state: ExecutionState,
    now: string,
  ): void {
    const scene: SceneAsset = {
      id: generateId("scene"),
      type: "scene",
      name: input.name,
      description: input.description,
      layout: {
        width: 960,
        height: 540,
        groundY: 410,
        background: input.background,
      },
      createdAt: now,
      updatedAt: now,
    };

    state.assets.scenes[scene.id] = scene;
    state.latestScene = scene;
    state.createdAssetIds.push(scene.id);
    state.nodes.push(createNode("scene", [scene.id], scene.name, 0, 1));
  }

  private createPreview(state: ExecutionState, now: string): void {
    const preview: PreviewAsset = {
      id: generateId("preview"),
      type: "preview",
      runtime: "canvas2d",
      characterId: state.latestCharacter?.id,
      skeletonId: state.latestSkeleton?.id,
      animationIds: state.latestAnimations.map((animation) => animation.id),
      sceneId: state.latestScene?.id,
      createdAt: now,
      updatedAt: now,
    };

    state.assets.previews[preview.id] = preview;
    state.latestPreview = preview;
    state.createdAssetIds.push(preview.id);
    state.nodes.push(createNode("preview", [preview.id], "Canvas2D Preview", 3));

    const previewNode = state.nodes.at(-1);
    if (!previewNode) return;
    connectLastNodeOfType(state, "animation", previewNode);
    connectLastNodeOfType(state, "scene", previewNode);
  }

  private createCompositionPreview(state: ExecutionState, now: string): void {
    const previewIds = Object.keys(state.assets.previews);
    if (previewIds.length === 0) {
      throw new Error("createCompositionPreview requires at least one preview asset.");
    }

    const composition: CompositionPreviewAsset = {
      id: generateId("composition"),
      type: "composition_preview",
      runtime: "canvas2d",
      previewIds,
      sceneId: state.latestScene?.id,
      placements: previewIds.map((previewId, index) => ({
        previewId,
        position: { x: 160 + index * 120, y: 320 },
        scale: 1,
        action: "idle",
      })),
      createdAt: now,
      updatedAt: now,
    };

    state.assets.compositionPreviews[composition.id] = composition;
    state.createdAssetIds.push(composition.id);
    state.nodes.push(createNode("compositionPreview", [composition.id], "Composition Preview", 4));

    const compositionNode = state.nodes.at(-1);
    if (!compositionNode) return;
    for (const previewNode of state.nodes.filter((node) => node.type === "preview")) {
      connectNodes(state, previewNode, compositionNode);
    }
  }
}

function createNode(
  type: BoardNode["type"],
  assetIds: string[],
  title: string,
  column: number,
  row = 0,
): BoardNode {
  return {
    id: generateId("node"),
    type,
    assetIds,
    position: { x: column * 260, y: row * 180 },
    status: "ready",
    title,
    upstreamNodeIds: [],
    downstreamNodeIds: [],
    locked: false,
  };
}

function connectLatestNodes(state: ExecutionState): void {
  const target = state.nodes.at(-1);
  const source = state.nodes.at(-2);
  if (!source || !target) return;

  connectNodes(state, source, target);
}

function connectLastNodeOfType(
  state: ExecutionState,
  type: BoardNode["type"],
  target: BoardNode,
): void {
  const source = state.nodes.findLast((node) => node.type === type && node.id !== target.id);
  if (!source) return;
  connectNodes(state, source, target);
}

function connectNodes(state: ExecutionState, source: BoardNode, target: BoardNode): void {
  if (state.edges.some((edge) => edge.source === source.id && edge.target === target.id)) {
    return;
  }

  source.downstreamNodeIds.push(target.id);
  target.upstreamNodeIds.push(source.id);
  state.edges.push({
    id: generateId("edge"),
    source: source.id,
    target: target.id,
  });
}

function createAnimationAsset(
  action: AnimationAction,
  skeleton: SkeletonAsset,
  now: string,
): AnimationAsset {
  const durationMs = action === "walk" ? 720 : action === "attack" ? 520 : 1200;
  return {
    id: generateId("anim"),
    type: "animation",
    skeletonId: skeleton.id,
    action,
    durationMs,
    loop: action !== "attack",
    keyframes: createKeyframes(action),
    createdAt: now,
    updatedAt: now,
  };
}

function createKeyframes(action: AnimationAction): AnimationAsset["keyframes"] {
  if (action === "idle") {
    return [
      { time: 0, joints: { head: { x: 0, y: -73 }, hips: { x: 0, y: 0 } } },
      { time: 0.5, joints: { head: { x: 0, y: -75 }, hips: { x: 0, y: -2 } } },
      { time: 1, joints: { head: { x: 0, y: -73 }, hips: { x: 0, y: 0 } } },
    ];
  }

  if (action === "attack") {
    return [
      { time: 0, joints: { right_hand: { x: 28, y: -24 }, left_foot: { x: -18, y: 54 } } },
      { time: 0.35, joints: { right_hand: { x: 58, y: -30 }, left_foot: { x: -30, y: 52 } } },
      { time: 0.7, joints: { right_hand: { x: 18, y: -22 }, left_foot: { x: -18, y: 54 } } },
      { time: 1, joints: { right_hand: { x: 28, y: -24 }, left_foot: { x: -18, y: 54 } } },
    ];
  }

  return [
    {
      time: 0,
      joints: {
        left_hand: { x: -24, y: -22 },
        right_hand: { x: 32, y: -28 },
        left_foot: { x: -24, y: 54 },
        right_foot: { x: 20, y: 50 },
      },
    },
    {
      time: 0.5,
      joints: {
        left_hand: { x: -34, y: -28 },
        right_hand: { x: 24, y: -22 },
        left_foot: { x: -12, y: 50 },
        right_foot: { x: 28, y: 54 },
      },
    },
    {
      time: 1,
      joints: {
        left_hand: { x: -24, y: -22 },
        right_hand: { x: 32, y: -28 },
        left_foot: { x: -24, y: 54 },
        right_foot: { x: 20, y: 50 },
      },
    },
  ];
}

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
