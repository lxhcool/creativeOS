/**
 * OpenAI Provider Adapter.
 *
 * Implements ModelProvider for OpenAI's API.
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

export class OpenAIProvider implements ModelProvider {
  readonly id: string;
  readonly name: string;
  private baseUrl: string;
  private apiKey: string;
  private models: ModelEntry[];

  constructor(config: ModelProviderConfig) {
    this.id = config.id;
    this.name = config.id;
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
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        messages: input.messages.map((m) => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content : m.content,
        })),
        temperature: input.temperature ?? 0.3,
        max_tokens: input.maxTokens ?? 4096,
        stop: input.stopSequences,
      }),
      signal,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${err.slice(0, 300)}`);
    }

    const json = (await response.json()) as OpenAIResponse;
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
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        messages: input.messages.map((m) => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content : m.content,
        })),
        temperature: input.temperature ?? 0.3,
        max_tokens: input.maxTokens ?? 4096,
        stop: input.stopSequences,
        stream: true,
      }),
      signal,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${err.slice(0, 300)}`);
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
            const delta = chunk.choices?.[0]?.delta;
            yield {
              content: delta?.content || "",
              finishReason: chunk.choices?.[0]?.finish_reason
                ? this.mapFinishReason(chunk.choices[0].finish_reason)
                : null,
            };
          } catch {
            // Skip unparseable chunks
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
    const chatInput: ChatInput = {
      messages: [
        ...(input.systemPrompt
          ? [{ role: "system" as const, content: input.systemPrompt }]
          : []),
        { role: "user" as const, content: input.prompt },
      ],
      temperature: input.temperature ?? 0.1,
      maxTokens: input.maxTokens ?? 4096,
    };

    let attempts = 0;
    let lastError = "";

    while (attempts < 2) {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelId,
          messages: chatInput.messages,
          temperature: chatInput.temperature,
          max_tokens: chatInput.maxTokens,
          response_format: { type: "json_object" },
        }),
        signal,
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error ${response.status}`);
      }

      const json = (await response.json()) as OpenAIResponse;
      const content = json.choices?.[0]?.message?.content || "";

      // Parse and validate
      try {
        const parsed = JSON.parse(content);
        const result = input.schema.safeParse(parsed);

        if (result.success && result.data !== undefined) {
          return {
            data: result.data,
            usage: {
              promptTokens: json.usage?.prompt_tokens || 0,
              completionTokens: json.usage?.completion_tokens || 0,
              totalTokens: json.usage?.total_tokens || 0,
            },
            modelId: json.model || modelId,
            providerId: this.id,
          };
        }

        lastError = "Schema validation failed";
        // Inject error into next attempt
        chatInput.messages.push(
          { role: "assistant", content },
          {
            role: "user",
            content: `Your output failed validation. Error: ${String(result.error)}. Please output valid JSON matching: ${input.schemaDescription}`,
          },
        );
      } catch {
        lastError = "JSON parse failed";
        chatInput.messages.push({
          role: "user",
          content: "Your output was not valid JSON. Please output ONLY valid JSON.",
        });
      }

      attempts++;
    }

    throw new Error(`generateJson failed after 2 attempts: ${lastError}`);
  }

  async embed(
    modelId: string,
    input: EmbedInput,
    signal?: AbortSignal,
  ): Promise<EmbedOutput> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        input: input.texts,
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`OpenAI Embeddings API error ${response.status}`);
    }

    const json = (await response.json()) as EmbedResponse;

    return {
      embeddings: json.data?.map((d: EmbedData) => d.embedding) || [],
      usage: {
        promptTokens: json.usage?.prompt_tokens || 0,
        completionTokens: 0,
        totalTokens: json.usage?.total_tokens || 0,
      },
      modelId: json.model || modelId,
    };
  }

  private mapFinishReason(
    reason?: string,
  ): ChatOutput["finishReason"] {
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

// ─── Raw API response types ──────────────────────────────────────

interface OpenAIResponse {
  id?: string;
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
  data?: EmbedData[];
  usage?: { prompt_tokens: number; total_tokens: number };
}

interface EmbedData {
  embedding: number[];
}
