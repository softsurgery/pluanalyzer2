import {
  getOllamaService,
  OllamaService,
} from "@/services/ollama/OllamaService";
import type {
  AiPipelineExecutionContext,
  AiPipelineHooks,
  AiPipelineLlmBaseConfig,
  AiPipelineLlmChatConfig,
  AiPipelineLlmChatOutput,
  AiPipelineLlmStructuredConfig,
  AiPipelineLlmStructuredOutput,
  AiPipelineResult,
  AiPipelineStepKind,
  AiPipelineStepOptions,
  AiPipelineStepTrace,
  StepHandler,
} from "@/types/ai-pipeline";
import type { OllamaExecutionMetrics, OllamaMessage } from "@/types/ollama";

// ============================================================================
// Internal Signals, Types & Timing Helpers
// ============================================================================

// Thrown by guard steps to halt downstream execution without treating it as an error
class PipelineShortCircuitSignal {
  readonly output: unknown;
  readonly reason?: string;

  constructor(output: unknown, reason?: string) {
    this.output = output;
    this.reason = reason;
  }
}

interface InternalStepNode<TContext> {
  name: string;
  kind: AiPipelineStepKind;
  options: AiPipelineStepOptions;
  run: (
    input: unknown,
    ctx: AiPipelineExecutionContext<TContext>,
  ) => Promise<{
    output: unknown;
    modelUsed?: string;
    metrics?: OllamaExecutionMetrics;
    stepWarnings?: string[];
  }>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Races a step promise against an optional deadline and clears the timer afterward
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs?: number,
  stepName?: string,
): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          `Step "${stepName || "unknown"}" timed out after ${timeoutMs}ms`,
        ),
      );
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface AiPipelineInitOptions<TContext = Record<string, unknown>> {
  name: string;
  ollama?: OllamaService;
  hooks?: AiPipelineHooks<TContext>;
  defaultContext?: () => TContext;
}

/**
 * Fluent, strongly-typed AI Pipeline builder & execution engine built on top of OllamaService.
 *
 * Supports deterministic guards, context preprocessing, declarative LLM chat & structured JSON
 * steps with multi-model fallback and self-repair, post-LLM validation, branching, parallel steps,
 * retries, lifecycle telemetry hooks, and graceful fallback recovery.
 */
export class AiPipeline<
  TInput,
  TCurrent = TInput,
  TContext = Record<string, unknown>,
