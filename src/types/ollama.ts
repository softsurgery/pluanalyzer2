export type OllamaRole = "system" | "user" | "assistant" | "tool";

export interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface OllamaToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface OllamaMessage {
  role: OllamaRole;
  content: string;
  images?: string[];
  tool_calls?: OllamaToolCall[];
  thinking?: string;
}

export interface OllamaModelOptions {
  temperature?: number;
  top_p?: number;
  top_k?: number;
  min_p?: number;
  num_ctx?: number;
  num_predict?: number;
  seed?: number;
  stop?: string[];
  repeat_penalty?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  num_gpu?: number;
  num_thread?: number;
  [key: string]: unknown;
}

export type OllamaFormat = "json" | Record<string, unknown>;

export interface OllamaConfig {
  baseUrl: string;
  defaultModel: string;
  apiKey?: string;
  defaultTimeoutMs: number;
  defaultKeepAlive?: string | number;
  defaultOptions?: OllamaModelOptions;
}

export interface OllamaExecutionMetrics {
  totalDurationMs?: number;
  loadDurationMs?: number;
  promptEvalCount?: number;
  promptEvalDurationMs?: number;
  evalCount?: number;
  evalDurationMs?: number;
  tokensPerSecond?: number;
}

export interface OllamaChatInput {
  model?: string;
  messages: OllamaMessage[];
  format?: OllamaFormat;
  options?: OllamaModelOptions;
  stream?: boolean;
  think?: boolean;
  keepAlive?: string | number;
  tools?: OllamaToolDefinition[];
  timeoutMs?: number;
  temperature?: number;
}

export interface OllamaRawChatResponse {
  model?: string;
  created_at?: string;
  message?: OllamaMessage;
  done?: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
  error?: string;
}

export interface OllamaChatResult {
  ok: boolean;
  status: number;
  model: string;
  content: string;
  thinking?: string;
  message?: OllamaMessage;
  toolCalls?: OllamaToolCall[];
  metrics?: OllamaExecutionMetrics;
  raw?: OllamaRawChatResponse;
  error?: string;
}

export interface OllamaChatWithFallbackInput extends OllamaChatInput {
  fallbackModels?: string[];
}

export interface OllamaChatWithFallbackResult extends OllamaChatResult {
  attemptedModels: string[];
  warnings: string[];
}

export interface OllamaChatStreamChunk {
  model: string;
  contentDelta: string;
  thinkingDelta?: string;
  done: boolean;
  metrics?: OllamaExecutionMetrics;
  raw?: OllamaRawChatResponse;
}

export interface OllamaGenerateInput {
  model?: string;
  prompt: string;
  system?: string;
  suffix?: string;
  images?: string[];
  format?: OllamaFormat;
  options?: OllamaModelOptions;
  raw?: boolean;
  think?: boolean;
  keepAlive?: string | number;
  timeoutMs?: number;
  temperature?: number;
}

export interface OllamaRawGenerateResponse {
  model?: string;
  created_at?: string;
  response?: string;
  thinking?: string;
  done?: boolean;
  done_reason?: string;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
  error?: string;
}

export interface OllamaGenerateResult {
  ok: boolean;
  status: number;
  model: string;
  content: string;
  thinking?: string;
  metrics?: OllamaExecutionMetrics;
  raw?: OllamaRawGenerateResponse;
  error?: string;
}

export interface OllamaStructuredJsonInput<T = unknown> {
  model?: string;
  fallbackModels?: string[];
  messages?: OllamaMessage[];
  prompt?: string;
  systemPrompt?: string;
  schema?: Record<string, unknown>;
  validate?: (parsed: unknown) => T;
  options?: OllamaModelOptions;
  temperature?: number;
  timeoutMs?: number;
  maxRepairAttempts?: number;
  think?: boolean;
  keepAlive?: string | number;
}

export interface OllamaStructuredJsonResult<T = unknown> {
  ok: boolean;
  model: string;
  data?: T;
  rawContent?: string;
  thinking?: string;
  attemptedModels: string[];
  repairAttempts: number;
  warnings: string[];
  metrics?: OllamaExecutionMetrics;
  raw?: OllamaRawChatResponse;
  error?: string;
}

export interface OllamaEmbedInput {
  model?: string;
  input: string | string[];
  truncate?: boolean;
  options?: OllamaModelOptions;
  keepAlive?: string | number;
  timeoutMs?: number;
}

export interface OllamaRawEmbedResponse {
  model?: string;
  embeddings?: number[][];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  error?: string;
}

export interface OllamaEmbedResult {
  ok: boolean;
  status: number;
  model: string;
  embeddings: number[][];
  metrics?: OllamaExecutionMetrics;
  raw?: OllamaRawEmbedResponse;
  error?: string;
}

export interface OllamaModelDetails {
  parent_model?: string;
  format?: string;
  family?: string;
  families?: string[] | null;
  parameter_size?: string;
  quantization_level?: string;
}

export interface OllamaModelInfo {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: OllamaModelDetails;
}

export interface OllamaListModelsResult {
  ok: boolean;
  models: OllamaModelInfo[];
  error?: string;
}

export interface OllamaShowModelResult {
  ok: boolean;
  modelfile?: string;
  parameters?: string;
  template?: string;
  details?: OllamaModelDetails;
  model_info?: Record<string, unknown>;
  capabilities?: string[];
  error?: string;
}

export interface OllamaServerStatus {
  ok: boolean;
  baseUrl: string;
  defaultModel: string;
  version?: string;
  latencyMs?: number;
  models: OllamaModelInfo[];
  fetchedAt: string;
  error?: string;
}

export interface TestAiResponse {
  ok?: boolean;
  model?: string;
  durationMs?: number;
  reply?: string;
  thinking?: string;
  metrics?: OllamaExecutionMetrics;
  error?: string;
}

export type OllamaUsageRange = "24h" | "7d" | "30d";

export interface OllamaUsageTotals {
  request_count: number;
  usage_usd: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
}

export interface OllamaUsageBucket extends OllamaUsageTotals {
  from: string;
  until: string;
  partial?: boolean;
}

export interface OllamaUsageData {
  range: OllamaUsageRange;
  scope?: string;
  granularity: "hour" | "day" | string;
  from: string;
  until: string;
  totals: OllamaUsageTotals;
  buckets: OllamaUsageBucket[];
}

export interface OllamaBalanceData {
  included?: {
    balance_usd: number;
    allowance_usd: number;
    period?: {
      from: string;
      until: string;
    };
  };
  purchased?: {
    balance_usd: number;
  };
}

export interface OllamaConsumptionPagination {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
}

export interface OllamaAccountConsumptionResult {
  ok: boolean;
  range: OllamaUsageRange;
  usage?: OllamaUsageData;
  balance?: OllamaBalanceData;
  pagination?: OllamaConsumptionPagination;
  fetchedAt: string;
  error?: string;
}
