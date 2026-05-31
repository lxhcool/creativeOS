/**
 * Fallback Handler — manages model failure recovery.
 *
 * When a primary model fails, the fallback handler tries the next model
 * in the chain until one succeeds or all options are exhausted.
 */

import type {
  ChatInput,
  ChatOutput,
  JsonInput,
  JsonOutput,
  TokenUsage,
} from "./types";

export type ChatCallFn = (
  ref: string,
  input: ChatInput,
  signal?: AbortSignal,
) => Promise<ChatOutput>;

export type JsonCallFn = <T>(
  ref: string,
  input: JsonInput<T>,
  signal?: AbortSignal,
) => Promise<JsonOutput<T>>;

interface FallbackResult<T> {
  result: T;
  attemptedModels: string[];
  successfulModel: string;
  totalLatencyMs: number;
}

export class FallbackHandler {

  constructor() {
    // No registry needed — fallback logic works on model ref chains
  }

  /**
   * Execute a chat call with fallback chain.
   *
   * Order: primary → task fallbacks → global fallback
   * Returns as soon as any model succeeds.
   */
  async executeWithFallback(
    modelChain: string[],
    input: ChatInput,
    callFn: ChatCallFn,
    signal?: AbortSignal,
  ): Promise<FallbackResult<ChatOutput>> {
    const attemptedModels: string[] = [];
    const startTime = Date.now();

    for (const modelRef of modelChain) {
      attemptedModels.push(modelRef);

      try {
        const result = await callFn(modelRef, input, signal);
        return {
          result,
          attemptedModels,
          successfulModel: modelRef,
          totalLatencyMs: Date.now() - startTime,
        };
      } catch (err) {
        console.warn(
          `[Fallback] Model "${modelRef}" failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        // Continue to next in chain
      }
    }

    throw new Error(
      `All models failed. Attempted: ${attemptedModels.join(", ")}`,
    );
  }

  /**
   * Execute a generateJson call with fallback chain.
   */
  async executeJsonWithFallback<T>(
    modelChain: string[],
    input: JsonInput<T>,
    callFn: JsonCallFn,
    signal?: AbortSignal,
  ): Promise<FallbackResult<JsonOutput<T>>> {
    const attemptedModels: string[] = [];
    const startTime = Date.now();

    for (const modelRef of modelChain) {
      attemptedModels.push(modelRef);

      try {
        const result = await callFn(modelRef, input, signal);
        return {
          result,
          attemptedModels,
          successfulModel: modelRef,
          totalLatencyMs: Date.now() - startTime,
        };
      } catch (err) {
        console.warn(
          `[Fallback] JSON generation "${modelRef}" failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    throw new Error(
      `All JSON generation models failed. Attempted: ${attemptedModels.join(", ")}`,
    );
  }

  /**
   * Drain the usage across all failed attempts for accurate cost tracking.
   */
  drainUsage(results: { usage?: TokenUsage }[]): TokenUsage {
    return results.reduce(
      (acc, r) => ({
        promptTokens: acc.promptTokens + (r.usage?.promptTokens || 0),
        completionTokens: acc.completionTokens + (r.usage?.completionTokens || 0),
        totalTokens: acc.totalTokens + (r.usage?.totalTokens || 0),
      }),
      { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    );
  }
}
