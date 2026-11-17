"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Code2,
  Download,
  FileText,
  GitCompare,
  History,
  Layers,
  Search,
  Settings,
} from "lucide-react";
import type { SnapshotRecord } from "@/types/analyses";
import type { ParcelRecord } from "@/types/parcels";
import {
  analysisKeys,
  compareSnapshots,
  fetchSnapshots,
  replaySnapshot,
  runAnalysis,
} from "@/api/analyses";
import { fetchParcels, lookupParcel, parcelKeys } from "@/api/parcels";
import { deleteProject, fetchProjects, projectKeys } from "@/api/projects";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AnalysisTab,
  type LocationInputMode,
} from "./workspace/AnalysisTab";
import type { MarkerCoordinates } from "./MarkerPicker";
import { CompareTab } from "./workspace/CompareTab";
import {
  ConstructibilityTab,
  type MapPreviewState,
} from "./workspace/ConstructibilityTab";
import { HistoryTab } from "./workspace/HistoryTab";
import { JsonInspectorTab } from "./workspace/JsonInspectorTab";
import { RegulationsTab } from "./workspace/RegulationsTab";
import { SettingsTab } from "./workspace/SettingsTab";

export type { ParcelRecord, SnapshotRecord };

interface WorkspaceClientProps {
  initialProjectId?: string;
  initialTab?: string;
  userRole?: string;
}

type TabKey =
  | "analysis"
  | "constructibility"
  | "regulations"
  | "history"
  | "compare"
  | "json"
  | "settings";

const VALID_TABS: readonly TabKey[] = [
  "analysis",
  "constructibility",
  "regulations",
  "history",
  "compare",
  "json",
  "settings",
];

function resolveTabKey(tab?: string): TabKey {
  return VALID_TABS.includes(tab as TabKey)
    ? (tab as TabKey)
    : "constructibility";
}

