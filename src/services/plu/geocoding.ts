import { fetchJsonWithTimeout } from '@/services/plu/http'
import type { GeocodingResult } from '@/services/plu/types'

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

export interface ParsedAddressCadastre {
  streetAddress: string
  cadastreSuffix?: string
  comAbs?: string
  section?: string
  numeros: string[]
}

const CADASTRE_SUFFIX_REGEX = /,?\s*((?:cad(?:astre)?|parc(?:elle|elles)?)\b.*)$/i
const CADASTRE_REF_REGEX =
  /(?:cadastre|parcelle|parcelles)\s+(?:(\d{3})\s+)?([a-z0-9]{1,2})\s+([\d,\s.]+)/i

/**
 * Strip trailing cadastral annotations (e.g. ", cadastre 844 K 39, 49, 50, 51.")
 * so BAN / Géoplateforme geocoding matches the street address cleanly.
 */
export function normalizeAddressQuery(address: string): string {
  return address.replace(CADASTRE_SUFFIX_REGEX, '').trim()
}

/**
 * Parse standalone cadastre input like "49, 50, 51, 256" or "844 K 39, 49, 50, 51".
 */
export function parseCadastreInput(raw: string): {
  comAbs?: string
  section?: string
  numeros: string[]
} {
  const trimmed = raw.trim()
  if (!trimmed) return { numeros: [] }

  const withSection = trimmed.match(
    /^(?:cadastre|parcelles?)?\s*(?:(\d{3})\s+)?([a-z0-9]{1,2})\s+([\d,\s.]+)$/i,
  )
  if (withSection) {
    return {
      comAbs: withSection[1]?.trim(),
      section: withSection[2].trim().toUpperCase().padStart(2, '0'),
      numeros: Array.from(
        new Set(
          withSection[3]
            .split(/[,\s.]+/)
            .map((n) => n.trim())
            .filter((n) => /^\d{1,4}$/.test(n))
            .map((n) => n.padStart(4, '0')),
        ),
      ),
    }
  }

  return {
    numeros: Array.from(
      new Set(
        trimmed
          .split(/[,\s.]+/)
          .map((n) => n.trim())
          .filter((n) => /^\d{1,4}$/.test(n))
          .map((n) => n.padStart(4, '0')),
      ),
    ),
  }
}

/**
 * Extract street address and optional cadastral parcel references from an address string.
 */
export function parseAddressCadastre(address: string): ParsedAddressCadastre {
  const trimmed = address.trim()
  const suffixMatch = trimmed.match(CADASTRE_SUFFIX_REGEX)
  const streetAddress = normalizeAddressQuery(trimmed)
  const cadastreSuffix = suffixMatch?.[1]?.trim()

  if (!cadastreSuffix) {
    return { streetAddress, numeros: [] }
  }

  const refMatch = cadastreSuffix.match(CADASTRE_REF_REGEX)
  if (!refMatch) {
    return { streetAddress, cadastreSuffix, numeros: [] }
  }

  const comAbs = refMatch[1]?.trim()
  const section = refMatch[2].trim().toUpperCase().padStart(2, '0')
  const numeros = Array.from(
    new Set(
      refMatch[3]
        .split(/[,\s.]+/)
        .map((n) => n.trim())
        .filter((n) => /^\d{1,4}$/.test(n))
        .map((n) => n.padStart(4, '0')),
    ),
  )

  return {
    streetAddress,
    cadastreSuffix,
    comAbs,
    section,
    numeros,
  }
}

/**
 * Geocode a French address using IGN Géoplateforme / BAN Geocoding API.
 */
export async function geocodeFrenchAddress(address: string): Promise<GeocodingResult> {
  const query = normalizeAddressQuery(address)
  if (!query) {
    return { status: 'error', query: address.trim(), error: 'Address query is empty' }
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
