import type {
  OpenRouterChatCompletionInput,
  OpenRouterChatCompletionResult,
  OpenRouterChatResponse,
  OpenRouterKeyApiResponse,
  OpenRouterQuotaInfo,
} from '@/types/openrouter'
import { fetchJsonWithTimeout } from '@/services/plu/http'

export const DEFAULT_OPENROUTER_API_URL =
  'https://openrouter.ai/api/v1/chat/completions'
export const DEFAULT_OPENROUTER_KEY_URL = 'https://openrouter.ai/api/v1/key'
export const DEFAULT_OPENROUTER_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free'

export function getOpenRouterConfig() {
  const apiUrl = process.env.OPENROUTER_API_URL || DEFAULT_OPENROUTER_API_URL
  const keyUrl = apiUrl.includes('/chat/completions')
    ? apiUrl.replace(/\/chat\/completions\/?$/, '/key')
    : DEFAULT_OPENROUTER_KEY_URL

  return {
    apiKey: process.env.OPENROUTER_API_KEY,
    apiUrl,
    keyUrl,
    defaultModel: process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL,
  }
}

export async function createOpenRouterChatCompletion(
  input: OpenRouterChatCompletionInput,
): Promise<OpenRouterChatCompletionResult> {
  const { apiKey, apiUrl } = getOpenRouterConfig()

  if (!apiKey) {
    return {
      ok: false,
      model: input.model,
      error: 'OPENROUTER_API_KEY is not configured',
    }
  }

  const res = await fetchJsonWithTimeout<OpenRouterChatResponse>(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000',
      'X-Title': input.title || 'PLU Analyzer Platform',
    },
    body: JSON.stringify({
      model: input.model,
      temperature: input.temperature ?? 0.1,
      messages: input.messages,
    }),
    timeoutMs: input.timeoutMs ?? 45000,
  })

  if (!res.ok) {
    return {
      ok: false,
      model: input.model,
      error: res.error || 'OpenRouter API error',
    }
  }

  return {
    ok: true,
    model: res.data?.model || input.model,
    content: res.data?.choices?.[0]?.message?.content ?? '',
    raw: res.data,
  }
}

export async function fetchOpenRouterQuota(): Promise<OpenRouterQuotaInfo> {
  const { apiKey, keyUrl } = getOpenRouterConfig()
  if (!apiKey) {
    return {
      ok: false,
      error: 'OPENROUTER_API_KEY is not configured',
    }
  }

  const res = await fetchJsonWithTimeout<OpenRouterKeyApiResponse>(keyUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000',
      'X-Title': 'PLU Analyzer Platform',
    },
    timeoutMs: 10000,
  })

  if (!res.ok || !res.data?.data) {
    return {
      ok: false,
      error: res.error || 'Failed to fetch OpenRouter key quota',
    }
  }

  const keyData = res.data.data
  const daily = keyData.free_model_daily_requests
  const rateLimit = keyData.rate_limit

  return {
    ok: true,
    label: keyData.label ?? null,
    isFreeTier:
      typeof keyData.is_free_tier === 'boolean' ? keyData.is_free_tier : null,
    limit: typeof keyData.limit === 'number' ? keyData.limit : null,
    limitReset: keyData.limit_reset ?? null,
    limitRemaining:
      typeof keyData.limit_remaining === 'number'
        ? keyData.limit_remaining
        : null,
    usage: typeof keyData.usage === 'number' ? keyData.usage : null,
    usageDaily:
      typeof keyData.usage_daily === 'number' ? keyData.usage_daily : null,
    usageWeekly:
      typeof keyData.usage_weekly === 'number' ? keyData.usage_weekly : null,
    usageMonthly:
      typeof keyData.usage_monthly === 'number' ? keyData.usage_monthly : null,
    rateLimit: rateLimit
      ? {
          requests:
            typeof rateLimit.requests === 'number' ? rateLimit.requests : null,
          interval: rateLimit.interval ?? null,
          note: rateLimit.note ?? null,
        }
      : null,
    freeModelDailyRequests: daily
      ? {
          used: typeof daily.used === 'number' ? daily.used : null,
          limit: typeof daily.limit === 'number' ? daily.limit : null,
          remaining:
            typeof daily.remaining === 'number' ? daily.remaining : null,
        }
      : null,
    fetchedAt: new Date().toISOString(),
  }
}
