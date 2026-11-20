// ============================================================================
// PDF Text & Article Extraction Types
// ============================================================================

/**
 * Discrete regulatory article extracted from a French PLU/PLUi document.
 */
export interface ExtractedArticle {
  articleNumber: string;
  title: string;
  content: string;
}

/**
 * Possible outcome statuses of a PDF text extraction run.
 */
export type PDFExtractionStatus =
  | "extracted"
  | "ocr_required"
  | "ocr_completed"
  | "failed";

/**
 * Complete result returned by `PdfExtractor.extractTextAndArticles`.
 */
export interface PDFExtractionResult {
  status: PDFExtractionStatus;
  pageCount: number;
  charCount: number;
  text: string;
  articles: ExtractedArticle[];
  ocrAttempted: boolean;
  contentMap?: PluContentMap;
  error?: string;
}

/**
 * Normalized single-page text input used by the PDF extractor and content mapper.
 */
export interface PdfPageInput {
  pageNumber: number;
  text: string;
}

/**
 * Low-level page object exposed by `pdf-parse` / `pdf.js` during `pagerender`.
 */
export interface PdfParsePageData {
  pageNumber?: number;
  pageIndex?: number;
  getTextContent: (opts?: {
    normalizeWhitespace?: boolean;
    disableCombineTextItems?: boolean;
  }) => Promise<{ items: Array<{ str: string; transform: number[] }> }>;
}

/**
 * Raw output shape returned by `pdf-parse`.
 */
export interface PdfParseResult {
  numpages: number;
  text: string;
  info?: Record<string, unknown> | null;
}

/**
 * Combined result of parsing a PDF buffer along with its per-page extracted texts.
 */
export interface PdfParsedDocument {
  parsed: PdfParseResult;
  pages: PdfPageInput[];
}

/**
 * Configuration options for CLI-based OCR fallback (e.g., Tesseract).
 */
export interface PdfOcrOptions {
  command?: string;
  language?: string;
  timeoutMs?: number;
}

// ============================================================================
// Deterministic PDF Logical Content Mapping Types
// ============================================================================

/**
 * Canonical urban-planning regulatory topic identifiers.
 */
export type PluTopicId =
  | "setbacks"
  | "height"
  | "footprint"
  | "parking"
  | "access"
  | "green_spaces"
  | "land_use"
  | "exterior_appearance"
  | "utilities"
  | "lot_characteristics"
  | "servitudes_risks";

/**
 * Health and readability classification of an individual PDF page.
 */
export type PluPageStatus = "digital" | "scanned" | "empty" | "unreadable";

/**
 * Structural heading category detected within a PLU/PLUi document.
 */
export type PluSectionKind =
  | "title"
  | "chapter"
  | "zone_disposition"
  | "section"
  | "subsection"
  | "annex"
  | "oap"
  | "toc";

/**
 * Inclusive start/end page range `[startPage, endPage]`.
 */
export interface PluPageRange {
  startPage: number;
  endPage: number;
}

/**
 * Topic match statistics for a page or section.
 */
export interface PluTopicMatch {
  topic: PluTopicId;
  label: string;
  matchCount: number;
  matchedTerms: string[];
}

/**
 * Hierarchical section node in the logical document outline.
 */
export interface PluContentSection {
  id: string;
  kind: PluSectionKind;
  level: number;
  title: string;
  code?: string;
  zoneCode?: string;
  parentId?: string;
  startPage: number;
  endPage: number;
  pageCount: number;
}

/**
 * Regulatory article mapped to its exact page span, parent section, zone, and topics.
 */
export interface PluMappedArticle {
  id: string;
  articleNumber: string;
  normalizedCode: string;
  title: string;
  zoneCode?: string;
  sectionId?: string;
  startPage: number;
  endPage: number;
  pageNumbers: number[];
  topics: PluTopicId[];
  keywords: string[];
  excerpt: string;
}

/**
 * Detailed logical profile of a single PDF page.
 */
export interface PluPageDescription {
  pageNumber: number;
  status: PluPageStatus;
  charCount: number;
  wordCount: number;
  lineCount: number;
  headings: string[];
  sectionIds: string[];
  articleIds: string[];
  zones: string[];
  topics: PluTopicMatch[];
  keywords: string[];
  mainSubject: string;
  description: string;
  hasTable: boolean;
  isAnnex: boolean;
  isToc: boolean;
}

/**
 * Document-wide index entry for an urban-planning topic.
 */
export interface PluTopicIndexEntry {
  topic: PluTopicId;
  label: string;
  pageNumbers: number[];
  pageRanges: PluPageRange[];
  matchCount: number;
  articleIds: string[];
  topKeywords: string[];
}

