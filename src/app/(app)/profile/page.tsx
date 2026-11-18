import { getPayloadWithUser } from '@/lib/payload-auth'
import { ProfileInfoSection } from '@/components/profile/ProfileInfoSection'

export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  const { user } = await getPayloadWithUser()

  if (!user) {
    return null
  }

  return <ProfileInfoSection user={user} />
}
