/**
 * Gemini (Google) Provider Adapter.
 *
 * Implements ModelProvider for Google's Generative Language API.
 * Endpoints: POST /v1beta/models/{model}:generateContent
 */

import type {
  ModelProvider,
  ModelEntry,
  ChatInput,
  ChatOutput,
  JsonInput,
  JsonOutput,
  ModelProviderConfig,
} from "../types";

export class GeminiProvider implements ModelProvider {
  readonly id: string;
  readonly name = "Gemini";
  private baseUrl: string;
  private apiKey: string;
  private models: ModelEntry[];

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
    const contents = this.convertToGeminiFormat(input);

    const response = await fetch(
      `${this.baseUrl}/models/${modelId}:generateContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: input.temperature ?? 0.3,
            maxOutputTokens: input.maxTokens ?? 4096,
            stopSequences: input.stopSequences,
          },
        }),
        signal,
      },
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${err.slice(0, 300)}`);
    }

    const json = (await response.json()) as GeminiResponse;
    const candidate = json.candidates?.[0];
    const text = candidate?.content?.parts
      ?.map((p: { text?: string }) => p.text || "")
      .join("") || "";

    return {
      content: text,
      usage: {
        promptTokens: json.usageMetadata?.promptTokenCount || 0,
        completionTokens: json.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: json.usageMetadata?.totalTokenCount || 0,
      },
      finishReason: this.mapFinishReason(candidate?.finishReason),
      modelId,
      providerId: this.id,
    };
  }

  async generateJson<T>(
    modelId: string,
    input: JsonInput<T>,
    signal?: AbortSignal,
  ): Promise<JsonOutput<T>> {
    const contents = this.convertToGeminiFormat({
      messages: [
        {
          role: "user",
          content: `${input.systemPrompt ? input.systemPrompt + "\n\n" : ""}${input.prompt}\n\nOutput ONLY valid JSON matching: ${input.schemaDescription}. Do not include markdown fences or other text.`,
        },
      ],
    });

    let attempts = 0;

    while (attempts < 2) {
      const response = await fetch(
        `${this.baseUrl}/models/${modelId}:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents,
            generationConfig: {
              temperature: input.temperature ?? 0.1,
              maxOutputTokens: input.maxTokens ?? 4096,
              responseMimeType: "application/json",
            },
          }),
          signal,
        },
      );

      if (!response.ok) {
        throw new Error(`Gemini API error ${response.status}`);
      }

      const json = (await response.json()) as GeminiResponse;
      const text = json.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text || "")
        .join("") || "";

      // Strip markdown fences if present
      const cleanText = text.replace(/^```json?\s*\n?/i, "").replace(/\n?```\s*$/, "");

      try {
        const parsed = JSON.parse(cleanText);
        const result = input.schema.safeParse(parsed);

        if (result.success && result.data !== undefined) {
          return {
            data: result.data,
            usage: {
              promptTokens: json.usageMetadata?.promptTokenCount || 0,
              completionTokens: json.usageMetadata?.candidatesTokenCount || 0,
              totalTokens: json.usageMetadata?.totalTokenCount || 0,
            },
            modelId,
            providerId: this.id,
          };
        }

        contents.push(
          { role: "model", parts: [{ text }] },
          { role: "user", parts: [{ text: `Validation error: ${String(result.error)}. Please fix.` }] },
        );
      } catch {
        contents.push({
          role: "user",
          parts: [{ text: "Output was not valid JSON. Please output ONLY valid JSON." }],
        });
      }

      attempts++;
    }

    throw new Error("Gemini generateJson failed after 2 attempts");
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private convertToGeminiFormat(input: ChatInput): GeminiContent[] {
    const contents: GeminiContent[] = [];
    let systemText = "";

    for (const msg of input.messages) {
      if (msg.role === "system") {
        systemText += (systemText ? "\n" : "") + (typeof msg.content === "string" ? msg.content : "");
        continue;
      }

      const role = msg.role === "assistant" ? "model" : "user";
      const text = typeof msg.content === "string"
        ? msg.content
        : msg.content.map((c) => c.text || "").join("");

      contents.push({ role, parts: [{ text }] });
    }

    // Prepend system instruction to first user message
    if (systemText && contents.length > 0 && contents[0]?.role === "user") {
      contents[0].parts[0]!.text = `${systemText}\n\n${contents[0].parts[0]!.text}`;
    }

    return contents;
  }

  private mapFinishReason(
    reason?: string,
  ): ChatOutput["finishReason"] {
    switch (reason) {
      case "STOP":
        return "stop";
      case "MAX_TOKENS":
        return "length";
      case "TOOL_CALLS":
        return "tool_calls";
      default:
        return "error";
    }
  }
}

// ─── Raw API response types ──────────────────────────────────────

interface GeminiContent {
  role: string;
  parts: Array<{ text?: string }>;
}

interface GeminiResponse {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string }> };
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}
