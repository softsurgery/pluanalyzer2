"use client";

import { useEffect, useRef } from "react";
import type L from "leaflet";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MarkerCoordinates {
  lat: number;
  lng: number;
}

export interface MarkerPickerProps {
  value?: MarkerCoordinates | null;
  onChange: (coords: MarkerCoordinates) => void;
  disabled?: boolean;
  defaultCenter?: MarkerCoordinates;
  className?: string;
}

const DEFAULT_CENTER: MarkerCoordinates = {
  lat: 43.52635,
  lng: 5.44235,
};

export function MarkerPicker({
  value,
  onChange,
  disabled = false,
  defaultCenter = DEFAULT_CENTER,
  className,
}: MarkerPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const disabledRef = useRef(disabled);
  const onChangeRef = useRef(onChange);

  disabledRef.current = disabled;
  onChangeRef.current = onChange;

  useEffect(() => {
    let mounted = true;
    let resizeObserver: ResizeObserver | null = null;

    async function initMap() {
      if (!containerRef.current || mapRef.current) return;
      const leaflet = (await import("leaflet")).default;
      if (!mounted || !containerRef.current) return;

      const initialLat = value?.lat ?? defaultCenter.lat;
      const initialLng = value?.lng ?? defaultCenter.lng;

      const map = leaflet.map(containerRef.current, {
        center: [initialLat, initialLng],
        zoom: 17,
      });

      const osm = leaflet.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 20,
        },
      );

      const ignCadastre = leaflet.tileLayer(
        "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=CADASTRALPARCELS.PARCELLAIRE_EXPRESS&STYLE=PCI%20vecteur&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png",
        {
          attribution: "&copy; IGN Géoplateforme Cadastre",
          maxZoom: 20,
          opacity: 0.75,
        },
      );

      osm.addTo(map);
      ignCadastre.addTo(map);

      leaflet.control
        .layers(
          { OpenStreetMap: osm },
          { "IGN Cadastre (Géoplateforme)": ignCadastre },
          { position: "topright" },
        )
        .addTo(map);

      map.on("click", (event: L.LeafletMouseEvent) => {
        if (disabledRef.current) return;
        onChangeRef.current({
          lat: Number(event.latlng.lat.toFixed(6)),
          lng: Number(event.latlng.lng.toFixed(6)),
        });
      });

      mapRef.current = map;

      requestAnimationFrame(() => {
        if (mounted && mapRef.current) {
          mapRef.current.invalidateSize();
        }
      });

      if (typeof ResizeObserver !== "undefined" && containerRef.current) {
        resizeObserver = new ResizeObserver(() => {
          mapRef.current?.invalidateSize();
        });
        resizeObserver.observe(containerRef.current);
      }
    }

    initMap();

    return () => {
      mounted = false;
      resizeObserver?.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mapRef.current?.invalidateSize();
  }, [disabled]);

  useEffect(() => {
    let cancelled = false;

    async function syncMarker() {
      const map = mapRef.current;
      if (!map) return;
      const leaflet = (await import("leaflet")).default;
      if (cancelled) return;

      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }

      if (value && Number.isFinite(value.lat) && Number.isFinite(value.lng)) {
        const marker = leaflet
          .circleMarker([value.lat, value.lng], {
            radius: 8,
            color: "#1d4ed8",
            weight: 3,
            fillColor: "#3b82f6",
            fillOpacity: 0.85,
          })
          .bindPopup(
            `<div style="font-size:12px"><strong>Point sélectionné</strong><br/>${value.lat.toFixed(6)}, ${value.lng.toFixed(6)}</div>`,
          )
          .addTo(map);
        markerRef.current = marker;
      }
    }

    syncMarker();

    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <div className={cn("space-y-2", className)}>
      <div
        className={cn(
          "relative z-0 isolate h-[680px] w-full overflow-hidden rounded-xl border bg-card shadow-sm transition-opacity",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-crosshair",
        )}
      >
        {/* Keep className static so React never strips Leaflet's .leaflet-container class */}
        <div ref={containerRef} className="h-full w-full" />
        {disabled && (
          <div
            aria-hidden="true"
            className="absolute inset-0 z-[1000] cursor-not-allowed bg-background/20"
          />
        )}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-primary" />
          {disabled
            ? "Sélection sur carte désactivée"
            : "Cliquez sur la carte pour placer le marqueur"}
        </span>
        {value ? (
          <span className="font-mono font-medium text-foreground">
            {value.lat.toFixed(6)}, {value.lng.toFixed(6)}
          </span>
        ) : (
          <span>Aucun point sélectionné</span>
        )}
      </div>
    </div>
  );
}
