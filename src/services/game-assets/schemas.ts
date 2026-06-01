import { z } from "zod";

export const workflowNodeStatusSchema = z.enum([
  "draft",
  "running",
  "ready",
  "dirty",
  "failed",
  "locked",
]);

export const animationActionSchema = z.enum(["idle", "walk", "attack"]);

export const pointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const characterAssetSchema = z.object({
  id: z.string(),
  type: z.literal("character"),
  name: z.string(),
  kind: z.string(),
  style: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const skeletonJointSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: pointSchema,
});

export const skeletonBoneSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
});

export const skeletonAssetSchema = z.object({
  id: z.string(),
  type: z.literal("skeleton"),
  characterId: z.string(),
  rig: z.literal("humanoid_2d"),
  proportion: z.enum(["stickman", "chibi", "standard"]),
  joints: z.array(skeletonJointSchema),
  bones: z.array(skeletonBoneSchema),
  attachmentPoints: z.record(z.string(), pointSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const animationKeyframeSchema = z.object({
  time: z.number(),
  joints: z.record(z.string(), pointSchema),
});

export const animationAssetSchema = z.object({
  id: z.string(),
  type: z.literal("animation"),
  skeletonId: z.string(),
  action: animationActionSchema,
  durationMs: z.number(),
  loop: z.boolean(),
  keyframes: z.array(animationKeyframeSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const sceneAssetSchema = z.object({
  id: z.string(),
  type: z.literal("scene"),
  name: z.string(),
  description: z.string(),
  layout: z.object({
    width: z.number(),
    height: z.number(),
    groundY: z.number(),
    background: z.string(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const previewAssetSchema = z.object({
  id: z.string(),
  type: z.literal("preview"),
  runtime: z.literal("canvas2d"),
  characterId: z.string().optional(),
  skeletonId: z.string().optional(),
  animationIds: z.array(z.string()).default([]),
  sceneId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const compositionPreviewAssetSchema = z.object({
  id: z.string(),
  type: z.literal("composition_preview"),
  runtime: z.literal("canvas2d"),
  previewIds: z.array(z.string()),
  sceneId: z.string().optional(),
  placements: z.array(z.object({
    previewId: z.string(),
    position: pointSchema,
    scale: z.number(),
    action: animationActionSchema.optional(),
  })),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const gameAssetSchema = z.discriminatedUnion("type", [
  characterAssetSchema,
  skeletonAssetSchema,
  animationAssetSchema,
  sceneAssetSchema,
  previewAssetSchema,
  compositionPreviewAssetSchema,
]);

export const assetLibrarySchema = z.object({
  characters: z.record(z.string(), characterAssetSchema),
  skeletons: z.record(z.string(), skeletonAssetSchema),
  animations: z.record(z.string(), animationAssetSchema),
  scenes: z.record(z.string(), sceneAssetSchema),
  previews: z.record(z.string(), previewAssetSchema),
  compositionPreviews: z.record(z.string(), compositionPreviewAssetSchema),
});

export const boardNodeSchema = z.object({
  id: z.string(),
  type: z.enum([
    "character",
    "skeleton",
    "animation",
    "scene",
    "preview",
    "compositionPreview",
  ]),
  assetIds: z.array(z.string()),
  position: pointSchema,
  status: workflowNodeStatusSchema,
  title: z.string(),
  upstreamNodeIds: z.array(z.string()).default([]),
  downstreamNodeIds: z.array(z.string()).default([]),
  locked: z.boolean().default(false),
});

export const boardEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
});

export const boardSchema = z.object({
  id: z.string(),
  name: z.string(),
  nodes: z.array(boardNodeSchema),
  edges: z.array(boardEdgeSchema),
  viewport: z.object({
    x: z.number(),
    y: z.number(),
    zoom: z.number(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const createCharacterInputSchema = z.object({
  kind: z.string().default("adventurer"),
  style: z.string().default("stickman"),
  description: z.string().default("A simple game character"),
  name: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

const createSkeletonInputSchema = z.object({
  rig: z.literal("humanoid_2d").default("humanoid_2d"),
  proportion: z.enum(["stickman", "chibi", "standard"]).default("stickman"),
});

const createAnimationInputSchema = z.object({
  actions: z.array(animationActionSchema).min(1).default(["idle", "walk", "attack"]),
});

const createSceneInputSchema = z.object({
  name: z.string().default("Scene"),
  description: z.string().default("A simple scene"),
  background: z.string().default("plain"),
});

const createPreviewInputSchema = z.object({
  runtime: z.literal("canvas2d").default("canvas2d"),
});

const createCompositionPreviewInputSchema = z.object({
  runtime: z.literal("canvas2d").default("canvas2d"),
});

export const toolCallSchema = z.discriminatedUnion("name", [
  z.object({ name: z.literal("createCharacter"), input: createCharacterInputSchema }),
  z.object({ name: z.literal("createSkeleton"), input: createSkeletonInputSchema }),
  z.object({ name: z.literal("createAnimation"), input: createAnimationInputSchema }),
  z.object({ name: z.literal("createScene"), input: createSceneInputSchema }),
  z.object({ name: z.literal("createPreview"), input: createPreviewInputSchema }),
  z.object({
    name: z.literal("createCompositionPreview"),
    input: createCompositionPreviewInputSchema,
  }),
]);

export const agentPlanSchema = z.object({
  version: z.literal("1"),
  intent: z.literal("create_game_asset_workflow"),
  summary: z.string(),
  tools: z.array(toolCallSchema).min(1),
});

export type WorkflowNodeStatus = z.infer<typeof workflowNodeStatusSchema>;
export type AnimationAction = z.infer<typeof animationActionSchema>;
export type Point = z.infer<typeof pointSchema>;
export type CharacterAsset = z.infer<typeof characterAssetSchema>;
export type SkeletonAsset = z.infer<typeof skeletonAssetSchema>;
export type AnimationAsset = z.infer<typeof animationAssetSchema>;
export type SceneAsset = z.infer<typeof sceneAssetSchema>;
export type PreviewAsset = z.infer<typeof previewAssetSchema>;
export type CompositionPreviewAsset = z.infer<typeof compositionPreviewAssetSchema>;
export type GameAsset = z.infer<typeof gameAssetSchema>;
export type AssetLibrary = z.infer<typeof assetLibrarySchema>;
export type BoardNode = z.infer<typeof boardNodeSchema>;
export type BoardEdge = z.infer<typeof boardEdgeSchema>;
export type Board = z.infer<typeof boardSchema>;
export type ToolCall = z.infer<typeof toolCallSchema>;
export type AgentPlan = z.infer<typeof agentPlanSchema>;

export function createEmptyAssetLibrary(): AssetLibrary {
  return {
    characters: {},
    skeletons: {},
    animations: {},
    scenes: {},
    previews: {},
    compositionPreviews: {},
  };
}

