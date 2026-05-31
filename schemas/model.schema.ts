export interface ModelConfig {
  id: string
  providerId: string
  modelName: string
  displayName: string
  capabilities: Array<'text' | 'json' | 'tool_calling' | 'vision' | 'embedding'>
  contextWindow?: number
  supportsJsonMode: boolean
  supportsToolCalling: boolean
  supportsVision: boolean
  enabled: boolean
  costLevel: 'low' | 'medium' | 'high'
}
