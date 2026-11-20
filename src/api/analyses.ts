import type { RunAnalysisInput, SnapshotRecord } from '@/types/analyses'
import type { PaginatedResponse } from '@/types/common'
import { apiFetch } from '@/api/client'

export interface FetchSnapshotsParams {
  projectId?: string
  page?: number
  limit?: number
  sort?: string
  search?: string
}

export const analysisKeys = {
  all: ['snapshots'] as const,
  snapshots: (
    projectId?: string,
    params?: Omit<FetchSnapshotsParams, 'projectId'>,
  ) =>
    params
      ? (['snapshots', projectId || 'all', params] as const)
      : (['snapshots', projectId || 'all'] as const),
}

export async function fetchSnapshots(
  projectIdOrParams?: string | FetchSnapshotsParams,
  limit = 50,
): Promise<PaginatedResponse<SnapshotRecord>> {
  const normalized: FetchSnapshotsParams =
    typeof projectIdOrParams === 'object' && projectIdOrParams !== null
      ? projectIdOrParams
      : { projectId: projectIdOrParams, limit }

  const params = new URLSearchParams({
    sort: normalized.sort || '-createdAt',
    page: String(normalized.page ?? 1),
    limit: String(normalized.limit ?? 50),
    depth: '0',
  })

  const search = normalized.search?.trim()
  if (normalized.projectId && search) {
    params.set('where[and][0][project][equals]', normalized.projectId)
    params.set('where[and][1][or][0][addressQuery][like]', search)
    params.set('where[and][1][or][1][snapshotLabel][like]', search)
    params.set('where[and][1][or][2][originalPrompt][like]', search)
    params.set('where[and][1][or][3][zoneCode][like]', search)
  } else if (normalized.projectId) {
    params.set('where[project][equals]', normalized.projectId)
  } else if (search) {
    params.set('where[or][0][addressQuery][like]', search)
    params.set('where[or][1][snapshotLabel][like]', search)
    params.set('where[or][2][originalPrompt][like]', search)
    params.set('where[or][3][zoneCode][like]', search)
  }

  return apiFetch<PaginatedResponse<SnapshotRecord>>(
    `/api/analysis-snapshots?${params.toString()}`,
  )
}

export async function runAnalysis(
  input: RunAnalysisInput,
): Promise<{ snapshot: SnapshotRecord }> {
  return apiFetch<{ snapshot: SnapshotRecord }>('/api/plu/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function replaySnapshot(
  snapshotId: number | string,
): Promise<{ snapshot: SnapshotRecord }> {
  return apiFetch<{ snapshot: SnapshotRecord }>('/api/plu/replay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshotId }),
  })
}

export async function compareSnapshots(
  snapshotA: string,
  snapshotB: string,
): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>(
    `/api/plu/compare?snapshotA=${snapshotA}&snapshotB=${snapshotB}`,
  )
}
