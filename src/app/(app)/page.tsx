import { getPayloadWithUser } from '@/lib/payload-auth'
import { Navbar } from '@/components/Navbar'
import { LoginPanel } from '@/components/LoginPanel'
import { DashboardClient } from '@/components/DashboardClient'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const { payload, user } = await getPayloadWithUser()

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

  const [projectsRes, analysesRes, snapshotsRes, documentsRes] = await Promise.all([
    payload.find({ collection: 'projects', sort: '-updatedAt', limit: 24 }),
    payload.count({ collection: 'analyses' }),
    payload.count({ collection: 'analysis-snapshots' }),
    payload.count({ collection: 'documents' }),
  ])

  return (
    <>
      <Navbar user={user} />
      <DashboardClient
        projects={projectsRes.docs.map((p) => ({
          id: p.id,
          name: p.name,
          commune: p.commune,
          codeInsee: p.codeInsee,
          territory: p.territory,
          status: p.status,
          description: p.description,
          updatedAt: p.updatedAt,
        }))}
        stats={{
          projects: projectsRes.totalDocs,
          analyses: analysesRes.totalDocs,
          snapshots: snapshotsRes.totalDocs,
          documents: documentsRes.totalDocs,
        }}
      />
    </>
  )
}
