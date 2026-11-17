import { getPayloadWithUser } from '@/lib/payload-auth'
import { Navbar } from '@/components/Navbar'
import { LoginPanel } from '@/components/LoginPanel'
import { WorkspaceClient, type ParcelRecord, type SnapshotRecord } from '@/components/WorkspaceClient'

export const dynamic = 'force-dynamic'

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>
}) {
  const { payload, user } = await getPayloadWithUser()
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

  const [projectsRes, parcelsRes, snapshotsRes] = await Promise.all([
    payload.find({ collection: 'projects', sort: '-updatedAt', limit: 50 }),
    payload.find({ collection: 'parcels', sort: '-updatedAt', limit: 50 }),
    payload.find({
      collection: 'analysis-snapshots',
      sort: '-createdAt',
      limit: 50,
      depth: 0,
      ...(resolvedParams.projectId
        ? { where: { project: { equals: Number(resolvedParams.projectId) } } }
        : {}),
    }),
  ])

  return (
    <>
      <Navbar user={user} />
      <WorkspaceClient
        projects={projectsRes.docs.map((p) => ({
          id: p.id,
          name: p.name,
          commune: p.commune,
          codeInsee: p.codeInsee,
        }))}
        parcels={parcelsRes.docs as unknown as ParcelRecord[]}
        snapshots={snapshotsRes.docs as unknown as SnapshotRecord[]}
        initialProjectId={resolvedParams.projectId}
      />
    </>
  )
}
