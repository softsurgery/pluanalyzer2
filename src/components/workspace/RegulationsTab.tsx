"use client";

import type React from "react";
import { useEffect } from "react";
import { Loader2, Play, Search } from "lucide-react";
import type { AddressSuggestion } from "@/api/parcels";
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

export interface RegulationsTabProps {
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
  const { projectId } = analysisStore.createDto;
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
          disabled={isLookingUpParcel}
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
    isLookingUpParcel,
    analyzeDisabled,
    isRunningAnalysis,
  ]);

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Réglementation &amp; Données parcelle</CardTitle>
        <CardDescription>
          Choisissez le mode de localisation par données (adresse ou IDU
          cadastral) pour interroger le cadastre et le PLU.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form id={REGULATIONS_FORM_ID} onSubmit={onSubmit}>
          <FormBuilder structure={locationFormStructure} />
        </form>
      </CardContent>
    </Card>
  );
}
