"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  FileText,
  FolderPlus,
  History,
  Layers,
  Loader2,
} from "lucide-react";
import {
  createProject,
  fetchDashboardStats,
  fetchProjects,
  projectKeys,
} from "@/api/projects";
import { FormBuilder } from "@/components/shared/form-builder";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreateProjectFormStructure } from "@/hooks/forms/useCreateProjectFormStructure";
import { useProjectStore } from "@/hooks/stores/useProjectStore";
import { createProjectSchema, validateForm } from "@/validations";

export function DashboardClient() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const projectStore = useProjectStore();
  const { createProjectFormStructure } = useCreateProjectFormStructure({
    projectStore,
  });

  const projectsQuery = useQuery({
    queryKey: projectKeys.list(24),
    queryFn: () => fetchProjects(24),
  });

  const statsQuery = useQuery({
    queryKey: projectKeys.stats,
    queryFn: fetchDashboardStats,
  });

  const createProjectMutation = useMutation({
    mutationFn: () => createProject(projectStore.createDto),
    onSuccess: async () => {
      projectStore.reset();
      setShowForm(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: projectKeys.all }),
        queryClient.invalidateQueries({ queryKey: projectKeys.stats }),
      ]);
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateForm(createProjectSchema, projectStore.createDto);
    if (!result.success) {
      projectStore.set("createDtoErrors", result.errors);
      return;
    }
    projectStore.set("createDtoErrors", {});
    createProjectMutation.mutate();
  };

  const projects = projectsQuery.data?.docs ?? [];
  const stats = statsQuery.data ?? {
    projects: 0,
    analyses: 0,
    snapshots: 0,
    documents: 0,
  };

  const kpiCards = [
    {
      label: "Projets",
      value: stats.projects,
      icon: Building2,
      iconColor: "text-primary",
    },
    {
      label: "Analyses PLU",
      value: stats.analyses,
      icon: Layers,
      iconColor: "text-indigo-600",
    },
    {
      label: "Snapshots immuables",
      value: stats.snapshots,
      icon: History,
      iconColor: "text-emerald-600",
    },
    {
      label: "Documents PLU",
      value: stats.documents,
      icon: FileText,
      iconColor: "text-amber-600",
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Tableau de bord — Études de Faisabilité PLU
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => setShowForm((v) => !v)}>
            <FolderPlus className="h-4 w-4" />
            Nouveau projet
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
        aria-busy={statsQuery.isLoading || undefined}
      >
        {statsQuery.isLoading
          ? Array.from({ length: 4 }).map((_, idx) => (
              <Card key={idx}>
                <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-4 rounded" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-9 w-16" />
                </CardContent>
              </Card>
            ))
          : kpiCards.map((kpi) => {
              const Icon = kpi.icon;
              return (
                <Card key={kpi.label}>
                  <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                    <CardDescription className="text-xs font-semibold uppercase tracking-wide">
                      {kpi.label}
                    </CardDescription>
                    <Icon className={`h-4 w-4 ${kpi.iconColor}`} />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-foreground">
                      {kpi.value}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
      </div>

      {/* Create Project Drawer */}
      {showForm && (
        <Card className="rounded-2xl border-primary/30">
          <CardHeader>
            <CardTitle className="text-base">
              Créer un projet de faisabilité
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <FormBuilder structure={createProjectFormStructure} />

              {createProjectMutation.isError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {createProjectMutation.error instanceof Error
                      ? createProjectMutation.error.message
                      : "Impossible de créer le projet"}
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowForm(false)}
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={createProjectMutation.isPending}
                >
                  {createProjectMutation.isPending && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  Enregistrer le projet
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Projects List */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-foreground">Projets actifs</h2>
        {projectsQuery.isLoading ? (
          <div
            className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
            aria-busy="true"
            aria-label="Chargement des projets"
          >
            {Array.from({ length: 3 }).map((_, idx) => (
              <Card key={idx} className="flex flex-col justify-between">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-[22px] w-24 rounded-full" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <div className="pt-2">
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent className="space-y-1 pt-0">
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-5/6" />
                </CardContent>
                <CardFooter className="mt-auto justify-between border-t pt-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-28" />
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : projectsQuery.isError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {projectsQuery.error instanceof Error
                ? projectsQuery.error.message
                : "Impossible de charger les projets."}
            </AlertDescription>
          </Alert>
        ) : projects.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              Aucun projet trouvé. Créez votre premier projet ci-dessus.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <Card
                key={p.id}
                className="flex flex-col justify-between transition hover:border-primary/40"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="info" className="text-[11px] uppercase">
                      {p.territory === "amp" ? "Métropole AMP" : "GPU National"}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      INSEE {p.codeInsee}
                    </span>
                  </div>
                  <CardTitle className="pt-2 text-base">{p.name}</CardTitle>
                  <CardDescription className="text-xs font-medium">
                    {p.commune}
                  </CardDescription>
                </CardHeader>

                {p.description && (
                  <CardContent className="pt-0">
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {p.description}
                    </p>
                  </CardContent>
                )}

                <CardFooter className="mt-auto justify-between border-t pt-3">
                  <span className="text-[11px] text-muted-foreground">
                    Maj {new Date(p.updatedAt).toLocaleDateString("fr-FR")}
                  </span>
                  <Button
                    variant="link"
                    size="sm"
                    asChild
                    className="h-auto p-0 text-xs"
                  >
                    <Link href={`/workspace?projectId=${p.id}`}>
                      Ouvrir l&apos;espace PLU
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
