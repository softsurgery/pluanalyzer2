import { getPayloadWithUser } from '@/lib/payload-auth'
import { Navbar } from '@/components/Navbar'
import { LoginPanel } from '@/components/LoginPanel'
import { ProfileClient } from '@/components/ProfileClient'

export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  const { user } = await getPayloadWithUser()

  if (!user) {
    return (
      <>
        <Navbar user={null} />
        <main className="px-4 pb-12">
          <LoginPanel />
        </main>
      </>
    )
  }

  return (
    <>
      <Navbar user={user} />
      <ProfileClient user={user} />
    </>
  )
}
