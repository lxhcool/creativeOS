export type ModelProviderType =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'openrouter'
  | 'openai-compatible'
  | 'ollama'

export interface ModelProvider {
  id: string
  name: string
  type: ModelProviderType
  baseUrl?: string
  apiKeyEncrypted: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}
