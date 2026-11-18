import { apiFetch } from '@/api/client'
import type { PaginatedResponse } from '@/types/common'

export interface AIModelRecord {
  id: number | string
  model: string
  label?: string | null
  isDefault?: boolean | null
  isActive?: boolean | null
  description?: string | null
}

export const aiModelKeys = {
  all: ['ai-models'] as const,
}

export async function fetchAiModels(): Promise<PaginatedResponse<AIModelRecord>> {
  return apiFetch<PaginatedResponse<AIModelRecord>>(
    '/api/ai-models?where[isActive][equals]=true&sort=-isDefault,model&limit=100&depth=0',
  )
}
