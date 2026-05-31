/**
 * OpenAI-Compatible Provider Adapter.
 *
 * Generic adapter for ANY API that speaks the OpenAI chat completions format:
 * DeepSeek, Ollama, Qwen, vLLM, LocalAI, etc.
 *
 * Endpoints: POST /v1/chat/completions
 */

import type {
  ModelProvider,
  ModelEntry,
  ChatInput,
  ChatOutput,
  ChatChunk,
  JsonInput,
  JsonOutput,
  EmbedInput,
  EmbedOutput,
  ModelProviderConfig,
} from "../types";

export class OpenAICompatibleProvider implements ModelProvider {
  readonly id: string;
  readonly name: string;
  private baseUrl: string;
  private apiKey: string;
  private models: ModelEntry[];

  constructor(config: ModelProviderConfig) {
    this.id = config.id;
    this.name = config.id;
    this.baseUrl = config.baseUrl;
    this.apiKey =
      config.apiKey ||
      (config.apiKeyEnv ? process.env[config.apiKeyEnv] || "not-needed" : "not-needed");
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
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey && this.apiKey !== "not-needed") {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: modelId,
        messages: input.messages.map((m) => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        })),
        temperature: input.temperature ?? 0.3,
        max_tokens: input.maxTokens ?? 4096,
        stop: input.stopSequences,
      }),
      signal,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`${this.id} API error ${response.status}: ${err.slice(0, 300)}`);
    }

    const json = (await response.json()) as OpenAICompatResponse;
    const choice = json.choices?.[0];
    const message = choice?.message;

    return {
      content: message?.content || "",
      usage: {
        promptTokens: json.usage?.prompt_tokens || 0,
        completionTokens: json.usage?.completion_tokens || 0,
        totalTokens: json.usage?.total_tokens || 0,
      },
      finishReason: this.mapFinishReason(choice?.finish_reason),
      modelId: json.model || modelId,
      providerId: this.id,
    };
  }

  async *stream(
    modelId: string,
    input: ChatInput,
    signal?: AbortSignal,
  ): AsyncIterable<ChatChunk> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey && this.apiKey !== "not-needed") {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: modelId,
        messages: input.messages,
        temperature: input.temperature ?? 0.3,
        max_tokens: input.maxTokens ?? 4096,
        stream: true,
      }),
      signal,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`${this.id} API error ${response.status}: ${err.slice(0, 300)}`);
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
          if (!line.startsWith("data: ") || line.startsWith("data: [DONE]")) continue;
          try {
            const chunk = JSON.parse(line.slice(6)) as StreamChunk;
            yield {
              content: chunk.choices?.[0]?.delta?.content || "",
              finishReason: chunk.choices?.[0]?.finish_reason
                ? this.mapFinishReason(chunk.choices[0].finish_reason)
                : null,
            };
          } catch {
            // Skip
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
    // Fallback: use chat + manual JSON parse + schema validation
    let attempts = 0;
    const systemPrompt = input.systemPrompt
      ? `${input.systemPrompt}\n\nYou MUST output ONLY valid JSON. No markdown, no explanation.`
      : "You MUST output ONLY valid JSON. No markdown fences, no explanation.";

    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `${input.prompt}\n\nSchema: ${input.schemaDescription}`,
      },
    ];

    while (attempts < 2) {
      const result = await this.chat(
        modelId,
        { messages: messages.map((m) => ({ role: m.role as "system" | "user", content: m.content })), temperature: input.temperature ?? 0.1, maxTokens: input.maxTokens },
        signal,
      );

      const text = result.content
        .replace(/^```json?\s*\n?/i, "")
        .replace(/\n?```\s*$/, "")
        .trim();

      try {
        const parsed = JSON.parse(text);
        const validationResult = input.schema.safeParse(parsed);

        if (validationResult.success && validationResult.data !== undefined) {
          return {
            data: validationResult.data,
            usage: result.usage,
            modelId: result.modelId,
            providerId: this.id,
          };
        }

        messages.push(
          { role: "assistant", content: text },
          {
            role: "user",
            content: `Validation error: ${String(validationResult.error)}. Output valid JSON matching the schema.`,
          },
        );
      } catch {
        messages.push({
          role: "user",
          content: "Not valid JSON. Output ONLY valid JSON starting with { or [.",
        });
      }

      attempts++;
    }

    throw new Error(`${this.id} generateJson failed after 2 attempts`);
  }

  async embed(
    modelId: string,
    input: EmbedInput,
    signal?: AbortSignal,
  ): Promise<EmbedOutput> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey && this.apiKey !== "not-needed") {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: modelId, input: input.texts }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`${this.id} Embeddings API error ${response.status}`);
    }

    const json = (await response.json()) as EmbedResponse;

    return {
      embeddings: json.data?.map((d: { embedding: number[] }) => d.embedding) || [],
      usage: {
        promptTokens: json.usage?.prompt_tokens || 0,
        completionTokens: 0,
        totalTokens: json.usage?.total_tokens || 0,
      },
      modelId: json.model || modelId,
    };
  }

  private mapFinishReason(reason?: string): ChatOutput["finishReason"] {
    switch (reason) {
      case "stop":
        return "stop";
      case "length":
        return "length";
      case "tool_calls":
        return "tool_calls";
      default:
        return "error";
    }
  }
}

interface OpenAICompatResponse {
  model?: string;
  choices?: Array<{
    finish_reason?: string;
    message?: { role: string; content: string };
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface StreamChunk {
  choices?: Array<{
    finish_reason?: string | null;
    delta?: { content?: string };
  }>;
}

interface EmbedResponse {
  model?: string;
  data?: Array<{ embedding: number[] }>;
  usage?: { prompt_tokens: number; total_tokens: number };
}
