import { fetchJsonWithTimeout } from './http'
import type { GeocodingResult } from './types'

interface BanFeatureCollection {
  features?: Array<{
    geometry?: { coordinates?: [number, number] }
    properties?: {
      label?: string
      score?: number
      city?: string
      postcode?: string
      citycode?: string
    }
  }>
}

/**
 * Geocode a French address using IGN Géoplateforme / BAN Geocoding API.
 */
export async function geocodeFrenchAddress(address: string): Promise<GeocodingResult> {
  const query = address.trim()
  if (!query) {
    return { status: 'error', query, error: 'Address query is empty' }
  }

  const baseUrl =
    process.env.GEOCODING_API_URL || 'https://data.geopf.fr/geocodage/search'
  const url = `${baseUrl}?q=${encodeURIComponent(query)}&limit=1`

  const res = await fetchJsonWithTimeout<BanFeatureCollection>(url, { timeoutMs: 10000 })
  if (!res.ok) {
    return {
      status: 'error',
      query,
      error: res.error || 'Geocoding request failed',
    }
  }

  const feature = res.data?.features?.[0]
  if (!feature || !feature.geometry?.coordinates) {
    return {
      status: 'not_found',
      query,
      raw: res.data,
    }
  }

  const [lng, lat] = feature.geometry.coordinates
  const props = feature.properties || {}

  return {
    status: 'ok',
    query,
    label: props.label,
    score: props.score,
    city: props.city,
    postcode: props.postcode,
    citycode: props.citycode,
    coordinates: { lng, lat },
    raw: res.data,
  }
}
