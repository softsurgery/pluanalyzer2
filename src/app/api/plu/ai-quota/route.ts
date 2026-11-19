import { NextResponse } from 'next/server'
import { fetchOpenRouterQuota } from '@/api/openrouter'
import { getPayloadWithUser } from '@/lib/payload-auth'

export async function GET() {
  try {
    const { user } = await getPayloadWithUser()
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const quota = await fetchOpenRouterQuota()
    if (!quota.ok) {
      return NextResponse.json(quota, { status: 502 })
    }

    return NextResponse.json(quota)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
