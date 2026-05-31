/** A single model call record for cost tracking */
export interface ModelCallLog {
  id: string;
  timestamp: string;
  providerId: string;
  modelId: string;
  taskType: string;
  latencyMs: number;
  success: boolean;
  error?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  retryAttempt: number;
}
