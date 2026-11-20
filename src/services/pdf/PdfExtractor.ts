import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  DEFAULT_MISTRAL_OCR_MODEL,
  DEFAULT_OCR_COMMAND,
  DEFAULT_OCR_LANGUAGE,
  DEFAULT_OCR_TIMEOUT_MS,
  DEFAULT_PAGE_WINDOW_AFTER,
  DEFAULT_PAGE_WINDOW_BEFORE,
  DEFAULT_PDFTOTEXT_COMMAND,
  DEFAULT_PDFTOTEXT_TIMEOUT_MS,
  MIN_DIGITAL_TEXT_CHARS,
  STRUCTURAL_LINE_START,
} from "@/services/pdf/constants";
import { PdfContentMapper } from "@/services/pdf/PdfContentMapper";
import type {
  ContentMapOptions,
  ExtractedArticle,
  PDFExtractionResult,
  PdfOcrOptions,
  PdfPageInput,
  PdfPageRangeOptions,
  PdfParsePageData,
  PdfParseResult,
  PdfParsedDocument,
  PdfTextEngine,
  PluContentMap,
} from "@/types/pdf";

const execFileAsync = promisify(execFile);

/**
 * PdfExtractor provides static utilities for parsing PDF buffers, cleaning and condensing
 * raw extracted text, splitting regulatory text into structured PLU articles, executing
 * CLI OCR fallback on scanned documents, and building the deterministic logical content map.
 */
export class PdfExtractor {
  /**
   * Regex pattern identifying structural French PLU headers and list markers that must not
   * be merged into the preceding line during line-wrap condensation.
   */
  static readonly STRUCTURAL_LINE_PATTERN: RegExp = STRUCTURAL_LINE_START;

  // ============================================================================
  // Text Cleaning & Condensation Utilities
  // ============================================================================

  /**
   * Check whether a trimmed line starts with a structural French PLU marker
   * (e.g., `ARTICLE`, `CHAPITRE`, `TITRE`, `SECTION`, `DISPOSITIONS`, `ZONE`, `ANNEXE`, `OAP`, or list item).
   */
  static isStructuralLine(line: string): boolean {
    return STRUCTURAL_LINE_START.test(line);
  }

