import type { PaginatedResponse } from '@/types/common'
import type { DocumentItem, UploadDocumentInput } from '@/types/documents'
import { apiFetch } from '@/api/client'

export interface FetchDocumentsParams {
  page?: number
  limit?: number
  sort?: string
  search?: string
}

export const documentKeys = {
  all: ['documents'] as const,
  list: (params: FetchDocumentsParams | number = 50) =>
    ['documents', typeof params === 'number' ? { limit: params } : params] as const,
}

export async function fetchDocuments(
  params: FetchDocumentsParams | number = 50,
): Promise<PaginatedResponse<DocumentItem>> {
  const normalized: FetchDocumentsParams =
    typeof params === 'number' ? { limit: params } : params

  const searchParams = new URLSearchParams({
    depth: '1',
    page: String(normalized.page ?? 1),
    limit: String(normalized.limit ?? 50),
    sort: normalized.sort || '-updatedAt',
  })

  const search = normalized.search?.trim()
  if (search) {
    searchParams.set('where[or][0][title][like]', search)
    searchParams.set('where[or][1][commune][like]', search)
    searchParams.set('where[or][2][codeInsee][like]', search)
    searchParams.set('where[or][3][zoneCode][like]', search)
  }

  return apiFetch<PaginatedResponse<DocumentItem>>(
    `/api/documents?${searchParams.toString()}`,
  )
}

export async function uploadDocument(input: UploadDocumentInput): Promise<unknown> {
  const formData = new FormData()
  formData.append('file', input.file)
  formData.append(
    '_payload',
    JSON.stringify({
      title: input.title || input.file.name,
      documentType: 'reglement',
      zoneCode: input.zoneCode,
      codeInsee: input.codeInsee,
      commune: input.commune || 'Aix-en-Provence',
      project: input.projectId ? Number(input.projectId) : undefined,
    }),
  )
  return apiFetch('/api/documents', {
    method: 'POST',
    body: formData,
  })
}

export async function extractDocumentPdf(
  id: number | string,
): Promise<{ document: DocumentItem; articles?: unknown[] }> {
  return apiFetch<{ document: DocumentItem; articles?: unknown[] }>(
    `/api/plu/documents/${id}/extract`,
    { method: 'POST' },
  )
}
