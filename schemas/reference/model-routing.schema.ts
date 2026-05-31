export type ModelTaskType =
  | 'planner'
  | 'character_generation'
  | 'skeleton_generation'
  | 'animation_generation'
  | 'cheap_text'
  | 'vision'
  | 'fallback'

export interface ModelRoutingRule {
  taskType: ModelTaskType
  primaryModelId: string
  fallbackModelIds: string[]
}
