import { fetchJsonWithTimeout } from './http'
import type {
  ExtractedArticle,
  GroqInterpretationResult,
  StructuredRegulatoryRules,
} from './types'

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

interface GroqChatResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

/**
 * Interpret official PLU regulatory articles using Groq LLM.
 * Strictly refuses to fabricate rules when GROQ_API_KEY is missing or no regulatory text is supplied.
 */
export async function interpretRegulationsWithGroq(params: {
  prompt: string
  zoneCode?: string
  commune?: string
  articles: ExtractedArticle[]
  existingRules?: Partial<StructuredRegulatoryRules>
}): Promise<GroqInterpretationResult> {
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
  const apiKey = process.env.GROQ_API_KEY
  const apiUrl =
    process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions'

  const mergedSeedRules: StructuredRegulatoryRules = {
    ...EMPTY_RULES,
    ...(params.existingRules || {}),
  }

  if (params.articles.length === 0) {
    return {
      status: 'insufficient_data',
      model,
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
      model,
      zoneCode: params.zoneCode,
      summary:
        'GROQ_API_KEY is not configured. Returned structured rules directly from stored official Regulations without LLM synthesis.',
      rules: mergedSeedRules,
      citations: params.articles.slice(0, 5).map((a) => ({
        article: a.articleNumber,
        excerpt: a.content.slice(0, 240),
      })),
      warnings: ['GROQ_API_KEY is not set; AI regulatory interpretation was skipped.'],
    }
  }

  const contextText = params.articles
    .map((a) => `### ${a.articleNumber} (${a.title})\n${a.content}`)
    .join('\n\n')
    .slice(0, 18000)

  const systemPrompt = [
    'You are a senior French urban-planning (PLU/PLUi) regulatory analyst.',
    'CRITICAL RULE: Use ONLY the provided official PLU regulatory excerpts. NEVER invent, guess, or extrapolate missing numbers.',
    'If a rule is not explicitly stated in the provided text, set its value to null and add a warning.',
    'Respond strictly in JSON matching:',
    '{',
    '  "summary": string,',
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
    '  "citations": [{"article": string, "excerpt": string}],',
    '  "warnings": [string]',
    '}',
  ].join('\n')

  const userMessage = `Commune: ${params.commune || 'Unknown'}
Zone: ${params.zoneCode || 'Unknown'}
User Feasibility Prompt: ${params.prompt}

Official PLU Excerpts:
${contextText}`

  const res = await fetchJsonWithTimeout<GroqChatResponse>(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
    timeoutMs: 25000,
  })

  if (!res.ok) {
    return {
      status: 'error',
      model,
      zoneCode: params.zoneCode,
      summary: 'Groq API call failed; falling back to structured stored rules.',
      rules: mergedSeedRules,
      citations: [],
      warnings: [res.error || 'Groq API error'],
      error: res.error,
    }
  }

  const content = res.data?.choices?.[0]?.message?.content
  if (!content) {
    return {
      status: 'error',
      model,
      zoneCode: params.zoneCode,
      summary: 'Groq returned an empty response.',
      rules: mergedSeedRules,
      citations: [],
      warnings: ['Empty Groq completion'],
      rawResponse: res.data,
    }
  }

  try {
    const parsed = JSON.parse(content) as Partial<GroqInterpretationResult>
    return {
      status: 'ok',
      model,
      zoneCode: params.zoneCode,
      summary: parsed.summary || 'Regulatory interpretation completed.',
      rules: {
        ...mergedSeedRules,
        ...(parsed.rules || {}),
      },
      citations: Array.isArray(parsed.citations) ? parsed.citations : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      rawResponse: res.data,
    }
  } catch (parseErr) {
    return {
      status: 'error',
      model,
      zoneCode: params.zoneCode,
      summary: 'Failed to parse Groq JSON output.',
      rules: mergedSeedRules,
      citations: [],
      warnings: ['Invalid JSON from Groq'],
      rawResponse: content,
      error: parseErr instanceof Error ? parseErr.message : 'JSON parse error',
    }
  }
}
