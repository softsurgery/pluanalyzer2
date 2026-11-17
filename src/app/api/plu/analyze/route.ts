import { NextResponse } from 'next/server'
import { z } from 'zod'
import { canExecuteAnalysis, getPayloadWithUser } from '@/lib/payload-auth'
import { runPluAnalysisPipeline } from '@/services/plu/pipeline'

const AnalyzeRequestSchema = z.object({
  projectId: z.union([z.number(), z.string()]),
  analysisId: z.union([z.number(), z.string()]).optional(),
  prompt: z.string().min(3, 'Prompt must be at least 3 characters'),
  address: z.string().optional(),
  parcelId: z.union([z.number(), z.string()]).optional(),
  idu: z.string().optional(),
  codeInsee: z.string().optional(),
  section: z.string().optional(),
  numero: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
})

export async function POST(request: Request) {
  try {
    const { payload, user } = await getPayloadWithUser()
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    if (!canExecuteAnalysis(user)) {
      return NextResponse.json(
        { error: 'Insufficient permissions: viewer role cannot execute analyses' },
        { status: 403 },
      )
    }

    const body = await request.json()
    const parsed = AnalyzeRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const result = await runPluAnalysisPipeline(payload, parsed.data, user.id)
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
