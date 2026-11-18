import { fetchJsonWithTimeout } from '@/services/plu/http'
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

interface OpenRouterChatResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
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
  const primaryModel =
    params.model?.trim() ||
    process.env.OPENROUTER_MODEL ||
    'nvidia/nemotron-3-ultra-550b-a55b:free'
  const apiKey = process.env.OPENROUTER_API_KEY
  const apiUrl =
    process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1/chat/completions'

  const mergedSeedRules: StructuredRegulatoryRules = {
    ...EMPTY_RULES,
    ...(params.existingRules || {}),
  }

  if (params.articles.length === 0) {
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
    'You are a senior French urban-planning (PLU/PLUi) regulatory analyst.',
    'CRITICAL RULE: Use ONLY the provided official PLU regulatory excerpts and parcel data. NEVER invent, guess, or extrapolate missing numbers.',
    'If a rule or parcel surface is not explicitly stated in the provided text or parcel data, set its value to null and add a warning.',
    'You MUST always determine and report the following 9 feasibility indicators (using null if a required input such as parcel surface or a rule is missing):',
    '1. Zone PLU (zoneCode)',
    '2. Surface parcelle en m² (parcelSurfaceM2)',
    '3. Emprise au sol max en m² (maxFootprintM2 = parcelSurfaceM2 * maxCoverageRatio)',
    '4. Emprise après reculs en m² (estimatedBuildableFootprintM2)',
    '5. Hauteur max en m (maxHeightM)',
    '6. Niveaux estimés (estimatedStoreys)',
    '7. SDP max estimée en m² (maxFloorAreaSdpM2)',
    '8. Volume max estimé en m³ (maxVolumeM3)',
    '9. Pleine terre min en m² (minGreenSpaceM2 = parcelSurfaceM2 * minGreenRatio)',
    'The "summary" field MUST be a thorough, descriptive, multi-section French urban-planning report formatted in valid Markdown (using ## / ### headings, bullet points, and **bold** values).',
    'Structure the "summary" Markdown report with these sections:',
    '- ## Contexte parcellaire et zonage PLU (commune, Zone PLU, surface de la parcelle, objectif du projet)',
    '- ## Analyse détaillée des règles d’urbanisme applicables (implantation / reculs voie & limites séparatives, emprise au sol, hauteur au faîtage et à l’égout, gabarit / niveaux, pleine terre et espaces verts, stationnement — en citant les articles PLU exacts)',
    '- ## Synthèse de la constructibilité et capacités du terrain (présenter et expliquer chaque indicateur : Zone PLU, Surface parcelle, Emprise au sol max, Emprise après reculs, Hauteur max, Niveaux estimés, SDP max estimée, Volume max estimé, Pleine terre min)',
    '- ## Points de vigilance et recommandations opérationnelles (faisabilité vis-à-vis de la demande utilisateur, contraintes ou données manquantes)',
    'Respond strictly with a single valid JSON object (no markdown fences around the JSON, escape newlines inside strings as \\n) matching:',
    '{',
    '  "summary": string (detailed, descriptive French Markdown report),',
    '  "rules": {',
    '    "maxHeightM": number|null,',
    '    "maxEavesHeightM": number|null,',
    '    "maxStoreys": number|null,',
    '    "maxCoverageRatio": number|null,',
    '    "frontSetbackM": number|null,',
    '    "sideSetbackM": number|null,',
    '    "rearSetbackM": number|null,',
    '    "minGreenRatio": number|null,',
    '    "parkingPerDwelling": number|null',
    '  },',
    '  "constructibility": {',
    '    "zoneCode": string|null,',
    '    "parcelSurfaceM2": number|null,',
    '    "maxFootprintM2": number|null,',
    '    "estimatedBuildableFootprintM2": number|null,',
    '    "maxHeightM": number|null,',
    '    "estimatedStoreys": number|null,',
    '    "maxFloorAreaSdpM2": number|null,',
    '    "maxVolumeM3": number|null,',
    '    "minGreenSpaceM2": number|null',
    '  },',
    '  "citations": [{"article": string, "excerpt": string}],',
    '  "warnings": [string]',
    '}',
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
    const res = await fetchJsonWithTimeout<OpenRouterChatResponse>(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000',
        'X-Title': 'PLU Analyzer Platform',
      },
      body: JSON.stringify({
        model: candidateModel,
        temperature: 0.1,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      }),
      timeoutMs: 45000,
    })

    if (!res.ok) {
      lastError = res.error || 'OpenRouter API error'
      fallbackWarnings.push(`Model ${candidateModel} failed: ${lastError}`)
      continue
    }

    const content = res.data?.choices?.[0]?.message?.content
    if (!content) {
      lastError = 'Empty OpenRouter completion'
      fallbackWarnings.push(`Model ${candidateModel} returned an empty response.`)
      continue
    }

    try {
      const parsed = JSON.parse(extractJsonObject(content)) as Partial<OpenRouterInterpretationResult>
      return {
        status: 'ok',
        model: candidateModel,
        zoneCode: params.zoneCode,
        summary: parsed.summary || 'Regulatory interpretation completed.',
        rules: {
          ...mergedSeedRules,
          ...(parsed.rules || {}),
        },
        constructibility: parsed.constructibility,
        citations: Array.isArray(parsed.citations) ? parsed.citations : [],
        warnings: [
          ...fallbackWarnings,
          ...(Array.isArray(parsed.warnings) ? parsed.warnings : []),
        ],
        rawResponse: res.data,
      }
    } catch (parseErr) {
      lastError = parseErr instanceof Error ? parseErr.message : 'JSON parse error'
      fallbackWarnings.push(`Model ${candidateModel} returned invalid JSON: ${lastError}`)
    }
  }

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