  /**
   * Clean and condense raw PDF text into compact, readable lines:
   * 1. Strips null bytes (`\u0000`), zero-width Unicode characters, and carriage-return/form-feed artifacts.
   * 2. Collapses tabs, non-breaking spaces, and multiple spaces into a single horizontal space, dropping empty lines.
   * 3. Merges mid-sentence PDF line-wraps into continuous paragraphs while preserving structural headings,
   *    article headers, and bulleted/numbered list items on their own lines.
   */
  static cleanAndCondenseText(text: string): string {
    if (!text) return "";

    // Step 1: Strip binary/zero-width artifacts and normalize line breaks
    const rawLines = text
      .replace(/\u0000/g, "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\r\n?|\f/g, "\n")
      .split("\n");

    // Step 2: Collapse horizontal whitespace and remove blank lines
    const nonEmptyLines: string[] = [];
    for (const rawLine of rawLines) {
      const cleaned = rawLine.replace(/[\t\u00A0 ]+/g, " ").trim();
      if (cleaned.length > 0) {
        nonEmptyLines.push(cleaned);
      }
    }

    if (nonEmptyLines.length === 0) return "";

    // Step 3: Rejoin mid-sentence line wraps while preserving headings and structural boundaries
    const condensed: string[] = [nonEmptyLines[0]];
    for (let i = 1; i < nonEmptyLines.length; i++) {
      const prev = condensed[condensed.length - 1];
      const curr = nonEmptyLines[i];

      const prevEndsSentence = /[.:;!?]$/.test(prev);
      const prevIsHeading =
        PdfExtractor.isStructuralLine(prev) && prev.length <= 140;
      const currIsStructural = PdfExtractor.isStructuralLine(curr);

      if (!prevEndsSentence && !prevIsHeading && !currIsStructural) {
        condensed[condensed.length - 1] = `${prev} ${curr}`;
      } else {
        condensed.push(curr);
      }
    }

    return condensed.join("\n");
  }

  // ============================================================================
  // Regulatory Article Segmentation Utilities
  // ============================================================================

  /**
   * Split French PLU/PLUi regulatory text into discrete `ExtractedArticle` blocks.
   *
   * 1. Attempts classic PLU `ARTICLE <zone/number>` segmentation (explicitly ignoring external
   *    Code de l'urbanisme / Code du patrimoine citations like `Article L. 152-3` or `Article R. 111-2`).
   * 2. For modern thematic PLUi documents that do not use `ARTICLE` headers, segments by
   *    structural headings (`TITRE`, `CHAPITRE`, `SECTION`, Roman/numbered sections) or
   *    clean line-bounded chunks so no regulatory sections are lost to a 12k truncation.
   */
  static parseArticles(text: string): ExtractedArticle[] {
    if (!text.trim()) return [];

    // Match PLU article headers while excluding external legal code citations (Article L./R./D. 123-4)
    const articleRegex =
      /(?:^|\n)\s*(ARTICLE\s+(?![LRD]\.?\s*\d)[A-Z0-9.\-]+(?:\s+[0-9]+(?:[.\-][0-9]+)*)?(?:\s*[:\-–]\s*[^\n]+)?)/gi;
    const matches = [...text.matchAll(articleRegex)].filter((m) => {
      const header = m[1];
      // Exclude inline sentence mentions like "conformément à l'article ..."
      return !/du\s+code\s+de\s+l['’]/i.test(header);
    });

    if (matches.length >= 1) {
      const articles: ExtractedArticle[] = [];
      for (let i = 0; i < matches.length; i++) {
        const current = matches[i];
        const next = matches[i + 1];
        const startIdx = current.index ?? 0;
        const endIdx = next?.index ?? text.length;
        const headerLine = current[1].trim();
        const numMatch = headerLine.match(
          /ARTICLE\s+([A-Z0-9.\-]+(?:\s+\d+(?:[.\-]\d+)*)?)/i,
        );
        const articleNumber = numMatch
          ? `Article ${numMatch[1].replace(/\s+/g, " ")}`
          : headerLine.slice(0, 32);
        const content = text.slice(startIdx, endIdx).trim();

        articles.push({
          articleNumber,
          title: headerLine.slice(0, 120),
          content: content.slice(0, 10000),
        });
      }
      return articles;
    }

    // Fallback for modern thematic PLUi documents without classic ARTICLE headers:
    // segment by major structural headings or line-bounded ~8,000-char sections.
    const sectionRegex =
      /(?:^|\n)\s*((?:TITRE|CHAPITRE|SECTION|SOUS-?SECTION|DISPOSITIONS\s+(?:G[ÉE]N[ÉE]RALES|APPLICABLES)|ZONE\s+[A-Z0-9]+|[IVX]{1,5}\.\s+[A-ZÀ-Ÿ][^\n]{3,}|[1-9]\d?\.\s+[A-ZÀ-Ÿ][^\n]{4,}))/g;
    const sectionMatches = [...text.matchAll(sectionRegex)].filter(
      (m) => !/\.{4,}\s*\d*\s*$/.test(m[1]),
    );

    if (sectionMatches.length >= 3) {
      const sections: ExtractedArticle[] = [];
      for (let i = 0; i < sectionMatches.length; i++) {
        const current = sectionMatches[i];
        const next = sectionMatches[i + 1];
        const startIdx = current.index ?? 0;
        const endIdx = next?.index ?? text.length;
        const content = text.slice(startIdx, endIdx).trim();
        if (content.length < 120) continue;
        const headerLine = current[1].trim();
        sections.push({
          articleNumber: `Section ${sections.length + 1}`,
          title: headerLine.slice(0, 120),
          content: content.slice(0, 10000),
        });
      }
      if (sections.length > 0) return sections;
    }

    // Final fallback: split into clean ~8,000-char line-bounded chunks so large PDFs are never truncated to 12k
    const chunks: ExtractedArticle[] = [];
    const chunkSize = 8000;
    let cursor = 0;
    while (cursor < text.length) {
      let end = Math.min(text.length, cursor + chunkSize);
      if (end < text.length) {
        const newlineIdx = text.lastIndexOf("\n", end);
        if (newlineIdx > cursor + chunkSize * 0.6) {
          end = newlineIdx;
        }
      }
      const slice = text.slice(cursor, end).trim();
      if (slice.length > 0) {
        chunks.push({
          articleNumber: chunks.length === 0 ? "GENERAL" : `Extrait ${chunks.length + 1}`,
          title:
            chunks.length === 0
              ? "Extrait réglementaire complet"
              : `Extrait réglementaire (${chunks.length + 1})`,
          content: slice,
        });
      }
      cursor = end + 1;
    }
    return chunks;
  }

  // ============================================================================
  // Low-Level PDF Buffer Parsing & OCR Fallback Utilities
  // ============================================================================

  /**
   * Parse a raw PDF `Buffer` with `pdf-parse` while capturing per-page text (`PdfPageInput[]`).
   *
   * Uses a custom `pagerender` callback that inspects each text item's Y-transform coordinate
   * (`item.transform[5]`) to insert newline characters whenever the vertical baseline shifts,
   * and temporarily suppresses noisy `pdf.js` TrueType font warnings (`Warning: TT:`).
   */
  static async parseBufferWithPages(
    buffer: Buffer,
  ): Promise<PdfParsedDocument> {
    const pdfParseModule = await import("pdf-parse");
    const pdfParse =
      pdfParseModule.default ||
      (pdfParseModule as unknown as (
        b: Buffer,
        opts?: { pagerender?: (pageData: PdfParsePageData) => Promise<string> },
      ) => Promise<PdfParseResult>);

    const pages: PdfPageInput[] = [];
    const pagerender = async (pageData: PdfParsePageData): Promise<string> => {
      const textContent = await pageData.getTextContent({
        normalizeWhitespace: false,
        disableCombineTextItems: false,
      });

      // Reconstruct line breaks by detecting changes in the PDF text item's Y coordinate
      let lastY: number | undefined;
      let text = "";
      for (const item of textContent.items) {
        if (lastY === item.transform[5] || lastY === undefined) {
          text += item.str;
        } else {
          text += "\n" + item.str;
        }
        lastY = item.transform[5];
      }

      const pageNumber =
        typeof pageData.pageNumber === "number"
          ? pageData.pageNumber
          : typeof pageData.pageIndex === "number"
            ? pageData.pageIndex + 1
            : pages.length + 1;

      pages.push({ pageNumber, text: text.replace(/\u0000/g, "") });
      return text;
    };

    // Suppress noisy pdf.js TrueType font warnings (e.g. "Warning: TT: undefined function: 21")
    const origWarn = console.warn;
    const origLog = console.log;
    const isTtWarning = (args: unknown[]) =>
      typeof args[0] === "string" && args[0].includes("Warning: TT:");
    console.warn = (...args: unknown[]) => {
      if (!isTtWarning(args)) origWarn.apply(console, args);
    };
    console.log = (...args: unknown[]) => {
      if (!isTtWarning(args)) origLog.apply(console, args);
    };

    try {
      const parsed = await pdfParse(new Uint8Array(buffer) as Buffer, {
        pagerender,
      });
      return { parsed, pages };
    } finally {
      console.warn = origWarn;
      console.log = origLog;
    }
  }

  /**
   * Extract a `#page=<N>` hint from a PDF URL fragment (e.g. `reglement.pdf#page=42`).
   */
  static parsePageHintFromUrl(url?: string): number | undefined {
    if (!url) return undefined;
    const match = url.match(/#(?:.*&)?page=(\d+)/i);
    if (!match) return undefined;
    const parsed = Number.parseInt(match[1], 10);
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : undefined;
  }

  /**
   * Resolve a targeted `[firstPage, lastPage]` extraction window from explicit bounds or `pageHint`
   * (defaulting to `pageHint - 10` through `pageHint + 60`).
   */
  static resolvePageWindow(
    options?: PdfPageRangeOptions,
  ): { firstPage: number; lastPage: number } | undefined {
    if (!options) return undefined;
    if (
      typeof options.firstPage === "number" &&
      typeof options.lastPage === "number" &&
      options.firstPage >= 1 &&
      options.lastPage >= options.firstPage
    ) {
      return {
        firstPage: Math.floor(options.firstPage),
        lastPage: Math.floor(options.lastPage),
      };
    }
    if (typeof options.pageHint === "number" && options.pageHint >= 1) {
      const before = options.windowBefore ?? DEFAULT_PAGE_WINDOW_BEFORE;
      const after = options.windowAfter ?? DEFAULT_PAGE_WINDOW_AFTER;
      const firstPage = Math.max(1, Math.floor(options.pageHint) - before);
      const lastPage = Math.max(firstPage, Math.floor(options.pageHint) + after);
      return { firstPage, lastPage };
    }
    return undefined;
  }

  /**
   * Primary text extraction engine using Poppler's `pdftotext -enc UTF-8`.
   * Supports `-f` / `-l` page range flags for targeted Territory/PLUi page-window extraction.
   */
  static async extractTextWithPdftotext(
    bufferOrPath: Buffer | string,
    options: PdfPageRangeOptions = {},
  ): Promise<{
    text: string;
    pages: PdfPageInput[];
    pageCount: number;
    pageWindow?: { firstPage: number; lastPage: number };
  }> {
    const pdftotextCmd =
      process.env.PDFTOTEXT_COMMAND || DEFAULT_PDFTOTEXT_COMMAND;
    const timeout = DEFAULT_PDFTOTEXT_TIMEOUT_MS;
    const pageWindow = PdfExtractor.resolvePageWindow(options);

    let tmpDir: string | undefined;
    let pdfPath: string;
    if (typeof bufferOrPath === "string") {
      pdfPath = bufferOrPath;
    } else {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "plu-pdftotext-"));
      pdfPath = path.join(tmpDir, "input.pdf");
      await fs.writeFile(pdfPath, bufferOrPath);
    }

    const args = ["-enc", "UTF-8"];
    if (pageWindow) {
      args.push("-f", String(pageWindow.firstPage), "-l", String(pageWindow.lastPage));
    }
    args.push(pdfPath, "-");

    try {
      const { stdout } = await execFileAsync(pdftotextCmd, args, {
        timeout,
        maxBuffer: 64 * 1024 * 1024,
      });

      const startPage = pageWindow?.firstPage ?? 1;
      const rawPages = stdout.split("\f");
      // pdftotext often appends a trailing form-feed producing an empty final element
      if (rawPages.length > 1 && rawPages[rawPages.length - 1].trim() === "") {
        rawPages.pop();
      }

      const pages: PdfPageInput[] = rawPages.map((pageText, idx) => ({
        pageNumber: startPage + idx,
        text: pageText.replace(/\u0000/g, ""),
      }));

      const cleaned = PdfExtractor.cleanAndCondenseText(stdout);
      return {
        text: cleaned,
        pages,
        pageCount: pages.length || 1,
        pageWindow,
      };
    } finally {
      if (tmpDir) {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }

  /**
   * Optional Mistral OCR helper (`mistral-ocr-latest`) for scanned PDFs when `MISTRAL_API_KEY` is configured.
   */
  static async extractPDFTextViaMistralOCR(
    buffer: Buffer,
    options: { apiKey?: string; model?: string; timeoutMs?: number } = {},
  ): Promise<string> {
    const apiKey = options.apiKey || process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      throw new Error("MISTRAL_API_KEY is not configured for Mistral OCR");
    }

    const model = options.model || process.env.MISTRAL_OCR_MODEL || DEFAULT_MISTRAL_OCR_MODEL;
    const timeoutMs = options.timeoutMs ?? DEFAULT_OCR_TIMEOUT_MS;
    const base64Pdf = buffer.toString("base64");

    const response = await fetch("https://api.mistral.ai/v1/ocr", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        document: {
          type: "document_url",
          document_url: `data:application/pdf;base64,${base64Pdf}`,
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Mistral OCR HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      pages?: Array<{ markdown?: string; text?: string }>;
    };
    const combined = (data.pages || [])
      .map((p) => p.markdown || p.text || "")
      .join("\n\n");
    return PdfExtractor.cleanAndCondenseText(combined);
  }

  /**
   * Run external CLI OCR (default: `tesseract <pdfPath> stdout -l fra`) on a PDF buffer.
   * Writes the buffer to an isolated temporary directory, cleans and condenses the OCR output,
   * and guarantees temporary file cleanup on exit.
   */
  static async runOcrFallback(
    buffer: Buffer,
    options: PdfOcrOptions = {},
  ): Promise<string> {
    const ocrCmd =
      options.command || process.env.OCR_COMMAND || DEFAULT_OCR_COMMAND;
    const language = options.language || DEFAULT_OCR_LANGUAGE;
    const timeout = options.timeoutMs ?? DEFAULT_OCR_TIMEOUT_MS;

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "plu-ocr-"));
    const pdfPath = path.join(tmpDir, "input.pdf");

    try {
      await fs.writeFile(pdfPath, buffer);
      const { stdout } = await execFileAsync(
        ocrCmd,
        [pdfPath, "stdout", "-l", language],
        { timeout },
      );
      return PdfExtractor.cleanAndCondenseText(stdout);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  // ============================================================================
  // High-Level Extraction & Content Map Orchestration
  // ============================================================================

  /**
   * Extract only the deterministic `PluContentMap` from a PDF buffer or path using the same
   * `pdftotext` primary + `pdf-parse` fallback pipeline as `extractTextAndArticles`.
   */
  static async extractContentMap(
    bufferOrPath: Buffer | string,
    options: ContentMapOptions & PdfPageRangeOptions = {},
  ): Promise<PluContentMap> {
    const pageWindow = PdfExtractor.resolvePageWindow(options);
    try {
      const pdftotextRes = await PdfExtractor.extractTextWithPdftotext(
        bufferOrPath,
        options,
      );
      if (pdftotextRes.text.length >= MIN_DIGITAL_TEXT_CHARS) {
        return PdfContentMapper.buildFromPages(pdftotextRes.pages, {
          ...options,
          pdfInfo: options.pdfInfo ?? null,
        });
      }
    } catch {
      // Fall back to pdf-parse below
    }

    const buffer =
      typeof bufferOrPath === "string"
        ? await fs.readFile(bufferOrPath)
        : bufferOrPath;
    const { parsed, pages } = await PdfExtractor.parseBufferWithPages(buffer);
    const filteredPages = pageWindow
      ? pages.filter(
          (p) =>
            p.pageNumber >= pageWindow.firstPage &&
            p.pageNumber <= pageWindow.lastPage,
        )
      : pages;
    return PdfContentMapper.buildFromPages(filteredPages, {
      ...options,
      pdfInfo: options.pdfInfo ?? parsed.info ?? null,
    });
  }

  /**
   * End-to-end PDF extraction pipeline:
   * 1. Primary engine: `pdftotext -enc UTF-8` (supports `-f`/`-l` page windows via `pageHint` or explicit bounds).
   * 2. Fallback engine: `pdf-parse` (`parseBufferWithPages`) if `pdftotext` fails or returns minimal text.
   * 3. Builds the deterministic logical content map (`PdfContentMapper.buildFromPages`).
   * 4. If selectable text meets the digital threshold (>= 80 chars), segments articles and returns `"extracted"`.
   * 5. Otherwise, attempts Mistral OCR (`MISTRAL_API_KEY`) or Tesseract OCR (`OCR_ENABLED=true`).
   * 6. Returns `"ocr_required"` or `"failed"` with diagnostic metadata when text cannot be recovered.
   */
  static async extractTextAndArticles(
    bufferOrPath: Buffer | string,
    options: ContentMapOptions & PdfPageRangeOptions = {},
  ): Promise<PDFExtractionResult> {
    try {
      let rawText = "";
      let pages: PdfPageInput[] = [];
      let pageCount = 1;
      let pdfInfo: Record<string, unknown> | null = options.pdfInfo ?? null;
      let engineUsed: PdfTextEngine = "pdftotext";
      const pageWindow = PdfExtractor.resolvePageWindow(options);

      // Primary: fast native Poppler `pdftotext -enc UTF-8`
      try {
        const pdftotextRes = await PdfExtractor.extractTextWithPdftotext(
          bufferOrPath,
          options,
        );
        rawText = pdftotextRes.text;
        pages = pdftotextRes.pages;
        pageCount = pdftotextRes.pageCount;
      } catch {
        // Ignore pdftotext failure and fall back to pdf-parse below
      }

      // Fallback: pdf-parse when pdftotext is unavailable, failed, or yielded minimal text
      if (rawText.length < MIN_DIGITAL_TEXT_CHARS) {
        const buffer =
          typeof bufferOrPath === "string"
            ? await fs.readFile(bufferOrPath)
            : bufferOrPath;
        const { parsed, pages: parsedPages } =
          await PdfExtractor.parseBufferWithPages(buffer);
        const pdfParseText = PdfExtractor.cleanAndCondenseText(parsed.text || "");
        if (pdfParseText.length > rawText.length) {
          rawText = pdfParseText;
          pages = pageWindow
            ? parsedPages.filter(
                (p) =>
                  p.pageNumber >= pageWindow.firstPage &&
                  p.pageNumber <= pageWindow.lastPage,
              )
            : parsedPages;
          pageCount = parsed.numpages || parsedPages.length || 1;
          pdfInfo = pdfInfo ?? parsed.info ?? null;
          engineUsed = "pdf-parse";
        }
      }

      const contentMap = PdfContentMapper.buildFromPages(pages, {
        ...options,
        pdfInfo,
      });

      // Digital PDF with sufficient selectable text
      if (rawText.length >= MIN_DIGITAL_TEXT_CHARS) {
        return {
          status: "extracted",
          pageCount,
          charCount: rawText.length,
          text: rawText,
          articles: PdfExtractor.parseArticles(rawText),
          ocrAttempted: false,
          engineUsed,
          pageWindow,
          contentMap,
        };
      }

      const bufferForOcr =
        typeof bufferOrPath === "string"
          ? await fs.readFile(bufferOrPath)
          : bufferOrPath;

      // Scanned PDF: optional Mistral OCR fallback
      if (process.env.MISTRAL_API_KEY) {
        try {
          const mistralText = await PdfExtractor.extractPDFTextViaMistralOCR(
            bufferForOcr,
          );
          if (mistralText.length >= MIN_DIGITAL_TEXT_CHARS) {
            return {
              status: "ocr_completed",
              pageCount,
              charCount: mistralText.length,
              text: mistralText,
              articles: PdfExtractor.parseArticles(mistralText),
              ocrAttempted: true,
              engineUsed: "mistral-ocr",
              pageWindow,
              contentMap: PdfContentMapper.buildFromText(mistralText, {
                ...options,
                pdfInfo,
              }),
            };
          }
        } catch {
          // Continue to Tesseract fallback if enabled
        }
      }

      // Scanned PDF: attempt CLI OCR fallback when enabled in environment
      if (process.env.OCR_ENABLED === "true") {
        try {
          const ocrText = await PdfExtractor.runOcrFallback(bufferForOcr);
          if (ocrText.length > 0) {
            return {
              status: "ocr_completed",
              pageCount,
              charCount: ocrText.length,
              text: ocrText,
              articles: PdfExtractor.parseArticles(ocrText),
              ocrAttempted: true,
              engineUsed: "tesseract",
              pageWindow,
              contentMap: PdfContentMapper.buildFromText(ocrText, {
                ...options,
                pdfInfo,
              }),
            };
          }
        } catch (ocrErr) {
          return {
            status: "ocr_required",
            pageCount,
            charCount: rawText.length,
            text: rawText,
            articles: PdfExtractor.parseArticles(rawText),
            ocrAttempted: true,
            engineUsed,
            pageWindow,
            contentMap,
            error: `OCR failed: ${ocrErr instanceof Error ? ocrErr.message : "Unknown error"}`,
          };
        }
      }

      return {
        status: "ocr_required",
        pageCount,
        charCount: rawText.length,
        text: rawText,
        articles: PdfExtractor.parseArticles(rawText),
        ocrAttempted: false,
        engineUsed,
        pageWindow,
        contentMap,
        error:
          "PDF contains minimal selectable text; OCR is required for scanned document.",
      };
    } catch (err) {
      return {
        status: "failed",
        pageCount: 0,
        charCount: 0,
        text: "",
        articles: [],
        ocrAttempted: false,
        error: err instanceof Error ? err.message : "PDF extraction failed",
      };
    }
  }
}
