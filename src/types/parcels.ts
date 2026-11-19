export interface ParcelRecord {
  id: number | string
  idu: string
  commune?: string | null
  codeInsee: string
  section: string
  numero: string
  surfaceM2?: number | null
  address?: string | null
  centroid?: { lng?: number | null; lat?: number | null } | null
  geometry?: unknown
}

export interface ParcelLookupItem {
  status: string
  idu?: string
  surfaceM2?: number
  centroid?: { lng?: number | null; lat?: number | null }
  geometry?: unknown
}

export interface ParcelLookupResponse {
  parcel?: ParcelLookupItem
  parcels?: ParcelLookupItem[]
  geocoding?: {
    coordinates?: { lng?: number | null; lat?: number | null }
    label?: string
  }
  gpu?: { zoneCode?: string }
}
