export interface ToolDefinition {
  id: string
  name: string
  description: string
  inputSchema: unknown
  outputSchema: unknown
}

export interface ToolCall {
  id: string
  toolId: string
  input: Record<string, unknown>
}

export interface ToolResult {
  id: string
  toolCallId: string
  success: boolean
  output?: unknown
  error?: string
}
