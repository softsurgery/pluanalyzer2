"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Code2,
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CadastralInfoTab } from "@/components/workspace/CadastralInfoTab";
import { CompareTab } from "@/components/workspace/CompareTab";
import { FeasibilityTab } from "@/components/workspace/FeasibilityTab";
import { HistoryTab } from "@/components/workspace/HistoryTab";
import { JsonInspectorTab } from "@/components/workspace/JsonInspectorTab";
import { RegulationsTab } from "@/components/workspace/RegulationsTab";
import { SettingsTab } from "@/components/workspace/SettingsTab";
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

const SELECTABLE_TABS: readonly Exclude<TabKey, "json">[] = [
  "analysis",
  "constructibility",
  "regulations",
  "history",
  "compare",
  "settings",
];

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
      return false;
  }
}

function resolveTabKey(
  tab: string | undefined,
  tabSettings: WorkspaceTabSettings,
): TabKey {
  if (
    tab &&
    SELECTABLE_TABS.includes(tab as Exclude<TabKey, "json">) &&
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

  const [activeTab, setActiveTab] = useState<TabKey>(() =>
    resolveTabKey(initialTab, tabSettings),
  );
  const [projectId, setProjectId] = useState<string>(initialProjectId || "");
  const [activeSnapshot, setActiveSnapshot] = useState<SnapshotRecord | null>(
    null,
  );

  // Form state (Zustand)
  const analysisStore = useAnalysisStore();
  const { locationMode, address, idu, prompt } = analysisStore.createDto;

  useEffect(() => {
    analysisStore.setNested("createDto.projectId", projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);
  const [statusBanner, setStatusBanner] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const [isLocationDetected, setIsLocationDetected] = useState<boolean>(false);

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

  const handleTabChange = (nextTab: TabKey) => {
    if (!isTabEnabled(nextTab, tabSettings)) return;
    setActiveTab(nextTab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Mutations
  const parcelLookupMutation = useMutation({
    mutationFn: () => {
      if (locationMode === "parcel") {
        return lookupParcel({ idu });
      }
      return lookupParcel({ address });
    },
    onSuccess: (data) => {
      if (data.parcel?.status === "ok") {
        setIsLocationDetected(true);
        if (data.parcel.idu) {
          analysisStore.setNested("createDto.idu", data.parcel.idu);
        }
        setStatusBanner({
          type: "ok",
          text: `Parcelle localisée : ${data.parcel.idu} · Surface ${data.parcel.surfaceM2 ?? "?"} m² · Zone GPU : ${data.gpu?.zoneCode || "non détectée"}`,
        });
      } else if (data.geocoding?.coordinates) {
        setIsLocationDetected(true);
        setStatusBanner({
          type: "ok",
          text: `Adresse géocodée (${data.geocoding.label}), parcelle cadastrale non retournée par IGN.`,
        });
      } else {
        setIsLocationDetected(false);
        setStatusBanner({
          type: "err",
          text: "Aucune parcelle trouvée pour cette recherche.",
        });
      }
    },
    onError: (err) => {
      setIsLocationDetected(false);
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
    setStatusBanner(null);
    const result = validateForm(createAnalysisSchema, analysisStore.createDto);
    if (!result.success) {
      analysisStore.set("createDtoErrors", result.errors);
      const locationError =
        result.errors.address?.[0] ||
        result.errors.idu?.[0] ||
        result.errors.selectedParcelId?.[0];
      if (locationError) {
        setStatusBanner({
          type: "err",
          text: `${locationError} (onglet Réglementation)`,
        });
      }
      return;
    }
    analysisStore.set("createDtoErrors", {});
    runAnalysisMutation.mutate();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      {statusBanner && (
        <Alert variant={statusBanner.type === "ok" ? "success" : "destructive"}>
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
        <TabsList>
          {tabSettings.showRegulations && (
            <TabsTrigger value="analysis">
              <Search className="h-3.5 w-3.5" />
              Réglementation
            </TabsTrigger>
          )}
          {tabSettings.showCadastralInfo && (
            <TabsTrigger value="constructibility">
              <Layers className="h-3.5 w-3.5" />
              Informations Cadastral
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
          <TabsTrigger value="json" disabled>
            <Code2 className="h-3.5 w-3.5" />
            Inspecteur JSON
          </TabsTrigger>
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
              onAddressSelect={() => {
                setIsLocationDetected(true);
              }}
              onLocationInputChange={() => {
                setIsLocationDetected(false);
              }}
              onLookupParcel={() => {
                setStatusBanner(null);
                parcelLookupMutation.mutate();
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
              snapshots={snapshots}
              activeSnapshot={activeSnapshot}
              isLoading={snapshotsQuery.isLoading}
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
                setStatusBanner(null);
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

        <TabsContent value="json">
          <JsonInspectorTab activeSnapshot={activeSnapshot} />
        </TabsContent>

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
