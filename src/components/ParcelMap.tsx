'use client'

import { useEffect, useRef } from 'react'
import type L from 'leaflet'

interface ParcelMapProps {
  centroid?: { lng?: number | null; lat?: number | null } | null
  geometry?: unknown
  parcelLabel?: string
  zoneCode?: string
}

export function ParcelMap({ centroid, geometry, parcelLabel, zoneCode }: ParcelMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const overlayRef = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    let mounted = true

    async function initMap() {
      if (!containerRef.current || mapRef.current) return
      const leaflet = (await import('leaflet')).default
      if (!mounted || !containerRef.current) return

      const lat = centroid?.lat ?? 43.52635
      const lng = centroid?.lng ?? 5.44235

      const map = leaflet.map(containerRef.current, {
        center: [lat, lng],
        zoom: 17,
      })

      const osm = leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 20,
      })

      const ignCadastre = leaflet.tileLayer(
        'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=CADASTRALPARCELS.PARCELLAIRE_EXPRESS&STYLE=PCI%20vecteur&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png',
        {
          attribution: '&copy; IGN Géoplateforme Cadastre',
          maxZoom: 20,
          opacity: 0.75,
        },
      )

      osm.addTo(map)
      ignCadastre.addTo(map)

      leaflet.control
        .layers(
          { OpenStreetMap: osm },
          { 'IGN Cadastre (Géoplateforme)': ignCadastre },
          { position: 'topright' },
        )
        .addTo(map)

      const overlay = leaflet.layerGroup().addTo(map)
      mapRef.current = map
      overlayRef.current = overlay
    }

    initMap()

    return () => {
      mounted = false
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        overlayRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function updateLayers() {
      const map = mapRef.current
      const overlay = overlayRef.current
      if (!map || !overlay) return

      const leaflet = (await import('leaflet')).default
      if (cancelled) return

      overlay.clearLayers()

      if (geometry && typeof geometry === 'object' && 'type' in geometry) {
        try {
          const geoLayer = leaflet.geoJSON(geometry as GeoJSON.GeoJsonObject, {
            style: {
              color: '#2563eb',
              weight: 3,
              fillColor: '#3b82f6',
              fillOpacity: 0.22,
            },
          })
          geoLayer.bindPopup(
            `<div style="font-size:12px"><strong>${parcelLabel || 'Parcelle'}</strong>${
              zoneCode ? `<br/>Zone PLU : <b>${zoneCode}</b>` : ''
            }</div>`,
          )
          geoLayer.addTo(overlay)
          const bounds = geoLayer.getBounds()
          if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 19 })
            return
          }
        } catch {
          // Fallback to centroid below
        }
      }

      if (centroid?.lat && centroid?.lng) {
        map.setView([centroid.lat, centroid.lng], 18)
        leaflet
          .circleMarker([centroid.lat, centroid.lng], {
            radius: 7,
            color: '#1d4ed8',
            fillColor: '#3b82f6',
            fillOpacity: 0.85,
          })
          .bindPopup(parcelLabel || 'Position sélectionnée')
          .addTo(overlay)
      }
    }

    updateLayers()
    return () => {
      cancelled = true
    }
  }, [centroid?.lat, centroid?.lng, geometry, parcelLabel, zoneCode])

  return (
    <div className="relative h-[460px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}
