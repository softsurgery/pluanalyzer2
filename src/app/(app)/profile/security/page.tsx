import { getPayloadWithUser } from '@/lib/payload-auth'
import { ProfileSecuritySection } from '@/components/profile/ProfileSecuritySection'

export const dynamic = 'force-dynamic'

export default async function ProfileSecurityPage() {
  const { user } = await getPayloadWithUser()

  if (!user) {
    return null
  }

  return <ProfileSecuritySection userId={user.id} />
}
