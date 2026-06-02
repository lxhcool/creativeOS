/**
 * Model Router — routes tasks to the appropriate model based on configuration.
 *
 * The router reads the routing table from providers.config.json and
 * selects the best available model for each task type.
 */

import type { ModelRegistry } from "./registry";
import type { ModelCapability } from "./types";

type TaskCapabilityMap = Record<string, ModelCapability[]>;

/**
 * Default capability requirements per task type.
 * These ensure even unconfigured tasks get a sensible model.
 */
const DEFAULT_TASK_CAPABILITIES: TaskCapabilityMap = {
  planner: ["text", "json"],
  cheap_text: ["text"],
  structured_json: ["text", "json"],
  vision: ["text", "vision"],
};

export class ModelRouter {
  private routingTable: Record<string, string[]>;
  private registry: ModelRegistry;

  constructor(routingTable: Record<string, string[]>, registry: ModelRegistry) {
    this.routingTable = routingTable;
    this.registry = registry;
  }

  /**
   * Route a task to the best available model.
   * Returns an ordered list of model references (primary first, then fallbacks).
   */
  route(task: string): string[] {
    // Check explicit routing table
    const configured = this.routingTable[task];
    if (configured && configured.length > 0) {
      // Filter to only available models
      const available = configured.filter((ref) => this.registry.hasModel(ref));
      if (available.length > 0) return available;
    }

    // Fallback: find models by capability
    const capabilities = DEFAULT_TASK_CAPABILITIES[task];
    if (capabilities) {
      const matches = this.registry.findModelsByCapability(capabilities);
      return matches.map((m) => m.ref);
    }

    // Ultimate fallback: return all models
    return this.registry.listAllModels().map((m) => m.ref);
  }

  /**
   * Get the primary model for a task (first available in the chain).
   */
  getPrimaryModel(task: string): string | undefined {
    return this.route(task)[0];
  }

  /**
   * Get the fallback chain for a task (everything after the primary).
   */
  getFallbackChain(task: string): string[] {
    const chain = this.route(task);
    return chain.slice(1);
  }

  /**
   * Resolve the complete routing decision: primary + fallbacks + global fallback.
   */
  resolveRoute(task: string): {
    primary: string;
    fallbacks: string[];
    globalFallback: string[];
  } {
    const chain = this.route(task);
    const globalFallback = this.routingTable["fallback"] || [];

    return {
      primary: chain[0] || "",
      fallbacks: chain.slice(1),
      globalFallback: globalFallback.filter((ref) => this.registry.hasModel(ref)),
    };
  }
}
