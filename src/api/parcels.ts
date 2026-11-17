import type { PaginatedResponse } from '@/types/common'
import type { ParcelLookupResponse, ParcelRecord } from '@/types/parcels'
import { apiFetch } from './client'

export const parcelKeys = {
  all: ['parcels'] as const,
  list: (limit = 50) => ['parcels', limit] as const,
}

export async function fetchParcels(limit = 50): Promise<PaginatedResponse<ParcelRecord>> {
  return apiFetch<PaginatedResponse<ParcelRecord>>(
    `/api/parcels?sort=-updatedAt&limit=${limit}`,
  )
}

export async function lookupParcel(input: {
  idu?: string
  address?: string
  lat?: number
  lng?: number
}): Promise<ParcelLookupResponse> {
  const params = new URLSearchParams()
  if (input.idu?.trim()) params.set('idu', input.idu.trim())
  else if (input.address?.trim()) params.set('address', input.address.trim())
  else if (typeof input.lat === 'number' && typeof input.lng === 'number') {
    params.set('lat', String(input.lat))
    params.set('lng', String(input.lng))
  }
  return apiFetch<ParcelLookupResponse>(`/api/plu/parcel-lookup?${params.toString()}`)
}
