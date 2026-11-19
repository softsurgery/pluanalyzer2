import { AiPipeline } from "@/services/ai-pipeline/AiPipeline";
import type { OllamaService } from "@/services/ollama/OllamaService";
import type {
  AiPipelineExecutionContext,
  AiPipelineHooks,
  AiPipelineLlmStructuredConfig,
} from "@/types/ai-pipeline";

export interface StructuredExtractionPipelineConfig<
  TInput,
  TExtracted,
  TOutput = TExtracted,
  TContext = Record<string, unknown>,
> extends Omit<
    AiPipelineLlmStructuredConfig<TInput, TExtracted, TContext>,
    "messages"
  > {
  name: string;
  ollama?: OllamaService;
  hooks?: AiPipelineHooks<TContext>;
  guard?: {
    predicate: (
      input: TInput,
      ctx: AiPipelineExecutionContext<TContext>,
    ) => boolean | Promise<boolean>;
    onShortCircuit: (
      input: TInput,
      ctx: AiPipelineExecutionContext<TContext>,
    ) => TOutput | Promise<TOutput>;
  };
  formatOutput: (
    params: {
      input: TInput;
      extracted: TExtracted;
      model: string;
      rawContent: string;
      thinking?: string;
      raw?: unknown;
    },
    ctx: AiPipelineExecutionContext<TContext>,
  ) => TOutput | Promise<TOutput>;
  onFallback?: (
    error: Error,
    input: TInput,
    ctx: AiPipelineExecutionContext<TContext>,
  ) => TOutput | Promise<TOutput>;
}

/**
 * Factory for the standard Guard -> Prompt Context -> LLM Structured Extraction -> Post-Format pipeline pattern.
 */
export function createStructuredExtractionPipeline<
  TInput,
  TExtracted,
  TOutput = TExtracted,
  TContext = Record<string, unknown>,
>(
  config: StructuredExtractionPipelineConfig<
    TInput,
    TExtracted,
    TOutput,
    TContext
  >,
): AiPipeline<TInput, TOutput, TContext> {
  let pipeline = AiPipeline.create<TInput, TContext>({
    name: config.name,
    ollama: config.ollama,
    hooks: config.hooks,
  });

  if (config.guard) {
    pipeline = pipeline.guard(
      "check_preconditions",
      config.guard.predicate,
      config.guard.onShortCircuit,
    );
  }

  let extractedPipeline = pipeline
    .llmStructured<TExtracted>(
      "extract_structured_json",
      {
        model: config.model,
        fallbackModels: config.fallbackModels,
        systemPrompt: config.systemPrompt,
        userPrompt: config.userPrompt,
        schema: config.schema,
        validate: config.validate,
        temperature: config.temperature ?? 0.1,
        options: config.options,
        timeoutMs: config.timeoutMs,
        maxRepairAttempts: config.maxRepairAttempts ?? 1,
      },
      { timeoutMs: config.timeoutMs },
    )
    .postprocess("format_output", async (llmOut, ctx) =>
      config.formatOutput(
        {
          input: llmOut.input,
          extracted: llmOut.data,
          model: llmOut.model,
          rawContent: llmOut.rawContent,
          thinking: llmOut.thinking,
          raw: llmOut.raw,
        },
        ctx,
      ),
    );

  if (config.onFallback) {
    extractedPipeline = extractedPipeline.withFallback(config.onFallback);
  }

  return extractedPipeline;
}

export interface MapReducePipelineConfig<
  TInput,
  TChunk,
  TChunkOutput,
  TFinalOutput,
  TContext = Record<string, unknown>,
> {
  name: string;
  ollama?: OllamaService;
  hooks?: AiPipelineHooks<TContext>;
  splitChunks: (
    input: TInput,
    ctx: AiPipelineExecutionContext<TContext>,
  ) => TChunk[] | Promise<TChunk[]>;
  mapChunk: (
    chunk: TChunk,
    index: number,
    ctx: AiPipelineExecutionContext<TContext>,
  ) => Promise<TChunkOutput>;
  reduceResults: (
    mapped: TChunkOutput[],
    originalInput: TInput,
    ctx: AiPipelineExecutionContext<TContext>,
  ) => Promise<TFinalOutput>;
}

