import { NextResponse } from 'next/server'
import { z } from 'zod'
import { canExecuteAnalysis, getPayloadWithUser } from '@/lib/payload-auth'
import { replaySnapshotPipeline } from '@/services/plu/pipeline'

const ReplaySchema = z.object({
  snapshotId: z.union([z.number(), z.string()]),
  overridePrompt: z.string().optional(),
})

export async function POST(request: Request) {
  try {
    const { payload, user } = await getPayloadWithUser()
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    if (!canExecuteAnalysis(user)) {
      return NextResponse.json(
        { error: 'Insufficient permissions to replay analyses' },
        { status: 403 },
      )
    }

    const body = await request.json()
    const parsed = ReplaySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const result = await replaySnapshotPipeline(
      payload,
      parsed.data.snapshotId,
      user.id,
      parsed.data.overridePrompt,
    )
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Replay failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
