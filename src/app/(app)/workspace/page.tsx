import { getPayloadWithUser } from '@/lib/payload-auth'
import { Navbar } from '@/components/Navbar'
import { LoginPanel } from '@/components/LoginPanel'
import { WorkspaceClient } from '@/components/WorkspaceClient'

export const dynamic = 'force-dynamic'

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; tab?: string }>
}) {
  const { user } = await getPayloadWithUser()
  const resolvedParams = await searchParams

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
      <WorkspaceClient
        initialProjectId={resolvedParams.projectId}
        initialTab={resolvedParams.tab}
        userRole={user.role}
      />
    </>
  )
}
