import {
  FRENCH_STOP_WORDS,
  KNOWN_NON_ZONE_TOKENS,
  PLU_TOPIC_DICTIONARY,
  ZONE_CODE_REGEX,
} from "@/services/pdf/constants";
import type {
  ContentMapOptions,
  ContentMapQuery,
  ContentMapQueryResult,
  DetectedHeading,
  PageSubjectSummary,
  PageSubjectSummaryInput,
  PdfPageInput,
  PluContentDocumentMetadata,
  PluContentMap,
  PluContentSection,
  PluCrossReference,
  PluKeywordIndexEntry,
  PluMappedArticle,
  PluPageDescription,
  PluPageRange,
  PluPageStatus,
  PluTopicId,
  PluTopicIndexEntry,
  PluTopicMatch,
  PluZoneIndexEntry,
  RawArticleMarker,
  TopicDefinition,
} from "@/types/pdf";

/**
 * PdfContentMapper provides deterministic static utilities for analyzing, indexing,
 * and logically mapping French PLU/PLUi PDF documents page by page.
 *
 * The mapper operates without an LLM (100% deterministic and reproducible):
 * 1. Classifies every page's health (`digital`, `scanned`, `empty`, `unreadable`).
 * 2. Extracts document-level metadata (type, commune, title, page statistics).
 * 3. Reconstructs the hierarchical document tree (`toc`, `title`, `chapter`, `zone_disposition`, `section`, `subsection`, `oap`, `annex`).
 * 4. Detects regulatory article boundaries and resolves exact multi-page article spans and inherited zone codes.
 * 5. Indexes urban-planning topics (`setbacks`, `height`, `footprint`, `parking`, etc.), zones, and keywords.
 * 6. Resolves explicit cross-references (articles, external legal codes, annexes, tables, pages) and TF cosine-similarity links.
 * 7. Exposes a fast query engine (`PdfContentMapper.query`) to locate relevant pages and articles for downstream AI pipelines.
 */
export class PdfContentMapper {
  /**
   * Reference dictionary of French urban-planning topics and their normalized search terms.
   */
  static readonly TOPIC_DICTIONARY: TopicDefinition[] = PLU_TOPIC_DICTIONARY;

  /**
   * Set of French stop-words excluded from keyword extraction and lexical similarity vectors.
   */
  static readonly STOP_WORDS: Set<string> = FRENCH_STOP_WORDS;

  // ============================================================================
  // Text Normalization, Tokenization & Page Range Utilities
  // ============================================================================

  /**
   * Normalize French regulatory text for deterministic matching:
   * - converts to lowercase
   * - decomposes Unicode characters (`NFD`) and strips diacritical marks (accents)
   * - collapses consecutive whitespace into a single space
   */
  static normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Escape special regular expression characters in a literal string so it can be
   * safely embedded inside a dynamic `RegExp`.
   */
  static escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Tokenize a normalized string into meaningful alphanumeric words:
   * - splits on non-alphanumeric delimiters
   * - discards tokens shorter than 3 characters, pure integers, and French stop-words
   */
  static tokenizeWords(normalizedText: string): string[] {
    const tokens = normalizedText.split(/[^a-z0-9]+/);
    const result: string[] = [];
    for (const tok of tokens) {
      if (tok.length < 3) continue;
      if (/^\d+$/.test(tok)) continue;
      if (FRENCH_STOP_WORDS.has(tok)) continue;
      result.push(tok);
    }
    return result;
  }

  /**
   * Build a sparse term-frequency (TF) vector mapping each token to its occurrence count.
   */
  static buildTermFrequencyVector(tokens: string[]): Map<string, number> {
    const tf = new Map<string, number>();
    for (const tok of tokens) {
      tf.set(tok, (tf.get(tok) ?? 0) + 1);
    }
    return tf;
  }

