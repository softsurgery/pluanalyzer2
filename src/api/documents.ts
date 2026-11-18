import type { PaginatedResponse } from '@/types/common'
import type { DocumentItem, UploadDocumentInput } from '@/types/documents'
import { apiFetch } from '@/api/client'

export const documentKeys = {
  all: ['documents'] as const,
  list: (limit = 50) => ['documents', limit] as const,
}

export async function fetchDocuments(limit = 50): Promise<PaginatedResponse<DocumentItem>> {
  return apiFetch<PaginatedResponse<DocumentItem>>(
    `/api/documents?sort=-updatedAt&limit=${limit}`,
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
