import {
  matchArticlesByTitle,
  type RegulatoryCategory,
} from "@/services/plu/article-selection";
import { OllamaService } from "@/services/ollama/OllamaService";
import type {
  ExtractedArticle,
  StructuredRegulatoryRules,
} from "@/services/plu/types";

export const MIN_VERBATIM_CITATION_WORDS = 20;
export const MAX_AI_CALLS_PER_FLOW = 5;

/**
 * Normalize text for verbatim citation verification:
 * strips diacritics, lowercases, normalizes apostrophes/hyphens, and collapses whitespace.
 */
export function normalizeForCitation(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’'`´]/g, "'")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^a-z0-9%.,;:'\-/\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Verify programmatically that `citation` appears verbatim in `articleText`.
 * Enforces >= 20 words for standard prose articles, while allowing >= 4 words
 * for short/tabular clauses (e.g. `UAe4 : 12 m`) so tabular rules are not dropped.
 */
export function verifyVerbatimCitation(
  articleText: string,
  citation: string,
  minWords: number = MIN_VERBATIM_CITATION_WORDS,
): { valid: boolean; wordCount: number; reason?: string } {
  if (!articleText || !citation) {
    return { valid: false, wordCount: 0, reason: "Missing article text or citation" };
  }

  const normArticle = normalizeForCitation(articleText);
  const normCitation = normalizeForCitation(citation);
  const words = normCitation.split(/\s+/).filter(Boolean);
  const articleWordCount = normArticle.split(/\s+/).filter(Boolean).length;
  const isShortOrTabular =
    articleWordCount < minWords + 5 || /[|\t]|\b\d+(?:[.,]\d+)?\s*(?:m|%|places?)\b/i.test(citation);
  const effectiveMinWords = isShortOrTabular ? Math.min(minWords, 4) : minWords;

  if (words.length < effectiveMinWords) {
    return {
      valid: false,
      wordCount: words.length,
      reason: `Citation too short (${words.length} < ${effectiveMinWords} words)`,
    };
  }

  if (!normArticle.includes(normCitation)) {
    return {
      valid: false,
      wordCount: words.length,
      reason: "Citation does not appear verbatim in article text",
    };
  }

  return { valid: true, wordCount: words.length };
}

function parseFrenchNumber(raw: string): number | null {
  const cleaned = raw.replace(/\s+/g, "").replace(",", ".");
  const val = Number.parseFloat(cleaned);
  return Number.isFinite(val) ? val : null;
}

/**
 * Deterministic regex fallbacks for well-known French PLU clauses
 * (e.g., depth-based emprise in Article 4, hauteur de façade in Article 5,
 * percentage green spaces, setback distances, and parking ratios).
 */
export function extractDeterministicRulesFromArticles(
  articles: ExtractedArticle[],
): {
  rules: Partial<StructuredRegulatoryRules>;
  details: Record<string, string>;
  citations: Array<{ article: string; excerpt: string }>;
} {
  const rules: Partial<StructuredRegulatoryRules> = {};
  const details: Record<string, string> = {};
  const citations: Array<{ article: string; excerpt: string }> = [];

  // 1. Emprise au sol (including depth-based emprise in Article 4 / Article 9)
  const empriseArticles = matchArticlesByTitle(articles, "emprise");
  for (const art of empriseArticles) {
    const text = art.content;
    // Depth-based emprise clause: e.g. "dans une bande de 20 mètres ... emprise au sol ... 40 %"
    const depthMatch = text.match(
      /(?:bande\s+(?:de\s+)?constructibilit[ée]\s+de\s+\d+\s*m[èe]tres?[^.]{0,160}?(\d{1,3}(?:[.,]\d+)?)\s*%)|(?:emprise\s+au\s+sol[^.]{0,140}?(?:limit[ée]e?\s+[àa]|maximale?\s+(?:est\s+fix[ée]e\s+[àa]|de)|ne\s+peut\s+exc[ée]der|inf[ée]rieure\s+ou\s+[ée]gale\s+[àa])\s*(\d{1,3}(?:[.,]\d+)?)\s*%)/i,
    );
    const pctStr = depthMatch?.[1] || depthMatch?.[2];
    if (pctStr) {
      const pct = parseFrenchNumber(pctStr);
      if (pct !== null && pct > 0 && pct <= 100 && rules.maxCoverageRatio === undefined) {
        rules.maxCoverageRatio = Math.round((pct / 100) * 1000) / 1000;
        details.emprise = `${pctStr} % (${art.articleNumber})`;
        citations.push({
          article: art.articleNumber,
          excerpt: depthMatch[0].trim().slice(0, 280),
        });
        break;
      }
    }
  }

  // 2. Hauteur de façade / hauteur maximale (Article 5 / Article 10, prose or colon/tabular)
  const heightArticles = matchArticlesByTitle(articles, "hauteur");
  for (const art of heightArticles) {
    const text = art.content;
    const facadeMatch = text.match(
      /hauteur\s+(?:de\s+fa[çc]ade|maximale\s+des\s+constructions|maximale|totale|[àa]\s+l['’][ée]gout)[^.\n]{0,120}?(?:fix[ée]e\s+[àa]|limit[ée]e\s+[àa]|ne\s+peut\s+exc[ée]der|est\s+de|inf[ée]rieure\s+ou\s+[ée]gale\s+[àa]|:)\s*(\d{1,2}(?:[.,]\d+)?)\s*m(?:[èe]tres?)?/i,
    );
    if (facadeMatch?.[1]) {
      const meters = parseFrenchNumber(facadeMatch[1]);
      if (meters !== null && meters > 0 && meters <= 100) {
        if (/fa[çc]ade|[ée]gout/i.test(facadeMatch[0])) {
          if (rules.maxEavesHeightM === undefined) rules.maxEavesHeightM = meters;
          if (!details.hauteur_facade) {
            details.hauteur_facade = `${facadeMatch[1]} m (${art.articleNumber})`;
          }
        }
        if (rules.maxHeightM === undefined) {
          rules.maxHeightM = meters;
          details.hauteur_totale =
            details.hauteur_totale || `${facadeMatch[1]} m (${art.articleNumber})`;
          citations.push({
            article: art.articleNumber,
            excerpt: facadeMatch[0].trim().slice(0, 280),
          });
        }
      }
    }

    const storeyMatch = text.match(/\bR\s*\+\s*(\d{1,2})\b/i);
    if (storeyMatch?.[1] && rules.maxStoreys === undefined) {
      const additional = Number.parseInt(storeyMatch[1], 10);
      if (Number.isFinite(additional) && additional >= 0 && additional <= 20) {
        rules.maxStoreys = additional + 1;
      }
    }
  }

  // 3. Espaces verts / pleine terre (Article 13)
  const greenArticles = matchArticlesByTitle(articles, "espaces_verts");
  for (const art of greenArticles) {
    const text = art.content;
    const greenMatch = text.match(
      /(?:espaces?\s+(?:verts?|libres?)|pleine\s+terre)[^.]{0,140}?(?:au\s+moins|minimum|minimale?\s+de|repr[ée]senter)\s*(\d{1,3}(?:[.,]\d+)?)\s*%/i,
    );
    if (greenMatch?.[1]) {
      const pct = parseFrenchNumber(greenMatch[1]);
      if (pct !== null && pct >= 0 && pct <= 100 && rules.minGreenRatio === undefined) {
        rules.minGreenRatio = Math.round((pct / 100) * 1000) / 1000;
        details.espaces_vegetalises = `${greenMatch[1]} % (${art.articleNumber})`;
        citations.push({
          article: art.articleNumber,
          excerpt: greenMatch[0].trim().slice(0, 280),
        });
        break;
      }
    }
  }

  // 4. Reculs (voies & limites séparatives)
  const setbackArticles = matchArticlesByTitle(articles, "recul");
  for (const art of setbackArticles) {
    const text = art.content;
    const frontMatch = text.match(
      /(?:recul|retrait)\s+(?:minimum|minimal|d['’]au\s+moins)?\s*(?:de\s+)?(\d{1,2}(?:[.,]\d+)?)\s*m(?:[èe]tres?)?\s*(?:par\s+rapport\s+[àa]\s+l['’]alignement|de\s+la\s+voie)/i,
    );
    if (frontMatch?.[1] && rules.frontSetbackM === undefined) {
      const m = parseFrenchNumber(frontMatch[1]);
      if (m !== null && m >= 0 && m <= 50) {
        rules.frontSetbackM = m;
        details.recul_voies = `${frontMatch[1]} m (${art.articleNumber})`;
      }
    }

    const sideMatch = text.match(
      /limites?\s+s[ée]paratives?[^.]{0,120}?(?:retrait|recul|distance)[^.]{0,60}?(?:au\s+moins|minimum|inf[ée]rieure?\s+[àa])\s*(\d{1,2}(?:[.,]\d+)?)\s*m(?:[èe]tres?)?/i,
    );
    if (sideMatch?.[1] && rules.sideSetbackM === undefined) {
      const m = parseFrenchNumber(sideMatch[1]);
      if (m !== null && m >= 0 && m <= 50) {
        rules.sideSetbackM = m;
        details.limites_separatives = `${sideMatch[1]} m (${art.articleNumber})`;
      }
    }
  }

  // 5. Stationnement (Article 12)
  const parkingArticles = matchArticlesByTitle(articles, "stationnement");
  for (const art of parkingArticles) {
    const text = art.content;
    const parkMatch = text.match(
      /(\d+(?:[.,]\d+)?)\s*places?\s*(?:de\s+stationnement\s*)?par\s+logement/i,
    );
    if (parkMatch?.[1] && rules.parkingPerDwelling === undefined) {
      const count = parseFrenchNumber(parkMatch[1]);
      if (count !== null && count >= 0 && count <= 10) {
        rules.parkingPerDwelling = count;
        details.stationnement = `${parkMatch[1]} place(s) par logement (${art.articleNumber})`;
        citations.push({
          article: art.articleNumber,
          excerpt: parkMatch[0].trim().slice(0, 280),
        });
        break;
      }
    }
  }

  return { rules, details, citations };
}

interface RecoveryPassOutput {
  value?: number | null;
  detail?: string | null;
  citation?: string | null;
}

/**
 * Targeted Multi-Pass Recovery with strict per-flow AI call budget (`maxCalls = 5` total):
 * Bundles up to 3 matching articles per missing aspect so we never exceed `maxCalls` per flow:
 * 1. Height Pass (hauteur totale / façade / R+N)
 * 2. Emprise & Green Spaces Pass (emprise au sol + espaces verts / pleine terre)
 * 3. Setbacks Pass (recul voies + limites séparatives)
 * 4. Aspect & Parking Pass (Articles 11-12 or `TITLE_PATTERNS` match)
 */
export async function runTargetedRecoveryPasses(params: {
  ollama: OllamaService;
  model: string;
  fallbackModels?: string[];
  zoneCode?: string;
  articles: ExtractedArticle[];
  currentRules: StructuredRegulatoryRules;
  currentDetails: Record<string, string>;
  currentCitations: Array<{ article: string; excerpt: string }>;
  warnings: string[];
  initialCallsUsed?: number;
  maxCalls?: number;
}): Promise<{
  rules: StructuredRegulatoryRules;
  details: Record<string, string>;
  citations: Array<{ article: string; excerpt: string }>;
  callsUsed: number;
}> {
  const rules = { ...params.currentRules };
  const details = { ...params.currentDetails };
  const citations = [...params.currentCitations];
  const maxCalls = params.maxCalls ?? MAX_AI_CALLS_PER_FLOW;
  let callsUsed = params.initialCallsUsed ?? 1;

  const canCallAi = () => callsUsed < maxCalls;

  const runBundledCategoryPrompt = async (
    category: RegulatoryCategory,
    targetArticles: ExtractedArticle[],
    instruction: string,
  ): Promise<{ combinedText: string; articleLabel: string; output: RecoveryPassOutput } | null> => {
    if (!canCallAi() || targetArticles.length === 0) return null;
    callsUsed += 1;

    const selected = targetArticles.slice(0, 3);
    const combinedText = selected
      .map((a) => `### ${a.articleNumber} — ${a.title}\n${a.content.slice(0, 3600)}`)
      .join("\n\n");
    const articleLabel = selected.map((a) => a.articleNumber).join(", ");

    try {
      const res = await params.ollama.generateJson<RecoveryPassOutput>({
        model: params.model,
        fallbackModels: params.fallbackModels,
        options: { temperature: 0 },
        maxRepairAttempts: 1,
        timeoutMs: 35000,
        messages: [
          {
            role: "system",
            content:
              `Tu extrais UNE règle d'urbanisme (${category}) pour la zone ${params.zoneCode || "concernée"} (y compris si elle figure dans un sous-chapitre parent ou un tableau). ` +
              `Température 0, aucune invention. Réponds UNIQUEMENT en JSON valide: {"value": number|null, "detail": string|null, "citation": string|null}. ` +
              `"citation" doit être une citation COPIÉE MOT POUR MOT du texte fourni (au moins 20 mots pour du texte rédigé, ou la ligne exacte du tableau/clause courte).`,
          },
          {
            role: "user",
            content: `Zone cible: ${params.zoneCode || "inconnue"}\nCatégorie: ${category}\nConsigne: ${instruction}\n\nExtraits:\n${combinedText}`,
          },
        ],
        validate: (parsed: unknown) => {
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("Expected JSON object in recovery pass");
          }
          return parsed as RecoveryPassOutput;
        },
      });

      const output = res.data;
      if (!output) return null;
      if (output.citation) {
        const check = verifyVerbatimCitation(
          combinedText,
          output.citation,
          MIN_VERBATIM_CITATION_WORDS,
        );
        if (!check.valid) {
          params.warnings.push(
            `Recovery citation rejected for ${category} (${articleLabel}): ${check.reason}`,
          );
          return null;
        }
      }
      return { combinedText, articleLabel, output };
    } catch {
      return null;
    }
  };

  // Priority 1: Height Pass (hauteur totale / façade / R+N)
  if (
    canCallAi() &&
    rules.maxHeightM === null &&
    rules.maxEavesHeightM === null &&
    rules.maxStoreys === null
  ) {
    const hArticles = matchArticlesByTitle(params.articles, "hauteur");
    const candidates = hArticles.length > 0 ? hArticles : params.articles.slice(0, 3);
    const recovered = await runBundledCategoryPrompt(
      "hauteur",
      candidates,
      `Extrais la hauteur maximale en mètres (ou hauteur de façade/égout si seule celle-ci est donnée) pour la zone ${params.zoneCode || ""} dans 'value' (nombre en mètres) et le détail complet dans 'detail'.`,
    );
    if (recovered?.output.value && recovered.output.value > 0 && recovered.output.value <= 100) {
      rules.maxHeightM = recovered.output.value;
      if (recovered.output.detail) details.hauteur_totale = recovered.output.detail;
      if (recovered.output.citation) {
        citations.push({ article: recovered.articleLabel, excerpt: recovered.output.citation });
      }
    }
  }

  // Priority 2: Emprise & Green Spaces Pass
  if (canCallAi() && rules.maxCoverageRatio === null) {
    const empArticles = matchArticlesByTitle(params.articles, "emprise");
    const candidates = empArticles.length > 0 ? empArticles : params.articles.slice(0, 3);
    const recovered = await runBundledCategoryPrompt(
      "emprise",
      candidates,
      `Extrais le ratio d'emprise au sol maximale (ex: 40% -> 0.40) pour la zone ${params.zoneCode || ""} dans 'value' (entre 0 et 1, JAMAIS en mètres) et la règle dans 'detail'.`,
    );
    if (recovered?.output.value && recovered.output.value > 0 && recovered.output.value <= 1) {
      rules.maxCoverageRatio = recovered.output.value;
      if (recovered.output.detail) details.emprise = recovered.output.detail;
      if (recovered.output.citation) {
        citations.push({ article: recovered.articleLabel, excerpt: recovered.output.citation });
      }
    }
  }

  if (canCallAi() && rules.minGreenRatio === null) {
    const gArticles = matchArticlesByTitle(params.articles, "espaces_verts");
    const candidates = gArticles.length > 0 ? gArticles : params.articles.slice(0, 3);
    const recovered = await runBundledCategoryPrompt(
      "espaces_verts",
      candidates,
      `Extrais le ratio minimal d'espaces verts / pleine terre (ex: 30% -> 0.30) pour la zone ${params.zoneCode || ""} dans 'value' et le détail dans 'detail'.`,
    );
    if (
      typeof recovered?.output.value === "number" &&
      recovered.output.value >= 0 &&
      recovered.output.value <= 1
    ) {
      rules.minGreenRatio = recovered.output.value;
      if (recovered.output.detail) details.espaces_vegetalises = recovered.output.detail;
      if (recovered.output.citation) {
        citations.push({ article: recovered.articleLabel, excerpt: recovered.output.citation });
      }
    }
  }

  // Priority 3: Setbacks Pass
  if (canCallAi() && rules.frontSetbackM === null && rules.sideSetbackM === null) {
    const rArticles = matchArticlesByTitle(params.articles, "recul");
    if (rArticles.length > 0) {
      const recovered = await runBundledCategoryPrompt(
        "recul",
        rArticles,
        `Extrais le recul minimal par rapport aux voies en mètres pour la zone ${params.zoneCode || ""} dans 'value' et le détail (voies + limites séparatives) dans 'detail'.`,
      );
      if (
        typeof recovered?.output.value === "number" &&
        recovered.output.value >= 0 &&
        recovered.output.value <= 50
      ) {
        rules.frontSetbackM = recovered.output.value;
        if (recovered.output.detail) details.recul_voies = recovered.output.detail;
        if (recovered.output.citation) {
          citations.push({ article: recovered.articleLabel, excerpt: recovered.output.citation });
        }
      }
    }
  }

  // Priority 4: Aspect & Parking Pass
  if (canCallAi() && !details.aspect_exterieur) {
    const aspectArticles = matchArticlesByTitle(params.articles, "aspect_exterieur");
    if (aspectArticles.length > 0) {
      const recovered = await runBundledCategoryPrompt(
        "aspect_exterieur",
        aspectArticles,
        "Extrais les règles d'aspect extérieur (façades, toitures, matériaux, clôtures) dans 'detail' (value: null).",
      );
      if (recovered?.output.detail) {
        details.aspect_exterieur = recovered.output.detail;
        if (recovered.output.citation) {
          citations.push({ article: recovered.articleLabel, excerpt: recovered.output.citation });
        }
      }
    }
  }

  if (canCallAi() && (rules.parkingPerDwelling === null || !details.stationnement)) {
    const parkingArticles = matchArticlesByTitle(params.articles, "stationnement");
    if (parkingArticles.length > 0) {
      const recovered = await runBundledCategoryPrompt(
        "stationnement",
        parkingArticles,
        "Extrais le nombre de places par logement dans 'value' (nombre) et les modalités dans 'detail'.",
      );
      if (recovered) {
        if (
          typeof recovered.output.value === "number" &&
          rules.parkingPerDwelling === null
        ) {
          rules.parkingPerDwelling = recovered.output.value;
        }
        if (recovered.output.detail && !details.stationnement) {
          details.stationnement = recovered.output.detail;
        }
        if (recovered.output.citation) {
          citations.push({ article: recovered.articleLabel, excerpt: recovered.output.citation });
        }
      }
    }
  }

  return { rules, details, citations, callsUsed };
}