/**
 * Factory for a Map-Reduce AI pipeline that splits large inputs into chunks, processes each chunk,
 * and synthesizes the results into a single final output.
 */
export function createMapReducePipeline<
  TInput,
  TChunk,
  TChunkOutput,
  TFinalOutput,
  TContext = Record<string, unknown>,
>(
  config: MapReducePipelineConfig<
    TInput,
    TChunk,
    TChunkOutput,
    TFinalOutput,
    TContext
  >,
): AiPipeline<TInput, TFinalOutput, TContext> {
  return AiPipeline.create<TInput, TContext>({
    name: config.name,
    ollama: config.ollama,
    hooks: config.hooks,
  })
    .preprocess("split_chunks", async (input, ctx) => {
      const chunks = await config.splitChunks(input, ctx);
      return { input, chunks };
    })
    .step("map_chunks", async ({ input, chunks }, ctx) => {
      const mapped: TChunkOutput[] = [];
      for (let i = 0; i < chunks.length; i++) {
        mapped.push(await config.mapChunk(chunks[i], i, ctx));
      }
      return { input, mapped };
    })
    .postprocess("reduce_results", async ({ input, mapped }, ctx) =>
      config.reduceResults(mapped, input, ctx),
    );
}

export interface CritiqueRefinePipelineConfig<
  TInput,
  TDraft,
  TFinalOutput = TDraft,
  TContext = Record<string, unknown>,
> {
  name: string;
  ollama?: OllamaService;
  hooks?: AiPipelineHooks<TContext>;
  generateDraft: (
    input: TInput,
    ctx: AiPipelineExecutionContext<TContext>,
  ) => Promise<TDraft>;
  critiqueDraft: (
    draft: TDraft,
    input: TInput,
    ctx: AiPipelineExecutionContext<TContext>,
  ) => Promise<{ approved: boolean; critiqueIssues: string[] }>;
  refineDraft: (
    draft: TDraft,
    critiqueIssues: string[],
    input: TInput,
    ctx: AiPipelineExecutionContext<TContext>,
  ) => Promise<TFinalOutput>;
  finalizeApproved?: (
    draft: TDraft,
    input: TInput,
    ctx: AiPipelineExecutionContext<TContext>,
  ) => TFinalOutput | Promise<TFinalOutput>;
}

/**
 * Factory for a Draft -> Critique -> Refine AI pipeline pattern.
 */
export function createCritiqueRefinePipeline<
  TInput,
  TDraft,
  TFinalOutput = TDraft,
  TContext = Record<string, unknown>,
>(
  config: CritiqueRefinePipelineConfig<TInput, TDraft, TFinalOutput, TContext>,
): AiPipeline<TInput, TFinalOutput, TContext> {
  return AiPipeline.create<TInput, TContext>({
    name: config.name,
    ollama: config.ollama,
    hooks: config.hooks,
  })
    .step("generate_draft", async (input, ctx) => {
      const draft = await config.generateDraft(input, ctx);
      return { input, draft };
    })
    .validate("critique_draft", async ({ input, draft }, ctx) => {
      const critique = await config.critiqueDraft(draft, input, ctx);
      for (const issue of critique.critiqueIssues) {
        ctx.addWarning(`Critique: ${issue}`);
      }
      return { input, draft, ...critique };
    })
    .branch(
      "refine_or_approve",
      ({ approved }) => approved,
      async ({ input, draft }, ctx) =>
        config.finalizeApproved
          ? config.finalizeApproved(draft, input, ctx)
          : (draft as unknown as TFinalOutput),
      async ({ input, draft, critiqueIssues }, ctx) =>
        config.refineDraft(draft, critiqueIssues, input, ctx),
    );
}
