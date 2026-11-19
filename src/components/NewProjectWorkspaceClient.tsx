"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FolderPlus, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import type { ParcelLookupResponse } from "@/types/parcels";
import type { ProjectItem } from "@/types/projects";
import { lookupParcel } from "@/api/parcels";
import { createProject, projectKeys } from "@/api/projects";
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
import { type MapPreviewState } from "@/components/workspace/RegulationsTab";
import { useFooter } from "@/contexts/FooterProvider";
import { useIntro } from "@/contexts/IntroProvider";
import { useAnalysisFormStructure } from "@/hooks/forms/useAnalysisFormStructure";
import { useAnalysisStore } from "@/hooks/stores/useAnalysisStore";
import { cn } from "@/lib/utils";

const NEW_PROJECT_FORM_ID = "new-project-cadastral-form";

export function NewProjectWorkspaceClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const analysisStore = useAnalysisStore();
  const { setContent, clearContent } = useFooter();
  const { setIntro, clearIntro } = useIntro();

  const [isLocationDetected, setIsLocationDetected] = useState(false);
  const [mapPreview, setMapPreview] = useState<MapPreviewState>({});
  const [lastLookupResult, setLastLookupResult] =
    useState<ParcelLookupResponse | null>(null);
  const [isMapExpanded, setIsMapExpanded] = useState(false);

  const { address, cadastreNumbers } = analysisStore.createDto;

  useEffect(() => {
    analysisStore.reset();
    analysisStore.setNested("createDto.address", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setIntro?.(
      "Nouveau projet",
      "Localisez la parcelle cadastrale pour créer votre nouveau projet.",
    );
    return () => {
      clearIntro?.();
    };
  }, [setIntro, clearIntro]);

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

  const { locationFormStructure } = useAnalysisFormStructure({
    analysisStore,
    onLocationInputChange: () => {
      setIsLocationDetected(false);
      setLastLookupResult(null);
    },
  });

  const parcelLookupMutation = useMutation({
    mutationFn: () =>
      lookupParcel({
        address: address.trim(),
        cadastre: cadastreNumbers.trim() || undefined,
      }),
    onSuccess: (data) => {
      if (data.parcel?.status === "ok") {
        const nextPreview: MapPreviewState = {
          centroid: data.parcel.centroid,
          geometry: data.parcel.geometry,
          label: `${data.parcel.idu} (${data.parcel.surfaceM2 ?? "?"} m²)`,
          zoneCode: data.gpu?.zoneCode,
        };
        setIsLocationDetected(true);
        setMapPreview(nextPreview);
        setLastLookupResult(data);
        toast.success("Parcelle localisée avec succès");
      } else if (data.geocoding?.coordinates) {
        const nextPreview: MapPreviewState = {
          centroid: data.geocoding.coordinates,
          label: data.geocoding.label,
          zoneCode: data.gpu?.zoneCode,
        };
        setIsLocationDetected(true);
        setMapPreview(nextPreview);
        setLastLookupResult(data);
        toast.success(
          `Adresse géocodée (${data.geocoding.label}), parcelle cadastrale non retournée par IGN.`,
        );
      } else {
        setIsLocationDetected(false);
        setMapPreview({});
        setLastLookupResult(null);
        toast.error("Aucune parcelle trouvée pour cette recherche.");
      }
    },
    onError: (err) => {
      setIsLocationDetected(false);
      setMapPreview({});
      setLastLookupResult(null);
      toast.error(
        err instanceof Error
          ? err.message
          : "Erreur lors de la localisation IGN",
      );
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async () => {
      const commune =
        lastLookupResult?.parcel?.commune?.trim() ||
        lastLookupResult?.geocoding?.city?.trim() ||
        "Commune inconnue";
      const codeInsee =
        lastLookupResult?.parcel?.codeInsee?.trim() ||
        lastLookupResult?.geocoding?.citycode?.trim() ||
        (lastLookupResult?.parcel?.idu &&
        lastLookupResult.parcel.idu.length >= 5
          ? lastLookupResult.parcel.idu.slice(0, 5)
          : undefined) ||
        "00000";
      const projectName =
        lastLookupResult?.geocoding?.label?.trim() ||
        address.trim() ||
        lastLookupResult?.parcel?.idu?.trim() ||
        "Nouveau projet";
      const territory: "amp" | "gpu" = codeInsee.startsWith("13")
        ? "amp"
        : "gpu";

      return createProject({
        name: projectName,
        commune,
        codeInsee,
        territory,
        status: "active",
      });
    },
    onSuccess: (createdProject: ProjectItem) => {
      if (!createdProject?.id) {
        toast.error("Projet créé mais identifiant introuvable.");
        return;
      }
      const newId = String(createdProject.id);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(
            `plu-workspace-location:${newId}`,
            JSON.stringify({
              address: address.trim(),
              cadastreNumbers: cadastreNumbers.trim(),
              mapPreview,
            }),
          );
        } catch {
          // Ignore storage quota errors
        }
      }
      toast.success("Projet créé avec succès.");
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
      void queryClient.invalidateQueries({ queryKey: projectKeys.stats });
      router.push(`/workspace/${newId}?tab=analysis`);
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Impossible de créer le projet.",
      );
    },
  });

  const handleLookupParcel = useCallback(() => {
    if (!address.trim()) {
      analysisStore.setNested("createDtoErrors.address", [
        "Veuillez saisir une adresse.",
      ]);
      return;
    }
    parcelLookupMutation.mutate();
  }, [address, analysisStore, parcelLookupMutation]);

  const handleLookupRef = useRef(handleLookupParcel);
  handleLookupRef.current = handleLookupParcel;

  const handleCreateProject = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!isLocationDetected || createProjectMutation.isPending) return;
      createProjectMutation.mutate();
    },
    [isLocationDetected, createProjectMutation],
  );

  const lookupDisabled = parcelLookupMutation.isPending || !address.trim();
  const createDisabled = createProjectMutation.isPending || !isLocationDetected;

  useEffect(() => {
    setContent?.(
      <>
        <Button
          type="button"
          variant="outline"
          onClick={() => handleLookupRef.current()}
          disabled={lookupDisabled}
        >
          {parcelLookupMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4 text-primary" />
          )}
          Localiser IGN
        </Button>

        <Button
          type="submit"
          form={NEW_PROJECT_FORM_ID}
          disabled={createDisabled}
        >
          {createProjectMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FolderPlus className="h-4 w-4" />
          )}
          Créer le projet
        </Button>
      </>,
    );

    return () => {
      clearContent?.();
    };
  }, [
    setContent,
    clearContent,
    lookupDisabled,
    parcelLookupMutation.isPending,
    createDisabled,
    createProjectMutation.isPending,
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-6 lg:flex-row">
        <Card className="h-fit flex-1 rounded-2xl">
          <CardHeader>
            <CardTitle>Données parcelle</CardTitle>
            <CardDescription>
              Saisissez une adresse et, optionnellement, des numéros cadastraux
              pour localiser la parcelle et créer le projet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              id={NEW_PROJECT_FORM_ID}
              onSubmit={handleCreateProject}
              className="space-y-5"
            >
              <FormBuilder structure={locationFormStructure} />
            </form>
          </CardContent>
        </Card>

        {isMapExpanded && (
          <div className="hidden flex-1 lg:block" aria-hidden="true" />
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
            isLoading={parcelLookupMutation.isPending}
            isExpanded={isMapExpanded}
            onToggleExpand={() => setIsMapExpanded((prev) => !prev)}
            className={isMapExpanded ? "h-full flex-1 shadow-2xl" : undefined}
          />
        </div>
      </div>
    </div>
  );
}