  /**
   * Deduplicate, sort, and compress an array of page numbers into contiguous
   * `{ startPage, endPage }` intervals (e.g. `[1, 2, 3, 5, 7, 8]` -> `[{1,3}, {5,5}, {7,8}]`).
   */
  static compressPageRanges(pages: number[]): PluPageRange[] {
    if (pages.length === 0) return [];
    const sorted = Array.from(new Set(pages)).sort((a, b) => a - b);
    const ranges: PluPageRange[] = [];
    let start = sorted[0];
    let end = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      const p = sorted[i];
      if (p === end + 1) {
        end = p;
      } else {
        ranges.push({ startPage: start, endPage: end });
        start = p;
        end = p;
      }
    }
    ranges.push({ startPage: start, endPage: end });
    return ranges;
  }

  // ============================================================================
  // Page Health Classification & Structural Detection Utilities
  // ============================================================================

  /**
   * Classify the extraction quality and readability of a single PDF page:
   * - `"empty"`: page contains no selectable characters after trimming
   * - `"unreadable"`: corrupted font encoding (> 15% replacement chars `\uFFFD` or < 30% alphanumeric ratio)
   * - `"scanned"`: contains only a page number/header (< 60 chars or < 8 words), indicating an image scan needing OCR
   * - `"digital"`: healthy selectable text suitable for structural & lexical indexing
   */
  static classifyPageStatus(rawText: string): PluPageStatus {
    const trimmed = rawText.trim();
    if (trimmed.length === 0) return "empty";

    // Detect corrupted font maps producing Unicode replacement characters
    const replacementCount = (trimmed.match(/\uFFFD/g) ?? []).length;
    if (replacementCount / trimmed.length > 0.15) return "unreadable";

    // Measure ratio of valid Latin/French alphanumeric characters vs garbage symbols
    const alphaNumMatches = trimmed.match(/[a-zA-ZÀ-ÿ0-9]/g) ?? [];
    const alphaNumRatio = alphaNumMatches.length / trimmed.length;
    const words = trimmed
      .split(/\s+/)
      .filter((w) => /[a-zA-ZÀ-ÿ]{2,}/.test(w));

    if (trimmed.length >= 20 && (alphaNumRatio < 0.3 || words.length === 0)) {
      return "unreadable";
    }

    // Pages with only a page number, short watermark, or < 60 chars / < 8 words are likely scanned
    if (trimmed.length < 60 || words.length < 8) {
      return "scanned";
    }

    return "digital";
  }

  /**
   * Extract PLU/PLUi urban zone codes (`UA`, `UB`, `1AU`, `2AU`, `N`, `A`, etc.) from text.
   *
   * Combines two passes:
   * 1. Contextual matching (`ZONE UA`, `SECTEUR UB1`, `DISPOSITIONS APPLICABLES À LA ZONE N`, `ARTICLE A 1`)
   *    which safely captures single-letter zones (`A`, `N`, `U`) without false positives.
   * 2. Unambiguous multi-character zone code matching (`UA`, `UB1`, `1AU`, `2AU`, `Nh`) filtered against
   *    common uppercase French words (`AU`, `AUX`, `ART`, `ANNEXE`, etc.).
   */
  static extractZoneCodes(text: string): string[] {
    const found = new Set<string>();

    // Pass 1: Explicit zone contexts (avoids false positives on French prepositions like "AU" or "A")
    const contextualRegex =
      /(?:ZONE|SECTEUR|SOUS-?SECTEUR|DISPOSITIONS\s+APPLICABLES\s+(?:AUX|À\s+LA|A\s+LA)\s+ZONES?|ARTICLE)\s+([A-Z0-9]{1,6}(?:[a-z]{1,2})?)/gi;
    for (const m of text.matchAll(contextualRegex)) {
      const candidate = m[1].toUpperCase();
      if (
        /^(?:U[A-Z0-9]{0,4}|[12]?AU[A-Z0-9]{0,4}|N[A-Z0-9]{0,3}|A[A-Z0-9]{0,3})$/.test(
          candidate,
        ) &&
        !KNOWN_NON_ZONE_TOKENS.has(candidate)
      ) {
        found.add(candidate);
      }
    }

    // Pass 2: Standalone multi-character zone codes (e.g. UA, UB1, 1AU, 2AU, Nh)
    for (const m of text.matchAll(ZONE_CODE_REGEX)) {
      const candidate = m[1];
      if (
        candidate.length >= 2 &&
        !KNOWN_NON_ZONE_TOKENS.has(candidate.toUpperCase())
      ) {
        found.add(candidate);
      }
    }

    return Array.from(found);
  }

  /**
   * Scan a page line-by-line to detect structural document headings and assign each
   * a hierarchy level (`1` = title/toc, `2` = zone_disposition/chapter/oap/annex, `3` = section, `4` = subsection).
   */
  static detectHeadingsOnPage(rawText: string): DetectedHeading[] {
    const lines = rawText.split(/\r?\n/);
    const headings: DetectedHeading[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.length > 160) continue;

      // Table of contents / Sommaire
      if (/^(?:SOMMAIRE|TABLE\s+DES\s+MATI[ÈE]RES)\b/i.test(line)) {
        headings.push({ kind: "toc", level: 1, title: line, lineIndex: i });
        continue;
      }

      // Level 1: TITRE I, TITRE II, etc.
      const titleMatch = line.match(
        /^(TITRE\s+[IVXLCDM0-9]+)(?:\s*[:\-–.]\s*(.+))?$/i,
      );
      if (titleMatch) {
        headings.push({
          kind: "title",
          level: 1,
          title: line,
          code: titleMatch[1].toUpperCase(),
          lineIndex: i,
        });
        continue;
      }

      // Level 2: DISPOSITIONS APPLICABLES À LA ZONE <ZONE>
      const dispMatch = line.match(
        /^DISPOSITIONS\s+APPLICABLES\s+(?:AUX|À\s+LA|A\s+LA)\s+ZONES?\s+([A-Z0-9][A-Z0-9a-z.\-]*)(.*)$/i,
      );
      if (dispMatch) {
        const zone = dispMatch[1].toUpperCase();
        headings.push({
          kind: "zone_disposition",
          level: 2,
          title: line,
          code: zone,
          zoneCode: zone,
          lineIndex: i,
        });
        continue;
      }

      // Level 2: (RÈGLEMENT DE LA) ZONE <ZONE>
      const zoneMatch = line.match(
        /^(?:R[ÈE]GLEMENT\s+DE\s+LA\s+)?ZONE\s+([A-Z]{1,3}[0-9a-z]{0,4})(?:\s*[:\-–]\s*(.+))?$/i,
      );
      if (zoneMatch) {
        const zone = zoneMatch[1].toUpperCase();
        headings.push({
          kind: "zone_disposition",
          level: 2,
          title: line,
          code: zone,
          zoneCode: zone,
          lineIndex: i,
        });
        continue;
      }

      // Level 2: CHAPITRE I, CHAPITRE II, etc. (extracting embedded zone code if present)
      const chapterMatch = line.match(
        /^(CHAPITRE\s+[IVXLCDM0-9]+)(?:\s*[:\-–.]\s*(.+))?$/i,
      );
      if (chapterMatch) {
        const zoneInChapter = PdfContentMapper.extractZoneCodes(line)[0];
        headings.push({
          kind: "chapter",
          level: 2,
          title: line,
          code: chapterMatch[1].toUpperCase(),
          zoneCode: zoneInChapter,
          lineIndex: i,
        });
        continue;
      }

      // Level 2: OAP (Orientations d'Aménagement et de Programmation)
      const oapMatch = line.match(
        /^(?:ORIENTATIONS?\s+D['’]AM[ÉE]NAGEMENT\s+ET\s+DE\s+PROGRAMMATION|OAP\s*[:\-–])(.*)$/i,
      );
      if (oapMatch) {
        headings.push({ kind: "oap", level: 2, title: line, lineIndex: i });
        continue;
      }

      // Level 2: ANNEXES / LEXIQUE / GLOSSAIRE / DÉFINITIONS
      const annexMatch = line.match(
        /^(?:ANNEXES?(?:\s+[IVXLCDM0-9]+)?|LEXIQUE|GLOSSAIRE|D[ÉE]FINITIONS)\b(?:\s*[:\-–.]\s*(.+))?$/i,
      );
      if (annexMatch) {
        headings.push({ kind: "annex", level: 2, title: line, lineIndex: i });
        continue;
      }

      // Level 3: SECTION I, SECTION 1, etc.
      const sectionMatch = line.match(
        /^(SECTION\s+[IVXLCDM0-9]+)(?:\s*[:\-–.]\s*(.+))?$/i,
      );
      if (sectionMatch) {
        headings.push({
          kind: "section",
          level: 3,
          title: line,
          code: sectionMatch[1].toUpperCase(),
          lineIndex: i,
        });
        continue;
      }

      // Level 4: SOUS-SECTION I, SOUS-SECTION 1, etc.
      const subSectionMatch = line.match(
        /^(SOUS-?SECTION\s+[IVXLCDM0-9]+)(?:\s*[:\-–.]\s*(.+))?$/i,
      );
      if (subSectionMatch) {
        headings.push({
          kind: "subsection",
          level: 4,
          title: line,
          code: subSectionMatch[1].toUpperCase(),
          lineIndex: i,
        });
      }
    }

    return headings;
  }

  /**
   * Detect regulatory article start markers on a single page (e.g. `ARTICLE UA 6 : Implantation...`
   * or `UA 6 - Implantation...`).
   *
   * If an article header only specifies a number (e.g. `ARTICLE 12 : Stationnement`),
   * it inherits `activeZoneCode` from the enclosing chapter/zone section to form
   * its normalized code (e.g. `UB12`).
   */
  static detectArticleMarkersOnPage(
    rawText: string,
    pageNumber: number,
    activeZoneCode?: string,
  ): RawArticleMarker[] {
    const markers: RawArticleMarker[] = [];
    const articleRegex =
      /(?:^|\n)\s*(ARTICLE\s+([A-Z]{0,4}\s*\d+(?:[.\-]\d+)*(?:\s*[a-z]{1,2})?)(?:\s*[:\-–.]\s*([^\n]+))?|([A-Z]{1,3}\s*\d{1,2})\s*[:\-–]\s*([A-ZÀ-Ÿ][^\n]{3,}))/gi;

    for (const match of rawText.matchAll(articleRegex)) {
      const fullMatch = match[0];
      const charIndex =
        (match.index ?? 0) + (fullMatch.startsWith("\n") ? 1 : 0);
      const isAtPageTop = rawText.slice(0, charIndex).trim().length === 0;

      let articleNumber: string;
      let rawCode: string;
      let title: string;

      if (match[2]) {
        rawCode = match[2].trim();
        articleNumber = `Article ${rawCode.replace(/\s+/g, " ")}`;
        title = (match[1] || articleNumber).trim().slice(0, 140);
      } else {
        rawCode = match[4].trim();
        articleNumber = rawCode.replace(/\s+/g, "");
        title = `${articleNumber} : ${match[5].trim()}`.slice(0, 140);
      }

      // Resolve explicit zone prefix (e.g. "UA6") or inherit from active section zone (e.g. "UB" + "12" -> "UB12")
      const compactCode = rawCode.replace(/\s+/g, "").toUpperCase();
      const explicitZoneMatch = compactCode.match(/^([A-Z]{1,3}[A-Z0-9]*?)\d/);
      const zoneCode = explicitZoneMatch
        ? explicitZoneMatch[1]
        : activeZoneCode;
      const normalizedCode =
        !explicitZoneMatch && zoneCode
          ? `${zoneCode}${compactCode}`
          : compactCode;

      markers.push({
        articleNumber,
        normalizedCode,
        title,
        zoneCode,
        pageNumber,
        charIndex,
        isAtPageTop,
      });
    }

    return markers;
  }

  // ============================================================================
  // Topic, Keyword, Table, TOC & Similarity Analysis Utilities
  // ============================================================================

  /**
   * Match normalized text against `PLU_TOPIC_DICTIONARY` using whole-word boundary matching,
   * returning all matched urban-planning topics sorted by descending occurrence count.
   */
  static detectTopics(normalizedText: string): PluTopicMatch[] {
    if (!normalizedText) return [];
    const matches: PluTopicMatch[] = [];

    for (const topic of PLU_TOPIC_DICTIONARY) {
      let matchCount = 0;
      const matchedTerms: string[] = [];

      for (const term of topic.terms) {
        const regex = new RegExp(
          `\\b${PdfContentMapper.escapeRegExp(term)}\\b`,
          "g",
        );
        const count = normalizedText.match(regex)?.length ?? 0;
        if (count > 0) {
          matchCount += count;
          matchedTerms.push(term);
        }
      }

      if (matchCount > 0) {
        matches.push({
          topic: topic.id,
          label: topic.label,
          matchCount,
          matchedTerms,
        });
      }
    }

    return matches.sort((a, b) => b.matchCount - a.matchCount);
  }

  /**
   * Compute the top `limit` most frequent tokens from a word array, breaking ties alphabetically
   * for 100% deterministic output.
   */
  static computeTopKeywords(
    tokens: string[],
    limit: number,
  ): Array<{ keyword: string; count: number }> {
    const freq = PdfContentMapper.buildTermFrequencyVector(tokens);
    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([keyword, count]) => ({ keyword, count }));
  }

  /**
   * Detect whether a page contains tabular data by checking for:
   * - 3 or more lines with wide multi-column whitespace gaps or pipe delimiters (`|...|`)
   * - explicit mention of `"tableau"` combined with at least 3 numeric metric values (`%`, `m`, `m²`)
   */
  static detectTableOnPage(rawText: string, normalizedText: string): boolean {
    const lines = rawText.split(/\r?\n/);
    let multiColumnLines = 0;
    for (const line of lines) {
      if (/\S+\s{3,}\S+\s{3,}\S+/.test(line) || /\|.+\|/.test(line)) {
        multiColumnLines++;
      }
    }
    if (multiColumnLines >= 3) return true;
    if (
      /\btableaux?\b/.test(normalizedText) &&
      (normalizedText.match(/\d+\s*(?:%|m\b|m2|m²)/g)?.length ?? 0) >= 3
    ) {
      return true;
    }
    return false;
  }

  /**
   * Detect whether a page is a Table of Contents (`Sommaire`) by checking for an explicit
   * `"toc"` heading or 3+ dotted leader lines ending with page numbers.
   */
  static detectTocOnPage(
    rawText: string,
    headings: DetectedHeading[],
  ): boolean {
    if (headings.some((h) => h.kind === "toc")) return true;
    const dottedLines = rawText
      .split(/\r?\n/)
      .filter((l) => /\.{4,}\s*\d{1,4}\s*$/.test(l.trim())).length;
    return dottedLines >= 3;
  }

  /**
   * Compute cosine similarity in `[0, 1]` between two sparse term-frequency maps.
   */
  static computeCosineSimilarity(
    vecA: Map<string, number>,
    vecB: Map<string, number>,
  ): number {
    if (vecA.size === 0 || vecB.size === 0) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (const [term, valA] of vecA) {
      normA += valA * valA;
      const valB = vecB.get(term);
      if (valB) dot += valA * valB;
    }
    for (const valB of vecB.values()) {
      normB += valB * valB;
    }

    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // ============================================================================
  // Document Metadata & Page Summary Builders
  // ============================================================================

  /**
   * Extract document-level metadata from the opening pages and aggregate page health statistics
   * across all pages in the PDF.
   */
  static extractDocumentMetadata(
    pages: PdfPageInput[],
    pageStatuses: PluPageStatus[],
    options: ContentMapOptions = {},
  ): PluContentDocumentMetadata {
    const firstPagesText = pages
      .slice(0, 3)
      .map((p) => p.text)
      .join("\n");
    const normalizedHead = PdfContentMapper.normalizeText(firstPagesText);

    // Infer document category from opening pages
    let documentType: PluContentDocumentMetadata["documentType"] = "UNKNOWN";
    if (/\bplui\b|plan local d'urbanisme intercommunal/.test(normalizedHead)) {
      documentType = "PLUi";
    } else if (/\bplu\b|plan local d'urbanisme/.test(normalizedHead)) {
      documentType = "PLU";
    } else if (/\boap\b|orientations? d'amenagement/.test(normalizedHead)) {
      documentType = "OAP";
    } else if (/\breglement\b/.test(normalizedHead)) {
      documentType = "REGLEMENT";
    } else if (/\bannexe/.test(normalizedHead)) {
      documentType = "ANNEXE";
    }

    // Resolve commune from options or "COMMUNE DE <NAME>" / "VILLE DE <NAME>" pattern
    let commune = options.commune;
    if (!commune) {
      const communeMatch = firstPagesText.match(
        /(?:COMMUNE\s+DE|VILLE\s+DE)\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ'’\-\s]{1,45})/i,
      );
      if (communeMatch) {
        commune = communeMatch[1].trim().split(/\r?\n/)[0].trim();
      }
    }

    // Resolve document title from explicit options, PDF info dictionary, or first non-trivial heading line
    const infoTitle =
      typeof options.pdfInfo?.Title === "string" &&
      options.pdfInfo.Title.trim()
        ? options.pdfInfo.Title.trim()
        : undefined;

    let title = options.title || infoTitle;
    if (!title) {
      const firstNonEmptyLine = firstPagesText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l.length >= 6 && l.length <= 120);
      if (firstNonEmptyLine) title = firstNonEmptyLine;
    }

    // Aggregate page health metrics
    const scannedPages: number[] = [];
    const unreadablePages: number[] = [];
    let digitalPageCount = 0;
    let emptyPageCount = 0;
    let totalCharCount = 0;
    let totalWordCount = 0;

    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      const status = pageStatuses[i];
      const trimmed = p.text.trim();
      totalCharCount += trimmed.length;
      totalWordCount += trimmed ? trimmed.split(/\s+/).length : 0;

      if (status === "digital") digitalPageCount++;
      else if (status === "scanned") scannedPages.push(p.pageNumber);
      else if (status === "empty") emptyPageCount++;
      else if (status === "unreadable") unreadablePages.push(p.pageNumber);
    }

    return {
      title,
      commune,
      documentType,
      pageCount: pages.length,
      digitalPageCount,
      scannedPageCount: scannedPages.length,
      emptyPageCount,
      unreadablePageCount: unreadablePages.length,
      totalCharCount,
      totalWordCount,
      scannedPages,
      unreadablePages,
      pdfInfo: options.pdfInfo ?? null,
    };
  }

  /**
   * Synthesize a human-readable French `mainSubject` and `description` for a single page
   * based on its readability status, structural headings, zones, articles, and topics.
   */
  static buildPageSubjectAndDescription(
    params: PageSubjectSummaryInput,
  ): PageSubjectSummary {
    if (params.status === "empty") {
      return {
        mainSubject: "Page vide",
        description: `Page ${params.pageNumber} sans texte extractible.`,
      };
    }
    if (params.status === "scanned") {
      return {
        mainSubject: "Page numérisée (OCR requis)",
        description: `Page ${params.pageNumber} contenant très peu de texte sélectionnable ; document probablement numérisé nécessitant une reconnaissance optique (OCR).`,
      };
    }
    if (params.status === "unreadable") {
      return {
        mainSubject: "Page illisible ou encodage corrompu",
        description: `Page ${params.pageNumber} dont l'encodage textuel est illisible ou corrompu.`,
      };
    }
    if (params.isToc) {
      return {
        mainSubject: "Sommaire / Table des matières",
        description: `Page ${params.pageNumber} présentant le sommaire ou la table des matières du document.`,
      };
    }

    let mainSubject = "Contenu réglementaire";
    if (params.headings.length > 0) {
      mainSubject = params.headings[0].slice(0, 100);
    } else if (params.articleNumbers.length > 0) {
      mainSubject = params.articleNumbers.slice(0, 3).join(", ");
    } else if (params.topics.length > 0) {
      mainSubject = params.topics[0].label;
    } else if (params.isAnnex) {
      mainSubject = "Annexe";
    }

    const parts: string[] = [];
    if (params.zones.length > 0) {
      parts.push(`Zone(s) : ${params.zones.join(", ")}`);
    }
    if (params.articleNumbers.length > 0) {
      parts.push(`Article(s) : ${params.articleNumbers.join(", ")}`);
    }
    if (params.topics.length > 0) {
      parts.push(
        `Thèmes : ${params.topics
          .slice(0, 3)
          .map((t) => t.label)
          .join(", ")}`,
      );
    }
    if (params.hasTable) {
      parts.push("Contient un tableau");
    }
    if (params.isAnnex) {
      parts.push("Section annexe");
    }

    const description =
      parts.length > 0
        ? `Page ${params.pageNumber} — ${parts.join(" | ")}.`
        : `Page ${params.pageNumber} — ${mainSubject}.`;

    return { mainSubject, description };
  }

  // ============================================================================
  // Index & Cross-Reference Builders
  // ============================================================================

  /**
   * Resolve exact start/end page spans and text slices for every detected article marker,
   * tagging each mapped article with its enclosing section ID, topics, top keywords, and excerpt.
   */
  static buildMappedArticles(
    pages: PdfPageInput[],
    pageStatuses: PluPageStatus[],
    rawMarkers: RawArticleMarker[],
    pageSectionIds: string[][],
  ): { articles: PluMappedArticle[]; pageArticleIds: string[][] } {
    const articles: PluMappedArticle[] = [];
    const pageArticleIds = pages.map(() => [] as string[]);
    const pageNumberToIdx = new Map<number, number>();
    pages.forEach((p, idx) => pageNumberToIdx.set(p.pageNumber, idx));

    const lastPageNumber =
      pages.length > 0 ? pages[pages.length - 1].pageNumber : 1;

    for (let i = 0; i < rawMarkers.length; i++) {
      const current = rawMarkers[i];
      const next = rawMarkers[i + 1];

      const startPage = current.pageNumber;
      let endPage = next ? next.pageNumber : lastPageNumber;
      if (next && next.isAtPageTop && next.pageNumber > startPage) {
        endPage = next.pageNumber - 1;
      }
      endPage = Math.max(startPage, endPage);

      // Slice and concatenate the article's exact text across its spanned pages
      const spannedPages: number[] = [];
      let combinedContent = "";
      for (let p = startPage; p <= endPage; p++) {
        const pIdx = pageNumberToIdx.get(p);
        if (pIdx === undefined) continue;
        if (p !== startPage && pageStatuses[pIdx] !== "digital") continue;
        spannedPages.push(p);
        const pText = pages[pIdx].text;
        if (
          p === startPage &&
          p === endPage &&
          next &&
          next.pageNumber === p
        ) {
          combinedContent += pText.slice(current.charIndex, next.charIndex);
        } else if (p === startPage) {
          combinedContent += pText.slice(current.charIndex) + "\n";
        } else if (p === endPage && next && next.pageNumber === p) {
          combinedContent += pText.slice(0, next.charIndex);
        } else {
          combinedContent += pText + "\n";
        }
      }

      const normArticle = PdfContentMapper.normalizeText(combinedContent);
      const artTopics = PdfContentMapper.detectTopics(normArticle).map(
        (t) => t.topic,
      );
      const artKeywords = PdfContentMapper.computeTopKeywords(
        PdfContentMapper.tokenizeWords(normArticle),
        8,
      ).map((k) => k.keyword);
      const startIdx = pageNumberToIdx.get(startPage);
      const sectionId =
        startIdx !== undefined ? pageSectionIds[startIdx][0] : undefined;
      const articleId = `art_${i + 1}_${current.normalizedCode}`;

      articles.push({
        id: articleId,
        articleNumber: current.articleNumber,
        normalizedCode: current.normalizedCode,
        title: current.title,
        zoneCode: current.zoneCode,
        sectionId,
        startPage,
        endPage,
        pageNumbers: spannedPages,
        topics: artTopics,
        keywords: artKeywords,
        excerpt: combinedContent.replace(/\s+/g, " ").trim().slice(0, 240),
      });

      for (const p of spannedPages) {
        const pIdx = pageNumberToIdx.get(p);
        if (pIdx !== undefined) {
          pageArticleIds[pIdx].push(articleId);
        }
      }
    }

    return { articles, pageArticleIds };
  }

  /**
   * Build the document-wide urban-planning topic index (`PluTopicIndexEntry[]`)
   * aggregating page numbers, compressed page ranges, match counts, related article IDs,
   * and co-occurring keywords for each topic in `PLU_TOPIC_DICTIONARY`.
   */
  static buildTopicIndex(
    pageDescriptions: PluPageDescription[],
    articleById: Map<string, PluMappedArticle>,
  ): PluTopicIndexEntry[] {
    const topicIndex: PluTopicIndexEntry[] = [];

    for (const def of PLU_TOPIC_DICTIONARY) {
      const matchingPages: number[] = [];
      let totalMatches = 0;
      const relatedArticleIds = new Set<string>();
      const keywordFreq = new Map<string, number>();

      for (const pDesc of pageDescriptions) {
        const match = pDesc.topics.find((t) => t.topic === def.id);
        if (match) {
          matchingPages.push(pDesc.pageNumber);
          totalMatches += match.matchCount;
          for (const aId of pDesc.articleIds) {
            const art = articleById.get(aId);
            if (art && art.topics.includes(def.id)) {
              relatedArticleIds.add(aId);
            }
          }
          for (const kw of pDesc.keywords) {
            keywordFreq.set(kw, (keywordFreq.get(kw) ?? 0) + 1);
          }
        }
      }

      if (matchingPages.length > 0) {
        topicIndex.push({
          topic: def.id,
          label: def.label,
          pageNumbers: matchingPages,
          pageRanges: PdfContentMapper.compressPageRanges(matchingPages),
          matchCount: totalMatches,
          articleIds: Array.from(relatedArticleIds),
          topKeywords: Array.from(keywordFreq.entries())
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 8)
            .map(([k]) => k),
        });
      }
    }

    return topicIndex;
  }

  /**
   * Build the document-wide urban zone index (`PluZoneIndexEntry[]`) linking each zone code
   * to all pages, compressed page ranges, articles, and sections that reference it.
   */
  static buildZoneIndex(
    pageDescriptions: PluPageDescription[],
    articles: PluMappedArticle[],
  ): PluZoneIndexEntry[] {
    const zoneMap = new Map<
      string,
      { pages: Set<number>; articles: Set<string>; sections: Set<string> }
    >();

    for (const pDesc of pageDescriptions) {
      for (const z of pDesc.zones) {
        if (!zoneMap.has(z)) {
          zoneMap.set(z, {
            pages: new Set(),
            articles: new Set(),
            sections: new Set(),
          });
        }
        const entry = zoneMap.get(z)!;
        entry.pages.add(pDesc.pageNumber);
        pDesc.sectionIds.forEach((s) => entry.sections.add(s));
      }
    }

    for (const art of articles) {
      if (art.zoneCode) {
        if (!zoneMap.has(art.zoneCode)) {
          zoneMap.set(art.zoneCode, {
            pages: new Set(),
            articles: new Set(),
            sections: new Set(),
          });
        }
        const entry = zoneMap.get(art.zoneCode)!;
        entry.articles.add(art.id);
        art.pageNumbers.forEach((p) => entry.pages.add(p));
      }
    }

    return Array.from(zoneMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([zoneCode, data]) => {
        const pageNumbers = Array.from(data.pages).sort((a, b) => a - b);
        return {
          zoneCode,
          pageNumbers,
          pageRanges: PdfContentMapper.compressPageRanges(pageNumbers),
          articleIds: Array.from(data.articles),
          sectionIds: Array.from(data.sections),
        };
      });
  }

  /**
   * Build the document-wide top keyword index (`PluKeywordIndexEntry[]`) sorted by total frequency.
   */
  static buildDocumentKeywordIndex(
    pages: PdfPageInput[],
    pageTokens: string[][],
    maxDocumentKeywords: number,
  ): PluKeywordIndexEntry[] {
    const docKeywordCounts = new Map<
      string,
      { count: number; pages: Set<number> }
    >();

    for (let idx = 0; idx < pages.length; idx++) {
      const pNum = pages[idx].pageNumber;
      for (const tok of pageTokens[idx]) {
        let entry = docKeywordCounts.get(tok);
        if (!entry) {
          entry = { count: 0, pages: new Set() };
          docKeywordCounts.set(tok, entry);
        }
        entry.count++;
        entry.pages.add(pNum);
      }
    }

    return Array.from(docKeywordCounts.entries())
      .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
      .slice(0, maxDocumentKeywords)
      .map(([keyword, data]) => ({
        keyword,
        count: data.count,
        pages: Array.from(data.pages).sort((a, b) => a - b),
      }));
  }

  /**
   * Extract explicit intra-document and external cross-references (internal articles,
   * Code de l'urbanisme articles like `R.111-2`, annexes/OAP, tables, and page numbers)
   * and compute lexical cosine-similarity links between non-adjacent digital pages.
   */
  static buildCrossReferences(params: {
    pages: PdfPageInput[];
    pageStatuses: PluPageStatus[];
    pageIsToc: boolean[];
    pageArticleIds: string[][];
    pageTfVectors: Map<string, number>[];
    pageDescriptions: PluPageDescription[];
    articles: PluMappedArticle[];
    similarityThreshold: number;
  }): PluCrossReference[] {
    const {
      pages,
      pageStatuses,
      pageIsToc,
      pageArticleIds,
      pageTfVectors,
      pageDescriptions,
      articles,
      similarityThreshold,
    } = params;

    const crossReferences: PluCrossReference[] = [];
    const articleByNormalized = new Map<string, PluMappedArticle>();
    for (const art of articles) {
      if (!articleByNormalized.has(art.normalizedCode)) {
        articleByNormalized.set(art.normalizedCode, art);
      }
    }

    const annexPages = pageDescriptions
      .filter((p) => p.isAnnex)
      .map((p) => p.pageNumber);
    const tablePages = pageDescriptions
      .filter((p) => p.hasTable)
      .map((p) => p.pageNumber);

    for (let idx = 0; idx < pages.length; idx++) {
      const page = pages[idx];
      if (pageStatuses[idx] !== "digital" || pageIsToc[idx]) continue;
      const rawText = page.text;
      const sourceArticleId = pageArticleIds[idx][0];

      // 1. Explicit internal article references (e.g. "voir article UA 6", "cf. article 10")
      const artRefRegex =
        /(?:voir|cf\.?|selon|au\s+sens\s+de|conform[ée]ment\s+[àa]|vis[ée]s?\s+[àa]|en\s+application\s+de)\s+(?:l['’]\s*)?article\s+([A-Z]{0,4}\s*\d+(?:[.\-]\d+)*(?:[a-z]\b|\s+(?:bis|ter|quater)\b)?)\b/gi;
      for (const m of rawText.matchAll(artRefRegex)) {
        const refCode = m[1].replace(/\s+/g, "").toUpperCase();
        const targetArt = articleByNormalized.get(refCode);
        crossReferences.push({
          sourcePage: page.pageNumber,
          sourceArticleId,
          targetType: "article",
          targetRef: `Article ${m[1].trim()}`,
          targetPage: targetArt?.startPage,
          targetArticleId: targetArt?.id,
          context: m[0].trim().slice(0, 120),
        });
      }

      // 2. External legal code references (Code de l'urbanisme, e.g. R.111-2, L.151-1)
      const extCodeRegex =
        /\b(?:article|art\.?)\s+([LRD]\.?\s*\d{3,4}(?:-\d+)+)\b/gi;
      for (const m of rawText.matchAll(extCodeRegex)) {
        crossReferences.push({
          sourcePage: page.pageNumber,
          sourceArticleId,
          targetType: "external_code",
          targetRef: m[1].replace(/\s+/g, ""),
          context: m[0].trim().slice(0, 120),
        });
      }

      // 3. Annex / OAP / zoning plan references
      const annexRefRegex =
        /(?:voir|cf\.?|se\s+r[ée]f[ée]rer\s+[àa]|figurant\s+(?:en|dans|à))\s+(?:l['’]|les?\s+)?(annexes?(?:\s+[A-Z0-9]+)?|OAP|plan\s+de\s+zonage)/gi;
      for (const m of rawText.matchAll(annexRefRegex)) {
        crossReferences.push({
          sourcePage: page.pageNumber,
          sourceArticleId,
          targetType: "annex",
          targetRef: m[1].trim(),
          targetPages: annexPages.length > 0 ? annexPages : undefined,
          context: m[0].trim().slice(0, 120),
        });
      }

      // 4. Table references (e.g. "selon le tableau récapitulatif")
      const tableRefRegex =
        /(?:voir|cf\.?|selon\s+le|dans\s+le)\s+(tableau(?:\s+(?:n°\s*)?\d+|\s+r[ée]capitulatif)?)\b/gi;
      for (const m of rawText.matchAll(tableRefRegex)) {
        crossReferences.push({
          sourcePage: page.pageNumber,
          sourceArticleId,
          targetType: "table",
          targetRef: m[1].trim(),
          targetPages: tablePages.length > 0 ? tablePages : undefined,
          context: m[0].trim().slice(0, 120),
        });
      }

      // 5. Direct page number references (e.g. "voir page 7")
      const pageRefRegex = /(?:voir|cf\.?|en)\s+(?:la\s+)?page\s+(\d{1,4})\b/gi;
      for (const m of rawText.matchAll(pageRefRegex)) {
        const targetPage = Number(m[1]);
        if (
          targetPage >= 1 &&
          targetPage <= pages.length &&
          targetPage !== page.pageNumber
        ) {
          crossReferences.push({
            sourcePage: page.pageNumber,
            sourceArticleId,
            targetType: "page",
            targetRef: `Page ${targetPage}`,
            targetPage,
            context: m[0].trim().slice(0, 120),
          });
        }
      }
    }

    // 6. Lightweight cosine similarity links between non-adjacent digital pages
    const digitalIndices = pages
      .map((_, idx) => idx)
      .filter(
        (idx) =>
          pageStatuses[idx] === "digital" &&
          !pageIsToc[idx] &&
          pageTfVectors[idx].size >= 5,
      );

    for (const idxA of digitalIndices) {
      const candidates: Array<{ pageNumber: number; score: number }> = [];
      for (const idxB of digitalIndices) {
        if (Math.abs(pages[idxA].pageNumber - pages[idxB].pageNumber) <= 1) {
          continue;
        }
        const score = PdfContentMapper.computeCosineSimilarity(
          pageTfVectors[idxA],
          pageTfVectors[idxB],
        );
        if (score >= similarityThreshold) {
          candidates.push({
            pageNumber: pages[idxB].pageNumber,
            score: Math.round(score * 1000) / 1000,
          });
        }
      }
      candidates.sort(
        (a, b) => b.score - a.score || a.pageNumber - b.pageNumber,
      );
      for (const cand of candidates.slice(0, 2)) {
        crossReferences.push({
          sourcePage: pages[idxA].pageNumber,
          sourceArticleId: pageArticleIds[idxA][0],
          targetType: "similarity",
          targetRef: `Page ${cand.pageNumber}`,
          targetPage: cand.pageNumber,
          similarityScore: cand.score,
          context: `Similarité lexicale (${cand.score}) avec la page ${cand.pageNumber}`,
        });
      }
    }

    return crossReferences;
  }

  // ============================================================================
  // Primary Content Map Builders & Query Engine
  // ============================================================================

  /**
   * Deterministically build a complete `PluContentMap` from page-by-page extracted PDF text.
   *
   * Execution pipeline:
   * 1. Sort pages and classify each page's readability status.
   * 2. Extract document-level metadata (title, commune, documentType, page counts).
   * 3. Walk pages sequentially to build hierarchical sections, track the active zone/annex context,
   *    and collect article markers, topics, zones, tables, and TF vectors per page.
   * 4. Resolve multi-page article spans (`buildMappedArticles`) and assemble per-page descriptions.
   * 5. Build document-wide topic, zone, keyword, and cross-reference indexes.
   */
  static buildFromPages(
    inputPages: PdfPageInput[],
    options: ContentMapOptions = {},
  ): PluContentMap {
    const maxKeywordsPerPage = options.maxKeywordsPerPage ?? 10;
    const maxDocumentKeywords = options.maxDocumentKeywords ?? 30;
    const similarityThreshold = options.similarityThreshold ?? 0.45;

    const pages = [...inputPages].sort((a, b) => a.pageNumber - b.pageNumber);
    const pageStatuses = pages.map((p) =>
      PdfContentMapper.classifyPageStatus(p.text),
    );
    const metadata = PdfContentMapper.extractDocumentMetadata(
      pages,
      pageStatuses,
      options,
    );

    const sections: PluContentSection[] = [];
    const openSectionsByLevel = new Map<number, PluContentSection>();
    let activeZoneCode: string | undefined;
    let activeIsAnnex = false;
    let sectionSeq = 0;

    const rawMarkers: RawArticleMarker[] = [];
    const pageTokens: string[][] = [];
    const pageTfVectors: Map<string, number>[] = [];
    const pageHeadingsList: DetectedHeading[][] = [];
    const pageTopicsList: PluTopicMatch[][] = [];
    const pageZonesList: string[][] = [];
    const pageSectionIds: string[][] = [];
    const pageHasTable: boolean[] = [];
    const pageIsToc: boolean[] = [];
    const pageIsAnnex: boolean[] = [];

    // Pass 1: Scan pages for sections, headings, article markers, topics, and token frequencies
    for (let idx = 0; idx < pages.length; idx++) {
      const page = pages[idx];
      const status = pageStatuses[idx];
      const rawText = page.text;
      const normText =
        status === "digital" ? PdfContentMapper.normalizeText(rawText) : "";
      const tokens = normText ? PdfContentMapper.tokenizeWords(normText) : [];

      pageTokens.push(tokens);
      pageTfVectors.push(PdfContentMapper.buildTermFrequencyVector(tokens));

      const headings =
        status === "digital"
          ? PdfContentMapper.detectHeadingsOnPage(rawText)
          : [];
      pageHeadingsList.push(headings);

      const currentPageSectionIds: string[] = [];
      for (const h of headings) {
        // Close open sections at the same or deeper hierarchy level
        for (const [lvl, sec] of Array.from(openSectionsByLevel.entries())) {
          if (lvl >= h.level) {
            sec.endPage = Math.max(sec.startPage, page.pageNumber - 1);
            sec.pageCount = sec.endPage - sec.startPage + 1;
            openSectionsByLevel.delete(lvl);
          }
        }

        // Update active zone / annex state from section heading
        if (h.zoneCode) {
          activeZoneCode = h.zoneCode;
          activeIsAnnex = false;
        } else if (h.kind === "annex") {
          activeIsAnnex = true;
        } else if (h.kind === "title" || h.kind === "oap") {
          activeIsAnnex = false;
        }

        // Link to nearest open parent section at a shallower level
        let parentId: string | undefined;
        for (let lvl = h.level - 1; lvl >= 1; lvl--) {
          const parent = openSectionsByLevel.get(lvl);
          if (parent) {
            parentId = parent.id;
            break;
          }
        }

        sectionSeq++;
        const sec: PluContentSection = {
          id: `sec_${sectionSeq}`,
          kind: h.kind,
          level: h.level,
          title: h.title,
          code: h.code,
          zoneCode: h.zoneCode ?? activeZoneCode,
          parentId,
          startPage: page.pageNumber,
          endPage: page.pageNumber,
          pageCount: 1,
        };
        sections.push(sec);
        openSectionsByLevel.set(h.level, sec);
        currentPageSectionIds.push(sec.id);
      }

      // Inherit deepest open section when no new heading starts on this page
      if (currentPageSectionIds.length === 0) {
        const deepestOpen = Array.from(openSectionsByLevel.entries()).sort(
          (a, b) => b[0] - a[0],
        )[0]?.[1];
        if (deepestOpen) {
          currentPageSectionIds.push(deepestOpen.id);
        }
      }
      pageSectionIds.push(currentPageSectionIds);

      const isToc =
        status === "digital" &&
        PdfContentMapper.detectTocOnPage(rawText, headings);
      const isAnnex = activeIsAnnex || headings.some((h) => h.kind === "annex");
      const hasTable =
        status === "digital" &&
        PdfContentMapper.detectTableOnPage(rawText, normText);
      pageIsToc.push(isToc);
      pageIsAnnex.push(isAnnex);
      pageHasTable.push(hasTable);

      const topics =
        status === "digital" ? PdfContentMapper.detectTopics(normText) : [];
      pageTopicsList.push(topics);

      const detectedZones =
        status === "digital" ? PdfContentMapper.extractZoneCodes(rawText) : [];
      if (
        activeZoneCode &&
        !detectedZones.includes(activeZoneCode) &&
        status === "digital"
      ) {
        detectedZones.unshift(activeZoneCode);
      }
      pageZonesList.push(detectedZones);

      if (status === "digital" && !isToc) {
        const markers = PdfContentMapper.detectArticleMarkersOnPage(
          rawText,
          page.pageNumber,
          activeZoneCode,
        );
        rawMarkers.push(...markers);
      }
    }

    // Close all remaining open sections at the final page of the document
    const lastPageNumber =
      pages.length > 0 ? pages[pages.length - 1].pageNumber : 1;
    for (const sec of openSectionsByLevel.values()) {
      sec.endPage = Math.max(sec.startPage, lastPageNumber);
      sec.pageCount = sec.endPage - sec.startPage + 1;
    }

    // Pass 2: Build mapped articles with exact page spans
    const { articles, pageArticleIds } = PdfContentMapper.buildMappedArticles(
      pages,
      pageStatuses,
      rawMarkers,
      pageSectionIds,
    );

    // Pass 3: Build per-page logical descriptions
    const articleById = new Map(articles.map((a) => [a.id, a]));
    const pageDescriptions: PluPageDescription[] = pages.map((page, idx) => {
      const status = pageStatuses[idx];
      const headings = pageHeadingsList[idx].map((h) => h.title);
      const artIds = pageArticleIds[idx];
      const artNumbers = artIds
        .map((id) => articleById.get(id)?.articleNumber)
        .filter((v): v is string => Boolean(v));
      const topics = pageTopicsList[idx];
      const keywords = PdfContentMapper.computeTopKeywords(
        pageTokens[idx],
        maxKeywordsPerPage,
      ).map((k) => k.keyword);

      const { mainSubject, description } =
        PdfContentMapper.buildPageSubjectAndDescription({
          pageNumber: page.pageNumber,
          status,
          headings,
          articleNumbers: artNumbers,
          zones: pageZonesList[idx],
          topics,
          isToc: pageIsToc[idx],
          isAnnex: pageIsAnnex[idx],
          hasTable: pageHasTable[idx],
        });

      const trimmedText = page.text.trim();
      return {
        pageNumber: page.pageNumber,
        status,
        charCount: trimmedText.length,
        wordCount: trimmedText ? trimmedText.split(/\s+/).length : 0,
        lineCount: page.text ? page.text.split(/\r?\n/).length : 0,
        headings,
        sectionIds: pageSectionIds[idx],
        articleIds: artIds,
        zones: pageZonesList[idx],
        topics,
        keywords,
        mainSubject,
        description,
        hasTable: pageHasTable[idx],
        isAnnex: pageIsAnnex[idx],
        isToc: pageIsToc[idx],
      };
    });

    // Pass 4: Build document-wide topic, zone, keyword, and cross-reference indexes
    const topics = PdfContentMapper.buildTopicIndex(
      pageDescriptions,
      articleById,
    );
    const zones = PdfContentMapper.buildZoneIndex(pageDescriptions, articles);
    const keywords = PdfContentMapper.buildDocumentKeywordIndex(
      pages,
      pageTokens,
      maxDocumentKeywords,
    );
    const crossReferences = PdfContentMapper.buildCrossReferences({
      pages,
      pageStatuses,
      pageIsToc,
      pageArticleIds,
      pageTfVectors,
      pageDescriptions,
      articles,
      similarityThreshold,
    });

    return {
      schemaVersion: "1.0.0",
      deterministic: true,
      metadata,
      sections,
      articles,
      pages: pageDescriptions,
      topics,
      zones,
      keywords,
      crossReferences,
    };
  }

  /**
   * Convenience builder that constructs a `PluContentMap` from a single extracted text string.
   * Splits pages on form-feed (`\f`) delimiters when present; otherwise treats the text as page 1.
   */
  static buildFromText(
    text: string,
    options: ContentMapOptions = {},
  ): PluContentMap {
    const rawPages = text.includes("\f") ? text.split("\f") : [text];
    const pages: PdfPageInput[] = rawPages.map((pageText, index) => ({
      pageNumber: index + 1,
      text: pageText.replace(/\u0000/g, ""),
    }));
    return PdfContentMapper.buildFromPages(pages, options);
  }

  /**
   * Query a `PluContentMap` to locate and rank the most relevant pages, compressed page ranges,
   * and regulatory articles for a target zone, urban-planning topics, and free-text keywords.
   */
  static query(
    contentMap: PluContentMap,
    query: ContentMapQuery,
  ): ContentMapQueryResult {
    const maxPages = Math.max(1, query.maxPages ?? 25);
    const targetZone = query.zoneCode?.trim().toUpperCase();
    const parentZone = targetZone
      ? targetZone.replace(/[0-9A-Z]+$/, "")
      : undefined;
    const targetTopics = new Set(query.topics ?? []);
    const normalizedKeywords = (query.keywords ?? [])
      .map((k) => PdfContentMapper.normalizeText(k))
      .filter((k) => k.length >= 3);

    // Score each digital non-TOC page against target zone, topics, and keywords
    const scoredPages = contentMap.pages
      .filter((p) => p.status === "digital" && !p.isToc)
      .map((p) => {
        let score = 0;

        // Zone match bonus (exact zone = +12, parent zone = +5)
        if (targetZone && p.zones.some((z) => z.toUpperCase() === targetZone)) {
          score += 12;
        } else if (
          parentZone &&
          parentZone.length >= 1 &&
          p.zones.some((z) => z.toUpperCase() === parentZone)
        ) {
          score += 5;
        }

        // Topic match bonus
        for (const t of p.topics) {
          if (targetTopics.size === 0 || targetTopics.has(t.topic)) {
            score += targetTopics.has(t.topic)
              ? 6 + Math.min(t.matchCount, 4)
              : 1;
          }
        }

        // Keyword match bonus against page keywords and headings
        if (normalizedKeywords.length > 0) {
          const pageKwSet = new Set(p.keywords);
          const subjectNorm = PdfContentMapper.normalizeText(
            `${p.mainSubject} ${p.headings.join(" ")}`,
          );
          for (const kw of normalizedKeywords) {
            if (pageKwSet.has(kw) || subjectNorm.includes(kw)) {
              score += 4;
            }
          }
        }

        if (p.articleIds.length > 0) score += 2;
        return { pageNumber: p.pageNumber, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.pageNumber - b.pageNumber)
      .slice(0, maxPages);

    const pageSet = new Set(scoredPages.map((p) => p.pageNumber));
    const pageNumbers = Array.from(pageSet).sort((a, b) => a - b);

    // Collect articles overlapping the selected pages and compatible with the target zone
    const articles = contentMap.articles.filter((art) => {
      const touchesPage = art.pageNumbers.some((p) => pageSet.has(p));
      if (!touchesPage) return false;
      if (!targetZone || !art.zoneCode) return true;
      return (
        art.zoneCode.toUpperCase() === targetZone ||
        (parentZone ? art.zoneCode.toUpperCase() === parentZone : false)
      );
    });

    const matchedTopics = Array.from(
      new Set<PluTopicId>(
        contentMap.pages
          .filter((p) => pageSet.has(p.pageNumber))
          .flatMap((p) => p.topics.map((t) => t.topic)),
      ),
    );

    return {
      pageNumbers,
      pageRanges: PdfContentMapper.compressPageRanges(pageNumbers),
      articles,
      matchedTopics,
    };
  }
}
