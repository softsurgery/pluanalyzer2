import { NextResponse } from 'next/server'
import { getPayloadWithUser } from '@/lib/payload-auth'
import {
  geocodeFrenchAddress,
  parseAddressCadastre,
  parseCadastreInput,
} from '@/services/plu/geocoding'
import { fetchIgnCadastreParcel } from '@/services/plu/cadastre'
import { fetchIgnApicartoGpu } from '@/services/plu/apicarto'
import type { CadastreParcelResult } from '@/services/plu/types'

export async function GET(request: Request) {
  try {
    const { user } = await getPayloadWithUser()
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const address = searchParams.get('address')
    const cadastreParam = searchParams.get('cadastre')
    const idu = searchParams.get('idu')
    const codeInsee = searchParams.get('codeInsee')
    const section = searchParams.get('section')
    const numero = searchParams.get('numero')
    const latParam = searchParams.get('lat')
    const lngParam = searchParams.get('lng')

    let geocoding = null
    let point = undefined

    if (latParam !== null && lngParam !== null) {
      const lat = Number(latParam)
      const lng = Number(lngParam)
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        point = { lat, lng }
      }
    }

    if (!point && address) {
      geocoding = await geocodeFrenchAddress(address)
      if (geocoding.status === 'ok' && geocoding.coordinates) {
        point = geocoding.coordinates
      }
    }

    const parsedAddressCadastre = address ? parseAddressCadastre(address) : null
    const parsedExplicitCadastre = cadastreParam
      ? parseCadastreInput(cadastreParam)
      : null
    const cadastreRef =
      parsedExplicitCadastre && parsedExplicitCadastre.numeros.length > 0
        ? parsedExplicitCadastre
        : parsedAddressCadastre

    let parcels: CadastreParcelResult[] = []

    if (
      cadastreRef?.section &&
      cadastreRef.numeros.length > 0 &&
      geocoding?.citycode
    ) {
      const codeDep = geocoding.citycode.slice(0, 2)
      const lookups = await Promise.all(
        cadastreRef.numeros.map((num) =>
          fetchIgnCadastreParcel({
            codeInsee: cadastreRef.comAbs ? undefined : geocoding?.citycode,
            codeDep: cadastreRef.comAbs ? codeDep : undefined,
            comAbs: cadastreRef.comAbs,
            section: cadastreRef.section,
            numero: num,
          }),
        ),
      )
      parcels = lookups.filter((p) => p.status === 'ok')
    } else if (cadastreRef && cadastreRef.numeros.length > 0) {
      // Bare parcel numbers (e.g. "49, 50, 51, 256"): resolve base parcel first to get its 10-char IDU prefix
      const baseParcel = await fetchIgnCadastreParcel({
        point,
        idu: idu || undefined,
        codeInsee: codeInsee || undefined,
        section: section || undefined,
        numero: numero || undefined,
      })
      const basePrefix =
        baseParcel.status === 'ok' && baseParcel.idu && baseParcel.idu.length >= 10
          ? baseParcel.idu.slice(0, 10)
          : undefined

      if (basePrefix) {
        const lookups = await Promise.all(
          cadastreRef.numeros.map((num) =>
            fetchIgnCadastreParcel({ idu: `${basePrefix}${num}` }),
          ),
        )
        parcels = lookups.filter((p) => p.status === 'ok')
      }
    }

    let parcel: CadastreParcelResult
    if (parcels.length > 0) {
      const totalSurface = parcels.reduce(
        (sum, p) => sum + (p.surfaceM2 ?? 0),
        0,
      )
      const combinedFeatures = parcels
        .filter((p) => p.geometry)
        .map((p) => ({
          type: 'Feature' as const,
          geometry: p.geometry,
          properties: {
            idu: p.idu,
            surfaceM2: p.surfaceM2,
          },
        }))

      parcel = {
        ...parcels[0],
        idu: parcels.map((p) => p.idu).filter(Boolean).join(', '),
        surfaceM2: totalSurface || parcels[0].surfaceM2,
        geometry:
          combinedFeatures.length > 1
            ? ({
                type: 'FeatureCollection',
                features: combinedFeatures,
              } as unknown as CadastreParcelResult['geometry'])
            : parcels[0].geometry,
      }
    } else {
      parcel = await fetchIgnCadastreParcel({
        point,
        idu: idu || undefined,
        codeInsee: codeInsee || undefined,
        section: section || undefined,
        numero: numero || undefined,
      })
      if (parcel.status === 'ok') {
        parcels = [parcel]
      }
    }

    const targetGeom = parcels[0]?.geometry || parcel.centroid || point
    const gpu = targetGeom ? await fetchIgnApicartoGpu(targetGeom) : null

    return NextResponse.json({
      geocoding,
      parcel,
      parcels,
      gpu,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Parcel lookup failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
