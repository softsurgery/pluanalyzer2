import { headers as nextHeaders } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'
import type { AuthUser } from '@/access/roles'

export async function getPayloadWithUser() {
  const payload = await getPayload({ config })
  const headersList = await nextHeaders()
  const { user } = await payload.auth({ headers: headersList })
  return {
    payload,
    user: user as AuthUser | null,
  }
}

export function canExecuteAnalysis(user: AuthUser | null): boolean {
  if (!user) return false
  return user.role === 'admin' || user.role === 'urban_planner' || user.role === 'analyst'
}
