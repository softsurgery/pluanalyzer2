import { NextResponse } from 'next/server'
import { getPayloadWithUser } from '@/lib/payload-auth'
import { getOllamaService } from '@/services/ollama/OllamaService'

export async function GET() {
  try {
    const { user } = await getPayloadWithUser()
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const status = await getOllamaService().healthCheck()
    if (!status.ok) {
      return NextResponse.json(status, { status: 502 })
    }

    return NextResponse.json(status)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
