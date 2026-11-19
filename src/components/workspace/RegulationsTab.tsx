"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { Loader2, Play, Search } from "lucide-react";
import { cn } from "@/lib/utils";
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
  const [isMapExpanded, setIsMapExpanded] = useState(false);
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
    if (!isMapExpanded) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsMapExpanded(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMapExpanded]);

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
          <CardTitle>Données parcelle</CardTitle>
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

      {isMapExpanded && (
        <div
          className="hidden flex-1 lg:block"
          aria-hidden="true"
        />
      )}

      <div
        aria-hidden="true"
        onClick={() => setIsMapExpanded(false)}
        className={cn(
          "fixed inset-0 z-40 bg-background/80 backdrop-blur-sm transition-opacity duration-300",
          isMapExpanded
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
        )}
      />

      <div
        className={cn(
          "transition-all duration-300 ease-out",
          isMapExpanded
            ? "fixed inset-3 z-50 flex flex-col sm:inset-6 animate-in fade-in-0 zoom-in-95 duration-300"
            : "h-fit flex-1",
        )}
      >
        <ParcelMap
          centroid={mapPreview.centroid}
          geometry={mapPreview.geometry}
          parcelLabel={mapPreview.label}
          zoneCode={mapPreview.zoneCode}
          isLoading={isLookingUpParcel}
          isExpanded={isMapExpanded}
          onToggleExpand={() => setIsMapExpanded((prev) => !prev)}
          className={isMapExpanded ? "h-full flex-1 shadow-2xl" : undefined}
        />
      </div>
    </div>
  );
}
