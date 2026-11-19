import {
  createOpenRouterChatCompletion,
  getOpenRouterConfig,
} from '@/api/openrouter'
import type {
  ExtractedArticle,
  OpenRouterInterpretationResult,
  StructuredRegulatoryRules,
} from '@/services/plu/types'

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

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim()
  const unfenced = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    : trimmed

  const firstBrace = unfenced.indexOf('{')
  const lastBrace = unfenced.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return unfenced.slice(firstBrace, lastBrace + 1)
  }
  return unfenced
}

/**
 * Interpret official PLU regulatory articles using OpenRouter LLM.
 * Strictly refuses to fabricate rules when OPENROUTER_API_KEY is missing or no regulatory text is supplied.
 */
export async function interpretRegulationsWithOpenRouter(params: {
  prompt: string
  model?: string
  fallbackModels?: string[]
  parcelSurfaceM2?: number | null
  zoneCode?: string
  commune?: string
  articles: ExtractedArticle[]
  existingRules?: Partial<StructuredRegulatoryRules>
}): Promise<OpenRouterInterpretationResult> {
  const { apiKey, defaultModel } = getOpenRouterConfig()
  const primaryModel = params.model?.trim() || defaultModel

  const mergedSeedRules: StructuredRegulatoryRules = {
    ...EMPTY_RULES,
    ...(params.existingRules || {}),
  }

  if (params.articles.length === 0) {
    console.warn(
      `[OpenRouter] Skipping AI call: 0 regulatory articles available (zone=${params.zoneCode || 'unknown'}, commune=${params.commune || 'unknown'})`,
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

  if (!apiKey) {
    console.warn('[OpenRouter] Skipping AI call: OPENROUTER_API_KEY is not configured')
    return {
      status: 'unconfigured',
      model: primaryModel,
      zoneCode: params.zoneCode,
      summary:
        'OPENROUTER_API_KEY is not configured. Returned structured rules directly from stored official Regulations without LLM synthesis.',
      rules: mergedSeedRules,
      citations: params.articles.slice(0, 5).map((a) => ({
        article: a.articleNumber,
        excerpt: a.content.slice(0, 240),
      })),
      warnings: ['OPENROUTER_API_KEY is not set; AI regulatory interpretation was skipped.'],
    }
  }

  const contextText = params.articles
    .map((a) => `### ${a.articleNumber} (${a.title})\n${a.content}`)
    .join('\n\n')
    .slice(0, 18000)

  const systemPrompt = [
    '=== TON RÔLE : EXTRAIRE ET STRUCTURER, RIEN D’AUTRE ===',
    'Tu es un outil d’extraction et de structuration d’informations issues du règlement officiel d’un PLU/PLUi français.',
    'Tu n’es PAS un conseiller, PAS un expert qui complète, PAS un calculateur. Tu LIS le texte fourni, tu RECOPIES ce qui y est écrit, tu le RANGES dans le JSON demandé.',
    'Trois interdictions absolues, sans exception, quelles que soient les circonstances :',
    '  1. NE RIEN INVENTER : aucun chiffre, aucune règle, aucun article, aucune citation qui ne soit pas écrit dans le texte fourni.',
    '  2. NE RIEN CHANGER : ne reformule pas une règle, ne corrige pas le texte, ne convertis pas une unité, n’arrondis pas, ne simplifie pas une formule, ne « complète » pas une règle partielle.',
    '  3. NE RIEN DÉDUIRE NI CALCULER : pas de multiplication, pas de surface, pas de SDP, pas de volume, pas de niveaux, pas d’emprise après reculs, pas de moyenne, pas d’estimation. Le code de l’application fait les calculs, pas toi.',
    'Si une information n’est pas dans le texte fourni : la valeur est null (ou "Non réglementé" dans "details") et tu l’indiques dans "warnings". Il vaut TOUJOURS mieux renvoyer null qu’une valeur incertaine. Une réponse incomplète mais exacte est correcte ; une réponse complète mais inventée est une faute grave.',
    '',
    '=== SOURCES AUTORISÉES ===',
    'Uniquement : (a) le texte de l’article du règlement fourni ; (b) les données de parcelle fournies (zone, commune, surface). Rien d’autre : ni tes connaissances générales sur le PLU de cette commune, ni ce qui se fait « habituellement », ni les valeurs d’une autre zone, ni une valeur « par défaut ».',
    '',
    '=== RÈGLES DE LECTURE ===',
    '1. VALEURS RECOPIÉES : une valeur se recopie avec ses chiffres et unités exacts. « 13 mètres » reste « 13 mètres ». Jamais un nombre sans unité.',
    '2. FORMULES : une formule se recopie telle quelle, sans la calculer. Exemples : « d ≥ DA/2 et d ≥ 3 m » ; « hauteur de façade + 3 m ». Dans "rules", mets null et garde la formule dans "details".',
    '3. ZONE DEMANDÉE UNIQUEMENT : quand le texte donne une valeur par zone, prends celle de la zone demandée. Exemple : « en UCt1, 20 % ; dans les autres zones, 30 % » → pour UC1 : 30 %. Ne prends jamais la valeur d’une autre zone.',
    '4. TABLEAUX : si on te fournit « valeurs lues sous la colonne de la zone », ces valeurs priment sur le texte brut. Le texte brut d’un tableau sort dans le désordre (colonnes aplaties, cellules fusionnées sur plusieurs zones) et ne permet pas de savoir quel nombre correspond à quelle zone. Exemple réel : tableau de hauteur de façade avec les colonnes UCt1 UCt2 UC1 UC2 UC3…, le texte brut affiche « 19 m 22 m 25 m 28 m 31 m 16 m 10 m 13 m 16 m » ; on te fournit « Autres sous-destinations ou destinations = 13 m sous la colonne UC1 » → la hauteur de façade pour UC1 est 13 m (et non 19 m, le premier nombre du texte). Si aucune valeur de tableau n’est fournie et que tu ne peux pas savoir quel nombre correspond à la zone : null + avertissement, ne devine jamais.',
    '5. COMMUNE : si la règle diffère selon la commune, donne celle de la commune indiquée. Les autres cas vont dans "warnings".',
    '6. EXCEPTIONS ET BONIFICATIONS : jamais mélangées à la règle courante. Exemple : emprise 30 %, bonification à 35 % possible → maxCoverageRatio 0.30 ; "warnings" : « Bonification à 35 % possible (art. 4) ».',
    '7. DEUX VALEURS POSSIBLES et tu ne sais pas laquelle s’applique : null + avertissement qui cite les deux. Ne tranche jamais.',
    '8. PLUSIEURS RÈGLES DANS UNE PHRASE : sépare-les, mais ne change aucun mot ni aucun chiffre.',
    '',
    '=== CITATIONS OBLIGATOIRES ===',
    'Chaque règle extraite est accompagnée d’une citation COPIÉE MOT POUR MOT du texte fourni (au moins 12 mots) et du numéro de l’article. Pas de reformulation, pas de « … » au milieu d’une phrase pour en changer le sens, pas de citation inventée. Le code vérifiera chaque citation dans le texte : une citation fausse fait rejeter la règle.',
    'Si tu ne peux pas citer le passage exact, la valeur est null.',
    '',
    '=== CE QUE TU NE FAIS JAMAIS (exemples) ===',
    '✗ Le texte dit « 13 mètres » → tu écris 12 ou 13,5 ou « environ 13 m ».',
    '✗ Le texte ne parle pas du stationnement → tu écris « 1 place par logement » parce que c’est courant.',
    '✗ Le texte dit « d ≥ DA/2 et d ≥ 3 m » → tu écris « 3 m » ou « recul de 3 mètres ».',
    '✗ Surface 2 638 m² et emprise 30 % → tu écris 791,4 dans le JSON : NON. Tu extrais seulement le ratio (maxCoverageRatio 0.30) ; le code de l’application calcule la surface. Tu ne renvoies aucun résultat de calcul.',
    '✗ Tu convertis 0,80 m en 80 cm ; tu arrondis 0,80 en 1 ; tu écris « 2 m » pour « inférieure ou égale à 2 mètres » sans citer.',
    '✗ Tu combles un trou avec la règle d’une zone voisine (UP pour UC, UCt1 pour UC1).',
    '✗ Tu ajoutes des conseils, des recommandations ou des interprétations juridiques dans les règles.',
    '✓ Le texte ne dit rien sur les clôtures → "clotures" absent de "details" et warning « clôtures : non trouvées dans l’article fourni ».',
    '',
    '=== VÉRIFICATION AVANT DE RÉPONDRE (fais-la vraiment) ===',
    'Pour CHAQUE valeur de ta réponse, pose-toi : « Puis-je mettre mon doigt sur le passage exact du texte fourni qui contient ce chiffre ? ». Non → null. Puis : « Ai-je changé un mot, un chiffre ou une unité ? ». Oui → corrige en recopiant.',
    '',
    '=== SORTIE ===',
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
    '  "details": {                            // texte EXACT de chaque règle trouvée ; clés possibles :',
    '    "hauteur_facade": string, "hauteur_totale": string, "emprise": string, "recul_voies": string,',
    '    "limites_separatives": string, "entre_batiments": string, "espaces_vegetalises": string,',
    '    "pleine_terre": string, "clotures": string, "eaux_pluviales": string, "stationnement": string',
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
  ].join('\n')

  const userMessage = `Commune: ${params.commune || 'Unknown'}
Zone PLU: ${params.zoneCode || 'Unknown'}
Surface parcelle (m²): ${params.parcelSurfaceM2 ?? 'Non disponible'}
User Feasibility Prompt: ${params.prompt}

Official PLU Excerpts:
${contextText}`

  const candidateModels = Array.from(
    new Set([primaryModel, ...(params.fallbackModels || [])].filter(Boolean)),
  )

  let lastError = 'OpenRouter API error'
  const fallbackWarnings: string[] = []

  for (const candidateModel of candidateModels) {
    console.log(
      `[OpenRouter] Requesting completion: model=${candidateModel} articles=${params.articles.length} contextChars=${contextText.length}`,
    )
    const res = await createOpenRouterChatCompletion({
      model: candidateModel,
      temperature: 0.1,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      timeoutMs: 45000,
    })

    if (!res.ok) {
      lastError = res.error || 'OpenRouter API error'
      console.warn(`[OpenRouter] Model ${candidateModel} HTTP error: ${lastError}`)
      fallbackWarnings.push(`Model ${candidateModel} failed: ${lastError}`)
      continue
    }

    const content = res.content
    if (!content) {
      lastError = 'Empty OpenRouter completion'
      console.warn(`[OpenRouter] Model ${candidateModel} returned empty completion`)
      fallbackWarnings.push(`Model ${candidateModel} returned an empty response.`)
      continue
    }

    try {
      const parsed = JSON.parse(extractJsonObject(content)) as Partial<OpenRouterInterpretationResult>
      const details =
        parsed.details && typeof parsed.details === 'object' ? parsed.details : undefined
      const detailsSummary =
        details && Object.keys(details).length > 0
          ? Object.entries(details)
              .map(([key, val]) => `- **${key}** : ${val}`)
              .join('\n')
          : undefined
      const resolvedSummary =
        parsed.summary || detailsSummary || 'Extraction réglementaire terminée.'
      console.log(
        `[OpenRouter] Model ${candidateModel} succeeded (summaryChars=${resolvedSummary.length}, citations=${Array.isArray(parsed.citations) ? parsed.citations.length : 0})`,
      )
      return {
        status: 'ok',
        model: candidateModel,
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
          ...fallbackWarnings,
          ...(Array.isArray(parsed.warnings) ? parsed.warnings : []),
        ],
        rawResponse: res.raw,
      }
    } catch (parseErr) {
      lastError = parseErr instanceof Error ? parseErr.message : 'JSON parse error'
      console.warn(`[OpenRouter] Model ${candidateModel} returned invalid JSON: ${lastError}`)
      fallbackWarnings.push(`Model ${candidateModel} returned invalid JSON: ${lastError}`)
    }
  }

  console.error(`[OpenRouter] All candidate models failed. Last error: ${lastError}`)
  return {
    status: 'error',
    model: primaryModel,
    zoneCode: params.zoneCode,
    summary: `OpenRouter API call failed (${lastError}); falling back to structured stored rules.`,
    rules: mergedSeedRules,
    citations: [],
    warnings: fallbackWarnings.length > 0 ? fallbackWarnings : [lastError],
    error: lastError,
  }
}
