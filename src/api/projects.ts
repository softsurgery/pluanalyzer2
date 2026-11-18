import type { PaginatedResponse } from '@/types/common'
import type {
  CreateProjectInput,
  DashboardStats,
  ProjectItem,
  UpdateProjectInput,
} from '@/types/projects'
import { apiFetch } from '@/api/client'

export const projectKeys = {
  all: ['projects'] as const,
  list: (limit = 50) => ['projects', limit] as const,
  stats: ['dashboard-stats'] as const,
}

export async function fetchProjects(limit = 50): Promise<PaginatedResponse<ProjectItem>> {
  return apiFetch<PaginatedResponse<ProjectItem>>(
    `/api/projects?sort=-updatedAt&limit=${limit}`,
  )
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
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

export async function createProject(input: CreateProjectInput): Promise<ProjectItem> {
  return apiFetch<ProjectItem>('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...input,
      status: input.status ?? 'active',
    }),
  })
}

export async function updateProject(
  id: number | string,
  input: UpdateProjectInput,
): Promise<ProjectItem> {
  return apiFetch<ProjectItem>(`/api/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function deleteProject(id: number | string): Promise<unknown> {
  return apiFetch(`/api/projects/${id}`, {
    method: 'DELETE',
  })
}
