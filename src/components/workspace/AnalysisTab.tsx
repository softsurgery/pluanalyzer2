"use client";

import type React from "react";
import { useEffect } from "react";
import { Loader2, Play, Search } from "lucide-react";
import type { AIModelRecord } from "@/api/ai-models";
import type { AddressSuggestion } from "@/api/parcels";
import type { MarkerCoordinates } from "@/components/MarkerPicker";
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
import type { ParcelRecord } from "@/types/parcels";
import type { ProjectItem } from "@/types/projects";

export type LocationInputMode = "address" | "parcel" | "map";

export interface AnalysisTabProps {
  parcels: ParcelRecord[];
  aiModels: AIModelRecord[];
  onAddressSelect?: (suggestion: AddressSuggestion) => void;
  onParcelSelect?: (parcelId: string, parcel?: ParcelRecord) => void;
  onPickedLocationChange?: (coords: MarkerCoordinates) => void;
  onLookupParcel: () => void;
  isLookingUpParcel: boolean;
  onSubmit: (e: React.FormEvent) => void;
  isRunningAnalysis: boolean;
}

const ANALYSIS_FORM_ID = "plu-analysis-form";

export function AnalysisTab({
  parcels,
  aiModels,
  onAddressSelect,
  onParcelSelect,
  onPickedLocationChange,
  onLookupParcel,
  isLookingUpParcel,
  onSubmit,
  isRunningAnalysis,
}: AnalysisTabProps) {
  const analysisStore = useAnalysisStore();
  const { setContent, clearContent } = useFooter();
  const { projectId, locationMode, pickedLocation } = analysisStore.createDto;
  const isMapMode = locationMode === "map";
  const lookupDisabled = isLookingUpParcel || (isMapMode && !pickedLocation);
  const analyzeDisabled =
    isRunningAnalysis || !projectId || (isMapMode && !pickedLocation);

  const { analysisFormStructure } = useAnalysisFormStructure({
    analysisStore,
    parcels,
    aiModels,
    onAddressSelect,
    onParcelSelect,
    onPickedLocationChange,
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
          form={ANALYSIS_FORM_ID}
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
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Lancer une analyse PLU</CardTitle>
        <CardDescription>
          Choisissez le mode de localisation (adresse, IDU / parcelle ou carte),
          puis saisissez votre prompt de faisabilité.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form id={ANALYSIS_FORM_ID} onSubmit={onSubmit} className="space-y-5">
          <FormBuilder structure={analysisFormStructure} />
        </form>
      </CardContent>
    </Card>
  );
}
