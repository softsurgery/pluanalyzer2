# AI Pipeline Concepts & Abstraction Guide

This document explains **how AI pipelines generally work** using the two-layer abstraction in PLU Analyzer (`OllamaService` + `AiPipeline`), and defines the **AI keywords and concepts** used throughout the codebase.

---

## 1. How an AI Pipeline Works (General Concept)

Calling an LLM (Large Language Model) in a production app is rarely a single API call. Raw LLM responses can be slow, unstructured, too long, or occasionally invalid JSON.

An **AI Pipeline** solves this by turning an AI task into a **predictable, multi-step workflow**—just like a data processing pipeline:

```text
Input Data
  │
  ▼
1. Guard          ──► Should we even call the AI? (If not, stop early.)
  │
  ▼
2. Preprocess     ──► Clean, format, and trim text to fit the model's limits.
  │
  ▼
3. LLM Step       ──► Send prompt to OllamaService (with fallback models & JSON repair).
  │
  ▼
4. Validate       ──► Check the AI output with deterministic code (types, ranges, rules).
  │
  ▼
5. Postprocess    ──► Format the final result & attach citations/warnings.
  │
  ▼
(Fallback)        ──► If anything fails, return a safe default instead of crashing.
```

### How Our Two-Layer Abstraction Splits Responsibilities

1. **Layer 1 — `OllamaService` ([`src/services/ollama/OllamaService.ts`](../src/services/ollama/OllamaService.ts))**
   - **What it does**: Handles *talking to the AI model* over HTTP (`https://ollama.com`).
   - **Why it exists**: Hides low-level details like Bearer token authentication, timeouts, stripping `<think>` reasoning blocks, extracting/repairing broken JSON, and switching to backup models if the primary model fails.

2. **Layer 2 — `AiPipeline` ([`src/services/ai-pipeline/AiPipeline.ts`](../src/services/ai-pipeline/AiPipeline.ts))**
   - **What it does**: Handles *orchestrating the workflow* around the AI call.
   - **Why it exists**: Lets you chain steps (`.guard()`, `.preprocess()`, `.llmStructured()`, `.validate()`, `.postprocess()`, `.withFallback()`) while automatically tracking execution time, token usage, warnings, retries, and step-by-step traces.

---

## 2. Common Pipeline Patterns (Presets)

In [`src/services/ai-pipeline/presets.ts`](../src/services/ai-pipeline/presets.ts), the framework provides three classic AI engineering patterns out of the box:

| Pattern | Function | How It Works | Best Used For |
| :--- | :--- | :--- | :--- |
| **Structured Extraction** | `createStructuredExtractionPipeline` | `Guard → Prompt → JSON LLM → Format → Fallback` | Turning unstructured text (like PLU PDF articles) into strict typed JSON objects. |
| **Map-Reduce** | `createMapReducePipeline` | Split big text into chunks → run LLM on each chunk (`map`) → combine all chunk results (`reduce`) | Analyzing documents that are too large to fit into a single prompt. |
| **Critique-Refine** | `createCritiqueRefinePipeline` | Generate a first draft → critique/check it → if not good enough, ask the AI to fix it | Improving accuracy on complex reasoning or writing tasks. |

---

## 3. Glossary of AI Keywords & Concepts Used in This Codebase

### Core Model Concepts

- **LLM (Large Language Model)**
  An AI model trained on massive text data to understand and generate language (e.g., `gpt-oss:20b`, `gemma4:31b`, `mistral-large-4`, `deepseek-v4.1-flash`).

- **Prompt (System Prompt vs. User Prompt)**
  - **System Prompt**: High-level instructions defining the AI's role, rules, and output format (e.g., *"You are a French urban planning expert. Return only JSON."*).
  - **User Prompt**: The specific task and input data for this request (e.g., the parcel details and PLU articles).

- **Messages Array (`OllamaMessage[]`)**
  The conversation format sent to `/api/chat`, consisting of `{ role: "system" | "user" | "assistant" | "tool", content: "..." }`.

- **Tokens & Tokenization**
  LLMs do not read words; they read **tokens** (roughly ~3–4 characters or ~0.75 words per token).
  - **Prompt / Input Tokens (`promptEvalCount`)**: Tokens in the text you send *to* the model.
  - **Completion / Output Tokens (`evalCount`)**: Tokens the model generates *back* to you.
  - Cloud APIs bill and rate-limit based on input + output tokens.

