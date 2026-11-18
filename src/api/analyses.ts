import type { RunAnalysisInput, SnapshotRecord } from '@/types/analyses'
import type { PaginatedResponse } from '@/types/common'
import { apiFetch } from '@/api/client'

export const analysisKeys = {
  all: ['snapshots'] as const,
  snapshots: (projectId?: string) => ['snapshots', projectId || 'all'] as const,
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
