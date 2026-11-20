"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Code2,
  FileText,
  GitCompare,
  History,
  Layers,
  Search,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import type { SnapshotRecord } from "@/types/analyses";
import type { ParcelRecord } from "@/types/parcels";
import {
  DEFAULT_WORKSPACE_TAB_SETTINGS,
  type WorkspaceTabSettings,
} from "@/types/workspace";
import {
  analysisKeys,
  compareSnapshots,
  fetchSnapshots,
  replaySnapshot,
  runAnalysis,
} from "@/api/analyses";
import { lookupParcel } from "@/api/parcels";
import { deleteProject, fetchProjects, projectKeys } from "@/api/projects";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CadastralInfoTab } from "@/components/workspace/CadastralInfoTab";
import { CompareTab } from "@/components/workspace/CompareTab";
import { FeasibilityTab } from "@/components/workspace/FeasibilityTab";
import { HistoryTab } from "@/components/workspace/HistoryTab";
import { JsonInspectorTab } from "@/components/workspace/JsonInspectorTab";
import {
  type MapPreviewState,
  RegulationsTab,
} from "@/components/workspace/RegulationsTab";
import { SettingsTab } from "@/components/workspace/SettingsTab";
import { useIntro } from "@/contexts/IntroProvider";
import { useAnalysisStore } from "@/hooks/stores/useAnalysisStore";
import { createAnalysisSchema, validateForm } from "@/validations";

export type { ParcelRecord, SnapshotRecord };

interface WorkspaceClientProps {
  initialProjectId?: string;
  initialTab?: string;
  userRole?: string;
  tabSettings?: WorkspaceTabSettings;
}

type TabKey =
  | "analysis"
  | "constructibility"
  | "regulations"
  | "history"
  | "compare"
  | "json"
  | "settings";

const SELECTABLE_TABS: readonly TabKey[] = [
  "analysis",
  "constructibility",
  "regulations",
  "history",
  "compare",
  "json",
  "settings",
];

const TAB_INTRO_META: Record<TabKey, { label: string; description: string }> = {
  analysis: {
    label: "Informations Cadastral",
    description:
      "Localisez la parcelle sur la carte et lancez une analyse réglementaire PLU.",
  },
  constructibility: {
    label: "Réglementation",
    description:
      "Consultez les indicateurs de constructibilité, les articles extraits et la synthèse réglementaire.",
  },
  regulations: {
    label: "Faisabilité",
    description:
      "Évaluez la faisabilité du projet au regard des règles d'urbanisme applicables.",
  },
  history: {
    label: "Historique",
    description:
      "Parcourez l'historique des snapshots d'analyse et relancez-les à tout moment.",
  },
  compare: {
    label: "Comparaison",
    description:
      "Comparez deux snapshots d'analyse pour identifier les écarts réglementaires.",
  },
  json: {
    label: "Inspecteur JSON",
    description:
      "Inspectez les données brutes JSON du snapshot d'analyse sélectionné.",
  },
  settings: {
    label: "Paramètres",
    description:
      "Gérez les informations du projet, l'exportation de l'analyse et les options avancées.",
  },
};

function isTabEnabled(
  tab: TabKey,
  tabSettings: WorkspaceTabSettings,
): boolean {
  switch (tab) {
    case "analysis":
      return tabSettings.showRegulations;
    case "constructibility":
      return tabSettings.showCadastralInfo;
    case "regulations":
      return tabSettings.showFeasibility;
    case "history":
      return tabSettings.showHistory;
    case "compare":
      return tabSettings.showCompare;
    case "settings":
      return tabSettings.showSettings;
    case "json":
      return tabSettings.showJsonInspector;
  }
}

function resolveTabKey(
  tab: string | undefined,
  tabSettings: WorkspaceTabSettings,
): TabKey {
  if (
    tab &&
    SELECTABLE_TABS.includes(tab as TabKey) &&
    isTabEnabled(tab as TabKey, tabSettings)
  ) {
    return tab as TabKey;
  }
  if (isTabEnabled("constructibility", tabSettings)) {
    return "constructibility";
  }
  return (
    SELECTABLE_TABS.find((t) => isTabEnabled(t, tabSettings)) ?? "analysis"
  );
}

