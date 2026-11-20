import { PdfContentMapper, PdfExtractor } from "@/services/pdf";
import type { ExtractedArticle } from "@/services/plu/types";

export const DEFAULT_MAX_CHUNK_CHARS = 22000;
export const DEFAULT_SUB_CHUNK_CHARS = 11000;

export type RegulatoryCategory =
  | "emprise"
  | "hauteur"
  | "espaces_verts"
  | "recul"
  | "aspect_exterieur"
  | "stationnement";

/**
 * Title and semantic patterns for matching PLU articles regardless of numbering scheme
 * (classic 1-14 numbering, thematic PLUi, or non-standard numbering like Pays d'Aix UI3/UI7).
 */
export const TITLE_PATTERNS: Record<RegulatoryCategory, RegExp> = {
  emprise:
    /\b(?:emprise\s+au\s+sol|coefficient\s+d['’]emprise|ces\b|densit[ée]|occupation\s+du\s+sol)\b/i,
  hauteur:
    /\b(?:hauteur\s+(?:des\s+constructions|maximale|de\s+fa[çc]ade|totale)|volum[ée]trie|gabarit)\b/i,
  espaces_verts:
    /\b(?:espaces?\s+(?:verts?|libres?|boisés?)|pleine\s+terre|plantations?|biotope|traitement\s+(?:des\s+abords|paysager))\b/i,
  recul:
    /\b(?:implantation\s+des\s+constructions|recul|retrait|alignement|voies\s+et\s+emprises|limites?\s+s[ée]paratives?|prospect)\b/i,
  aspect_exterieur:
    /\b(?:aspect\s+ext[ée]rieur|architecture|fa[çc]ades?|toitures?|cl[ôo]tures?|insertion\s+(?:urbaine|paysag[èe]re)|qualit[ée]\s+urbaine)\b/i,
  stationnement:
    /\b(?:stationnement|aires?\s+de\s+stationnement|parking|places?\s+de\s+stationnement|v[ée]los?|deux[- ]roues)\b/i,
};

const CLASSIC_ARTICLE_NUMBERS: Record<RegulatoryCategory, RegExp> = {
  emprise: /\b(?:article\s*(?:[a-z]{1,4}\s*)?(?:4|9)|ui\s*4)\b/i,
  hauteur: /\b(?:article\s*(?:[a-z]{1,4}\s*)?(?:5|10)|ui\s*5)\b/i,
  recul: /\b(?:article\s*(?:[a-z]{1,4}\s*)?(?:3|6|7|8)|ui\s*3)\b/i,
  aspect_exterieur: /\b(?:article\s*(?:[a-z]{1,4}\s*)?11|ui\s*6)\b/i,
  stationnement: /\b(?:article\s*(?:[a-z]{1,4}\s*)?12|ui\s*7)\b/i,
  espaces_verts: /\b(?:article\s*(?:[a-z]{1,4}\s*)?13|ui\s*8)\b/i,
};

/**
 * Extract the base zone prefix (e.g. "UA1" -> "UA", "UCt1" -> "UC", "1AUa" -> "1AU").
 */
export function getZonePrefix(zoneCode: string): string {
  const clean = zoneCode.trim().toUpperCase();
  const match = clean.match(/^(\d?[A-Z]{1,3})/);
  return match ? match[1] : clean;
}

/**
 * Detect whether a PLU/PLUi PDF covers a single zone (mono-zone) or multiple zones (multi-zone).
 */
export function isMonoZonePdf(fullText: string): boolean {
  if (!fullText || fullText.trim().length === 0) return true;

  const zoneHeaderRegex =
    /(?:^|\n)\s*(?:DISPOSITIONS\s+APPLICABLES\s+[ÀA]\s+LA\s+ZONE|CHAPITRE\s+[IVX0-9]+\s*[:\-–]?\s*ZONE|ZONE)\s+([1-9]?[A-Z]{1,3}[0-9a-zA-Z]{0,4})\b/gi;
  const foundZones = new Set<string>();

  for (const match of fullText.matchAll(zoneHeaderRegex)) {
    const line = match[0];
    // Ignore Table of Contents lines with dot leaders
    if (/\.{3,}\s*\d*\s*$/.test(line)) continue;
    const code = match[1].toUpperCase();
    // Normalize to base zone family (e.g. UA, UB, AU, N, A)
    if (/^(?:U|AU|A|N)/.test(code)) {
      foundZones.add(getZonePrefix(code));
    }
  }

  return foundZones.size <= 1;
}

/**
 * Isolate the regulatory chapter for `zoneCode` from a full PLU/PLUi document.
 *
 * In multi-zone PDFs, never trusts the first occurrence of a zone name (usually the TOC).
 * Instead, scores every mention of the zone by counting following `ARTICLE <prefix><num>`
 * and generic `ARTICLE <num>` headers (`specCount * 1000 + genCount`) and stops cleanly
 * when the next zone's header or `ARTICLE <OTHER_PREFIX> 1` appears.
 */
export function isolateZoneSection(
  fullText: string,
  zoneCode?: string,
): { text: string; isMonoZone: boolean; startIndex: number; endIndex: number } {
  if (!fullText || !zoneCode || !zoneCode.trim()) {
    return {
      text: fullText,
      isMonoZone: true,
      startIndex: 0,
      endIndex: fullText.length,
    };
  }

  const mono = isMonoZonePdf(fullText);
  if (mono) {
    return {
      text: fullText,
      isMonoZone: true,
      startIndex: 0,
      endIndex: fullText.length,
    };
  }

  const targetZone = zoneCode.trim().toUpperCase();
  const targetPrefix = getZonePrefix(targetZone);
  const candidates = Array.from(
    new Set([targetZone, targetPrefix].filter((z) => z.length >= 1)),
  );

  let bestScore = -1;
  let bestStart = -1;
  let bestZoneToken = targetZone;

  for (const candidate of candidates) {
    const escaped = PdfContentMapper.escapeRegExp(candidate);
    const mentionRegex = new RegExp(
      `(?:^|\\n)\\s*(?:(?:DISPOSITIONS\\s+APPLICABLES\\s+[ÀA]\\s+LA\\s+)?ZONE\\s+${escaped}\\b|CHAPITRE\\s+[IVX0-9]+\\s*[:\\-–]?\\s*(?:ZONE\\s+)?${escaped}\\b|${escaped}\\s*[:\\-–]\\s*[A-ZÀ-Ÿ]|${escaped}\\s*$)`,
      "gim",
    );

    for (const m of fullText.matchAll(mentionRegex)) {
      const idx = m.index ?? 0;
      const lineEnd = fullText.indexOf("\n", idx + 1);
      const headerLine = fullText.slice(
        idx,
        lineEnd === -1 ? idx + 160 : lineEnd,
      );
      // Skip Table of Contents entries with dot leaders + page numbers
      if (/\.{3,}\s*\d+\s*$/.test(headerLine)) continue;

      const windowSlice = fullText.slice(idx, Math.min(fullText.length, idx + 45000));
      const specRegex = new RegExp(
        `(?:^|\\n)\\s*ARTICLE\\s+${PdfContentMapper.escapeRegExp(targetPrefix)}\\s*\\d+`,
        "gim",
      );
      const genRegex = /(?:^|\n)\s*ARTICLE\s+\d+(?:\s|[:.\-–]|$)/gim;

      const specCount = [...windowSlice.matchAll(specRegex)].length;
      const genCount = [...windowSlice.matchAll(genRegex)].length;
      const exactBonus = candidate === targetZone ? 500 : 0;
      const score = specCount * 1000 + genCount + exactBonus;

      if (score > bestScore && (specCount > 0 || genCount > 0)) {
        bestScore = score;
        bestStart = idx;
        bestZoneToken = candidate;
      }
    }
  }

  if (bestStart === -1) {
    return {
      text: fullText,
      isMonoZone: false,
      startIndex: 0,
      endIndex: fullText.length,
    };
  }

  // Find clean end boundary: next zone header or ARTICLE <OTHER_PREFIX> 1
  const lineEndAfterStart = fullText.indexOf("\n", bestStart + 1);
  const searchAfterStart =
    lineEndAfterStart !== -1 ? lineEndAfterStart + 1 : bestStart + 40;
  const tail = fullText.slice(searchAfterStart);
  let endIndex = fullText.length;

  const nextZoneHeaderRegex =
    /(?:^|\n)\s*(?:DISPOSITIONS\s+APPLICABLES\s+[ÀA]\s+LA\s+ZONE|CHAPITRE\s+[IVX0-9]+\s*[:\-–]?\s*ZONE)\s+([1-9]?[A-Z]{1,3}[0-9a-zA-Z]{0,4})\b/gi;
  for (const m of tail.matchAll(nextZoneHeaderRegex)) {
    const foundCode = m[1].toUpperCase();
    const foundPrefix = getZonePrefix(foundCode);
    if (
      foundCode !== targetZone &&
      foundCode !== bestZoneToken &&
      foundPrefix !== targetPrefix
    ) {
      endIndex = Math.min(endIndex, searchAfterStart + (m.index ?? 0));
      break;
    }
  }

  const otherArticle1Regex =
    /(?:^|\n)\s*ARTICLE\s+([1-9]?[A-Z]{1,3})\s*1\b/gi;
  for (const m of tail.matchAll(otherArticle1Regex)) {
    const foundPrefix = getZonePrefix(m[1].toUpperCase());
    if (foundPrefix !== targetPrefix) {
      endIndex = Math.min(endIndex, searchAfterStart + (m.index ?? 0));
      break;
    }
  }

  return {
    text: fullText.slice(bestStart, endIndex).trim(),
    isMonoZone: false,
    startIndex: bestStart,
    endIndex,
  };
}

/**
 * Filter out sub-zone articles (e.g., `Article UA.2` or `Article UB 3`) that explicitly
 * target a different sub-zone than `zoneCode`.
 */
export function filterSubZoneArticles(
  articles: ExtractedArticle[],
  zoneCode?: string,
): ExtractedArticle[] {
  if (!zoneCode || !zoneCode.trim()) return articles;

  const target = zoneCode.trim().toUpperCase();
  const targetPrefix = getZonePrefix(target);

  return articles.filter((art) => {
    const header = `${art.articleNumber} ${art.title}`.toUpperCase();
    // Check for explicit sub-zone article patterns like "ARTICLE UA.B 4" or "ARTICLE UA2 4"
    const subZoneMatch = header.match(
      /ARTICLE\s+([1-9]?[A-Z]{1,3}(?:[.\-]?[A-Z0-9]+)?)\s+\d+/,
    );
    if (!subZoneMatch) return true;

    const foundToken = subZoneMatch[1].replace(/[.\-]/g, "");
    // Keep if it matches the target zone, its base prefix, or a parent sub-zone (e.g. UAE for UAE4)
    if (
      foundToken === target ||
      foundToken === targetPrefix ||
      target.startsWith(foundToken)
    ) {
      return true;
    }

    // If it starts with the same prefix + a different sub-zone letter/number (e.g. target=UA1, found=UA2)
    if (foundToken.startsWith(targetPrefix) && foundToken !== target) {
      return false;
    }

    // If it belongs to a completely different zone prefix (e.g. target=UA, found=UB)
    if (/^(?:U|AU|A|N)/.test(foundToken) && getZonePrefix(foundToken) !== targetPrefix) {
      return false;
    }

    return true;
  });
}

/**
 * Split isolated zone text along article boundaries into chunks of `<= maxChunkChars` (default 22,000),
 * filtering out inapplicable sub-zone articles.
 */
export function chunkZoneArticles(
  zoneText: string,
  zoneCode?: string,
  maxChunkChars: number = DEFAULT_MAX_CHUNK_CHARS,
): { articles: ExtractedArticle[]; chunks: ExtractedArticle[][] } {
  const parsed = PdfExtractor.parseArticles(zoneText);
  const filtered = filterSubZoneArticles(parsed, zoneCode);
  const articles = filtered.length > 0 ? filtered : parsed;

  const chunks: ExtractedArticle[][] = [];
  let currentChunk: ExtractedArticle[] = [];
  let currentChars = 0;

  for (const art of articles) {
    const artLen =
      art.articleNumber.length + art.title.length + art.content.length + 32;

    if (currentChunk.length > 0 && currentChars + artLen > maxChunkChars) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentChars = 0;
    }

    // If a single article exceeds maxChunkChars, truncate safely at maxChunkChars
    const boundedArt =
      artLen > maxChunkChars
        ? {
            ...art,
            content: art.content.slice(0, Math.max(1000, maxChunkChars - 200)),
          }
        : art;

    currentChunk.push(boundedArt);
    currentChars +=
      boundedArt.articleNumber.length +
      boundedArt.title.length +
      boundedArt.content.length +
      32;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return { articles, chunks };
}

/**
 * Match articles by title or classic article numbering for a specific regulatory category
 * (supports standard Articles 1-14 as well as non-standard numbering like Pays d'Aix UI3/UI7).
 */
export function matchArticlesByTitle(
  articles: ExtractedArticle[],
  category: RegulatoryCategory,
): ExtractedArticle[] {
  const titlePattern = TITLE_PATTERNS[category];
  const numberPattern = CLASSIC_ARTICLE_NUMBERS[category];

  return articles.filter((a) => {
    const header = `${a.articleNumber} ${a.title}`;
    if (titlePattern.test(header) || numberPattern.test(header)) {
      return true;
    }
    return titlePattern.test(a.content.slice(0, 600));
  });
}
