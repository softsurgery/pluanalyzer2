import { nsToMs } from "@/lib/date";
import { fetchJsonWithTimeout } from "@/services/plu/http";
import type {
  OllamaAccountConsumptionResult,
  OllamaBalanceData,
  OllamaChatInput,
  OllamaChatResult,
  OllamaChatStreamChunk,
  OllamaChatWithFallbackInput,
  OllamaChatWithFallbackResult,
  OllamaConfig,
  OllamaEmbedInput,
  OllamaEmbedResult,
  OllamaExecutionMetrics,
  OllamaGenerateInput,
  OllamaGenerateResult,
  OllamaListModelsResult,
  OllamaMessage,
  OllamaModelInfo,
  OllamaModelOptions,
  OllamaRawChatResponse,
  OllamaRawEmbedResponse,
  OllamaRawGenerateResponse,
  OllamaServerStatus,
  OllamaShowModelResult,
  OllamaStructuredJsonInput,
  OllamaStructuredJsonResult,
  OllamaUsageData,
  OllamaUsageRange,
} from "@/types/ollama";

export const DEFAULT_OLLAMA_BASE_URL = "https://ollama.com";
export const DEFAULT_OLLAMA_MODEL = "gpt-oss:20b";
export const DEFAULT_OLLAMA_TIMEOUT_MS = 60000;
export const DEFAULT_OLLAMA_KEEP_ALIVE = "5m";

/**
 * OllamaService provides a unified, typed service layer for interacting with the Ollama REST API.
 * Includes utilities for chat completions, streaming, raw generation, structured JSON extraction
 * with self-repair and model fallbacks, embeddings, server health diagnostics, and model management.
 */
export class OllamaService {
  private readonly config: OllamaConfig;

  constructor(config: Partial<OllamaConfig> = {}) {
    this.config = getOllamaConfig(config);
  }

  /**
   * Create a new OllamaService instance initialized from current environment variables.
   */
  static fromEnv(overrides: Partial<OllamaConfig> = {}): OllamaService {
    return new OllamaService(overrides);
  }

  /**
   * Return an immutable copy of the current service configuration.
   */
  getConfig(): OllamaConfig {
    return {
      ...this.config,
      defaultOptions: this.config.defaultOptions
        ? { ...this.config.defaultOptions }
        : undefined,
    };
  }

  /**
   * Clone this service with overridden configuration values.
   */
  withConfig(overrides: Partial<OllamaConfig>): OllamaService {
    return new OllamaService({
      ...this.config,
      ...overrides,
      defaultOptions: {
        ...(this.config.defaultOptions || {}),
        ...(overrides.defaultOptions || {}),
      },
    });
  }

