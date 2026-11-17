import { NextResponse } from 'next/server'
import { getPayloadWithUser } from '@/lib/payload-auth'
import { compareAnalysisSnapshots } from '@/services/plu/pipeline'

export async function GET(request: Request) {
  try {
    const { payload, user } = await getPayloadWithUser()
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const snapshotAId = searchParams.get('snapshotA')
    const snapshotBId = searchParams.get('snapshotB')

    if (!snapshotAId || !snapshotBId) {
      return NextResponse.json(
        { error: 'Query parameters snapshotA and snapshotB are required' },
        { status: 400 },
      )
    }

    const [snapshotA, snapshotB] = await Promise.all([
      payload.findByID({ collection: 'analysis-snapshots', id: snapshotAId, depth: 0 }),
      payload.findByID({ collection: 'analysis-snapshots', id: snapshotBId, depth: 0 }),
    ])

    const diff = compareAnalysisSnapshots(
      snapshotA as unknown as Record<string, unknown>,
      snapshotB as unknown as Record<string, unknown>,
    )

    return NextResponse.json(diff)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Comparison failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
