import { NextResponse } from 'next/server'
import { getPayloadWithUser } from '@/lib/payload-auth'
import { geocodeFrenchAddress } from '@/services/plu/geocoding'
import { fetchIgnCadastreParcel } from '@/services/plu/cadastre'
import { fetchIgnApicartoGpu } from '@/services/plu/apicarto'

export async function GET(request: Request) {
  try {
    const { user } = await getPayloadWithUser()
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const address = searchParams.get('address')
    const idu = searchParams.get('idu')
    const codeInsee = searchParams.get('codeInsee')
    const section = searchParams.get('section')
    const numero = searchParams.get('numero')

    let geocoding = null
    let point = undefined

    if (address) {
      geocoding = await geocodeFrenchAddress(address)
      if (geocoding.status === 'ok' && geocoding.coordinates) {
        point = geocoding.coordinates
      }
    }

    const parcel = await fetchIgnCadastreParcel({
      point,
      idu: idu || undefined,
      codeInsee: codeInsee || undefined,
      section: section || undefined,
      numero: numero || undefined,
    })

    const targetGeom = parcel.geometry || parcel.centroid || point
    const gpu = targetGeom ? await fetchIgnApicartoGpu(targetGeom) : null

    return NextResponse.json({
      geocoding,
      parcel,
      gpu,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Parcel lookup failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
