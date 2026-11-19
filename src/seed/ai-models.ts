import type { Payload } from 'payload'

export interface AiModelSeedEntry {
  model: string
  label: string
  isDefault: boolean
  isActive: boolean
  description: string
}

export const DEFAULT_OLLAMA_MODELS: AiModelSeedEntry[] = [
  {
    model: 'gpt-oss:20b',
    label: 'GPT-OSS 20B (Ollama Cloud)',
    isDefault: true,
    isActive: true,
    description: 'Default fast Ollama Cloud reasoning model for PLU regulatory extraction.',
  },
  {
    model: 'gpt-oss:120b',
    label: 'GPT-OSS 120B (Ollama Cloud)',
    isDefault: false,
    isActive: true,
    description: 'Large 120B Ollama Cloud reasoning model for complex PLU analysis.',
  },
  {
    model: 'gemma4:31b',
    label: 'Google Gemma 4 31B (Ollama Cloud)',
    isDefault: false,
    isActive: true,
    description: 'Google Gemma 4 31B Ollama Cloud model with vision, tools, and structured output.',
  },
  {
    model: 'mistral-large-4',
    label: 'Mistral Large 4 (Ollama Cloud)',
    isDefault: false,
    isActive: true,
    description: 'French-optimized Mistral Large 4 Ollama Cloud model for PLU/PLUi regulatory analysis.',
  },
  {
    model: 'deepseek-v4.1-flash',
    label: 'DeepSeek V4.1 Flash (Ollama Cloud)',
    isDefault: false,
    isActive: true,
    description: 'Fast DeepSeek V4.1 Flash Ollama Cloud model with thinking and vision support.',
  },
  {
    model: 'deepseek-v4-pro:0813',
    label: 'DeepSeek V4 Pro (Ollama Cloud)',
    isDefault: false,
    isActive: true,
    description: 'DeepSeek V4 Pro Ollama Cloud reasoning model for complex multi-article PLU rule extraction.',
  },
  {
    model: 'kimi-k3.1-pro',
    label: 'Kimi K3.1 Pro (Ollama Cloud)',
    isDefault: false,
    isActive: true,
    description: 'Kimi K3.1 Pro Ollama Cloud multimodal reasoning model.',
  },
  {
    model: 'kimi-k3',
    label: 'Kimi K3 (Ollama Cloud)',
    isDefault: false,
    isActive: true,
    description: 'Kimi K3 Ollama Cloud multimodal reasoning model.',
  },
  {
    model: 'minimax-m3.1-flash',
    label: 'MiniMax M3.1 Flash (Ollama Cloud)',
    isDefault: false,
    isActive: true,
    description: 'Fast MiniMax M3.1 Flash Ollama Cloud model.',
  },
  {
    model: 'glm-5.3-flash',
    label: 'GLM 5.3 Flash (Ollama Cloud)',
    isDefault: false,
    isActive: true,
    description: 'Fast GLM 5.3 Flash Ollama Cloud model with thinking and vision.',
  },
  {
    model: 'mimo-v2.6-flash',
    label: 'MiMo V2.6 Flash (Ollama Cloud)',
    isDefault: false,
    isActive: true,
    description: 'Fast MiMo V2.6 Flash Ollama Cloud model.',
  },
  {
    model: 'nemotron-3-super',
    label: 'NVIDIA Nemotron 3 Super (Ollama Cloud)',
    isDefault: false,
    isActive: true,
    description: 'NVIDIA Nemotron 3 Super Ollama Cloud reasoning model.',
  },
  {
    model: 'nemotron-3-ultra',
    label: 'NVIDIA Nemotron 3 Ultra (Ollama Cloud)',
    isDefault: false,
    isActive: true,
    description: 'NVIDIA Nemotron 3 Ultra Ollama Cloud reasoning model.',
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
  for (const entry of DEFAULT_OLLAMA_MODELS) {
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

  return { created, total: DEFAULT_OLLAMA_MODELS.length }
}
