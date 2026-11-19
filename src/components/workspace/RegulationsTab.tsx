"use client";

import type React from "react";
import { useEffect } from "react";
import { Loader2, Play, Search } from "lucide-react";
import type { AddressSuggestion } from "@/api/parcels";
import { ParcelMap } from "@/components/ParcelMap";
import { FormBuilder } from "@/components/shared/form-builder";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useFooter } from "@/contexts/FooterProvider";
import { useAnalysisFormStructure } from "@/hooks/forms/useAnalysisFormStructure";
import { useAnalysisStore } from "@/hooks/stores/useAnalysisStore";

export type LocationInputMode = "address" | "parcel";

export interface MapPreviewState {
  centroid?: { lng?: number | null; lat?: number | null } | null;
  geometry?: unknown;
  label?: string;
  zoneCode?: string;
}

export interface RegulationsTabProps {
  mapPreview?: MapPreviewState;
  onAddressSelect?: (suggestion: AddressSuggestion) => void;
  onLocationInputChange?: () => void;
  onLookupParcel: () => void;
  isLookingUpParcel: boolean;
  onSubmit: (e: React.FormEvent) => void;
  isRunningAnalysis: boolean;
  isLocationDetected: boolean;
}

const REGULATIONS_FORM_ID = "plu-analysis-form";

export function RegulationsTab({
  mapPreview = {},
  onAddressSelect,
  onLocationInputChange,
  onLookupParcel,
  isLookingUpParcel,
  onSubmit,
  isRunningAnalysis,
  isLocationDetected,
}: RegulationsTabProps) {
  const analysisStore = useAnalysisStore();
  const { setContent, clearContent } = useFooter();
  const { projectId, address } = analysisStore.createDto;
  const hasLocationInput = Boolean(address.trim());
  const lookupDisabled = isLookingUpParcel || !hasLocationInput;
  const analyzeDisabled =
    isRunningAnalysis || !projectId || !isLocationDetected;

  const { locationFormStructure } = useAnalysisFormStructure({
    analysisStore,
    onAddressSelect,
    onLocationInputChange,
  });

  useEffect(() => {
    setContent?.(
      <>
        <Button
          type="button"
          variant="outline"
          onClick={onLookupParcel}
          disabled={lookupDisabled}
        >
          {isLookingUpParcel ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4 text-primary" />
          )}
          Localiser IGN
        </Button>

        <Button
          type="submit"
          form={REGULATIONS_FORM_ID}
          disabled={analyzeDisabled}
        >
          {isRunningAnalysis ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          Analyser PLU
        </Button>
      </>,
    );

    return () => {
      clearContent?.();
    };
  }, [
    setContent,
    clearContent,
    onLookupParcel,
    lookupDisabled,
    isLookingUpParcel,
    analyzeDisabled,
    isRunningAnalysis,
  ]);

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <Card className="h-fit flex-1 rounded-2xl">
        <CardHeader>
          <CardTitle>Réglementation &amp; Données parcelle</CardTitle>
          <CardDescription>
            Saisissez une adresse et, optionnellement, des numéros cadastraux
            pour interroger le cadastre et le PLU.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            id={REGULATIONS_FORM_ID}
            onSubmit={onSubmit}
            className="space-y-5"
          >
            <FormBuilder structure={locationFormStructure} />
          </form>
        </CardContent>
      </Card>

      <Card className="h-fit flex-1 rounded-2xl">
        <CardHeader>
          <CardTitle>Localisation cadastrale</CardTitle>
          <CardDescription>
            {mapPreview.label
              ? `${mapPreview.label}${mapPreview.zoneCode ? ` · Zone ${mapPreview.zoneCode}` : ""}`
              : "Sélectionnez une adresse ou saisissez un IDU cadastral pour localiser la parcelle sur la carte."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ParcelMap
            centroid={mapPreview.centroid}
            geometry={mapPreview.geometry}
            parcelLabel={mapPreview.label}
            zoneCode={mapPreview.zoneCode}
            isLoading={isLookingUpParcel}
          />
        </CardContent>
      </Card>
    </div>
  );
}
