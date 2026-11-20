import {
  createStructuredExtractionPipeline,
  formatContextChunks,
  PromptBuilder,
  PromptTemplate,
} from '@/services/ai-pipeline'
import type {
  ExtractedArticle,
  OllamaInterpretationResult,
  StructuredRegulatoryRules,
} from '@/services/plu/types'
import { getOllamaService, OllamaService } from '@/services/ollama/OllamaService'

const EMPTY_RULES: StructuredRegulatoryRules = {
  maxHeightM: null,
  maxEavesHeightM: null,
  maxStoreys: null,
  maxCoverageRatio: null,
  frontSetbackM: null,
  sideSetbackM: null,
  rearSetbackM: null,
  minGreenRatio: null,
  parkingPerDwelling: null,
}

export interface InterpretRegulationsParams {
  prompt: string
  model?: string
  fallbackModels?: string[]
  parcelSurfaceM2?: number | null
  zoneCode?: string
  commune?: string
  articles: ExtractedArticle[]
  existingRules?: Partial<StructuredRegulatoryRules>
  gisContext?: string
  maxContextChars?: number
  maxArticles?: number
  ollama?: OllamaService
}

export function buildPluRegulatorySystemPrompt(): string {
  return PromptBuilder.create()
    .role('TON RÔLE : EXTRAIRE ET STRUCTURER, RIEN D’AUTRE', [
      'Tu es un outil d’extraction et de structuration d’informations issues du règlement officiel d’un PLU/PLUi français.',
      'Tu n’es PAS un conseiller, PAS un expert qui complète, PAS un calculateur. Tu LIS le texte fourni, tu RECOPIES ce qui y est écrit, tu le RANGES dans le JSON demandé.',
      'Trois interdictions absolues, sans exception, quelles que soient les circonstances :',
      '  1. NE RIEN INVENTER : aucun chiffre, aucune règle, aucun article, aucune citation qui ne soit pas écrit dans le texte fourni.',
      '  2. NE RIEN CHANGER : ne reformule pas une règle, ne corrige pas le texte, ne convertis pas une unité, n’arrondis pas, ne simplifie pas une formule, ne « complète » pas une règle partielle.',
      '  3. NE RIEN DÉDUIRE NI CALCULER : pas de multiplication, pas de surface, pas de SDP, pas de volume, pas de niveaux, pas d’emprise après reculs, pas de moyenne, pas d’estimation. Le code de l’application fait les calculs, pas toi.',
      'Si une information n’est pas dans le texte fourni : la valeur est null (ou "Non réglementé" dans "details") et tu l’indiques dans "warnings". Il vaut TOUJOURS mieux renvoyer null qu’une valeur incertaine. Une réponse incomplète mais exacte est correcte ; une réponse complète mais inventée est une faute grave.',
    ])
    .section('SOURCES AUTORISÉES', [
      'Uniquement : (a) le texte de l’article du règlement fourni ; (b) les données de parcelle fournies (zone, commune, surface). Rien d’autre : ni tes connaissances générales sur le PLU de cette commune, ni ce qui se fait « habituellement », ni les valeurs d’une autre zone, ni une valeur « par défaut ».',
    ])
    .constraints('RÈGLES DE LECTURE', [
      'VALEURS RECOPIÉES : une valeur se recopie avec ses chiffres et unités exacts. « 13 mètres » reste « 13 mètres ». Jamais un nombre sans unité.',
      'FORMULES : une formule se recopie telle quelle, sans la calculer. Exemples : « d ≥ DA/2 et d ≥ 3 m » ; « hauteur de façade + 3 m ». Dans "rules", mets null et garde la formule dans "details".',
      'ZONE DEMANDÉE UNIQUEMENT : quand le texte donne une valeur par zone, prends celle de la zone demandée. Exemple : « en UCt1, 20 % ; dans les autres zones, 30 % » → pour UC1 : 30 %. Ne prends jamais la valeur d’une autre zone.',
      'TABLEAUX : si on te fournit « valeurs lues sous la colonne de la zone », ces valeurs priment sur le texte brut. Si aucune valeur de tableau n’est fournie et que tu ne peux pas savoir quel nombre correspond à la zone : null + avertissement, ne devine jamais.',
      'COMMUNE : si la règle diffère selon la commune, donne celle de la commune indiquée. Les autres cas vont dans "warnings".',
      'EXCEPTIONS, ALTERNATIVES ET BONIFICATIONS : dans "rules", garde la règle générale (ou null si conditionnelle/formule). Dans "details", rédige un PARAGRAPHE COMPLET incluant la règle principale ET toutes les exceptions, règles alternatives, majorations, conditions par destination ou par commune figurant dans l’article.',
      'EXHAUSTIVITÉ DES PARAGRAPHES ("details") : ne te limite PAS à un chiffre isolé quand l’article contient des précisions. Recopie en paragraphes complets et structurés toutes les dispositions utiles de l’article (conditions d’application, seuils, destinations, arbres à planter, clôtures pleines/ajourées, places résidents/visiteurs/vélos, règles alternatives, OAP).',
      'DEUX VALEURS POSSIBLES et tu ne sais pas laquelle s’applique : null + avertissement qui cite les deux. Ne tranche jamais.',
      'PLUSIEURS RÈGLES DANS UNE PHRASE : sépare-les, mais ne change aucun mot ni aucun chiffre.',
    ])
    .section('CITATIONS OBLIGATOIRES', [
      'Chaque règle extraite est accompagnée d’une citation COPIÉE MOT POUR MOT du texte fourni (au moins 12 mots) et du numéro de l’article. Pas de reformulation, pas de « … » au milieu d’une phrase pour en changer le sens, pas de citation inventée. Le code vérifiera chaque citation dans le texte : une citation fausse fait rejeter la règle.',
      'Si tu ne peux pas citer le passage exact, la valeur est null.',
    ])
    .examples('CE QUE TU NE FAIS JAMAIS (exemples)', {
      forbidden: [
        'Le texte dit « 13 mètres » → tu écris 12 ou 13,5 ou « environ 13 m ».',
        'Le texte ne parle pas du stationnement → tu écris « 1 place par logement » parce que c’est courant.',
        'Le texte dit « d ≥ DA/2 et d ≥ 3 m » → tu écris « 3 m » ou « recul de 3 mètres ».',
        'Surface 2 638 m² et emprise 30 % → tu écris 791,4 dans le JSON : NON. Tu extrais seulement le ratio (maxCoverageRatio 0.30) ; le code de l’application calcule la surface. Tu ne renvoies aucun résultat de calcul.',
        'Tu convertis 0,80 m en 80 cm ; tu arrondis 0,80 en 1 ; tu écris « 2 m » pour « inférieure ou égale à 2 mètres » sans citer.',
        'Tu combles un trou avec la règle d’une zone voisine (UP pour UC, UCt1 pour UC1).',
        'Tu ajoutes des conseils, des recommandations ou des interprétations juridiques dans les règles.',
      ],
      allowed: [
        'Le texte ne dit rien sur les clôtures → "clotures" absent de "details" et warning « clôtures : non trouvées dans l’article fourni ».',
      ],
    })
    .section('VÉRIFICATION AVANT DE RÉPONDRE (fais-la vraiment)', [
      'Pour CHAQUE valeur de ta réponse, pose-toi : « Puis-je mettre mon doigt sur le passage exact du texte fourni qui contient ce chiffre ? ». Non → null. Puis : « Ai-je changé un mot, un chiffre ou une unité ? ». Oui → corrige en recopiant.',
    ])
    .outputJsonContract([
      'UN seul objet JSON valide, sans balises markdown, sans texte avant ou après, retours à la ligne échappés (\\n) dans les chaînes.',
      'Tu ne renvoies AUCUN champ calculé (emprise en m², pleine terre en m², emprise après reculs, niveaux, SDP, volume) : le code de l’application les calcule à partir des ratios extraits et de la surface de la parcelle.',
      '{',
      '  "rules": {',
      '    "maxHeightM": number|null,            // hauteur de FAÇADE courante, en mètres, si elle est un simple nombre',
      '    "maxEavesHeightM": number|null,',
      '    "maxStoreys": number|null,',
      '    "maxCoverageRatio": number|null,      // 30 % → 0.30, seulement si le texte donne un pourcentage',
      '    "frontSetbackM": number|null,         // seulement si la règle est UN nombre ; formule → null',
      '    "sideSetbackM": number|null,          // formule (DA/2…) → null',
      '    "rearSetbackM": number|null,',
      '    "minGreenRatio": number|null,         // espaces végétalisés, seulement si un pourcentage est écrit',
      '    "parkingPerDwelling": number|null',
      '  },',
      '  "summary": string,                      // synthèse en Markdown (.md) débutant par un paragraphe clair et complet (3 à 5 phrases) résumant le profil réglementaire de la zone, ses règles clés et ses exceptions (strictement d’après le texte fourni)',
      '  "details": {                            // paragraphes COMPLETS et détaillés de chaque règle/donnée trouvée, incluant la règle de base, les exceptions/conditions et « — Article X » à la fin ; clés possibles :',
      '    "hauteur_facade": string, "hauteur_totale": string, "emprise": string, "recul_voies": string,',
      '    "limites_separatives": string, "entre_batiments": string,',
      '    "stationnement": string, "aspect_exterieur": string,',
      '    "espaces_vegetalises": string, "pleine_terre": string, "clotures": string, "eaux_pluviales": string,',
      '    "servitudes": string, "servitudes_utilite_publique": string, "informations_foncieres": string,',
      '    "risques": string, "oap": string, "points_de_vigilance": string',
      '  },',
      '  "citations": [{"article": string, "excerpt": string}],   // extraits EXACTS',
      '  "warnings": [string]                                      // règles absentes, bonifications, cas ambigus',
      '}',
      '',
      'EXEMPLE DE FORME UNIQUEMENT. Zone fictive « ZZ9 », valeurs inventées pour montrer la structure : ne les réutilise JAMAIS, ne t’en inspire pour aucune valeur. Utilise uniquement le texte fourni.',
      '{"rules":{"maxHeightM":99,"maxEavesHeightM":null,"maxStoreys":null,"maxCoverageRatio":0.99,"frontSetbackM":null,"sideSetbackM":null,"rearSetbackM":null,"minGreenRatio":null,"parkingPerDwelling":null},',
      ' "details":{"hauteur_facade":"99 m","emprise":"99 % maximum de la surface du terrain","limites_separatives":"d ≥ DA/2 et d ≥ 9 m"},',
      ' "citations":[{"article":"4","excerpt":"L’emprise au sol de la totalité des constructions est inférieure ou égale à 99 % de la surface du terrain dans la zone ZZ9."}],',
      ' "warnings":["Clôtures : non trouvées dans l’article fourni"]}',
    ])
    .build()
}

