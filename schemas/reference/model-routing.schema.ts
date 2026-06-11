export type ModelTaskType =
  | 'planner'
  | 'cheap_text'
  | 'vision'
  | 'fallback'

export interface ModelRoutingRule {
  taskType: ModelTaskType
  primaryModelId: string
  fallbackModelIds: string[]
}
