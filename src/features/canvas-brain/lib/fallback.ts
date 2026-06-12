import type { CanvasBrainMessage } from "../model/types";

export function buildFallbackMaterialText(params: {
  command: string;
  history: CanvasBrainMessage[];
}): string {
  const recentUserText = params.history
    .filter((message) => message.role === "user")
    .slice(-3)
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join("\n\n");

  return recentUserText || params.command;
}