const DETAIL_LABELS: Record<string, string> = {
  hauteur_facade: 'Hauteur de façade',
  hauteur_totale: 'Hauteur totale',
  emprise: 'Emprise au sol',
  recul_voies: 'Retrait sur voies',
  limites_separatives: 'Limites séparatives',
  entre_batiments: "Entre bâtiments d'un même terrain",
  stationnement: 'Stationnement',
  aspect_exterieur: 'Aspect extérieur',
  espaces_vegetalises: 'Espaces végétalisés',
  pleine_terre: 'Pleine terre',
  clotures: 'Clôtures',
  eaux_pluviales: 'Eaux pluviales',
  servitudes: 'Servitudes (Règlement graphique)',
  servitudes_utilite_publique: "Servitudes d'utilité publique (SUP)",
  informations_foncieres: 'Informations (DPU, RLPi, périmètres)',
  risques: 'Risques naturels / PPRI',
  oap: 'OAP applicable',
  points_de_vigilance: 'Points de vigilance',
}

function formatRegulatorySynthesis(
  details?: Record<string, string>,
): string | undefined {
  if (!details) return undefined
  const orderedKeys = [
    ...Object.keys(DETAIL_LABELS),
    ...Object.keys(details).filter((k) => !(k in DETAIL_LABELS)),
  ]
  const blocks: string[] = []
  for (const key of orderedKeys) {
    const rawVal = details[key]
    if (typeof rawVal !== 'string') continue
    const val = rawVal.trim()
    if (!val || /^non\s+r[ée]glement[ée]$/i.test(val)) continue
    const label = DETAIL_LABELS[key] || key.replace(/_/g, ' ')
    blocks.push(`- **${label}** = ${val}`)
  }
  return blocks.length > 0 ? blocks.join('\n') : undefined
}