  /**
   * Build the full Ollama API endpoint URL for a path (e.g., `/api/chat`).
   */
  endpoint(path: string): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${this.config.baseUrl}${normalizedPath}`;
  }

  /**
   * Build HTTP headers for Ollama requests (includes optional Bearer token when `OLLAMA_API_KEY` is configured).
   */
  buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...extra,
    };
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }

  // ============================================================================
  // Static Text, Thinking, JSON, Token & Vector Utilities
  // ============================================================================

  /**
   * Separate `<think>...</think>` blocks emitted by reasoning models (e.g., Qwen3, DeepSeek-R1)
   * from the final assistant response content.
   */
  static stripThinkingTags(rawText: string): {
    content: string;
    thinking?: string;
  } {
    if (!rawText) return { content: "" };

    const thinkBlocks: string[] = [];
    const cleaned = rawText
      .replace(/<think>([\s\S]*?)<\/think>/gi, (_match, inner: string) => {
        const trimmedInner = inner.trim();
        if (trimmedInner) thinkBlocks.push(trimmedInner);
        return "";
      })
      // Also handle unclosed <think> tags if output was cut off before any non-think text
      .trim();

    return {
      content: cleaned,
      thinking: thinkBlocks.length > 0 ? thinkBlocks.join("\n\n") : undefined,
    };
  }

  /**
   * Extract a valid JSON object (`{...}`) or array (`[...]`) from raw LLM text.
   * Automatically strips `<think>` blocks, Markdown code fences, and leading/trailing prose.
   */
  static extractJson(rawText: string): string {
    const { content } = OllamaService.stripThinkingTags(rawText);
    const trimmed = content.trim();

    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;

    const firstBrace = candidate.indexOf("{");
    const firstBracket = candidate.indexOf("[");

    let startIdx = -1;
    let openChar: "{" | "[" = "{";
    let closeChar: "}" | "]" = "}";

    if (
      firstBrace !== -1 &&
      (firstBracket === -1 || firstBrace < firstBracket)
    ) {
      startIdx = firstBrace;
      openChar = "{";
      closeChar = "}";
    } else if (firstBracket !== -1) {
      startIdx = firstBracket;
      openChar = "[";
      closeChar = "]";
    }

    if (startIdx === -1) {
      return candidate;
    }

    // Balanced brace/bracket scan respecting JSON string literals
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = startIdx; i < candidate.length; i++) {
      const ch = candidate[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\" && inString) {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (ch === openChar) depth++;
        else if (ch === closeChar) {
          depth--;
          if (depth === 0) {
            return candidate.slice(startIdx, i + 1);
          }
        }
      }
    }

    // Fallback to last matching closer
    const lastClose = candidate.lastIndexOf(closeChar);
    if (lastClose > startIdx) {
      return candidate.slice(startIdx, lastClose + 1);
    }

    return candidate;
  }

  /**
   * Parse and optionally validate JSON from raw LLM output.
   */
  static parseJson<T = unknown>(
    rawText: string,
    validate?: (parsed: unknown) => T,
  ): T {
    const extracted = OllamaService.extractJson(rawText);
    const parsed: unknown = JSON.parse(extracted);
    return validate ? validate(parsed) : (parsed as T);
  }

  /**
   * Estimate token count for a string (~3.8 characters per token heuristic for French/English).
   */
  static estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 3.8);
  }

  /**
   * Truncate text cleanly at a line or word boundary to fit within a target token budget.
   */
  static truncateToTokenBudget(text: string, maxTokens: number): string {
    if (!text || maxTokens <= 0) return "";
    const maxChars = Math.floor(maxTokens * 3.8);
    if (text.length <= maxChars) return text;

    const slice = text.slice(0, maxChars);
    const lastNewline = slice.lastIndexOf("\n");
    if (lastNewline > maxChars * 0.8) {
      return slice.slice(0, lastNewline).trimEnd();
    }
    const lastSpace = slice.lastIndexOf(" ");
    if (lastSpace > maxChars * 0.8) {
      return slice.slice(0, lastSpace).trimEnd();
    }
    return slice.trimEnd();
  }

  /**
   * Compute cosine similarity between two embedding vectors in [-1, 1].
   */
  static cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length === 0 || vecA.length !== vecB.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  // ============================================================================
  // Core Generation & Chat Endpoints
  // ============================================================================

  private mergeModelOptions(
    options?: OllamaModelOptions,
    temperature?: number,
  ): OllamaModelOptions | undefined {
    const merged: OllamaModelOptions = {
      ...(this.config.defaultOptions || {}),
      ...(options || {}),
    };
    if (typeof temperature === "number") {
      merged.temperature = temperature;
    }
    return Object.keys(merged).length > 0 ? merged : undefined;
  }

  /**
   * Execute a chat completion request against `POST /api/chat` (`stream: false`).
   */
  async chat(input: OllamaChatInput): Promise<OllamaChatResult> {
    const model = input.model?.trim() || this.config.defaultModel;
    const options = this.mergeModelOptions(input.options, input.temperature);

    const payload: Record<string, unknown> = {
      model,
      messages: input.messages,
      stream: false,
    };
    if (options) payload.options = options;
    if (input.format) payload.format = input.format;
    if (typeof input.think === "boolean") payload.think = input.think;
    if (
      input.keepAlive !== undefined ||
      this.config.defaultKeepAlive !== undefined
    ) {
      payload.keep_alive = input.keepAlive ?? this.config.defaultKeepAlive;
    }
    if (input.tools && input.tools.length > 0) {
      payload.tools = input.tools;
    }

    const res = await fetchJsonWithTimeout<OllamaRawChatResponse>(
      this.endpoint("/api/chat"),
      {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(payload),
        timeoutMs: input.timeoutMs ?? this.config.defaultTimeoutMs,
      },
    );

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        model,
        content: "",
        error: res.error || "Ollama chat API error",
      };
    }

    if (res.data?.error) {
      return {
        ok: false,
        status: res.status,
        model,
        content: "",
        raw: res.data,
        error: res.data.error,
      };
    }

    const rawContent = res.data?.message?.content ?? "";
    const stripped = OllamaService.stripThinkingTags(rawContent);
    const thinking = res.data?.message?.thinking || stripped.thinking;

    return {
      ok: true,
      status: res.status,
      model: res.data?.model || model,
      content: stripped.content,
      thinking,
      message: res.data?.message,
      toolCalls: res.data?.message?.tool_calls,
      metrics: parseMetrics(res.data),
      raw: res.data,
    };
  }

  /**
   * Execute a chat completion with automatic fallback across multiple candidate models.
   */
  async chatWithFallback(
    input: OllamaChatWithFallbackInput,
  ): Promise<OllamaChatWithFallbackResult> {
    const primaryModel = input.model?.trim() || this.config.defaultModel;
    const candidates = Array.from(
      new Set(
        [primaryModel, ...(input.fallbackModels || [])]
          .map((m) => m.trim())
          .filter(Boolean),
      ),
    );

    const attemptedModels: string[] = [];
    const warnings: string[] = [];
    let lastResult: OllamaChatResult = {
      ok: false,
      status: 0,
      model: primaryModel,
      content: "",
      error: "No candidate models configured",
    };

    for (const candidateModel of candidates) {
      attemptedModels.push(candidateModel);
      const res = await this.chat({
        ...input,
        model: candidateModel,
      });
      lastResult = res;

      if (!res.ok) {
        warnings.push(
          `Model ${candidateModel} failed: ${res.error || "Unknown error"}`,
        );
        continue;
      }

      if (
        !res.content.trim() &&
        (!res.toolCalls || res.toolCalls.length === 0)
      ) {
        warnings.push(`Model ${candidateModel} returned an empty response.`);
        lastResult = {
          ...res,
          ok: false,
          error: "Empty completion from Ollama model",
        };
        continue;
      }

      return {
        ...res,
        attemptedModels,
        warnings,
      };
    }

    return {
      ...lastResult,
      attemptedModels,
      warnings,
    };
  }

  /**
   * Stream a chat completion from `POST /api/chat` (`stream: true`) as an async generator.
   */
  async *chatStream(
    input: OllamaChatInput,
    onChunk?: (chunk: OllamaChatStreamChunk) => void,
  ): AsyncGenerator<OllamaChatStreamChunk, OllamaChatResult, unknown> {
    const model = input.model?.trim() || this.config.defaultModel;
    const options = this.mergeModelOptions(input.options, input.temperature);

    const payload: Record<string, unknown> = {
      model,
      messages: input.messages,
      stream: true,
    };
    if (options) payload.options = options;
    if (input.format) payload.format = input.format;
    if (typeof input.think === "boolean") payload.think = input.think;
    if (
      input.keepAlive !== undefined ||
      this.config.defaultKeepAlive !== undefined
    ) {
      payload.keep_alive = input.keepAlive ?? this.config.defaultKeepAlive;
    }

    const controller = new AbortController();
    const timeoutMs = input.timeoutMs ?? this.config.defaultTimeoutMs;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(this.endpoint("/api/chat"), {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const errText = await response.text().catch(() => "");
        return {
          ok: false,
          status: response.status,
          model,
          content: "",
          error: `HTTP ${response.status}: ${errText.slice(0, 300)}`,
        };
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";
      let fullThinking = "";
      let resolvedModel = model;
      let finalRaw: OllamaRawChatResponse | undefined;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const parsed = JSON.parse(trimmed) as OllamaRawChatResponse;
            if (parsed.model) resolvedModel = parsed.model;
            const contentDelta = parsed.message?.content ?? "";
            const thinkingDelta = parsed.message?.thinking;
            fullContent += contentDelta;
            if (thinkingDelta) fullThinking += thinkingDelta;
            if (parsed.done) finalRaw = parsed;

            const chunk: OllamaChatStreamChunk = {
              model: resolvedModel,
              contentDelta,
              thinkingDelta,
              done: Boolean(parsed.done),
              metrics: parsed.done ? parseMetrics(parsed) : undefined,
              raw: parsed,
            };
            onChunk?.(chunk);
            yield chunk;
          } catch {
            // Skip malformed NDJSON fragment
          }
        }
      }

      const stripped = OllamaService.stripThinkingTags(fullContent);
      return {
        ok: true,
        status: 200,
        model: resolvedModel,
        content: stripped.content,
        thinking: fullThinking || stripped.thinking,
        metrics: parseMetrics(finalRaw),
        raw: finalRaw,
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Ollama stream error";
      return {
        ok: false,
        status: 0,
        model,
        content: "",
        error: message,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Execute a raw text completion request against `POST /api/generate` (`stream: false`).
   */
  async generate(input: OllamaGenerateInput): Promise<OllamaGenerateResult> {
    const model = input.model?.trim() || this.config.defaultModel;
    const options = this.mergeModelOptions(input.options, input.temperature);

    const payload: Record<string, unknown> = {
      model,
      prompt: input.prompt,
      stream: false,
    };
    if (input.system) payload.system = input.system;
    if (input.suffix) payload.suffix = input.suffix;
    if (input.images && input.images.length > 0) payload.images = input.images;
    if (input.format) payload.format = input.format;
    if (options) payload.options = options;
    if (typeof input.raw === "boolean") payload.raw = input.raw;
    if (typeof input.think === "boolean") payload.think = input.think;
    if (
      input.keepAlive !== undefined ||
      this.config.defaultKeepAlive !== undefined
    ) {
      payload.keep_alive = input.keepAlive ?? this.config.defaultKeepAlive;
    }

    const res = await fetchJsonWithTimeout<OllamaRawGenerateResponse>(
      this.endpoint("/api/generate"),
      {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(payload),
        timeoutMs: input.timeoutMs ?? this.config.defaultTimeoutMs,
      },
    );

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        model,
        content: "",
        error: res.error || "Ollama generate API error",
      };
    }

    if (res.data?.error) {
      return {
        ok: false,
        status: res.status,
        model,
        content: "",
        raw: res.data,
        error: res.data.error,
      };
    }

    const rawResponse = res.data?.response ?? "";
    const stripped = OllamaService.stripThinkingTags(rawResponse);
    const thinking = res.data?.thinking || stripped.thinking;

    return {
      ok: true,
      status: res.status,
      model: res.data?.model || model,
      content: stripped.content,
      thinking,
      metrics: parseMetrics(res.data),
      raw: res.data,
    };
  }

  /**
   * Generate and validate structured JSON output with automatic JSON extraction,
   * schema validation, self-repair retries, and multi-model fallback.
   */
  async generateJson<T = unknown>(
    input: OllamaStructuredJsonInput<T>,
  ): Promise<OllamaStructuredJsonResult<T>> {
    const primaryModel = input.model?.trim() || this.config.defaultModel;
    const candidates = Array.from(
      new Set(
        [primaryModel, ...(input.fallbackModels || [])]
          .map((m) => m.trim())
          .filter(Boolean),
      ),
    );

    const baseMessages: OllamaMessage[] = input.messages
      ? [...input.messages]
      : [
          ...(input.systemPrompt
            ? [{ role: "system" as const, content: input.systemPrompt }]
            : []),
          { role: "user" as const, content: input.prompt || "" },
        ];

    const maxRepairAttempts = Math.max(0, input.maxRepairAttempts ?? 1);
    const attemptedModels: string[] = [];
    const warnings: string[] = [];
    let totalRepairAttempts = 0;
    let lastError = "Ollama structured JSON generation failed";
    let lastRaw: OllamaRawChatResponse | undefined;
    let lastContent: string | undefined;

    for (const candidateModel of candidates) {
      attemptedModels.push(candidateModel);
      const conversation: OllamaMessage[] = [...baseMessages];

      for (let attempt = 0; attempt <= maxRepairAttempts; attempt++) {
        if (attempt > 0) {
          totalRepairAttempts++;
        }

        const res = await this.chat({
          model: candidateModel,
          messages: conversation,
          format: input.schema ?? "json",
          options: input.options,
          temperature: input.temperature ?? 0.1,
          think: input.think,
          timeoutMs: input.timeoutMs,
          keepAlive: input.keepAlive,
        });

        lastRaw = res.raw;
        if (!res.ok) {
          lastError = res.error || "Ollama API error";
          warnings.push(`Model ${candidateModel} HTTP error: ${lastError}`);
          break; // HTTP/network failure on this model -> move to next candidate model
        }

        const content = res.content.trim();
        lastContent = content;
        if (!content) {
          lastError = "Empty completion from Ollama";
          warnings.push(`Model ${candidateModel} returned an empty response.`);
          break;
        }

        try {
          const parsed = OllamaService.parseJson<T>(content, input.validate);
          return {
            ok: true,
            model: res.model || candidateModel,
            data: parsed,
            rawContent: content,
            thinking: res.thinking,
            attemptedModels,
            repairAttempts: totalRepairAttempts,
            warnings,
            metrics: res.metrics,
            raw: res.raw,
          };
        } catch (parseErr) {
          const errMsg =
            parseErr instanceof Error
              ? parseErr.message
              : "Invalid JSON structure";
          lastError = errMsg;
          warnings.push(
            `Model ${candidateModel} (attempt ${attempt + 1}) returned invalid JSON: ${errMsg}`,
          );

          if (attempt < maxRepairAttempts) {
            conversation.push(
              { role: "assistant", content },
              {
                role: "user",
                content: `Your previous response could not be parsed or failed validation (${errMsg}). Respond ONLY with a valid JSON object matching the required structure, without markdown fences or commentary.`,
              },
            );
          }
        }
      }
    }

    return {
      ok: false,
      model: primaryModel,
      rawContent: lastContent,
      attemptedModels,
      repairAttempts: totalRepairAttempts,
      warnings,
      raw: lastRaw,
      error: lastError,
    };
  }

  // ============================================================================
  // Embeddings
  // ============================================================================

  /**
   * Generate vector embeddings for one or more texts via `POST /api/embed`.
   */
  async embed(input: OllamaEmbedInput): Promise<OllamaEmbedResult> {
    const model = input.model?.trim() || this.config.defaultModel;
    const payload: Record<string, unknown> = {
      model,
      input: input.input,
    };
    if (typeof input.truncate === "boolean") payload.truncate = input.truncate;
    if (input.options) payload.options = input.options;
    if (
      input.keepAlive !== undefined ||
      this.config.defaultKeepAlive !== undefined
    ) {
      payload.keep_alive = input.keepAlive ?? this.config.defaultKeepAlive;
    }

    const res = await fetchJsonWithTimeout<OllamaRawEmbedResponse>(
      this.endpoint("/api/embed"),
      {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(payload),
        timeoutMs: input.timeoutMs ?? this.config.defaultTimeoutMs,
      },
    );

    if (!res.ok || res.data?.error) {
      return {
        ok: false,
        status: res.status,
        model,
        embeddings: [],
        raw: res.data,
        error:
          res.data?.error ||
          res.error ||
          "Failed to generate Ollama embeddings",
      };
    }

    return {
      ok: true,
      status: res.status,
      model: res.data?.model || model,
      embeddings: Array.isArray(res.data?.embeddings)
        ? res.data.embeddings
        : [],
      metrics: parseMetrics(res.data),
      raw: res.data,
    };
  }

  // ============================================================================
  // Server Diagnostics & Model Management
  // ============================================================================

  /**
   * Fetch the Ollama daemon version via `GET /api/version`.
   */
  async getVersion(timeoutMs = 5000): Promise<{
    ok: boolean;
    version?: string;
    error?: string;
  }> {
    const res = await fetchJsonWithTimeout<{ version?: string }>(
      this.endpoint("/api/version"),
      {
        method: "GET",
        headers: this.buildHeaders(),
        timeoutMs,
      },
    );
    if (!res.ok) {
      return {
        ok: false,
        error: res.error || "Failed to connect to Ollama server",
      };
    }
    return { ok: true, version: res.data?.version };
  }

  /**
   * List available Ollama Cloud models via `GET /api/tags`.
   */
  async listModels(timeoutMs = 8000): Promise<OllamaListModelsResult> {
    const res = await fetchJsonWithTimeout<{ models?: OllamaModelInfo[] }>(
      this.endpoint("/api/tags"),
      {
        method: "GET",
        headers: this.buildHeaders(),
        timeoutMs,
      },
    );
    if (!res.ok) {
      return {
        ok: false,
        models: [],
        error: res.error || "Failed to list Ollama models",
      };
    }
    return {
      ok: true,
      models: Array.isArray(res.data?.models) ? res.data.models : [],
    };
  }

  /**
   * Retrieve detailed metadata for a specific model via `POST /api/show`.
   */
  async showModel(
    model?: string,
    verbose = false,
    timeoutMs = 8000,
  ): Promise<OllamaShowModelResult> {
    const targetModel = model?.trim() || this.config.defaultModel;
    const res = await fetchJsonWithTimeout<Omit<OllamaShowModelResult, "ok">>(
      this.endpoint("/api/show"),
      {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify({ model: targetModel, verbose }),
        timeoutMs,
      },
    );

    if (!res.ok) {
      return {
        ok: false,
        error: res.error || `Failed to inspect Ollama model "${targetModel}"`,
      };
    }

    return {
      ok: true,
      ...res.data,
    };
  }

  /**
   * Check whether a model tag is available on Ollama Cloud.
   */
  async hasModel(model: string): Promise<boolean> {
    const target = model.trim().toLowerCase();
    if (!target) return false;
    const list = await this.listModels();
    if (!list.ok) return false;
    const withLatest = target.includes(":") ? target : `${target}:latest`;
    return list.models.some((m) => {
      const name = (m.name || m.model || "").toLowerCase();
      return name === target || name === withLatest;
    });
  }

  /**
   * Perform a diagnostic check of the Ollama Cloud API (`/api/version`, `/api/tags`).
   */
  async healthCheck(timeoutMs = 6000): Promise<OllamaServerStatus> {
    const startedAt = Date.now();
    const [versionRes, tagsRes] = await Promise.all([
      this.getVersion(timeoutMs),
      this.listModels(timeoutMs),
    ]);
    const latencyMs = Date.now() - startedAt;

    if (!versionRes.ok && !tagsRes.ok) {
      return {
        ok: false,
        baseUrl: this.config.baseUrl,
        defaultModel: this.config.defaultModel,
        latencyMs,
        models: [],
        fetchedAt: new Date().toISOString(),
        error:
          versionRes.error ||
          tagsRes.error ||
          `Ollama server unreachable at ${this.config.baseUrl}`,
      };
    }

    return {
      ok: true,
      baseUrl: this.config.baseUrl,
      defaultModel: this.config.defaultModel,
      version: versionRes.version,
      latencyMs,
      models: tagsRes.models,
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Fetch cloud usage history & USD costs via `GET /api/usage?range=24h|7d|30d`.
   */
  async getUsage(
    range: OllamaUsageRange = "7d",
    timeoutMs = 10000,
  ): Promise<{ ok: boolean; data?: OllamaUsageData; error?: string }> {
    const res = await fetchJsonWithTimeout<OllamaUsageData>(
      this.endpoint(`/api/usage?range=${encodeURIComponent(range)}`),
      {
        method: "GET",
        headers: this.buildHeaders(),
        timeoutMs,
      },
    );
    if (!res.ok) {
      return {
        ok: false,
        error: res.error || "Failed to fetch Ollama Cloud usage",
      };
    }
    return { ok: true, data: res.data };
  }

  /**
   * Fetch remaining cloud credit balance & allowance via `GET /api/balance`.
   */
  async getBalance(
    timeoutMs = 10000,
  ): Promise<{ ok: boolean; data?: OllamaBalanceData; error?: string }> {
    const res = await fetchJsonWithTimeout<OllamaBalanceData>(
      this.endpoint("/api/balance"),
      {
        method: "GET",
        headers: this.buildHeaders(),
        timeoutMs,
      },
    );
    if (!res.ok) {
      return {
        ok: false,
        error: res.error || "Failed to fetch Ollama Cloud balance",
      };
    }
    return { ok: true, data: res.data };
  }

  /**
   * Fetch paginated Ollama Cloud usage history and credit balance for the configured account.
   */
  async getAccountConsumption(
    range: OllamaUsageRange = "7d",
    options: { limit?: number; offset?: number; timeoutMs?: number } = {},
  ): Promise<OllamaAccountConsumptionResult> {
    const fetchedAt = new Date().toISOString();
    if (!this.config.apiKey) {
      return {
        ok: false,
        range,
        fetchedAt,
        error: "OLLAMA_API_KEY non configurée dans .env",
      };
    }

    const timeoutMs = options.timeoutMs ?? 10000;
    const [usageRes, balanceRes] = await Promise.all([
      this.getUsage(range, timeoutMs),
      this.getBalance(timeoutMs),
    ]);

    if (!usageRes.ok || !usageRes.data) {
      return {
        ok: false,
        range,
        balance: balanceRes.ok ? balanceRes.data : undefined,
        fetchedAt,
        error: `Ollama /api/usage: ${usageRes.error || "Erreur inconnue"}`,
      };
    }

    const allBuckets = Array.isArray(usageRes.data.buckets)
      ? [...usageRes.data.buckets].reverse()
      : [];
    const total = allBuckets.length;
    const offset = Math.max(0, options.offset ?? 0);
    const limit =
      typeof options.limit === "number" && options.limit > 0
        ? options.limit
        : total;
    const pagedBuckets = allBuckets.slice(offset, offset + limit);

    return {
      ok: true,
      range,
      usage: {
        ...usageRes.data,
        buckets: pagedBuckets,
      },
      balance: balanceRes.ok ? balanceRes.data : undefined,
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + pagedBuckets.length < total,
      },
      fetchedAt,
      ...(balanceRes.ok
        ? {}
        : { error: `Ollama /api/balance: ${balanceRes.error}` }),
    };
  }
}

let defaultOllamaServiceInstance: OllamaService | null = null;

/**
 * Retrieve a shared OllamaService instance configured from current environment variables.
 */
export function getOllamaService(
  overrides?: Partial<OllamaConfig>,
): OllamaService {
  if (overrides && Object.keys(overrides).length > 0) {
    return new OllamaService(overrides);
  }
  if (!defaultOllamaServiceInstance) {
    defaultOllamaServiceInstance = OllamaService.fromEnv();
  } else {
    // Refresh if env vars changed at runtime (e.g. during tests)
    const freshConfig = getOllamaConfig();
    const currentConfig = defaultOllamaServiceInstance.getConfig();
    if (
      freshConfig.baseUrl !== currentConfig.baseUrl ||
      freshConfig.defaultModel !== currentConfig.defaultModel ||
      freshConfig.apiKey !== currentConfig.apiKey
    ) {
      defaultOllamaServiceInstance = new OllamaService(freshConfig);
    }
  }
  return defaultOllamaServiceInstance;
}

/**
 * Normalizes an Ollama base URL by stripping trailing slashes and any accidental `/api/...` suffix.
 */
export function normalizeOllamaBaseUrl(rawUrl?: string): string {
  const candidate = (rawUrl || DEFAULT_OLLAMA_BASE_URL).trim();
  if (!candidate) return DEFAULT_OLLAMA_BASE_URL;
  const withProtocol = /^https?:\/\//i.test(candidate)
    ? candidate
    : /^localhost\b|^127\.0\.0\.1\b/i.test(candidate)
      ? `http://${candidate}`
      : `https://${candidate}`;
  return withProtocol
    .replace(/\/api\/(?:chat|generate|tags|embed|show|version)\/?$/i, "")
    .replace(/\/api\/?$/i, "")
    .replace(/\/+$/, "");
}

