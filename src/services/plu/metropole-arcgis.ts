import { fetchJsonWithTimeout } from '@/services/plu/http'
import type { ArcGISResult, GeoPoint } from '@/services/plu/types'

interface ArcGISQueryResponse {
  features?: Array<{
    attributes?: Record<string, unknown>
    geometry?: unknown
  }>
  error?: {
    code?: number
    message?: string
  }
}

/**
 * Query Métropole Aix-Marseille-Provence ArcGIS REST service for local PLUi zoning.
 * Returns status='unavailable' or 'error' if the endpoint is unreachable or not configured,
 * never fabricating official regulatory data.
 */
export async function fetchMetropoleArcgisZoning(point: GeoPoint): Promise<ArcGISResult> {
  const baseUrl =
    process.env.AMP_ARCGIS_PLUI_URL || 'https://sig.ampmetropole.fr/arcgis/rest/services'
  const layerPath = process.env.AMP_ARCGIS_ZONING_LAYER || 'PLUi/MapServer/0'
  const endpoint = `${baseUrl.replace(/\/$/, '')}/${layerPath.replace(/^\//, '')}/query`

  const params = new URLSearchParams({
    f: 'json',
    geometry: JSON.stringify({ x: point.lng, y: point.lat, spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    returnGeometry: 'false',
  })

  const res = await fetchJsonWithTimeout<ArcGISQueryResponse>(`${endpoint}?${params.toString()}`, {
    timeoutMs: 10000,
  })

  if (!res.ok) {
    return {
      status: 'unavailable',
      endpoint,
      features: [],
      error: res.error || 'Métropole AMP ArcGIS endpoint unreachable',
    }
  }

  if (res.data?.error) {
    return {
      status: 'error',
      endpoint,
      features: [],
      raw: res.data,
      error: res.data.error.message || 'ArcGIS query error',
    }
  }

  const features = (res.data?.features || [])
    .map((f) => f.attributes)
    .filter((a): a is Record<string, unknown> => Boolean(a))

  if (features.length === 0) {
    return {
      status: 'not_found',
      endpoint,
      features: [],
      raw: res.data,
    }
  }

  const first = features[0]
  const zoneCode =
    (first.LIBELLE as string) ||
    (first.libelle as string) ||
    (first.ZONE as string) ||
    (first.zone as string) ||
    undefined
  const zoneLabel =
    (first.LIBELONG as string) ||
    (first.libelong as string) ||
    (first.NOM_ZONE as string) ||
    undefined

  return {
    status: 'ok',
    endpoint,
    features,
    zoneCode,
    zoneLabel,
    raw: res.data,
  }
}
