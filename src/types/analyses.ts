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

export interface RunAnalysisInput {
  projectId: number
  prompt?: string
  aiModel?: string
  address?: string
  idu?: string
  parcelId?: number
  lat?: number
  lng?: number
}
