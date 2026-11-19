import type {
  OllamaExecutionMetrics,
  OllamaFormat,
  OllamaMessage,
  OllamaModelOptions,
} from "@/types/ollama";
import type { OllamaService } from "@/services/ollama/OllamaService";

export type AiPipelineStepKind =
  | "guard"
  | "preprocess"
  | "transform"
  | "llm_chat"
  | "llm_structured"
  | "validate"
  | "postprocess"
  | "branch"
  | "parallel";

export type AiPipelineStepStatus =
  | "ok"
  | "skipped"
  | "short_circuited"
  | "error";

export interface AiPipelineStepTrace {
  step: string;
  kind: AiPipelineStepKind;
  status: AiPipelineStepStatus;
  durationMs: number;
  attempts: number;
  modelUsed?: string;
  metrics?: OllamaExecutionMetrics;
  warnings: string[];
  error?: string;
  timestamp: string;
}

export interface AiPipelineTokenSummary {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AiPipelineHooks<TContext = Record<string, unknown>> {
  onStepStart?: (info: {
    pipelineName: string;
    step: string;
    kind: AiPipelineStepKind;
    context: TContext;
  }) => void | Promise<void>;
  onStepComplete?: (
    trace: AiPipelineStepTrace,
    context: TContext,
  ) => void | Promise<void>;
  onStepError?: (
    trace: AiPipelineStepTrace,
    error: Error,
    context: TContext,
  ) => void | Promise<void>;
  onPipelineComplete?: (
    result: AiPipelineResult<unknown, TContext>,
  ) => void | Promise<void>;
}

export interface AiPipelineExecutionContext<
  TContext = Record<string, unknown>,
> {
  pipelineName: string;
  ollama: OllamaService;
  state: TContext;
  traces: AiPipelineStepTrace[];
  warnings: string[];
  modelsUsed: Set<string>;
  tokens: AiPipelineTokenSummary;
  addWarning: (warning: string) => void;
  recordMetrics: (model?: string, metrics?: OllamaExecutionMetrics) => void;
}

export type StepHandler<TIn, TOut, TContext = Record<string, unknown>> = (
  input: TIn,
  ctx: AiPipelineExecutionContext<TContext>,
) => TOut | Promise<TOut>;

export type Resolvable<T, TIn, TContext = Record<string, unknown>> =
  | T
  | ((input: TIn, ctx: AiPipelineExecutionContext<TContext>) => T);

export interface AiPipelineStepOptions {
  retries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  shouldRetry?: (error: Error, attempt: number) => boolean;
  optional?: boolean;
}

export interface AiPipelineLlmBaseConfig<
  TIn,
  TContext = Record<string, unknown>,
> {
  model?: Resolvable<string | undefined, TIn, TContext>;
  fallbackModels?: Resolvable<string[], TIn, TContext>;
  systemPrompt?: string | StepHandler<TIn, string, TContext>;
  userPrompt?: string | StepHandler<TIn, string, TContext>;
  messages?: StepHandler<TIn, OllamaMessage[], TContext>;
  temperature?: number;
  options?: OllamaModelOptions;
  think?: boolean;
  timeoutMs?: number;
  keepAlive?: string | number;
}

export interface AiPipelineLlmChatConfig<
  TIn,
  TContext = Record<string, unknown>,
> extends AiPipelineLlmBaseConfig<TIn, TContext> {
  format?: OllamaFormat;
}

export interface AiPipelineLlmBaseOutput<TIn> {
  input: TIn;
  thinking?: string;
  model: string;
  attemptedModels: string[];
  metrics?: OllamaExecutionMetrics;
  raw?: unknown;
}

export interface AiPipelineLlmChatOutput<TIn>
  extends AiPipelineLlmBaseOutput<TIn> {
  content: string;
}

export interface AiPipelineLlmStructuredConfig<
  TIn,
  TSchema,
  TContext = Record<string, unknown>,
> extends AiPipelineLlmBaseConfig<TIn, TContext> {
  schema?: Record<string, unknown>;
  validate?: (
    parsed: unknown,
    input: TIn,
    ctx: AiPipelineExecutionContext<TContext>,
  ) => TSchema;
  maxRepairAttempts?: number;
}

export interface AiPipelineLlmStructuredOutput<TIn, TSchema>
  extends AiPipelineLlmBaseOutput<TIn> {
  data: TSchema;
  rawContent: string;
  repairAttempts: number;
}

export interface AiPipelineResult<TOutput, TContext = Record<string, unknown>> {
  ok: boolean;
  status: "ok" | "short_circuited" | "fallback" | "error";
  pipelineName: string;
  output: TOutput;
  context: TContext;
  steps: AiPipelineStepTrace[];
  totalDurationMs: number;
  modelsUsed: string[];
  totalTokens: AiPipelineTokenSummary;
  warnings: string[];
  error?: string;
}
