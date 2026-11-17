export interface PaginatedResponse<T> {
  docs: T[]
  totalDocs: number
  limit: number
  page?: number
  totalPages?: number
}

export interface ProjectItem {
  id: number | string
  name: string
  commune: string
  codeInsee: string
  territory?: string | null
  status?: string | null
  description?: string | null
  updatedAt: string
}

export interface DocumentItem {
  id: number | string
  title: string
  documentType: string
  commune?: string | null
  codeInsee?: string | null
  zoneCode?: string | null
  extractionStatus?: string | null
  pageCount?: number | null
  extractedText?: string | null
  filename?: string | null
  updatedAt: string
}

export interface ParcelRecord {
  id: number | string
  idu: string
  commune?: string | null
  codeInsee: string
  section: string
  numero: string
  surfaceM2?: number | null
  address?: string | null
  centroid?: { lng?: number | null; lat?: number | null } | null
  geometry?: unknown
}

export interface SnapshotRecord {
  id: number | string
  snapshotLabel: string
  version: number
  zoneCode?: string | null
  validationStatus?: string | null
  originalPrompt: string
  addressQuery?: string | null
  cadastralReferences?: Record<string, unknown> | null
  geocodingResult?: Record<string, unknown> | null
  zoningAndGis?: Record<string, unknown> | null
  extractedArticles?: Array<{ articleNumber: string; title: string; content: string }> | null
  regulatoryInterpretation?: Record<string, unknown> | null
  validationReport?: Record<string, unknown> | null
  constructibilityCalculations?: Record<string, unknown> | null
  archicadExport?: Record<string, unknown> | null
  executionLogs?: Array<{ step: string; status: string; durationMs: number; message: string }> | null
  executionErrors?: Array<{ step: string; error: string }> | null
  createdAt: string
}

export const queryKeys = {
  projects: (limit = 50) => ['projects', limit] as const,
  dashboardStats: ['dashboard-stats'] as const,
  documents: (limit = 50) => ['documents', limit] as const,
  parcels: (limit = 50) => ['parcels', limit] as const,
  snapshots: (projectId?: string) => ['snapshots', projectId || 'all'] as const,
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message =
      data?.error ||
      data?.errors?.[0]?.message ||
      data?.message ||
      `Erreur HTTP ${res.status}`
    throw new Error(message)
  }
  return data as T
}

export async function fetchProjects(limit = 50): Promise<PaginatedResponse<ProjectItem>> {
  return apiFetch<PaginatedResponse<ProjectItem>>(
    `/api/projects?sort=-updatedAt&limit=${limit}`,
  )
}

export async function fetchDashboardStats() {
  const [projectsRes, analysesRes, snapshotsRes, documentsRes] = await Promise.all([
    apiFetch<PaginatedResponse<ProjectItem>>('/api/projects?limit=0'),
    apiFetch<PaginatedResponse<unknown>>('/api/analyses?limit=0'),
    apiFetch<PaginatedResponse<unknown>>('/api/analysis-snapshots?limit=0'),
    apiFetch<PaginatedResponse<unknown>>('/api/documents?limit=0'),
  ])

  return {
    projects: projectsRes.totalDocs,
    analyses: analysesRes.totalDocs,
    snapshots: snapshotsRes.totalDocs,
    documents: documentsRes.totalDocs,
  }
}

export async function fetchDocuments(limit = 50): Promise<PaginatedResponse<DocumentItem>> {
  return apiFetch<PaginatedResponse<DocumentItem>>(
    `/api/documents?sort=-updatedAt&limit=${limit}`,
  )
}

export async function fetchParcels(limit = 50): Promise<PaginatedResponse<ParcelRecord>> {
  return apiFetch<PaginatedResponse<ParcelRecord>>(
    `/api/parcels?sort=-updatedAt&limit=${limit}`,
  )
}

export async function fetchSnapshots(
  projectId?: string,
  limit = 50,
): Promise<PaginatedResponse<SnapshotRecord>> {
  const params = new URLSearchParams({
    sort: '-createdAt',
    limit: String(limit),
    depth: '0',
  })
  if (projectId) {
    params.set('where[project][equals]', projectId)
  }
  return apiFetch<PaginatedResponse<SnapshotRecord>>(
    `/api/analysis-snapshots?${params.toString()}`,
  )
}
