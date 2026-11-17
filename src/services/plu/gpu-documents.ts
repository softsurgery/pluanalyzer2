import { fetchJsonWithTimeout } from './http'
import type { GPUDocumentInfo, GPUDocumentsResult } from './types'

interface GpuApiDocument {
  id?: string
  name?: string
  type?: string
  status?: string
  partition?: string
  archiveUrl?: string
  files?: Array<{ name?: string; url?: string }>
}

/**
 * Retrieve official PLU/PLUi document metadata from Géoportail de l'Urbanisme (GPU).
 */
export async function fetchGpuDocuments(
  codeInsee: string,
  partition?: string,
): Promise<GPUDocumentsResult> {
  const baseUrl =
    process.env.GPU_API_BASE_URL || 'https://www.geoportail-urbanisme.gouv.fr/api'

  const cleanInsee = codeInsee.trim()
  if (!cleanInsee) {
    return { status: 'error', documents: [], error: 'Missing codeInsee' }
  }

  const url = partition
    ? `${baseUrl}/document?partition=${encodeURIComponent(partition)}`
    : `${baseUrl}/document?grid=${encodeURIComponent(cleanInsee)}`

  const res = await fetchJsonWithTimeout<GpuApiDocument[]>(url, { timeoutMs: 12000 })

  if (!res.ok) {
    // Fallback to municipality documents endpoint
    const fallbackUrl = `${baseUrl}/municipality/${encodeURIComponent(cleanInsee)}/documents`
    const fallbackRes = await fetchJsonWithTimeout<GpuApiDocument[]>(fallbackUrl, {
      timeoutMs: 12000,
    })

    if (!fallbackRes.ok) {
      return {
        status: 'error',
        communeInsee: cleanInsee,
        documents: [],
        error: fallbackRes.error || res.error || 'GPU API request failed',
      }
    }

    const docs = mapGpuDocs(fallbackRes.data || [])
    return {
      status: docs.length > 0 ? 'ok' : 'not_found',
      communeInsee: cleanInsee,
      documents: docs,
      raw: fallbackRes.data,
    }
  }

  const docs = mapGpuDocs(Array.isArray(res.data) ? res.data : [])
  return {
    status: docs.length > 0 ? 'ok' : 'not_found',
    communeInsee: cleanInsee,
    documents: docs,
    raw: res.data,
  }
}

function mapGpuDocs(rawDocs: GpuApiDocument[]): GPUDocumentInfo[] {
  return rawDocs.map((doc) => ({
    id: String(doc.id || doc.partition || doc.name || 'unknown'),
    name: doc.name,
    type: doc.type,
    status: doc.status,
    partition: doc.partition,
    archiveUrl: doc.archiveUrl,
    files: (doc.files || [])
      .filter((f): f is { name: string; url: string } => Boolean(f.name && f.url)),
  }))
}