export function WorkspaceClient({
  initialProjectId,
  initialTab,
  userRole,
  tabSettings = DEFAULT_WORKSPACE_TAB_SETTINGS,
}: WorkspaceClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { setIntro, setFloating, clearIntro, clearFloating } = useIntro();

  const [projectId, setProjectId] = useState<string>(initialProjectId || "");
  const [activeTab, setActiveTab] = useState<TabKey>(() =>
    resolveTabKey(initialTab, tabSettings),
  );
  const [activeSnapshot, setActiveSnapshot] = useState<SnapshotRecord | null>(
    null,
  );

  // Form state (Zustand)
  const analysisStore = useAnalysisStore();
  const { locationMode, address, idu, cadastreNumbers, prompt } =
    analysisStore.createDto;

  useEffect(() => {
    analysisStore.setNested("createDto.projectId", projectId);
    if (!projectId || typeof window === "undefined") return;

    let restoredAddress = address;
    let restoredCadastre = cadastreNumbers;
    let hasRestoredPreview = false;

    try {
      const raw = window.localStorage.getItem(
        `plu-workspace-location:${projectId}`,
      );
      if (raw) {
        const saved = JSON.parse(raw) as {
          address?: string;
          cadastreNumbers?: string;
          mapPreview?: MapPreviewState;
        };
        if (typeof saved.address === "string") {
          restoredAddress = saved.address;
          analysisStore.setNested("createDto.address", saved.address);
        }
        if (typeof saved.cadastreNumbers === "string") {
          restoredCadastre = saved.cadastreNumbers;
          analysisStore.setNested(
            "createDto.cadastreNumbers",
            saved.cadastreNumbers,
          );
        }
        if (saved.mapPreview) {
          hasRestoredPreview = true;
          setMapPreview(saved.mapPreview);
          setIsLocationDetected(true);
        }
      }
    } catch {
      // Ignore malformed stored location
    }

    if (
      activeTab === "analysis" &&
      !hasRestoredPreview &&
      restoredAddress.trim() &&
      autoLocalizedProjectRef.current !== projectId
    ) {
      autoLocalizedProjectRef.current = projectId;
      parcelLookupMutation.mutate({
        address: restoredAddress.trim(),
        cadastre: restoredCadastre.trim() || undefined,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, activeTab]);
  const [isLocationDetected, setIsLocationDetected] = useState<boolean>(false);
  const [mapPreview, setMapPreview] = useState<MapPreviewState>({});
  const autoLocalizedProjectRef = useRef<string>("");

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

  const snapshotsQuery = useQuery({
    queryKey: analysisKeys.snapshots(projectId || undefined),
    queryFn: () => fetchSnapshots(projectId || undefined, 50),
    enabled: Boolean(projectId) || !projectsQuery.isLoading,
  });

  const projects = projectsQuery.data?.docs ?? [];
  const snapshots = snapshotsQuery.data?.docs ?? [];

  useEffect(() => {
    if (!projectId && projects.length > 0) {
      setProjectId(String(projects[0].id));
    }
  }, [projectId, projects]);

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

  const snapshotGeoLabel = activeSnapshot?.geocodingResult?.label;
  const displayAddress =
    address.trim() ||
    (typeof snapshotGeoLabel === "string" ? snapshotGeoLabel.trim() : "") ||
    activeSnapshot?.addressQuery?.trim() ||
    currentProject?.name?.trim() ||
    "Espace de travail";

  const snapshotCadastral = activeSnapshot?.cadastralReferences;
  const snapshotCadastreFallback = (() => {
    if (!snapshotCadastral) return "";
    if (
      typeof snapshotCadastral.idu === "string" &&
      snapshotCadastral.idu.trim()
    ) {
      return snapshotCadastral.idu.trim();
    }
    const section =
      typeof snapshotCadastral.section === "string"
        ? snapshotCadastral.section.trim()
        : "";
    const numero =
      typeof snapshotCadastral.numero === "string"
        ? snapshotCadastral.numero.trim()
        : "";
    return [section, numero].filter(Boolean).join(" ");
  })();

  const displayCadastre =
    cadastreNumbers.trim() || idu.trim() || snapshotCadastreFallback;

  const generatedDateLabel = (() => {
    if (!activeSnapshot?.createdAt) return "";
    const parsed = new Date(activeSnapshot.createdAt);
    if (Number.isNaN(parsed.getTime())) return "";
    return parsed.toLocaleString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  })();

  useEffect(() => {
    const tabMeta = TAB_INTRO_META[activeTab];
    const locationPrefix = [displayAddress, displayCadastre]
      .filter(Boolean)
      .join(", ");
    setIntro?.(`${locationPrefix} — ${tabMeta.label}`, tabMeta.description);
    return () => {
      clearIntro?.();
    };
  }, [setIntro, clearIntro, activeTab, displayAddress, displayCadastre]);

  useEffect(() => {
    if (generatedDateLabel) {
      setFloating?.(
        <span className="text-xs text-muted-foreground">
          Généré le {generatedDateLabel}
        </span>,
      );
    } else {
      clearFloating?.();
    }
    return () => {
      clearFloating?.();
    };
  }, [setFloating, clearFloating, generatedDateLabel]);

  const handleTabChange = (nextTab: TabKey) => {
    if (!isTabEnabled(nextTab, tabSettings)) return;
    setActiveTab(nextTab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Mutations
  const parcelLookupMutation = useMutation({
    mutationFn: (override?: { address?: string; cadastre?: string }) => {
      const targetAddress = override?.address ?? address;
      const targetCadastre =
        override?.cadastre !== undefined
          ? override.cadastre
          : cadastreNumbers.trim() || undefined;
      if (locationMode === "parcel" && !override?.address) {
        return lookupParcel({ idu, cadastre: targetCadastre });
      }
      return lookupParcel({ address: targetAddress, cadastre: targetCadastre });
    },
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
        if (data.parcel.idu && locationMode === "parcel") {
          analysisStore.setNested("createDto.idu", data.parcel.idu);
        }
        if (projectId && typeof window !== "undefined") {
          try {
            window.localStorage.setItem(
              `plu-workspace-location:${projectId}`,
              JSON.stringify({
                address: address.trim(),
                cadastreNumbers: cadastreNumbers.trim(),
                mapPreview: nextPreview,
              }),
            );
          } catch {
            // Ignore storage quota errors
          }
        }
        toast.success("Parcelle localisée avec succès");
      } else if (data.geocoding?.coordinates) {
        const nextPreview: MapPreviewState = {
          centroid: data.geocoding.coordinates,
          label: data.geocoding.label,
          zoneCode: data.gpu?.zoneCode,
        };
        setIsLocationDetected(true);
        setMapPreview(nextPreview);
        if (projectId && typeof window !== "undefined") {
          try {
            window.localStorage.setItem(
              `plu-workspace-location:${projectId}`,
              JSON.stringify({
                address: address.trim(),
                cadastreNumbers: cadastreNumbers.trim(),
                mapPreview: nextPreview,
              }),
            );
          } catch {
            // Ignore storage quota errors
          }
        }
        toast.success(
          `Adresse géocodée (${data.geocoding.label}), parcelle cadastrale non retournée par IGN.`,
        );
      } else {
        setIsLocationDetected(false);
        setMapPreview({});
        toast.error("Aucune parcelle trouvée pour cette recherche.");
      }
    },
    onError: (err) => {
      setIsLocationDetected(false);
      setMapPreview({});
      toast.error(
        err instanceof Error
          ? err.message
          : "Erreur lors de la localisation IGN",
      );
    },
  });

  const runAnalysisMutation = useMutation({
    mutationFn: () => {
      const base = {
        projectId: Number(projectId),
        prompt,
      };
      if (locationMode === "parcel") {
        return runAnalysis({
          ...base,
          idu: idu.trim() || undefined,
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
      toast.success(
        `Analyse enregistrée : ${newSnap.snapshotLabel} (historique immuable mis à jour).`,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: analysisKeys.all }),
        queryClient.invalidateQueries({ queryKey: projectKeys.stats }),
      ]);
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Échec de l'analyse PLU",
      );
    },
  });

  const replayMutation = useMutation({
    mutationFn: (snapshotId: number | string) => replaySnapshot(snapshotId),
    onSuccess: async (data) => {
      const newSnap = data.snapshot;
      setActiveSnapshot(newSnap);
      toast.success(
        `Replay terminé : nouveau snapshot ${newSnap.snapshotLabel} créé sans écraser l'historique.`,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: analysisKeys.all }),
        queryClient.invalidateQueries({ queryKey: projectKeys.stats }),
      ]);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Échec du replay");
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
    const result = validateForm(createAnalysisSchema, analysisStore.createDto);
    if (!result.success) {
      analysisStore.set("createDtoErrors", result.errors);
      const locationError =
        result.errors.address?.[0] ||
        result.errors.idu?.[0] ||
        result.errors.selectedParcelId?.[0];
      if (locationError) {
        toast.error(`${locationError} (onglet Informations Cadastral)`);
      }
      return;
    }
    analysisStore.set("createDtoErrors", {});
    runAnalysisMutation.mutate();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <Tabs
        value={activeTab}
        onValueChange={(v) => handleTabChange(v as TabKey)}
      >
        <TabsList>
          {tabSettings.showRegulations && (
            <TabsTrigger value="analysis">
              <Search className="h-3.5 w-3.5" />
              Informations Cadastral
            </TabsTrigger>
          )}
          {tabSettings.showCadastralInfo && (
            <TabsTrigger value="constructibility">
              <Layers className="h-3.5 w-3.5" />
              Réglementation
            </TabsTrigger>
          )}
          {tabSettings.showFeasibility && (
            <TabsTrigger value="regulations">
              <FileText className="h-3.5 w-3.5" />
              Faisabilité
            </TabsTrigger>
          )}
          {tabSettings.showHistory && (
            <TabsTrigger value="history">
              <History className="h-3.5 w-3.5" />
              Historique ({snapshots.length})
            </TabsTrigger>
          )}
          {tabSettings.showCompare && (
            <TabsTrigger value="compare">
              <GitCompare className="h-3.5 w-3.5" />
              Comparaison
            </TabsTrigger>
          )}
          {tabSettings.showJsonInspector && (
            <TabsTrigger value="json">
              <Code2 className="h-3.5 w-3.5" />
              Inspecteur JSON
            </TabsTrigger>
          )}
          {tabSettings.showSettings && (
            <TabsTrigger value="settings">
              <Settings className="h-3.5 w-3.5" />
              Paramètres
            </TabsTrigger>
          )}
        </TabsList>

        {tabSettings.showRegulations && (
          <TabsContent value="analysis">
            <RegulationsTab
              mapPreview={mapPreview}
              onLocationInputChange={() => {
                setIsLocationDetected(false);
              }}
              onLookupParcel={() => {
                if (!address.trim()) {
                  analysisStore.setNested("createDtoErrors.address", [
                    "Veuillez saisir une adresse.",
                  ]);
                  return;
                }
                parcelLookupMutation.mutate(undefined);
              }}
              isLookingUpParcel={parcelLookupMutation.isPending}
              onSubmit={handleRunAnalysis}
              isRunningAnalysis={runAnalysisMutation.isPending}
              isLocationDetected={isLocationDetected}
            />
          </TabsContent>
        )}

        {tabSettings.showCadastralInfo && (
          <TabsContent value="constructibility">
            <CadastralInfoTab
              activeSnapshot={activeSnapshot}
              isLoading={snapshotsQuery.isLoading}
            />
          </TabsContent>
        )}

        {tabSettings.showFeasibility && (
          <TabsContent value="regulations">
            <FeasibilityTab />
          </TabsContent>
        )}

        {tabSettings.showHistory && (
          <TabsContent value="history">
            <HistoryTab
              projectId={projectId || undefined}
              isReplaying={replayMutation.isPending}
              replayingSnapshotId={replayMutation.variables}
              onReopenSnapshot={(snap) => {
                setActiveSnapshot(snap);
                handleTabChange(
                  isTabEnabled("constructibility", tabSettings)
                    ? "constructibility"
                    : resolveTabKey(undefined, tabSettings),
                );
              }}
              onReplaySnapshot={(snapshotId) => {
                replayMutation.mutate(snapshotId);
              }}
            />
          </TabsContent>
        )}

        {tabSettings.showCompare && (
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
        )}

        {tabSettings.showJsonInspector && (
          <TabsContent value="json">
            <JsonInspectorTab activeSnapshot={activeSnapshot} />
          </TabsContent>
        )}

        {tabSettings.showSettings && (
          <TabsContent value="settings">
            <SettingsTab
              currentProject={currentProject}
              activeSnapshot={activeSnapshot}
              isLoading={projectsQuery.isLoading}
              isSnapshotLoading={snapshotsQuery.isLoading}
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
        )}
      </Tabs>
    </div>
  );
}