function rankArticlesForPrompt(
  articles: ExtractedArticle[],
  zoneCode?: string,
  prompt?: string,
  maxArticles = 40,
): ExtractedArticle[] {
  if (articles.length <= maxArticles) return articles

  const zoneLower = zoneCode?.trim().toLowerCase()
  const promptWords = (prompt || '')
    .toLowerCase()
    .split(/[^a-z0-9àâéèêëîïôùûüç]+/i)
    .filter((w) => w.length >= 4)

  const coreRegex =
    /(?:hauteur|emprise|recul|alignement|stationnement|pleine\s+terre|cl[ôo]ture|aspect|oap|eaux\s+pluviales|article\s*(?:1|2|3|4|5|6|7|8|9|10|11|12|13))/i

  return [...articles]
    .map((a, idx) => {
      let score = 0
      const haystack = `${a.articleNumber} ${a.title} ${a.content}`.toLowerCase()
      if (zoneLower && haystack.includes(zoneLower)) score += 10
      if (coreRegex.test(haystack)) score += 6
      for (const word of promptWords) {
        if (haystack.includes(word)) score += 3
      }
      // Preserve natural article order as a tiebreaker
      return { article: a, score, idx }
    })
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
    .slice(0, maxArticles)
    .map((x) => x.article)
}

