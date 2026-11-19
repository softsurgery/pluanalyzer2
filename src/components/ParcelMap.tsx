'use client'

import { useEffect, useRef, useState } from 'react'
import type L from 'leaflet'
import { Loader2 } from 'lucide-react'

interface ParcelMapProps {
  centroid?: { lng?: number | null; lat?: number | null } | null
  geometry?: unknown
  parcelLabel?: string
  zoneCode?: string
  isLoading?: boolean
}

export function ParcelMap({
  centroid,
  geometry,
  parcelLabel,
  zoneCode,
  isLoading = false,
}: ParcelMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const overlayRef = useRef<L.LayerGroup | null>(null)
  const boundsRef = useRef<L.LatLngBounds | null>(null)
  const centerRef = useRef<[number, number] | null>(null)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    let mounted = true
    let resizeObserver: ResizeObserver | null = null

    async function initMap() {
      if (!containerRef.current || mapRef.current) return
      const leaflet = (await import('leaflet')).default
      if (!mounted || !containerRef.current) return

      const lat = centroid?.lat ?? 43.52635
      const lng = centroid?.lng ?? 5.44235

      const map = leaflet.map(containerRef.current, {
        center: [lat, lng],
        zoom: 17,
        dragging: false,
        keyboard: false,
        boxZoom: false,
        doubleClickZoom: 'center',
        scrollWheelZoom: 'center',
        touchZoom: 'center',
        zoomControl: true,
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

      const CenterControl = leaflet.Control.extend({
        options: { position: 'topleft' },
        onAdd() {
          const container = leaflet.DomUtil.create(
            'div',
            'leaflet-bar leaflet-control',
          )
          const button = leaflet.DomUtil.create('a', '', container)
          button.href = '#'
          button.title = 'Recentrer sur le cadastre'
          button.setAttribute('role', 'button')
          button.setAttribute('aria-label', 'Recentrer sur le cadastre')
          button.style.display = 'flex'
          button.style.alignItems = 'center'
          button.style.justifyContent = 'center'
          button.innerHTML =
            '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="M2 12h4"/><path d="M18 12h4"/></svg>'

          leaflet.DomEvent.disableClickPropagation(container)
          leaflet.DomEvent.on(button, 'click', (e) => {
            leaflet.DomEvent.preventDefault(e)
            if (boundsRef.current?.isValid()) {
              map.fitBounds(boundsRef.current, { padding: [40, 40], maxZoom: 19 })
            } else if (centerRef.current) {
              map.setView(centerRef.current, 18)
            }
          })
          return container
        },
      })
      new CenterControl().addTo(map)

      const overlay = leaflet.layerGroup().addTo(map)
      mapRef.current = map
      overlayRef.current = overlay
      setMapReady(true)

      requestAnimationFrame(() => {
        if (mounted && mapRef.current) {
          mapRef.current.invalidateSize()
          if (boundsRef.current?.isValid()) {
            mapRef.current.fitBounds(boundsRef.current, {
              padding: [40, 40],
              maxZoom: 19,
            })
          } else if (centerRef.current) {
            mapRef.current.setView(centerRef.current, 18)
          }
        }
      })

      if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
        resizeObserver = new ResizeObserver(() => {
          mapRef.current?.invalidateSize()
        })
        resizeObserver.observe(containerRef.current)
      }
    }

    initMap()

    return () => {
      mounted = false
      setMapReady(false)
      resizeObserver?.disconnect()
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
      boundsRef.current = null
      centerRef.current = null

      if (geometry && typeof geometry === 'object' && 'type' in geometry) {
        try {
          const geoLayer = leaflet.geoJSON(geometry as GeoJSON.GeoJsonObject, {
            style: {
              color: '#2563eb',
              weight: 3,
              fillColor: '#3b82f6',
              fillOpacity: 0.3,
            },
            onEachFeature: (feature, layer) => {
              const props = feature?.properties as
                | { idu?: string; surfaceM2?: number }
                | undefined
              const title = props?.idu
                ? `${props.idu}${props.surfaceM2 ? ` (${props.surfaceM2} m²)` : ''}`
                : parcelLabel || 'Parcelle'
              layer.bindPopup(
                `<div style="font-size:12px"><strong>${title}</strong>${
                  zoneCode ? `<br/>Zone PLU : <b>${zoneCode}</b>` : ''
                }</div>`,
              )
            },
          })
          geoLayer.addTo(overlay)
          const bounds = geoLayer.getBounds()
          if (bounds.isValid()) {
            boundsRef.current = bounds
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 19 })
            return
          }
        } catch {
          // Fallback to centroid below
        }
      }

      if (centroid?.lat && centroid?.lng) {
        centerRef.current = [centroid.lat, centroid.lng]
        map.setView([centroid.lat, centroid.lng], 18)
      }
    }

    updateLayers()
    return () => {
      cancelled = true
    }
  }, [mapReady, centroid?.lat, centroid?.lng, geometry, parcelLabel, zoneCode])

  return (
    <div className="relative h-[460px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
      <div ref={containerRef} className="h-full w-full" />
      {isLoading && (
        <div
          aria-live="polite"
          className="absolute inset-0 z-[1000] flex items-center justify-center bg-background/50 backdrop-blur-[1px]"
        >
          <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs font-medium text-foreground shadow-md">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>Localisation cadastrale en cours...</span>
          </div>
        </div>
      )}
    </div>
  )
}