- **Context Window (`num_ctx`) & Token Budget**
  The maximum number of tokens a model can hold in memory at once (prompt + response combined).
  `PromptBuilder` and `truncateToTokenBudget` trim long PLU documents so they don't overflow the model's context window.

### Controlling AI Behavior

- **Temperature (`temperature`)**
  A number (typically `0.0` to `1.0+`) controlling randomness:
  - **Low (`0.0` – `0.2`)**: Deterministic, factual, consistent. Used in PLU extraction so the model doesn't invent rules.
  - **High (`0.7` – `1.0`)**: Creative, varied. Useful for brainstorming, bad for legal/regulatory extraction.

- **Structured Output / JSON Mode (`format: "json"` / `schema`)**
  Forces the model to reply with valid JSON matching an expected structure rather than free-form prose, making it safe for TypeScript code to parse and use.

- **JSON Self-Repair (`maxRepairAttempts`)**
  If the model outputs malformed JSON (e.g., missing a closing brace or trailing comma), `OllamaService.generateJson()` catches the parse error and automatically sends a follow-up prompt asking the model to fix its own JSON.

- **Reasoning / Thinking Tags (`<think>...</think>`)**
  Reasoning models (like `gpt-oss`, `deepseek`, `kimi`) often output internal step-by-step reasoning inside `<think>...</think>` tags or a separate `thinking` field. `OllamaService.stripThinkingTags()` separates that reasoning into `result.thinking` so `result.content` stays clean.

### Reliability & Orchestration Concepts

- **Guard / Short-Circuit (`.guard()`)**
  A deterministic check before calling the AI. For example, if there are `0` PLU articles to analyze, the pipeline **short-circuits** immediately instead of wasting tokens or risking hallucinations.

- **Model Fallback (`fallbackModels`)**
  An ordered backup list of models. If the primary model times out, is unavailable, or fails validation, `OllamaService` automatically retries with the next model in `fallbackModels`.

- **Retries with Exponential Backoff (`retries`, `retryDelayMs`)**
  If a step fails due to a temporary network glitch, `AiPipeline` waits `retryDelayMs * 2^attempt` milliseconds before trying again.

- **Graceful Fallback (`.withFallback()`)**
  A safety net at the end of a pipeline. If every model and retry fails, `.withFallback()` returns a safe default output (e.g., stored deterministic rules) so the user still gets a working response.

- **Telemetry & Step Trace (`AiPipelineStepTrace`)**
  A structured log of every step in a pipeline run: step name, status (`ok`, `skipped`, `short_circuited`, `error`), duration in milliseconds, attempts, model used, and token counts.

### Search & Similarity Concepts

- **Embeddings (`embed()`)**
  Converting text into a list of numbers (a vector) that captures its *meaning* rather than exact keywords.

- **Cosine Similarity (`cosineSimilarity()`)**
  A math formula (returning `-1` to `1`) that measures how similar two embedding vectors are—used for semantic search or matching relevant text chunks.

- **Tokens per Second (`tokensPerSecond`) & Latency (`totalDurationMs`)**
  Performance metrics measuring how fast the model responds (`evalCount / evalDurationSeconds`) and total round-trip time.

---

## 4. Putting It Together: Example Flow

When you run a PLU feasibility analysis in this app:
1. [`src/services/plu/pipeline.ts`](../src/services/plu/pipeline.ts) selects the primary model (default `gpt-oss:20b`) and builds `fallbackModels` from the active `ai-models` in PostgreSQL.
2. [`src/services/plu/ollama-interpreter.ts`](../src/services/plu/ollama-interpreter.ts) runs `createStructuredExtractionPipeline`:
   - **Guard**: Checks that `OLLAMA_DISABLED` is not `true` and at least 1 PLU article exists.
   - **Preprocess**: Formats the PLU articles within a token budget using `PromptBuilder`.
   - **LLM Structured**: Calls `OllamaService.generateJson()` against `https://ollama.com` with JSON validation and self-repair.
   - **Postprocess**: Merges AI-extracted rules with deterministic rules and returns citations + warnings.
3. The final `AiPipelineResult` includes both the extracted data and full observability (`modelsUsed`, `totalTokens`, `totalDurationMs`, and `steps`).