> {
  private readonly pipelineName: string;
  private readonly ollama: OllamaService;
  private readonly hooks: AiPipelineHooks<TContext>;
  private readonly defaultContextFactory?: () => TContext;
  private readonly steps: InternalStepNode<TContext>[];
  private fallbackHandler?: (
    error: Error,
    initialInput: TInput,
    ctx: AiPipelineExecutionContext<TContext>,
  ) => TCurrent | Promise<TCurrent>;

  private constructor(
    options: AiPipelineInitOptions<TContext>,
    steps: InternalStepNode<TContext>[] = [],
    fallbackHandler?: (
      error: Error,
      initialInput: TInput,
      ctx: AiPipelineExecutionContext<TContext>,
    ) => TCurrent | Promise<TCurrent>,
  ) {
    this.pipelineName = options.name;
    this.ollama = options.ollama ?? getOllamaService();
    this.hooks = options.hooks ?? {};
    this.defaultContextFactory = options.defaultContext;
    this.steps = steps;
    this.fallbackHandler = fallbackHandler;
  }

  /**
   * Create a new typed AI pipeline instance.
   */
  static create<TInput, TContext = Record<string, unknown>>(
    options: AiPipelineInitOptions<TContext> | string,
  ): AiPipeline<TInput, TInput, TContext> {
    const normalized: AiPipelineInitOptions<TContext> =
      typeof options === "string" ? { name: options } : options;
    return new AiPipeline<TInput, TInput, TContext>(normalized);
  }

  // Returns an immutable copy of the pipeline with the new step appended
  private cloneWithStep<TNext>(
    node: InternalStepNode<TContext>,
  ): AiPipeline<TInput, TNext, TContext> {
    return new AiPipeline<TInput, TNext, TContext>(
      {
        name: this.pipelineName,
        ollama: this.ollama,
        hooks: this.hooks,
        defaultContext: this.defaultContextFactory,
      },
      [...this.steps, node],
      this.fallbackHandler as unknown as (
        error: Error,
        initialInput: TInput,
        ctx: AiPipelineExecutionContext<TContext>,
      ) => TNext | Promise<TNext>,
    );
  }

  // Registers a single-handler step (preprocess, transform, validate, or postprocess)
  private addTransformStep<TNext>(
    kind: Extract<
      AiPipelineStepKind,
      "preprocess" | "transform" | "validate" | "postprocess"
    >,
    name: string,
    handler: StepHandler<TCurrent, TNext, TContext>,
    options: AiPipelineStepOptions = {},
  ): AiPipeline<TInput, TNext, TContext> {
    return this.cloneWithStep<TNext>({
      name,
      kind,
      options,
      run: async (rawInput, ctx) => ({
        output: await handler(rawInput as TCurrent, ctx),
      }),
    });
  }

  // Resolves model, fallback models, and prompts/messages for both llmChat and llmStructured
  private async resolveLlmInputs(
    config: AiPipelineLlmBaseConfig<TCurrent, TContext>,
    input: TCurrent,
    ctx: AiPipelineExecutionContext<TContext>,
  ): Promise<{
    model?: string;
    fallbackModels?: string[];
    messages?: OllamaMessage[];
    systemPrompt?: string;
    userPrompt?: string;
  }> {
    const model =
      typeof config.model === "function"
        ? config.model(input, ctx)
        : config.model;
    const fallbackModels =
      typeof config.fallbackModels === "function"
        ? config.fallbackModels(input, ctx)
        : config.fallbackModels;

    if (config.messages) {
      return {
        model,
        fallbackModels,
        messages: await config.messages(input, ctx),
      };
    }

    const systemPrompt = config.systemPrompt
      ? typeof config.systemPrompt === "function"
        ? await config.systemPrompt(input, ctx)
        : config.systemPrompt
      : undefined;

    const userPrompt =
      typeof config.userPrompt === "function"
        ? await config.userPrompt(input, ctx)
        : (config.userPrompt ??
          (typeof input === "string" ? input : JSON.stringify(input)));

    return { model, fallbackModels, systemPrompt, userPrompt };
  }

  /**
   * Add a pre-condition guard step. If `predicate` returns false, the pipeline short-circuits
   * immediately and returns `onShortCircuit(input, ctx)` as the final pipeline output without
   * invoking downstream LLM steps.
   */
  guard<TShortCircuit = unknown>(
    name: string,
    predicate: StepHandler<TCurrent, boolean, TContext>,
    onShortCircuit: StepHandler<TCurrent, TShortCircuit, TContext>,
  ): AiPipeline<TInput, TCurrent, TContext> {
    return this.cloneWithStep<TCurrent>({
      name,
      kind: "guard",
      options: {},
      run: async (rawInput, ctx) => {
        const input = rawInput as TCurrent;
        const passed = await predicate(input, ctx);
        if (!passed) {
          const shortCircuitOutput = await onShortCircuit(input, ctx);
          throw new PipelineShortCircuitSignal(
            shortCircuitOutput,
            `Guard "${name}" triggered`,
          );
        }
        return { output: input };
      },
    });
  }

  /**
   * Add a context preparation / preprocessing step (e.g., chunk formatting, token truncation).
   */
  preprocess<TNext>(
    name: string,
    handler: StepHandler<TCurrent, TNext, TContext>,
    options: AiPipelineStepOptions = {},
  ): AiPipeline<TInput, TNext, TContext> {
    return this.addTransformStep("preprocess", name, handler, options);
  }

  /**
   * Add a general transformation or business-logic step.
   */
  step<TNext>(
    name: string,
    handler: StepHandler<TCurrent, TNext, TContext>,
    options: AiPipelineStepOptions = {},
  ): AiPipeline<TInput, TNext, TContext> {
    return this.addTransformStep("transform", name, handler, options);
  }

  /**
   * Add a declarative Ollama chat completion step with multi-model fallback support.
   */
  llmChat(
    name: string,
    config: AiPipelineLlmChatConfig<TCurrent, TContext>,
    options: AiPipelineStepOptions = {},
  ): AiPipeline<TInput, AiPipelineLlmChatOutput<TCurrent>, TContext> {
    return this.cloneWithStep<AiPipelineLlmChatOutput<TCurrent>>({
      name,
      kind: "llm_chat",
      options,
      run: async (rawInput, ctx) => {
        const input = rawInput as TCurrent;
        const resolved = await this.resolveLlmInputs(config, input, ctx);

        const messages: OllamaMessage[] = resolved.messages ?? [
          ...(resolved.systemPrompt
            ? [{ role: "system" as const, content: resolved.systemPrompt }]
            : []),
          { role: "user" as const, content: resolved.userPrompt ?? "" },
        ];

        // Execute chat completion with automatic model fallback
        const res = await ctx.ollama.chatWithFallback({
          model: resolved.model,
          fallbackModels: resolved.fallbackModels,
          messages,
          temperature: config.temperature,
          options: config.options,
          format: config.format,
          think: config.think,
          timeoutMs: config.timeoutMs ?? options.timeoutMs,
          keepAlive: config.keepAlive,
        });

        if (!res.ok) {
          for (const w of res.warnings) ctx.addWarning(w);
          throw new Error(res.error || `LLM chat step "${name}" failed`);
        }

        return {
          output: {
            input,
            content: res.content,
            thinking: res.thinking,
            model: res.model,
            attemptedModels: res.attemptedModels,
            metrics: res.metrics,
            raw: res.raw,
          },
          modelUsed: res.model,
          metrics: res.metrics,
          stepWarnings: res.warnings,
        };
      },
    });
  }

  /**
   * Add a declarative structured JSON extraction step using OllamaService.generateJson.
   * Includes automatic JSON extraction, schema validation, self-repair retries, and model fallbacks.
   */
  llmStructured<TSchema>(
    name: string,
    config: AiPipelineLlmStructuredConfig<TCurrent, TSchema, TContext>,
    options: AiPipelineStepOptions = {},
  ): AiPipeline<
    TInput,
    AiPipelineLlmStructuredOutput<TCurrent, TSchema>,
    TContext
  > {
    return this.cloneWithStep<AiPipelineLlmStructuredOutput<TCurrent, TSchema>>(
      {
        name,
        kind: "llm_structured",
        options,
        run: async (rawInput, ctx) => {
          const input = rawInput as TCurrent;
          const resolved = await this.resolveLlmInputs(config, input, ctx);

          // Execute structured JSON extraction with schema validation and self-repair
          const res = await ctx.ollama.generateJson<TSchema>({
            model: resolved.model,
            fallbackModels: resolved.fallbackModels,
            messages: resolved.messages,
            systemPrompt: resolved.systemPrompt,
            prompt: resolved.userPrompt,
            schema: config.schema,
            validate: config.validate
              ? (parsed) => config.validate!(parsed, input, ctx)
              : undefined,
            temperature: config.temperature ?? 0.1,
            options: config.options,
            think: config.think,
            timeoutMs: config.timeoutMs ?? options.timeoutMs,
            maxRepairAttempts: config.maxRepairAttempts ?? 1,
            keepAlive: config.keepAlive,
          });

          if (!res.ok || res.data === undefined) {
            for (const w of res.warnings) ctx.addWarning(w);
            throw new Error(
              res.error || `LLM structured step "${name}" failed`,
            );
          }

          return {
            output: {
              input,
              data: res.data,
              rawContent: res.rawContent || "",
              thinking: res.thinking,
              model: res.model,
              attemptedModels: res.attemptedModels,
              repairAttempts: res.repairAttempts,
              metrics: res.metrics,
              raw: res.raw,
            },
            modelUsed: res.model,
            metrics: res.metrics,
            stepWarnings: res.warnings,
          };
        },
      },
    );
  }

  /**
   * Add a deterministic validation or citation-verification step.
   */
  validate<TNext = TCurrent>(
    name: string,
    validator: StepHandler<TCurrent, TNext, TContext>,
    options: AiPipelineStepOptions = {},
  ): AiPipeline<TInput, TNext, TContext> {
    return this.addTransformStep("validate", name, validator, options);
  }

  /**
   * Add a final post-processing / formatting step.
   */
  postprocess<TNext>(
    name: string,
    handler: StepHandler<TCurrent, TNext, TContext>,
    options: AiPipelineStepOptions = {},
  ): AiPipeline<TInput, TNext, TContext> {
    return this.addTransformStep("postprocess", name, handler, options);
  }

  /**
   * Add a conditional branch step that routes execution to `onTrue` or `onFalse`.
   */
  branch<TNext>(
    name: string,
    condition: StepHandler<TCurrent, boolean, TContext>,
    onTrue: StepHandler<TCurrent, TNext, TContext>,
    onFalse: StepHandler<TCurrent, TNext, TContext>,
    options: AiPipelineStepOptions = {},
  ): AiPipeline<TInput, TNext, TContext> {
    return this.cloneWithStep<TNext>({
      name,
      kind: "branch",
      options,
      run: async (rawInput, ctx) => {
        const input = rawInput as TCurrent;
        const matched = await condition(input, ctx);
        const output = matched
          ? await onTrue(input, ctx)
          : await onFalse(input, ctx);
        return { output };
      },
    });
  }

  /**
   * Execute multiple branches in parallel on the current input and return their tuple/array of outputs.
   */
  parallel<TOutputs extends readonly unknown[]>(
    name: string,
    tasks: {
      [K in keyof TOutputs]: StepHandler<TCurrent, TOutputs[K], TContext>;
    },
    options: AiPipelineStepOptions = {},
  ): AiPipeline<TInput, TOutputs, TContext> {
    return this.cloneWithStep<TOutputs>({
      name,
      kind: "parallel",
      options,
      run: async (rawInput, ctx) => {
        const input = rawInput as TCurrent;
        const results = await Promise.all(
          tasks.map((task) => task(input, ctx)),
        );
        return { output: results as unknown as TOutputs };
      },
    });
  }

  /**
   * Register a graceful fallback handler that produces a safe default output
   * when any unrecoverable step error occurs.
   */
  withFallback(
    handler: (
      error: Error,
      initialInput: TInput,
      ctx: AiPipelineExecutionContext<TContext>,
    ) => TCurrent | Promise<TCurrent>,
  ): AiPipeline<TInput, TCurrent, TContext> {
    return new AiPipeline<TInput, TCurrent, TContext>(
      {
        name: this.pipelineName,
        ollama: this.ollama,
        hooks: this.hooks,
        defaultContext: this.defaultContextFactory,
      },
      [...this.steps],
      handler,
    );
  }

  /**
   * Execute the pipeline end-to-end for a given input and optional initial context state.
   */
  async execute(
    initialInput: TInput,
    initialContext?: TContext,
  ): Promise<AiPipelineResult<TCurrent, TContext>> {
    const pipelineStart = Date.now();

    // Initialize shared mutable context, telemetry accumulators, and token counters
    const state: TContext =
      initialContext ??
      (this.defaultContextFactory
        ? this.defaultContextFactory()
        : ({} as TContext));

    const traces: AiPipelineStepTrace[] = [];
    const warnings: string[] = [];
    const modelsUsed = new Set<string>();
    const tokens = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };

    const ctx: AiPipelineExecutionContext<TContext> = {
      pipelineName: this.pipelineName,
      ollama: this.ollama,
      state,
      traces,
      warnings,
      modelsUsed,
      tokens,
      addWarning: (warning: string) => {
        if (warning && !warnings.includes(warning)) {
          warnings.push(warning);
        }
      },
      recordMetrics: (model?: string, metrics?: OllamaExecutionMetrics) => {
        if (model) modelsUsed.add(model);
        if (metrics) {
          const p = metrics.promptEvalCount ?? 0;
          const c = metrics.evalCount ?? 0;
          tokens.promptTokens += p;
          tokens.completionTokens += c;
          tokens.totalTokens += p + c;
        }
      },
    };

    let current: unknown = initialInput;

    const createStepTrace = (
      stepNode: InternalStepNode<TContext>,
      stepStart: number,
      attempts: number,
      status: AiPipelineStepTrace["status"],
      extra: Partial<
        Pick<
          AiPipelineStepTrace,
          "modelUsed" | "metrics" | "warnings" | "error"
        >
      > = {},
    ): AiPipelineStepTrace => {
      const trace: AiPipelineStepTrace = {
        step: stepNode.name,
        kind: stepNode.kind,
        status,
        durationMs: Date.now() - stepStart,
        attempts,
        warnings: extra.warnings ?? [],
        timestamp: new Date().toISOString(),
        ...(extra.modelUsed !== undefined ? { modelUsed: extra.modelUsed } : {}),
        ...(extra.metrics !== undefined ? { metrics: extra.metrics } : {}),
        ...(extra.error !== undefined ? { error: extra.error } : {}),
      };
      traces.push(trace);
      return trace;
    };

    const finalizeResult = async (
      status: AiPipelineResult<TCurrent, TContext>["status"],
      output: TCurrent,
      error?: string,
    ): Promise<AiPipelineResult<TCurrent, TContext>> => {
      const result: AiPipelineResult<TCurrent, TContext> = {
        ok: status === "ok" || status === "short_circuited",
        status,
        pipelineName: this.pipelineName,
        output,
        context: state,
        steps: traces,
        totalDurationMs: Date.now() - pipelineStart,
        modelsUsed: Array.from(modelsUsed),
        totalTokens: { ...tokens },
        warnings: [...warnings],
        ...(error !== undefined ? { error } : {}),
      };
      await this.hooks.onPipelineComplete?.(result);
      return result;
    };

    try {
      for (const stepNode of this.steps) {
        const stepStart = Date.now();
        const maxRetries = Math.max(0, stepNode.options.retries ?? 0);
        const retryDelayMs = Math.max(0, stepNode.options.retryDelayMs ?? 250);
        let attempts = 0;
        let lastStepError: Error | undefined;

        await this.hooks.onStepStart?.({
          pipelineName: this.pipelineName,
          step: stepNode.name,
          kind: stepNode.kind,
          context: state,
        });

        let stepSucceeded = false;

        // Attempt step execution with optional exponential backoff retries
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          attempts = attempt + 1;
          try {
            const stepResult = await withTimeout(
              stepNode.run(current, ctx),
              stepNode.options.timeoutMs,
              stepNode.name,
            );

            // Advance pipeline payload and aggregate step metrics/warnings
            current = stepResult.output;
            ctx.recordMetrics(stepResult.modelUsed, stepResult.metrics);
            const stepWarnings = stepResult.stepWarnings ?? [];
            for (const w of stepWarnings) ctx.addWarning(w);

            const trace = createStepTrace(stepNode, stepStart, attempts, "ok", {
              modelUsed: stepResult.modelUsed,
              metrics: stepResult.metrics,
              warnings: stepWarnings,
            });
            await this.hooks.onStepComplete?.(trace, state);
            stepSucceeded = true;
            break;
          } catch (err) {
            // Guard short-circuit: return early with the guard's output
            if (err instanceof PipelineShortCircuitSignal) {
              const trace = createStepTrace(
                stepNode,
                stepStart,
                attempts,
                "short_circuited",
                { warnings: err.reason ? [err.reason] : [] },
              );
              await this.hooks.onStepComplete?.(trace, state);
              return finalizeResult(
                "short_circuited",
                err.output as TCurrent,
              );
            }

            lastStepError = err instanceof Error ? err : new Error(String(err));
            const canRetry =
              attempt < maxRetries &&
              (stepNode.options.shouldRetry
                ? stepNode.options.shouldRetry(lastStepError, attempts)
                : true);
            if (canRetry) {
              await sleep(retryDelayMs * Math.pow(2, attempt));
            }
          }
        }

        // Handle step failure after all retry attempts are exhausted
        if (!stepSucceeded && lastStepError) {
          // Optional steps are skipped with a warning instead of failing the pipeline
          if (stepNode.options.optional) {
            const warningMsg = `Optional step "${stepNode.name}" skipped after error: ${lastStepError.message}`;
            ctx.addWarning(warningMsg);
            const trace = createStepTrace(
              stepNode,
              stepStart,
              attempts,
              "skipped",
              { warnings: [warningMsg], error: lastStepError.message },
            );
            await this.hooks.onStepComplete?.(trace, state);
            continue;
          }

          const errorTrace = createStepTrace(
            stepNode,
            stepStart,
            attempts,
            "error",
            { error: lastStepError.message },
          );
          await this.hooks.onStepError?.(errorTrace, lastStepError, state);
          throw lastStepError;
        }
      }

      return finalizeResult("ok", current as TCurrent);
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));

      // Invoke registered fallback handler for graceful degradation when available
      if (this.fallbackHandler) {
        const fallbackOutput = await this.fallbackHandler(
          errorObj,
          initialInput,
          ctx,
        );
        return finalizeResult("fallback", fallbackOutput, errorObj.message);
      }

      return finalizeResult(
        "error",
        undefined as unknown as TCurrent,
        errorObj.message,
      );
    }
  }
}
