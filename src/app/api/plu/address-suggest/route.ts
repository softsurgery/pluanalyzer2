import { NextResponse } from 'next/server'
import { getPayloadWithUser } from '@/lib/payload-auth'
import { parseAddressCadastre } from '@/services/plu/geocoding'
import { fetchJsonWithTimeout } from '@/services/plu/http'

interface BanFeatureCollection {
  features?: Array<{
    geometry?: { coordinates?: [number, number] }
    properties?: {
      label?: string
      city?: string
      postcode?: string
      citycode?: string
      context?: string
      score?: number
    }
  }>
}

export async function GET(request: Request) {
  try {
    const { user } = await getPayloadWithUser()
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const rawQuery = (searchParams.get('q') || '').trim()
    const { streetAddress: q, cadastreSuffix } = parseAddressCadastre(rawQuery)
    if (q.length < 3) {
      return NextResponse.json({ suggestions: [] })
    }

    const baseUrl =
      process.env.GEOCODING_API_URL || 'https://data.geopf.fr/geocodage/search'
    const url = `${baseUrl}?q=${encodeURIComponent(q)}&limit=6`

    const res = await fetchJsonWithTimeout<BanFeatureCollection>(url, {
      timeoutMs: 6000,
    })

    if (!res.ok || !res.data?.features) {
      return NextResponse.json({ suggestions: [] })
    }

    const suggestions = res.data.features
      .filter((f) => f.properties?.label && f.geometry?.coordinates)
      .map((f) => {
        const [lng, lat] = f.geometry!.coordinates!
        const props = f.properties!
        const label = cadastreSuffix
          ? `${props.label!}, ${cadastreSuffix}`
          : props.label!
        return {
          label,
          city: props.city || '',
          postcode: props.postcode || '',
          citycode: props.citycode || '',
          context: props.context || '',
          coordinates: { lat, lng },
        }
      })

    return NextResponse.json({ suggestions })
  } catch {
    return NextResponse.json({ suggestions: [] })
  }
}
