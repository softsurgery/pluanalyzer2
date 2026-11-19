import { OllamaService } from "@/services/ollama/OllamaService";

/**
 * Reusable string template supporting `{{variable}}` interpolation.
 */
export class PromptTemplate<
  TVars extends Record<string, string | number | boolean | null | undefined> =
    Record<string, string | number | boolean | null | undefined>,
> {
  private readonly template: string;
  private readonly defaults: Partial<TVars>;

  constructor(template: string, defaults: Partial<TVars> = {}) {
    this.template = template;
    this.defaults = defaults;
  }

  static from<
    TVars extends Record<string, string | number | boolean | null | undefined> =
      Record<string, string | number | boolean | null | undefined>,
  >(
    template: string | string[],
    defaults: Partial<TVars> = {},
  ): PromptTemplate<TVars> {
    const joined = Array.isArray(template) ? template.join("\n") : template;
    return new PromptTemplate<TVars>(joined, defaults);
  }

  render(vars: TVars): string {
    const merged = { ...this.defaults, ...vars };
    return this.template.replace(
      /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g,
      (_match, key: string) => {
        const value = merged[key as keyof TVars];
        if (value === null || value === undefined) return "";
        return String(value);
      },
    );
  }
}

export interface ContextChunkItem {
  id?: string;
  title?: string;
  content: string;
  metadata?: Record<string, string | number | undefined>;
}

export interface FormatContextOptions {
  maxChars?: number;
  maxTokens?: number;
  headerPrefix?: string;
}

/**
 * Formats an array of retrieved documents or regulatory articles into a bounded context block.
 */
export function formatContextChunks(
  items: ContextChunkItem[],
  options: FormatContextOptions = {},
): string {
  const prefix = options.headerPrefix ?? "###";
  const joined = items
    .map((item, idx) => {
      const idLabel = item.id || `Chunk ${idx + 1}`;
      const titleSuffix = item.title ? ` (${item.title})` : "";
      const metaEntries = item.metadata
        ? Object.entries(item.metadata)
            .filter(([, v]) => v !== undefined && v !== "")
            .map(([k, v]) => `${k}=${v}`)
            .join(", ")
        : "";
      const metaSuffix = metaEntries ? ` [${metaEntries}]` : "";
      return `${prefix} ${idLabel}${titleSuffix}${metaSuffix}\n${item.content}`;
    })
    .join("\n\n");

  let bounded = joined;
  if (typeof options.maxTokens === "number" && options.maxTokens > 0) {
    bounded = OllamaService.truncateToTokenBudget(bounded, options.maxTokens);
  }
  if (
    typeof options.maxChars === "number" &&
    options.maxChars > 0 &&
    bounded.length > options.maxChars
  ) {
    bounded = bounded.slice(0, options.maxChars);
  }
  return bounded;
}

/**
 * Fluent builder for crafting structured, deterministic system and user prompts.
 */
export class PromptBuilder {
  private readonly blocks: string[] = [];

  static create(): PromptBuilder {
    return new PromptBuilder();
  }

  /**
   * Add a role / persona header block.
   */
  role(title: string, lines: string | string[]): this {
    return this.section(title, lines);
  }

  /**
   * Add a titled section (`=== TITLE ===`) followed by one or more lines.
   */
  section(title: string, lines: string | string[]): this {
    const body = Array.isArray(lines) ? lines.join("\n") : lines;
    this.blocks.push(`=== ${title} ===\n${body}`);
    return this;
  }

  /**
   * Add a numbered or bulleted list of strict rules or constraints under a section title.
   */
  constraints(
    title: string,
    items: string[],
    options: { numbered?: boolean; intro?: string } = {},
  ): this {
    const numbered = options.numbered ?? true;
    const formattedItems = items.map((item, idx) =>
      numbered ? `${idx + 1}. ${item}` : `- ${item}`,
    );
    const lines = options.intro
      ? [options.intro, ...formattedItems]
      : formattedItems;
    return this.section(title, lines);
  }

  /**
   * Add negative/positive demonstration examples (`✗` vs `✓`).
   */
  examples(
    title: string,
    entries: { forbidden?: string[]; allowed?: string[] },
  ): this {
    const lines: string[] = [];
    for (const item of entries.forbidden || []) {
      lines.push(`✗ ${item}`);
    }
    for (const item of entries.allowed || []) {
      lines.push(`✓ ${item}`);
    }
    return this.section(title, lines);
  }

  /**
   * Append a context block with optional token budget truncation.
   */
  contextBlock(title: string, content: string, maxTokens?: number): this {
    const bounded =
      typeof maxTokens === "number" && maxTokens > 0
        ? OllamaService.truncateToTokenBudget(content, maxTokens)
        : content;
    this.blocks.push(`${title}:\n${bounded}`);
    return this;
  }

  /**
   * Append strict JSON output contract instructions and an optional shape example.
   */
  outputJsonContract(
    instructions: string | string[],
    example?: string | Record<string, unknown>,
  ): this {
    const lines = Array.isArray(instructions)
      ? [...instructions]
      : [instructions];
    if (example !== undefined) {
      const serialized =
        typeof example === "string"
          ? example
          : JSON.stringify(example, null, 2);
      lines.push(serialized);
    }
    return this.section("SORTIE", lines);
  }

  /**
   * Append raw text lines directly.
   */
  raw(lines: string | string[]): this {
    this.blocks.push(Array.isArray(lines) ? lines.join("\n") : lines);
    return this;
  }

  /**
   * Compile all blocks into the final prompt string.
   */
  build(separator = "\n\n"): string {
    return this.blocks.filter(Boolean).join(separator);
  }
}
