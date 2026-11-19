export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface OpenRouterChatResponse {
  model?: string
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

export interface OpenRouterChatCompletionInput {
  model: string
  messages: OpenRouterMessage[]
  temperature?: number
  timeoutMs?: number
  title?: string
}

export interface OpenRouterChatCompletionResult {
  ok: boolean
  model: string
  content?: string
  raw?: OpenRouterChatResponse
  error?: string
}

export interface TestAiResponse {
  ok?: boolean
  model?: string
  durationMs?: number
  reply?: string
  error?: string
}

export interface OpenRouterRateLimit {
  requests: number | null
  interval: string | null
  note?: string | null
}

export interface OpenRouterFreeModelDailyQuota {
  used: number | null
  limit: number | null
  remaining: number | null
}

export interface OpenRouterKeyApiResponse {
  data?: {
    label?: string | null
    is_free_tier?: boolean | null
    limit?: number | null
    limit_reset?: string | null
    limit_remaining?: number | null
    usage?: number | null
    usage_daily?: number | null
    usage_weekly?: number | null
    usage_monthly?: number | null
    free_model_daily_requests?: {
      used?: number | null
      limit?: number | null
      remaining?: number | null
    } | null
    rate_limit?: {
      requests?: number | null
      interval?: string | null
      note?: string | null
    } | null
  }
}

export interface OpenRouterQuotaInfo {
  ok: boolean
  label?: string | null
  isFreeTier?: boolean | null
  limit?: number | null
  limitReset?: string | null
  limitRemaining?: number | null
  usage?: number | null
  usageDaily?: number | null
  usageWeekly?: number | null
  usageMonthly?: number | null
  rateLimit?: OpenRouterRateLimit | null
  freeModelDailyRequests?: OpenRouterFreeModelDailyQuota | null
  fetchedAt?: string
  error?: string
}
