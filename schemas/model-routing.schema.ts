/** Maps task types to model references */
export interface ModelRoutingTable {
  [taskName: string]: RoutingRule;
}

export interface RoutingRule {
  /** Primary model: "providerId:modelId" */
  primary: string;
  /** Fallback chain in order */
  fallback: string[];
  /** Strategy for selecting between multiple models */
  strategy: "primary_only" | "fallback_chain" | "cost_optimized" | "latency_optimized";
  /** Retry count on failure */
  retryCount: number;
  /** Timeout per call in ms */
  timeoutMs: number;
}

/** Task names used in the system */
export type TaskType =
  | "planner"
  | "cheap_text"
  | "structured_json"
  | "vision";
