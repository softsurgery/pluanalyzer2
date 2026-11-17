import { getPayloadWithUser } from '@/lib/payload-auth'
import { Navbar } from '@/components/Navbar'
import { LoginPanel } from '@/components/LoginPanel'
import { DocumentsClient } from '@/components/DocumentsClient'

export const dynamic = 'force-dynamic'

export default async function DocumentsPage() {
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

  const [docsRes, projectsRes] = await Promise.all([
    payload.find({ collection: 'documents', sort: '-updatedAt', limit: 50 }),
    payload.find({ collection: 'projects', sort: '-updatedAt', limit: 50 }),
  ])

  return (
    <>
      <Navbar user={user} />
      <DocumentsClient
        documents={docsRes.docs.map((d) => ({
          id: d.id,
          title: d.title,
          documentType: d.documentType,
          commune: d.commune,
          codeInsee: d.codeInsee,
          zoneCode: d.zoneCode,
          extractionStatus: d.extractionStatus,
          pageCount: d.pageCount,
          extractedText: d.extractedText,
          filename: d.filename,
          updatedAt: d.updatedAt,
        }))}
        projects={projectsRes.docs.map((p) => ({ id: p.id, name: p.name }))}
      />
    </>
  )
}
