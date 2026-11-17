import type {
  ArchicadExportPayload,
  ConstructibilityResult,
  GeoJSONGeometry,
  GeoPoint,
  StructuredRegulatoryRules,
} from './types'

/**
 * Convert WGS84 polygon coordinates into local metric coordinates (meters) relative to centroid
 * for direct import into Archicad / BIM modeling tools.
 */
function geoJsonToLocalMeters(
  geometry?: GeoJSONGeometry,
  centroid?: GeoPoint,
): Array<{ x: number; y: number }> | undefined {
  if (!geometry || !centroid || !Array.isArray(geometry.coordinates)) return undefined

  let ring: unknown = geometry.coordinates
  if (geometry.type === 'MultiPolygon' && Array.isArray(ring) && Array.isArray(ring[0])) {
    ring = ring[0][0]
  } else if (geometry.type === 'Polygon' && Array.isArray(ring)) {
    ring = ring[0]
  }

  if (!Array.isArray(ring)) return undefined

  const latRad = (centroid.lat * Math.PI) / 180
  const metersPerDegLat = 111132.92
  const metersPerDegLng = 111412.84 * Math.cos(latRad)

  const outline: Array<{ x: number; y: number }> = []
  for (const pt of ring) {
    if (Array.isArray(pt) && typeof pt[0] === 'number' && typeof pt[1] === 'number') {
      outline.push({
        x: Number(((pt[0] - centroid.lng) * metersPerDegLng).toFixed(3)),
        y: Number(((pt[1] - centroid.lat) * metersPerDegLat).toFixed(3)),
      })
    }
  }
  return outline.length > 0 ? outline : undefined
}

export function buildArchicadExport(params: {
  project: { id: string | number; name: string; commune: string; codeInsee: string }
  parcel: {
    idu?: string
    surfaceM2?: number | null
    centroid?: GeoPoint
    geometry?: GeoJSONGeometry
  }
  zoning: { zoneCode?: string; zoneLabel?: string; zoneType?: string }
  rules: StructuredRegulatoryRules
  constructibility: ConstructibilityResult
}): ArchicadExportPayload {
  return {
    schemaVersion: '1.0.0',
    exportedAt: new Date().toISOString(),
    sourcePlatform: 'PLU Analyzer (Payload CMS)',
    project: params.project,
    parcel: {
      idu: params.parcel.idu,
      surfaceM2: params.parcel.surfaceM2 ?? null,
      centroid: params.parcel.centroid,
      geometry: params.parcel.geometry,
      localOutlineMeters: geoJsonToLocalMeters(
        params.parcel.geometry,
        params.parcel.centroid,
      ),
    },
    zoning: params.zoning,
    envelopeConstraints: {
      maxHeightM: params.rules.maxHeightM,
      maxEavesHeightM: params.rules.maxEavesHeightM,
      maxStoreys: params.rules.maxStoreys,
      maxCoverageRatio: params.rules.maxCoverageRatio,
      frontSetbackM: params.rules.frontSetbackM,
      sideSetbackM: params.rules.sideSetbackM,
      rearSetbackM: params.rules.rearSetbackM,
      minGreenRatio: params.rules.minGreenRatio,
    },
    constructibility: params.constructibility,
  }
}
