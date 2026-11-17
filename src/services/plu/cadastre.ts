import { fetchJsonWithTimeout } from './http'
import type { CadastreParcelResult, GeoJSONGeometry, GeoPoint } from './types'

interface CadastreFeatureCollection {
  features?: Array<{
    geometry?: GeoJSONGeometry
    properties?: {
      idu?: string
      code_insee?: string
      nom_com?: string
      section?: string
      numero?: string
      code_arr?: string
      contenance?: number
    }
  }>
}

export interface ParcelLookupInput {
  point?: GeoPoint
  idu?: string
  codeInsee?: string
  section?: string
  numero?: string
}

function computeGeoJSONCentroid(geometry?: GeoJSONGeometry): GeoPoint | undefined {
  if (!geometry || !geometry.coordinates) return undefined

  const points: Array<[number, number]> = []
  const collect = (coords: unknown) => {
    if (!Array.isArray(coords)) return
    if (
      coords.length >= 2 &&
      typeof coords[0] === 'number' &&
      typeof coords[1] === 'number'
    ) {
      points.push([coords[0], coords[1]])
      return
    }
    for (const item of coords) collect(item)
  }

  collect(geometry.coordinates)
  if (points.length === 0) return undefined

  const sum = points.reduce(
    (acc, [lng, lat]) => ({ lng: acc.lng + lng, lat: acc.lat + lat }),
    { lng: 0, lat: 0 },
  )

  return {
    lng: Number((sum.lng / points.length).toFixed(7)),
    lat: Number((sum.lat / points.length).toFixed(7)),
  }
}

/**
 * Retrieve cadastral parcel from IGN API Carto Cadastre.
 */
export async function fetchIgnCadastreParcel(
  input: ParcelLookupInput,
): Promise<CadastreParcelResult> {
  const baseUrl = process.env.IGN_APICARTO_BASE_URL || 'https://apicarto.ign.fr/api'
  const params = new URLSearchParams()

  if (input.point) {
    params.set(
      'geom',
      JSON.stringify({
        type: 'Point',
        coordinates: [input.point.lng, input.point.lat],
      }),
    )
  } else if (input.idu) {
    const clean = input.idu.trim().toUpperCase()
    // Standard French IDU: 5 chars INSEE + 3 chars prefixe + 2 chars section + 4 chars numero = 14 chars
    if (clean.length >= 14) {
      params.set('code_insee', clean.slice(0, 5))
      params.set('code_arr', clean.slice(5, 8))
      params.set('section', clean.slice(8, 10))
      params.set('numero', clean.slice(10, 14))
    } else {
      return { status: 'error', error: `Invalid IDU format: ${input.idu}` }
    }
  } else if (input.codeInsee && input.section && input.numero) {
    params.set('code_insee', input.codeInsee.trim())
    params.set('section', input.section.trim().toUpperCase().padStart(2, '0'))
    params.set('numero', input.numero.trim().padStart(4, '0'))
  } else {
    return {
      status: 'error',
      error: 'Provide point coordinates, IDU, or codeInsee + section + numero',
    }
  }

  const url = `${baseUrl}/cadastre/parcelle?${params.toString()}`
  const res = await fetchJsonWithTimeout<CadastreFeatureCollection>(url, {
    timeoutMs: 12000,
  })

  if (!res.ok) {
    return {
      status: 'error',
      error: res.error || 'IGN API Carto Cadastre request failed',
    }
  }

  const feature = res.data?.features?.[0]
  if (!feature) {
    return {
      status: 'not_found',
      raw: res.data,
    }
  }

  const props = feature.properties || {}
  const centroid = computeGeoJSONCentroid(feature.geometry) || input.point

  return {
    status: 'ok',
    idu: props.idu,
    codeInsee: props.code_insee,
    commune: props.nom_com,
    section: props.section,
    numero: props.numero,
    prefixe: props.code_arr || '000',
    surfaceM2: typeof props.contenance === 'number' ? props.contenance : undefined,
    centroid,
    geometry: feature.geometry,
    raw: feature,
  }
}
