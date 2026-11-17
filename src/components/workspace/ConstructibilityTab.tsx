"use client";

import type { SnapshotRecord } from "@/types/analyses";
import { ParcelMap } from "@/components/ParcelMap";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface MapPreviewState {
  centroid?: { lng?: number | null; lat?: number | null } | null;
  geometry?: unknown;
  label?: string;
  zoneCode?: string;
}

export interface ConstructibilityTabProps {
  mapPreview: MapPreviewState;
  activeSnapshot: SnapshotRecord | null;
}

export function ConstructibilityTab({
  mapPreview,
  activeSnapshot,
}: ConstructibilityTabProps) {
  const calc = (activeSnapshot?.constructibilityCalculations || {}) as Record<
    string,
    unknown
  >;
  const interp = (activeSnapshot?.regulatoryInterpretation || {}) as Record<
    string,
    unknown
  >;

  const kpis = [
    {
      label: "Zone PLU",
      value: activeSnapshot?.zoneCode || "Non identifiée",
    },
    {
      label: "Surface parcelle",
      value: calc.parcelSurfaceM2 ? `${calc.parcelSurfaceM2} m²` : "N/A",
    },
    {
      label: "Emprise au sol max",
      value: calc.maxFootprintM2 ? `${calc.maxFootprintM2} m²` : "N/A",
    },
    {
      label: "Emprise après reculs",
      value: calc.estimatedBuildableFootprintM2
        ? `${calc.estimatedBuildableFootprintM2} m²`
        : "N/A",
    },
    {
      label: "Hauteur max",
      value: calc.maxHeightM ? `${calc.maxHeightM} m` : "N/A",
    },
    {
      label: "Niveaux estimés",
      value: calc.estimatedStoreys
        ? `R+${Number(calc.estimatedStoreys) - 1}`
        : "N/A",
    },
    {
      label: "SDP max estimée",
      value: calc.maxFloorAreaSdpM2 ? `${calc.maxFloorAreaSdpM2} m²` : "N/A",
    },
    {
      label: "Volume max estimé",
      value: calc.maxVolumeM3 ? `${calc.maxVolumeM3} m³` : "N/A",
    },
    {
      label: "Pleine terre min",
      value: calc.minGreenSpaceM2 ? `${calc.minGreenSpaceM2} m²` : "N/A",
    },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="space-y-3 lg:col-span-5">
        <ParcelMap
          centroid={mapPreview.centroid}
          geometry={mapPreview.geometry}
          parcelLabel={mapPreview.label}
          zoneCode={activeSnapshot?.zoneCode || mapPreview.zoneCode}
        />
        {activeSnapshot && (
          <Card>
            <CardHeader className="p-4 pb-1">
              <CardTitle className="text-xs font-bold">
                {activeSnapshot.snapshotLabel}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-xs text-muted-foreground">
                {activeSnapshot.originalPrompt}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-4 lg:col-span-7">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {kpis.map((kpi) => (
            <Card key={kpi.label}>
              <CardHeader className="p-4 pb-1">
                <CardDescription className="text-[11px] font-semibold uppercase tracking-wide">
                  {kpi.label}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="text-lg font-bold text-foreground">
                  {kpi.value}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {interp.summary ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Synthèse réglementaire
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-foreground/90">
                {String(interp.summary)}
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