const USER_PROMPT_TEMPLATE = PromptTemplate.from<{
  commune: string
  zoneCode: string
  parcelSurfaceM2: string | number
  gisContext: string
  prompt: string
  contextText: string
}>([
  'Commune: {{commune}}',
  'Zone PLU: {{zoneCode}}',
  'Surface parcelle (m²): {{parcelSurfaceM2}}',
  'Servitudes / Informations GIS & GPU: {{gisContext}}',
  'User Feasibility Prompt: {{prompt}}',
  '',
  'Official PLU Excerpts:',
  '{{contextText}}',
])

/**
 * Create a reusable AI pipeline for interpreting French PLU regulatory articles via Ollama.
 */
export function createPluRegulatoryExtractionPipeline(ollama?: OllamaService) {
  const service = ollama ?? getOllamaService()
  const systemPrompt = buildPluRegulatorySystemPrompt()

  return createStructuredExtractionPipeline<
    InterpretRegulationsParams,
    Partial<OllamaInterpretationResult>,
    OllamaInterpretationResult
  >({
    name: 'plu-regulatory-interpretation',
    ollama: service,
    guard: {
      predicate: (params) => {
        if (params.articles.length === 0) return false
        const disabled =
          process.env.OLLAMA_DISABLED === 'true' ||
          process.env.OLLAMA_BASE_URL?.trim().toLowerCase() === 'disabled'
        if (disabled) return false
        return true
      },
      onShortCircuit: (params, ctx) => {
        const defaultModel = ctx.ollama.getConfig().defaultModel
        const primaryModel = params.model?.trim() || defaultModel
        const mergedSeedRules: StructuredRegulatoryRules = {
          ...EMPTY_RULES,
          ...(params.existingRules || {}),
        }

        if (params.articles.length === 0) {
          console.warn(
            `[Ollama] Skipping AI call: 0 regulatory articles available (zone=${params.zoneCode || 'unknown'}, commune=${params.commune || 'unknown'})`,
          )
          return {
            status: 'insufficient_data',
            model: primaryModel,
            zoneCode: params.zoneCode,
            summary:
              'No official PLU regulatory articles were available in the knowledge base or retrieved documents. No regulatory parameters were fabricated.',
            rules: mergedSeedRules,
            citations: [],
            warnings: [
              'Official PLU written regulation text is missing for this zone/commune. Upload the PLU PDF or link Regulations records to enable AI interpretation.',
            ],
          }
        }

        console.warn('[Ollama] Skipping AI call: Ollama is disabled in configuration')
        return {
          status: 'unconfigured',
          model: primaryModel,
          zoneCode: params.zoneCode,
          summary:
            'Ollama AI interpretation is disabled. Returned structured rules directly from stored official Regulations without LLM synthesis.',
          rules: mergedSeedRules,
          citations: params.articles.slice(0, 5).map((a) => ({
            article: a.articleNumber,
            excerpt: a.content.slice(0, 240),
          })),
          warnings: ['Ollama AI regulatory interpretation is disabled; returned stored rules.'],
        }
      },
    },
    model: (params, ctx) => params.model?.trim() || ctx.ollama.getConfig().defaultModel,
    fallbackModels: (params) => params.fallbackModels || [],
    options: { num_predict: 4096 },
    systemPrompt,
    userPrompt: (params) => {
      const maxChars = Math.max(5000, params.maxContextChars ?? 90000)
      const maxArticles = Math.max(5, params.maxArticles ?? 40)
      const rankedArticles = rankArticlesForPrompt(
        params.articles,
        params.zoneCode,
        params.prompt,
        maxArticles,
      )
      const contextText = formatContextChunks(
        rankedArticles.map((a) => ({
          id: a.articleNumber,
          title: a.title,
          content: a.content,
        })),
        { maxChars },
      )
      return USER_PROMPT_TEMPLATE.render({
        commune: params.commune || 'Unknown',
        zoneCode: params.zoneCode || 'Unknown',
        parcelSurfaceM2: params.parcelSurfaceM2 ?? 'Non disponible',
        gisContext: params.gisContext || 'Aucune servitude ou information complémentaire fournie',
        prompt: params.prompt,
        contextText,
      })
    },
    validate: (parsed) => {
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Expected a JSON object for regulatory interpretation')
      }
      return parsed as Partial<OllamaInterpretationResult>
    },
    formatOutput: ({ input: params, extracted: parsed, model, raw }, ctx) => {
      const mergedSeedRules: StructuredRegulatoryRules = {
        ...EMPTY_RULES,
        ...(params.existingRules || {}),
      }
      const details =
        parsed.details && typeof parsed.details === 'object' ? parsed.details : undefined
      const detailsSummary = formatRegulatorySynthesis(details)
      const aiParagraph =
        typeof parsed.summary === 'string' && parsed.summary.trim().length > 0
          ? parsed.summary.trim()
          : undefined
      const resolvedSummary =
        aiParagraph && detailsSummary
          ? `${aiParagraph}\n\n---\n\n### Détail des règles extraites\n\n${detailsSummary}`
          : aiParagraph || detailsSummary || 'Extraction réglementaire terminée.'

      console.log(
        `[Ollama] Model ${model} succeeded (summaryChars=${resolvedSummary.length}, citations=${Array.isArray(parsed.citations) ? parsed.citations.length : 0})`,
      )

      return {
        status: 'ok',
        model,
        zoneCode: params.zoneCode,
        summary: resolvedSummary,
        rules: {
          ...mergedSeedRules,
          ...(parsed.rules || {}),
        },
        details,
        constructibility: parsed.constructibility,
        citations: Array.isArray(parsed.citations) ? parsed.citations : [],
        warnings: [
          ...ctx.warnings,
          ...(Array.isArray(parsed.warnings) ? parsed.warnings : []),
        ],
        rawResponse: raw,
      }
    },
    onFallback: (error, params, ctx) => {
      const primaryModel = params.model?.trim() || ctx.ollama.getConfig().defaultModel
      const mergedSeedRules: StructuredRegulatoryRules = {
        ...EMPTY_RULES,
        ...(params.existingRules || {}),
      }
      console.error(`[Ollama] All candidate models failed. Last error: ${error.message}`)
      return {
        status: 'error',
        model: primaryModel,
        zoneCode: params.zoneCode,
        summary: `Ollama API call failed (${error.message}); falling back to structured stored rules.`,
        rules: mergedSeedRules,
        citations: [],
        warnings: ctx.warnings.length > 0 ? [...ctx.warnings] : [error.message],
        error: error.message,
      }
    },
    temperature: 0.1,
    timeoutMs: 60000,
    maxRepairAttempts: 1,
  })
}

/**
 * Interpret official PLU regulatory articles using the Ollama AI Pipeline.
 * Strictly refuses to fabricate rules when no regulatory text is supplied or when Ollama is disabled.
 */
export async function interpretRegulationsWithOllama(
  params: InterpretRegulationsParams,
): Promise<OllamaInterpretationResult> {
  const pipeline = createPluRegulatoryExtractionPipeline(params.ollama)
  const result = await pipeline.execute(params)
  return result.output
}
