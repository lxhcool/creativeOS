/**
 * Cost Tracker — records every LLM call for cost monitoring.
 *
 * Every call logs: model, tokens, latency, cost, success/fail.
 */

import type { ModelCallLog } from "./types";
import { generateId } from "@/lib/id";

export class CostTracker {
  private logs: ModelCallLog[] = [];
  private enabled = true;

  /** Maximum number of logs to keep in memory */
  private maxLogsMemory = 1000;

  /**
   * Record a model call.
   */
  record(params: {
    providerId: string;
    modelId: string;
    taskType: string;
    latencyMs: number;
    success: boolean;
    error?: string;
    promptTokens: number;
    completionTokens: number;
    costPer1kInput?: number;
    costPer1kOutput?: number;
    retryAttempt: number;
  }): ModelCallLog {
    const estimatedCostUsd =
      ((params.promptTokens / 1000) * (params.costPer1kInput || 0)) +
      ((params.completionTokens / 1000) * (params.costPer1kOutput || 0));

    const log: ModelCallLog = {
      id: generateId("call"),
      timestamp: new Date().toISOString(),
      providerId: params.providerId,
      modelId: params.modelId,
      taskType: params.taskType,
      latencyMs: params.latencyMs,
      success: params.success,
      error: params.error,
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
      totalTokens: params.promptTokens + params.completionTokens,
      estimatedCostUsd,
      retryAttempt: params.retryAttempt,
    };

    if (this.enabled) {
      this.logs.push(log);
      if (this.logs.length > this.maxLogsMemory) {
        this.logs = this.logs.slice(-this.maxLogsMemory / 2);
      }
    }

    return log;
  }

  /**
   * Get total cost across all recorded calls.
   */
  getTotalCost(): number {
    return this.logs.reduce((acc, log) => acc + log.estimatedCostUsd, 0);
  }

  /**
   * Get cost by task type.
   */
  getCostByTask(): Record<string, number> {
    const costs: Record<string, number> = {};
    for (const log of this.logs) {
      costs[log.taskType] = (costs[log.taskType] || 0) + log.estimatedCostUsd;
    }
    return costs;
  }

  /**
   * Get cost by provider.
   */
  getCostByProvider(): Record<string, number> {
    const costs: Record<string, number> = {};
    for (const log of this.logs) {
      costs[log.providerId] =
        (costs[log.providerId] || 0) + log.estimatedCostUsd;
    }
    return costs;
  }

  /**
   * Get success rate overall.
   */
  getSuccessRate(): number {
    if (this.logs.length === 0) return 1;
    const successCount = this.logs.filter((l) => l.success).length;
    return successCount / this.logs.length;
  }

  /**
   * Get average latency for successful calls.
   */
  getAverageLatency(): number {
    const successful = this.logs.filter((l) => l.success);
    if (successful.length === 0) return 0;
    return (
      successful.reduce((acc, l) => acc + l.latencyMs, 0) / successful.length
    );
  }

  /**
   * Get recent logs for display.
   */
  getRecentLogs(count = 20): ModelCallLog[] {
    return this.logs.slice(-count).reverse();
  }

  /**
   * Get all logs.
   */
  getLogs(): ModelCallLog[] {
    return [...this.logs];
  }

  /**
   * Clear all logs.
   */
  clear(): void {
    this.logs = [];
  }

  /**
   * Enable or disable cost tracking.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Get total token count.
   */
  getTotalTokens(): { prompt: number; completion: number; total: number } {
    return this.logs.reduce(
      (acc, log) => ({
        prompt: acc.prompt + log.promptTokens,
        completion: acc.completion + log.completionTokens,
        total: acc.total + log.totalTokens,
      }),
      { prompt: 0, completion: 0, total: 0 },
    );
  }
}
