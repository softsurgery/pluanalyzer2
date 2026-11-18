"use client";

import type React from "react";
import { Loader2, Play } from "lucide-react";
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
import { useAnalysisFormStructure } from "@/hooks/forms/useAnalysisFormStructure";
import { useAnalysisStore } from "@/hooks/stores/useAnalysisStore";
import type { ParcelRecord } from "@/types/parcels";
import type { ProjectItem } from "@/types/projects";

export type LocationInputMode = "address" | "parcel" | "map";

export interface AnalysisTabProps {
  projects: ProjectItem[];
  parcels: ParcelRecord[];
  aiModels: AIModelRecord[];
  hideProjectSelect?: boolean;
  onProjectChange: (nextProjectId: string) => void;
  onAddressSelect?: (suggestion: AddressSuggestion) => void;
  onParcelSelect?: (parcelId: string, parcel?: ParcelRecord) => void;
  onPickedLocationChange?: (coords: MarkerCoordinates) => void;
  onLookupParcel: () => void;
  isLookingUpParcel: boolean;
  onSubmit: (e: React.FormEvent) => void;
  isRunningAnalysis: boolean;
}

export function AnalysisTab({
  projects,
  parcels,
  aiModels,
  hideProjectSelect = false,
  onProjectChange,
  onAddressSelect,
  onParcelSelect,
  onPickedLocationChange,
  onLookupParcel,
  isLookingUpParcel,
  onSubmit,
  isRunningAnalysis,
}: AnalysisTabProps) {
  const analysisStore = useAnalysisStore();
  const { projectId, locationMode, pickedLocation } = analysisStore.createDto;
  const isMapMode = locationMode === "map";

  const { analysisFormStructure } = useAnalysisFormStructure({
    analysisStore,
    projects,
    parcels,
    aiModels,
    hideProjectSelect,
    onProjectChange,
    onAddressSelect,
    onParcelSelect,
    onPickedLocationChange,
    onLookupParcel,
    isLookingUpParcel,
  });

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
        <form onSubmit={onSubmit} className="space-y-5">
          <FormBuilder structure={analysisFormStructure} />

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={
                isRunningAnalysis ||
                !projectId ||
                (isMapMode && !pickedLocation)
              }
            >
              {isRunningAnalysis ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Analyser PLU
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