/**
 * Resolves Ollama configuration from environment variables with optional overrides.
 */
export function getOllamaConfig(
  overrides: Partial<OllamaConfig> = {},
): OllamaConfig {
  const envUrl =
    process.env.OLLAMA_BASE_URL ||
    process.env.OLLAMA_HOST ||
    process.env.OLLAMA_API_URL ||
    DEFAULT_OLLAMA_BASE_URL;
  const envTimeout = Number(process.env.OLLAMA_TIMEOUT_MS);

  return {
    baseUrl: normalizeOllamaBaseUrl(overrides.baseUrl ?? envUrl),
    defaultModel:
      (overrides.defaultModel ?? process.env.OLLAMA_MODEL)?.trim() ||
      DEFAULT_OLLAMA_MODEL,
    apiKey:
      overrides.apiKey ?? (process.env.OLLAMA_API_KEY?.trim() || undefined),
    defaultTimeoutMs:
      overrides.defaultTimeoutMs ??
      (Number.isFinite(envTimeout) && envTimeout > 0
        ? envTimeout
        : DEFAULT_OLLAMA_TIMEOUT_MS),
    defaultKeepAlive:
      overrides.defaultKeepAlive ??
      (process.env.OLLAMA_KEEP_ALIVE?.trim() || DEFAULT_OLLAMA_KEEP_ALIVE),
    defaultOptions: overrides.defaultOptions,
  };
}

function parseMetrics(raw?: {
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}): OllamaExecutionMetrics | undefined {
  if (!raw) return undefined;
  const totalDurationMs = nsToMs(raw.total_duration);
  const loadDurationMs = nsToMs(raw.load_duration);
  const promptEvalDurationMs = nsToMs(raw.prompt_eval_duration);
  const evalDurationMs = nsToMs(raw.eval_duration);
  const promptEvalCount =
    typeof raw.prompt_eval_count === "number"
      ? raw.prompt_eval_count
      : undefined;
  const evalCount =
    typeof raw.eval_count === "number" ? raw.eval_count : undefined;

  const tokensPerSecond =
    typeof evalCount === "number" &&
    typeof raw.eval_duration === "number" &&
    raw.eval_duration > 0
      ? Number((evalCount / (raw.eval_duration / 1_000_000_000)).toFixed(2))
      : undefined;

  if (
    totalDurationMs === undefined &&
    loadDurationMs === undefined &&
    promptEvalCount === undefined &&
    evalCount === undefined
  ) {
    return undefined;
  }

  return {
    totalDurationMs,
    loadDurationMs,
    promptEvalCount,
    promptEvalDurationMs,
    evalCount,
    evalDurationMs,
    tokensPerSecond,
  };
}
