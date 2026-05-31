/**
 * Claude (Anthropic) Provider Adapter.
 *
 * Implements ModelProvider for Anthropic's Messages API.
 * Endpoints: POST /v1/messages
 */

import type {
  ModelProvider,
  ModelEntry,
  ChatInput,
  ChatOutput,
  ChatChunk,
  JsonInput,
  JsonOutput,
  ModelProviderConfig,
} from "../types";

export class ClaudeProvider implements ModelProvider {
  readonly id: string;
  readonly name = "Claude";
  private baseUrl: string;
  private apiKey: string;
  private models: ModelEntry[];
  private anthropicVersion = "2023-06-01";

  constructor(config: ModelProviderConfig) {
    this.id = config.id;
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey || (config.apiKeyEnv ? process.env[config.apiKeyEnv] || "" : "");
    this.models = config.models;
  }

  listModels(): ModelEntry[] {
    return this.models;
  }

  async chat(
    modelId: string,
    input: ChatInput,
    signal?: AbortSignal,
  ): Promise<ChatOutput> {
    const { system, messages } = this.convertMessages(input);

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": this.anthropicVersion,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        system,
        messages,
        max_tokens: input.maxTokens ?? 4096,
        temperature: input.temperature ?? 0.3,
        stop_sequences: input.stopSequences,
      }),
      signal,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API error ${response.status}: ${err.slice(0, 300)}`);
    }

    const json = (await response.json()) as ClaudeResponse;

    return {
      content: this.extractText(json),
      usage: {
        promptTokens: json.usage?.input_tokens || 0,
        completionTokens: json.usage?.output_tokens || 0,
        totalTokens:
          (json.usage?.input_tokens || 0) + (json.usage?.output_tokens || 0),
      },
      finishReason: this.mapStopReason(json.stop_reason),
      modelId: json.model || modelId,
      providerId: this.id,
    };
  }

  async *stream(
    modelId: string,
    input: ChatInput,
    signal?: AbortSignal,
  ): AsyncIterable<ChatChunk> {
    const { system, messages } = this.convertMessages(input);

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": this.anthropicVersion,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        system,
        messages,
        max_tokens: input.maxTokens ?? 4096,
        temperature: input.temperature ?? 0.3,
        stop_sequences: input.stopSequences,
        stream: true,
      }),
      signal,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API error ${response.status}: ${err.slice(0, 300)}`);
    }

    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as ClaudeStreamEvent;
            if (event.type === "content_block_delta") {
              yield {
                content: event.delta?.text || "",
                finishReason: null,
              };
            } else if (event.type === "message_stop") {
              yield {
                content: "",
                finishReason: "stop",
              };
            }
          } catch {
            // Skip unparseable events
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async generateJson<T>(
    modelId: string,
    input: JsonInput<T>,
    signal?: AbortSignal,
  ): Promise<JsonOutput<T>> {
    // Claude doesn't have native JSON mode — pre-fill assistant response with `{`
    let attempts = 0;
    const lastMessages = this.convertMessages({
      messages: [
        {
          role: "system",
          content: input.systemPrompt || "You are a helpful assistant. Output ONLY valid JSON.",
        },
        {
          role: "user",
          content: `${input.prompt}\n\nOutput ONLY valid JSON matching this schema: ${input.schemaDescription}. Do not include any other text.`,
        },
      ],
    });

    while (attempts < 2) {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": this.anthropicVersion,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelId,
          system: lastMessages.system,
          messages: [
            ...lastMessages.messages,
            { role: "assistant", content: "{" },
          ],
          max_tokens: input.maxTokens ?? 4096,
          temperature: input.temperature ?? 0.1,
        }),
        signal,
      });

      if (!response.ok) {
        throw new Error(`Claude API error ${response.status}`);
      }

      const json = (await response.json()) as ClaudeResponse;
      const content = "{" + this.extractText(json);

      try {
        const parsed = JSON.parse(content);
        const result = input.schema.safeParse(parsed);

        if (result.success && result.data !== undefined) {
          return {
            data: result.data,
            usage: {
              promptTokens: json.usage?.input_tokens || 0,
              completionTokens: json.usage?.output_tokens || 0,
              totalTokens:
                (json.usage?.input_tokens || 0) + (json.usage?.output_tokens || 0),
            },
            modelId: json.model || modelId,
            providerId: this.id,
          };
        }

        lastMessages.messages.push(
          { role: "assistant", content: content },
          {
            role: "user",
            content: `Validation error: ${String(result.error)}. Please output valid JSON.`,
          },
        );
      } catch {
        lastMessages.messages.push({
          role: "user",
          content: "Output was not valid JSON. Please output ONLY valid JSON starting with {.",
        });
      }

      attempts++;
    }

    throw new Error("Claude generateJson failed after 2 attempts");
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private convertMessages(input: ChatInput): {
    system: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  } {
    let system = "";
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

    for (const msg of input.messages) {
      if (msg.role === "system") {
        system += (system ? "\n" : "") + (typeof msg.content === "string" ? msg.content : "");
      } else {
        const content = typeof msg.content === "string"
          ? msg.content
          : msg.content.map((c) => c.text || "").join("");
        messages.push({ role: msg.role as "user" | "assistant", content });
      }
    }

    return { system, messages };
  }

  private extractText(response: ClaudeResponse): string {
    return response.content
      ?.filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text)
      .join("") || "";
  }

  private mapStopReason(
    reason?: string,
  ): ChatOutput["finishReason"] {
    switch (reason) {
      case "end_turn":
        return "stop";
      case "max_tokens":
        return "length";
      case "tool_use":
        return "tool_calls";
      default:
        return "error";
    }
  }
}

// ─── Raw API response types ──────────────────────────────────────

interface ClaudeResponse {
  id?: string;
  model?: string;
  stop_reason?: string;
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens: number; output_tokens: number };
}

interface ClaudeStreamEvent {
  type: string;
  delta?: { text?: string };
}
