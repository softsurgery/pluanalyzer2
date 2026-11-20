import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  DEFAULT_OCR_COMMAND,
  DEFAULT_OCR_LANGUAGE,
  DEFAULT_OCR_TIMEOUT_MS,
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
  PdfParsePageData,
  PdfParseResult,
  PdfParsedDocument,
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
   * Extract only the deterministic `PluContentMap` from a PDF buffer by parsing
   * per-page text and delegating to `PdfContentMapper.buildFromPages`.
   */
  static async extractContentMap(
    buffer: Buffer,
    options: ContentMapOptions = {},
  ): Promise<PluContentMap> {
    const { parsed, pages } = await PdfExtractor.parseBufferWithPages(buffer);
    return PdfContentMapper.buildFromPages(pages, {
      ...options,
      pdfInfo: options.pdfInfo ?? parsed.info ?? null,
    });
  }

  /**
   * End-to-end PDF extraction pipeline:
   * 1. Parses the PDF buffer page-by-page (`parseBufferWithPages`).
   * 2. Cleans and condenses the full text (`cleanAndCondenseText`).
   * 3. Builds the deterministic logical content map (`PdfContentMapper.buildFromPages`).
   * 4. If selectable text meets the digital threshold (>= 80 chars), segments articles and returns `"extracted"`.
   * 5. Otherwise, if `OCR_ENABLED=true`, runs Tesseract OCR fallback (`runOcrFallback`) and rebuilds the content map.
   * 6. Returns `"ocr_required"` or `"failed"` with diagnostic metadata when text cannot be recovered.
   */
  static async extractTextAndArticles(
    buffer: Buffer,
    options: ContentMapOptions = {},
  ): Promise<PDFExtractionResult> {
    try {
      const { parsed, pages } = await PdfExtractor.parseBufferWithPages(buffer);
      const rawText = PdfExtractor.cleanAndCondenseText(parsed.text || "");
      const pageCount = parsed.numpages || pages.length || 1;
      const contentMap = PdfContentMapper.buildFromPages(pages, {
        ...options,
        pdfInfo: options.pdfInfo ?? parsed.info ?? null,
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
          contentMap,
        };
      }

      // Scanned PDF: attempt CLI OCR fallback when enabled in environment
      if (process.env.OCR_ENABLED === "true") {
        try {
          const ocrText = await PdfExtractor.runOcrFallback(buffer);
          if (ocrText.length > 0) {
            return {
              status: "ocr_completed",
              pageCount,
              charCount: ocrText.length,
              text: ocrText,
              articles: PdfExtractor.parseArticles(ocrText),
              ocrAttempted: true,
              contentMap: PdfContentMapper.buildFromText(ocrText, {
                ...options,
                pdfInfo: options.pdfInfo ?? parsed.info ?? null,
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