export function WorkspaceClient({
  initialProjectId,
  initialTab,
  userRole,
}: WorkspaceClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabKey>(() =>
    resolveTabKey(initialTab),
  );
  const [projectId, setProjectId] = useState<string>(initialProjectId || "");
  const [activeSnapshot, setActiveSnapshot] = useState<SnapshotRecord | null>(
    null,
  );

  // Form state
  const [locationMode, setLocationMode] =
    useState<LocationInputMode>("address");
  const [address, setAddress] = useState("12 Avenue Sextius, Aix-en-Provence");
  const [idu, setIdu] = useState("");
  const [selectedParcelId, setSelectedParcelId] = useState<string>("");
  const [pickedLocation, setPickedLocation] =
    useState<MarkerCoordinates | null>(null);
  const [prompt, setPrompt] = useState(
    "Analyser la constructibilité maximale (emprise, hauteur, SDP, stationnement) pour un bâtiment mixte R+3.",
  );
  const [statusBanner, setStatusBanner] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  // Map preview state
  const [mapPreview, setMapPreview] = useState<MapPreviewState>({});

  // Comparison state
  const [compareA, setCompareA] = useState<string>("");
  const [compareB, setCompareB] = useState<string>("");
  const [compareResult, setCompareResult] = useState<Record<
    string,
    unknown
  > | null>(null);

  // Queries
  const projectsQuery = useQuery({
    queryKey: projectKeys.list(50),
    queryFn: () => fetchProjects(50),
  });

  const parcelsQuery = useQuery({
    queryKey: parcelKeys.list(50),
    queryFn: () => fetchParcels(50),
  });

  const snapshotsQuery = useQuery({
    queryKey: analysisKeys.snapshots(projectId || undefined),
    queryFn: () => fetchSnapshots(projectId || undefined, 50),
    enabled: Boolean(projectId) || !projectsQuery.isLoading,
  });

  const projects = projectsQuery.data?.docs ?? [];
  const parcels = parcelsQuery.data?.docs ?? [];
  const snapshots = snapshotsQuery.data?.docs ?? [];

  useEffect(() => {
    if (!projectId && projects.length > 0) {
      setProjectId(String(projects[0].id));
    }
  }, [projectId, projects]);

  useEffect(() => {
    if (parcels.length > 0 && !selectedParcelId && !mapPreview.label) {
      const p = parcels[0];
      setSelectedParcelId(String(p.id));
      setMapPreview((prev) => ({
        ...prev,
        centroid: p.centroid,
        geometry: p.geometry,
        label: `${p.idu} (${p.surfaceM2 ?? "?"} m²)`,
      }));
    }
  }, [parcels, selectedParcelId, mapPreview.label]);

  useEffect(() => {
    if (snapshots.length === 0) {
      setActiveSnapshot(null);
      setCompareA("");
      setCompareB("");
      return;
    }
    setActiveSnapshot((prev) => {
      if (prev && snapshots.some((s) => String(s.id) === String(prev.id))) {
        return prev;
      }
      return snapshots[0];
    });
    setCompareA((prev) => prev || String(snapshots[0].id));
    setCompareB((prev) => prev || String(snapshots[1]?.id ?? snapshots[0].id));
  }, [snapshots]);

  const currentProject =
    projects.find((p) => String(p.id) === projectId) || null;
  const canDeleteProject = userRole !== "viewer";

  const handleTabChange = (nextTab: TabKey) => {
    setActiveTab(nextTab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleProjectChange = (nextProjectId: string) => {
    setProjectId(nextProjectId);
    setActiveSnapshot(null);
    setCompareResult(null);
    const params = new URLSearchParams(searchParams.toString());
    params.set("projectId", nextProjectId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Mutations
  const parcelLookupMutation = useMutation({
    mutationFn: () => {
      if (locationMode === "map" && pickedLocation) {
        return lookupParcel({
          lat: pickedLocation.lat,
          lng: pickedLocation.lng,
        });
      }
      if (locationMode === "parcel") {
        return lookupParcel({ idu });
      }
      return lookupParcel({ address });
    },
    onSuccess: (data) => {
      if (data.parcel?.status === "ok") {
        setMapPreview({
          centroid: data.parcel.centroid,
          geometry: data.parcel.geometry,
          label: `${data.parcel.idu} (${data.parcel.surfaceM2 ?? "?"} m²)`,
          zoneCode: data.gpu?.zoneCode,
        });
        if (data.parcel.idu) setIdu(data.parcel.idu);
        setStatusBanner({
          type: "ok",
          text: `Parcelle localisée : ${data.parcel.idu} · Surface ${data.parcel.surfaceM2 ?? "?"} m² · Zone GPU : ${data.gpu?.zoneCode || "non détectée"}`,
        });
      } else if (data.geocoding?.coordinates) {
        setMapPreview({
          centroid: data.geocoding.coordinates,
          label: data.geocoding.label,
          zoneCode: data.gpu?.zoneCode,
        });
        setStatusBanner({
          type: "ok",
          text: `Adresse géocodée (${data.geocoding.label}), parcelle cadastrale non retournée par IGN.`,
        });
      } else {
        setStatusBanner({
          type: "err",
          text: "Aucune parcelle trouvée pour cette recherche.",
        });
      }
    },
    onError: (err) => {
      setStatusBanner({
        type: "err",
        text:
          err instanceof Error
            ? err.message
            : "Erreur lors de la localisation IGN",
      });
    },
  });

  const runAnalysisMutation = useMutation({
    mutationFn: () => {
      const base = {
        projectId: Number(projectId),
        prompt,
      };
      if (locationMode === "map" && pickedLocation) {
        return runAnalysis({
          ...base,
          lat: pickedLocation.lat,
          lng: pickedLocation.lng,
        });
      }
      if (locationMode === "parcel") {
        return runAnalysis({
          ...base,
          idu: idu.trim() || undefined,
          parcelId:
            !idu.trim() && selectedParcelId
              ? Number(selectedParcelId)
              : undefined,
        });
      }
      return runAnalysis({
        ...base,
        address: address.trim() || undefined,
      });
    },
    onSuccess: async (data) => {
      const newSnap = data.snapshot;
      setActiveSnapshot(newSnap);
      setStatusBanner({
        type: "ok",
        text: `Analyse enregistrée : ${newSnap.snapshotLabel} (historique immuable mis à jour).`,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: analysisKeys.all }),
        queryClient.invalidateQueries({ queryKey: projectKeys.stats }),
      ]);
    },
    onError: (err) => {
      setStatusBanner({
        type: "err",
        text: err instanceof Error ? err.message : "Échec de l'analyse PLU",
      });
    },
  });

  const replayMutation = useMutation({
    mutationFn: (snapshotId: number | string) => replaySnapshot(snapshotId),
    onSuccess: async (data) => {
      const newSnap = data.snapshot;
      setActiveSnapshot(newSnap);
      setStatusBanner({
        type: "ok",
        text: `Replay terminé : nouveau snapshot ${newSnap.snapshotLabel} créé sans écraser l'historique.`,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: analysisKeys.all }),
        queryClient.invalidateQueries({ queryKey: projectKeys.stats }),
      ]);
    },
    onError: (err) => {
      setStatusBanner({
        type: "err",
        text: err instanceof Error ? err.message : "Échec du replay",
      });
    },
  });

  const compareMutation = useMutation({
    mutationFn: () => compareSnapshots(compareA, compareB),
    onSuccess: (data) => {
      setCompareResult(data);
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: (id: number | string) => deleteProject(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: projectKeys.all }),
        queryClient.invalidateQueries({ queryKey: analysisKeys.all }),
        queryClient.invalidateQueries({ queryKey: projectKeys.stats }),
      ]);
      router.push("/");
      router.refresh();
    },
  });

  const handleRunAnalysis = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    setStatusBanner(null);
    runAnalysisMutation.mutate();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      {statusBanner && (
        <Alert
          variant={statusBanner.type === "ok" ? "success" : "destructive"}
        >
          {statusBanner.type === "ok" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <AlertDescription>{statusBanner.text}</AlertDescription>
        </Alert>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(v) => handleTabChange(v as TabKey)}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="analysis">
              <Search className="h-3.5 w-3.5" />
              Analyse & Parcelle
            </TabsTrigger>
            <TabsTrigger value="constructibility">
              <Layers className="h-3.5 w-3.5" />
              Constructibilité & Carte
            </TabsTrigger>
            <TabsTrigger value="regulations">
              <FileText className="h-3.5 w-3.5" />
              Réglementation & Validation
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="h-3.5 w-3.5" />
              Historique ({snapshots.length})
            </TabsTrigger>
            <TabsTrigger value="compare">
              <GitCompare className="h-3.5 w-3.5" />
              Comparaison
            </TabsTrigger>
            <TabsTrigger value="json">
              <Code2 className="h-3.5 w-3.5" />
              Inspecteur JSON
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings className="h-3.5 w-3.5" />
              Paramètres
            </TabsTrigger>
          </TabsList>

          {activeSnapshot && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <a
                  href={`/api/plu/export/${activeSnapshot.id}?format=archicad`}
                >
                  <Download className="h-3.5 w-3.5 text-primary" />
                  Export Archicad
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a
                  href={`/api/plu/export/${activeSnapshot.id}?format=markdown`}
                >
                  <Download className="h-3.5 w-3.5 text-emerald-600" />
                  Rapport MD
                </a>
              </Button>
            </div>
          )}
        </div>

        <TabsContent value="analysis">
          <AnalysisTab
            projects={projects}
            parcels={parcels}
            projectId={projectId}
            hideProjectSelect={Boolean(initialProjectId)}
            onProjectChange={handleProjectChange}
            locationMode={locationMode}
            onLocationModeChange={setLocationMode}
            address={address}
            onAddressChange={setAddress}
            idu={idu}
            onIduChange={setIdu}
            selectedParcelId={selectedParcelId}
            onParcelSelect={(nextId, found) => {
              setSelectedParcelId(nextId);
              if (found) {
                setMapPreview({
                  centroid: found.centroid,
                  geometry: found.geometry,
                  label: `${found.idu} (${found.surfaceM2 ?? "?"} m²)`,
                });
              }
            }}
            pickedLocation={pickedLocation}
            onPickedLocationChange={(coords) => {
              setPickedLocation(coords);
              setMapPreview((prev) => ({
                ...prev,
                centroid: coords,
                label: `Point (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})`,
              }));
            }}
            prompt={prompt}
            onPromptChange={setPrompt}
            onLookupParcel={() => {
              setStatusBanner(null);
              parcelLookupMutation.mutate();
            }}
            isLookingUpParcel={parcelLookupMutation.isPending}
            onSubmit={handleRunAnalysis}
            isRunningAnalysis={runAnalysisMutation.isPending}
          />
        </TabsContent>

        <TabsContent value="constructibility">
          <ConstructibilityTab
            mapPreview={mapPreview}
            activeSnapshot={activeSnapshot}
          />
        </TabsContent>

        <TabsContent value="regulations">
          <RegulationsTab activeSnapshot={activeSnapshot} />
        </TabsContent>

        <TabsContent value="history">
          <HistoryTab
            snapshots={snapshots}
            activeSnapshot={activeSnapshot}
            isLoading={snapshotsQuery.isLoading}
            isReplaying={replayMutation.isPending}
            replayingSnapshotId={replayMutation.variables}
            onReopenSnapshot={(snap) => {
              setActiveSnapshot(snap);
              handleTabChange("constructibility");
            }}
            onReplaySnapshot={(snapshotId) => {
              setStatusBanner(null);
              replayMutation.mutate(snapshotId);
            }}
          />
        </TabsContent>

        <TabsContent value="compare">
          <CompareTab
            snapshots={snapshots}
            compareA={compareA}
            compareB={compareB}
            onCompareAChange={setCompareA}
            onCompareBChange={setCompareB}
            onCompare={() => compareMutation.mutate()}
            isComparing={compareMutation.isPending}
            compareResult={compareResult}
          />
        </TabsContent>

        <TabsContent value="json">
          <JsonInspectorTab activeSnapshot={activeSnapshot} />
        </TabsContent>

        <TabsContent value="settings">
          <SettingsTab
            currentProject={currentProject}
            userRole={userRole}
            canDeleteProject={canDeleteProject}
            isDeleting={deleteProjectMutation.isPending}
            deleteError={
              deleteProjectMutation.isError &&
              deleteProjectMutation.error instanceof Error
                ? deleteProjectMutation.error
                : null
            }
            onDeleteProject={(id) => deleteProjectMutation.mutate(id)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