/**
 * Document-wide index entry for a detected urban zone (e.g., `UA`, `UB`, `1AU`, `N`).
 */
export interface PluZoneIndexEntry {
  zoneCode: string;
  pageNumbers: number[];
  pageRanges: PluPageRange[];
  articleIds: string[];
  sectionIds: string[];
}

/**
 * Category of intra-document or external cross-reference.
 */
export type PluCrossReferenceType =
  | "article"
  | "annex"
  | "table"
  | "page"
  | "external_code"
  | "similarity";

/**
 * Directed cross-reference linking a source page/article to another article, page, annex, table, or legal code.
 */
export interface PluCrossReference {
  sourcePage: number;
  sourceArticleId?: string;
  targetType: PluCrossReferenceType;
  targetRef: string;
  targetPage?: number;
  targetArticleId?: string;
  targetPages?: number[];
  similarityScore?: number;
  context: string;
}

/**
 * High-level classification of the urban-planning PDF document.
 */
export type PluDocumentType =
  | "PLU"
  | "PLUi"
  | "REGLEMENT"
  | "OAP"
  | "ANNEXE"
  | "UNKNOWN";

/**
 * Document-level metadata and page health statistics.
 */
export interface PluContentDocumentMetadata {
  title?: string;
  commune?: string;
  documentType?: PluDocumentType;
  pageCount: number;
  digitalPageCount: number;
  scannedPageCount: number;
  emptyPageCount: number;
  unreadablePageCount: number;
  totalCharCount: number;
  totalWordCount: number;
  scannedPages: number[];
  unreadablePages: number[];
  pdfInfo?: Record<string, unknown> | null;
}

/**
 * Document-wide frequency entry for a top keyword.
 */
export interface PluKeywordIndexEntry {
  keyword: string;
  count: number;
  pages: number[];
}

/**
 * Deterministic logical content map of a PLU/PLUi PDF document.
 */
export interface PluContentMap {
  schemaVersion: "1.0.0";
  deterministic: true;
  metadata: PluContentDocumentMetadata;
  sections: PluContentSection[];
  articles: PluMappedArticle[];
  pages: PluPageDescription[];
  topics: PluTopicIndexEntry[];
  zones: PluZoneIndexEntry[];
  keywords: PluKeywordIndexEntry[];
  crossReferences: PluCrossReference[];
}

// ============================================================================
// Content Mapper Configuration, Query & Internal Detection Types
// ============================================================================

/**
 * Configuration options when building a `PluContentMap`.
 */
export interface ContentMapOptions {
  title?: string;
  commune?: string;
  pdfInfo?: Record<string, unknown> | null;
  maxKeywordsPerPage?: number;
  maxDocumentKeywords?: number;
  similarityThreshold?: number;
}

/**
 * Filter criteria for querying relevant pages and articles from a `PluContentMap`.
 */
export interface ContentMapQuery {
  zoneCode?: string;
  topics?: PluTopicId[];
  keywords?: string[];
  maxPages?: number;
}

/**
 * Ranked pages, compressed page ranges, and articles matching a `ContentMapQuery`.
 */
export interface ContentMapQueryResult {
  pageNumbers: number[];
  pageRanges: PluPageRange[];
  articles: PluMappedArticle[];
  matchedTopics: PluTopicId[];
}

/**
 * Dictionary definition mapping a `PluTopicId` to its French label and search terms.
 */
export interface TopicDefinition {
  id: PluTopicId;
  label: string;
  terms: string[];
}

/**
 * Structural heading detected on a single PDF page.
 */
export interface DetectedHeading {
  kind: PluSectionKind;
  level: number;
  title: string;
  code?: string;
  zoneCode?: string;
  lineIndex: number;
}

/**
 * Raw article boundary marker detected on a single PDF page before cross-page span resolution.
 */
export interface RawArticleMarker {
  articleNumber: string;
  normalizedCode: string;
  title: string;
  zoneCode?: string;
  pageNumber: number;
  charIndex: number;
  isAtPageTop: boolean;
}

/**
 * Input signals used to synthesize a human-readable subject and summary for a page.
 */
export interface PageSubjectSummaryInput {
  pageNumber: number;
  status: PluPageStatus;
  headings: string[];
  articleNumbers: string[];
  zones: string[];
  topics: PluTopicMatch[];
  isToc: boolean;
  isAnnex: boolean;
  hasTable: boolean;
}

/**
 * Synthesized human-readable main subject and description for a single page.
 */
export interface PageSubjectSummary {
  mainSubject: string;
  description: string;
}
