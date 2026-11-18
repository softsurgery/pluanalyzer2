import type { Payload } from 'payload'

export interface AiModelSeedEntry {
  model: string
  label: string
  isDefault: boolean
  isActive: boolean
  description: string
}

export const FREE_OPENROUTER_MODELS: AiModelSeedEntry[] = [
  {
    model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    label: 'NVIDIA Nemotron 3 Ultra 550B (Free)',
    isDefault: true,
    isActive: true,
    description: 'Default free OpenRouter reasoning model for PLU regulatory interpretation.',
  },
  {
    model: 'nvidia/nemotron-3.5-super-vl:free',
    label: 'NVIDIA Nemotron 3.5 Super VL (Free)',
    isDefault: false,
    isActive: true,
    description: 'Fast NVIDIA free OpenRouter model (~1s response time).',
  },
  {
    model: 'nvidia/nemotron-3.5-lightning:free',
    label: 'NVIDIA Nemotron 3.5 Lightning (Free)',
    isDefault: false,
    isActive: true,
    description: 'NVIDIA Lightning free OpenRouter model.',
  },
  {
    model: 'google/gemma-4-26b-a4b-it:free',
    label: 'Google Gemma 4 26B A4B (Free)',
    isDefault: false,
    isActive: true,
    description: 'Google Gemma 4 26B MoE free OpenRouter model with structured JSON support.',
  },
  {
    model: 'inclusionai/ling-3.2-flash:free',
    label: 'inclusionAI Ling 3.2 Flash (Free)',
    isDefault: false,
    isActive: true,
    description: 'Fast inclusionAI free OpenRouter model with structured JSON support.',
  },
  {
    model: 'baidu/ernie-5.5-flash-preview:free',
    label: 'Baidu ERNIE 5.5 Flash Preview (Free)',
    isDefault: false,
    isActive: true,
    description: 'Fast Baidu ERNIE 5.5 Flash free OpenRouter model.',
  },
  {
    model: 'cohere/north-mini-code:free',
    label: 'Cohere North Mini Code (Free)',
    isDefault: false,
    isActive: true,
    description: 'Ultra-fast Cohere free OpenRouter model (~0.6s response time).',
  },
]

export async function seedAiModels(payload: Payload): Promise<{ created: number; total: number }> {
  const existingDefault = await payload.find({
    collection: 'ai-models',
    where: { isDefault: { equals: true } },
    limit: 1,
  })
  const hasDefault = existingDefault.docs.length > 0

  let created = 0
  for (const entry of FREE_OPENROUTER_MODELS) {
    const existing = await payload.find({
      collection: 'ai-models',
      where: { model: { equals: entry.model } },
      limit: 1,
    })

    if (existing.docs.length === 0) {
      await payload.create({
        collection: 'ai-models',
        data: {
          ...entry,
          // Preserve an admin's custom default if one already exists
          isDefault: hasDefault ? false : entry.isDefault,
        },
      })
      created++
    }
  }

  return { created, total: FREE_OPENROUTER_MODELS.length }
}
