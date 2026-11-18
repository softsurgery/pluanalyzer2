export interface GeoPoint {
  lng: number
  lat: number
}

export interface GeoJSONGeometry {
  type: string
  coordinates: unknown
}

export interface GeocodingResult {
  status: 'ok' | 'not_found' | 'error'
  query: string
  label?: string
  score?: number
  city?: string
  postcode?: string
  citycode?: string
  coordinates?: GeoPoint
  raw?: unknown
  error?: string
}

export interface CadastreParcelResult {
  status: 'ok' | 'not_found' | 'error'
  idu?: string
  codeInsee?: string
  commune?: string
  section?: string
  numero?: string
  prefixe?: string
  surfaceM2?: number
  centroid?: GeoPoint
  geometry?: GeoJSONGeometry
  raw?: unknown
  error?: string
}

export interface ApicartoZoningFeature {
  libelle?: string
  libelong?: string
  typezone?: string
  destdomi?: string
  partition?: string
  gpu_doc_id?: string
  nomfic?: string
  urlfic?: string
  datappro?: string
  insee?: string
  [key: string]: unknown
}

export interface ApicartoResult {
  status: 'ok' | 'not_found' | 'error'
  zoneCode?: string
  zoneLabel?: string
  zoneType?: string
  partition?: string
  zones: ApicartoZoningFeature[]
  prescriptions: {
    surf: unknown[]
    lin: unknown[]
    pct: unknown[]
    infoSurf: unknown[]
  }
  raw?: unknown
  error?: string
}

export interface ArcGISResult {
  status: 'ok' | 'not_found' | 'unavailable' | 'error'
  endpoint: string
  features: Array<Record<string, unknown>>
  zoneCode?: string
  zoneLabel?: string
  raw?: unknown
  error?: string
}

export interface GPUDocumentInfo {
  id: string
  name?: string
  type?: string
  status?: string
  partition?: string
  archiveUrl?: string
  files?: Array<{ name: string; url: string }>
}

export interface GPUDocumentsResult {
  status: 'ok' | 'not_found' | 'error'
  communeInsee?: string
  documents: GPUDocumentInfo[]
  raw?: unknown
  error?: string
}

export interface ExtractedArticle {
  articleNumber: string
  title: string
  content: string
}

export interface PDFExtractionResult {
  status: 'extracted' | 'ocr_required' | 'ocr_completed' | 'failed'
  pageCount: number
  charCount: number
  text: string
  articles: ExtractedArticle[]
  ocrAttempted: boolean
  error?: string
}

export interface StructuredRegulatoryRules {
  maxHeightM: number | null
  maxEavesHeightM: number | null
  maxStoreys: number | null
  maxCoverageRatio: number | null
  frontSetbackM: number | null
  sideSetbackM: number | null
  rearSetbackM: number | null
  minGreenRatio: number | null
  parkingPerDwelling: number | null
}

export interface OpenRouterInterpretationResult {
  status: 'ok' | 'unconfigured' | 'insufficient_data' | 'error'
  model: string
  summary: string
  zoneCode?: string
  rules: StructuredRegulatoryRules
  constructibility?: {
    zoneCode: string | null
    parcelSurfaceM2: number | null
    maxFootprintM2: number | null
    estimatedBuildableFootprintM2: number | null
    maxHeightM: number | null
    estimatedStoreys: number | null
    maxFloorAreaSdpM2: number | null
    maxVolumeM3: number | null
    minGreenSpaceM2: number | null
  }
  citations: Array<{ article: string; excerpt: string }>
  warnings: string[]
  rawResponse?: unknown
  error?: string
}

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info'
  field: string
  message: string
}

export interface ValidationReport {
  status: 'valid' | 'warnings' | 'incomplete' | 'invalid'
  issues: ValidationIssue[]
  hasOfficialZoning: boolean
  hasOfficialRegulations: boolean
  completenessScore: number
}

export interface ConstructibilityResult {
  status: 'computed' | 'insufficient_data'
  parcelSurfaceM2: number | null
  maxFootprintM2: number | null
  estimatedBuildableFootprintM2: number | null
  minGreenSpaceM2: number | null
  maxHeightM: number | null
  estimatedStoreys: number | null
  floorHeightAssumedM: number
  maxFloorAreaSdpM2: number | null
  maxVolumeM3: number | null
  estimatedDwellings: number | null
  requiredParkingSpaces: number | null
  assumptions: string[]
  missingParameters: string[]
}

export interface ArchicadExportPayload {
  schemaVersion: '1.0.0'
  exportedAt: string
  sourcePlatform: 'PLU Analyzer (Payload CMS)'
  project: {
    id: string | number
    name: string
    commune: string
    codeInsee: string
  }
  parcel: {
    idu?: string
    surfaceM2: number | null
    centroid?: GeoPoint
    geometry?: GeoJSONGeometry
    localOutlineMeters?: Array<{ x: number; y: number }>
  }
  zoning: {
    zoneCode?: string
    zoneLabel?: string
    zoneType?: string
  }
  envelopeConstraints: {
    maxHeightM: number | null
    maxEavesHeightM: number | null
    maxStoreys: number | null
    maxCoverageRatio: number | null
    frontSetbackM: number | null
    sideSetbackM: number | null
    rearSetbackM: number | null
    minGreenRatio: number | null
  }
  constructibility: ConstructibilityResult
}

export interface PipelineStepLog {
  step: string
  status: 'ok' | 'warning' | 'skipped' | 'error'
  durationMs: number
  message: string
  timestamp: string
}
