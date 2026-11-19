import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createOpenRouterChatCompletion,
  getOpenRouterConfig,
} from '@/api/openrouter'
import { getPayloadWithUser } from '@/lib/payload-auth'

const TestAiSchema = z.object({
  prompt: z.string().trim().min(1, 'Le prompt de test est requis.'),
  modelId: z.union([z.number(), z.string()]).optional(),
  modelSlug: z.string().optional(),
})

export async function POST(request: Request) {
  try {
    const { payload, user } = await getPayloadWithUser()
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = TestAiSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const { apiKey, defaultModel } = getOpenRouterConfig()
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENROUTER_API_KEY is not configured' },
        { status: 500 },
      )
    }

    let resolvedModel = parsed.data.modelSlug?.trim() || ''

    if (!resolvedModel && parsed.data.modelId) {
      try {
        const modelDoc = await payload.findByID({
          collection: 'ai-models',
          id: parsed.data.modelId,
          depth: 0,
        })
        if (modelDoc?.model) {
          resolvedModel = modelDoc.model
        }
      } catch {
        // Fallback below
      }
    }

    if (!resolvedModel) {
      try {
        const settings = await payload.findGlobal({
          slug: 'workspace-settings',
          depth: 1,
        })
        const rel = settings?.defaultAiModel
        if (rel && typeof rel === 'object' && 'model' in rel && typeof rel.model === 'string') {
          resolvedModel = rel.model
        }
      } catch {
        // Fallback below
      }
    }

    if (!resolvedModel) {
      const defaults = await payload.find({
        collection: 'ai-models',
        where: { isActive: { equals: true } },
        sort: '-isDefault,createdAt',
        limit: 1,
      })
      resolvedModel = defaults.docs[0]?.model || defaultModel
    }

    const startedAt = Date.now()
    console.log(`[OpenRouter Test] Sending test prompt to model=${resolvedModel}`)

    const res = await createOpenRouterChatCompletion({
      model: resolvedModel,
      temperature: 0.1,
      messages: [{ role: 'user', content: parsed.data.prompt }],
      timeoutMs: 45000,
      title: 'PLU Analyzer Platform - Admin AI Test',
    })

    const durationMs = Date.now() - startedAt

    if (!res.ok) {
      console.warn(`[OpenRouter Test] Failed (${durationMs}ms): ${res.error}`)
      return NextResponse.json(
        {
          ok: false,
          model: resolvedModel,
          durationMs,
          error: res.error || 'OpenRouter API error',
        },
        { status: 502 },
      )
    }

    const reply = res.content ?? ''
    console.log(
      `[OpenRouter Test] Succeeded in ${durationMs}ms (model=${res.model}, chars=${reply.length})`,
    )

    return NextResponse.json({
      ok: true,
      model: res.model,
      durationMs,
      reply,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
