"use client";

import {
  AlertCircle,
  AlertTriangle,
  Download,
  Loader2,
  Trash2,
} from "lucide-react";
import type { SnapshotRecord } from "@/types/analyses";
import type { ProjectItem } from "@/types/projects";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export interface SettingsTabProps {
  currentProject: ProjectItem | null;
  activeSnapshot: SnapshotRecord | null;
  isLoading?: boolean;
  userRole?: string;
  canDeleteProject: boolean;
  isDeleting: boolean;
  deleteError: Error | null;
  onDeleteProject: (projectId: number | string) => void;
}

export function SettingsTab({
  currentProject,
  activeSnapshot,
  isLoading = false,
  userRole,
  canDeleteProject,
  isDeleting,
  deleteError,
  onDeleteProject,
}: SettingsTabProps) {
  if (isLoading) {
    return (
      <div
        className="space-y-6"
        aria-busy="true"
        aria-label="Chargement des paramètres du projet"
      >
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="space-y-1">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-32" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Skeleton className="h-8 w-36 rounded-md" />
            <Skeleton className="h-8 w-32 rounded-md" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[68px] w-full rounded-lg" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!currentProject) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Sélectionnez un projet pour accéder à ses paramètres.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informations du projet</CardTitle>
          <CardDescription className="text-xs">
            Paramètres généraux du projet sélectionné dans l&apos;espace de
            travail
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="text-xs font-semibold text-muted-foreground">
              Nom
            </div>
            <div className="mt-1 font-semibold text-foreground">
              {currentProject.name}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-muted-foreground">
              Commune
            </div>
            <div className="mt-1 text-foreground">{currentProject.commune}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-muted-foreground">
              Code INSEE
            </div>
            <div className="mt-1 font-mono text-foreground">
              {currentProject.codeInsee}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-muted-foreground">
              Territoire
            </div>
            <div className="mt-1">
              <Badge variant="info">
                {currentProject.territory === "amp"
                  ? "Métropole AMP"
                  : "GPU National"}
              </Badge>
            </div>
          </div>
          {currentProject.description && (
            <div className="sm:col-span-2 lg:col-span-4">
              <div className="text-xs font-semibold text-muted-foreground">
                Description
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {currentProject.description}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Export de l&apos;analyse</CardTitle>
          <CardDescription className="text-xs">
            {activeSnapshot
              ? `Téléchargez les données de l'analyse active (${activeSnapshot.snapshotLabel}) au format Archicad ou Markdown.`
              : "Aucune analyse sélectionnée. Lancez ou ouvrez une analyse pour exporter les données."}
          </CardDescription>
        </CardHeader>
        {activeSnapshot && (
          <CardContent className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/plu/export/${activeSnapshot.id}?format=archicad`}>
                <Download className="h-3.5 w-3.5 text-primary" />
                Export Archicad
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/plu/export/${activeSnapshot.id}?format=markdown`}>
                <Download className="h-3.5 w-3.5 text-emerald-600" />
                Rapport MD
              </a>
            </Button>
          </CardContent>
        )}
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base text-destructive">
            Zone de danger
          </CardTitle>
          <CardDescription className="text-xs">
            La suppression du projet est définitive. Les analyses, snapshots et
            historiques associés seront supprimés, et les documents liés seront
            détachés du projet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {deleteError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {deleteError.message || "Impossible de supprimer le projet."}
              </AlertDescription>
            </Alert>
          )}

          {!canDeleteProject && (
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Votre rôle ({userRole}) ne permet pas de supprimer un projet.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center">
            <div>
              <div className="text-sm font-semibold text-foreground">
                Supprimer le projet « {currentProject.name} »
              </div>
              <p className="text-xs text-muted-foreground">
                Cette action supprimera le projet de la liste des études
                actives.
              </p>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!canDeleteProject || isDeleting}
                >
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Supprimer le projet
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Confirmer la suppression du projet
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Êtes-vous sûr de vouloir supprimer définitivement le projet{" "}
                    <strong className="text-foreground">
                      {currentProject.name}
                    </strong>{" "}
                    ? Cette action est irréversible.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => onDeleteProject(currentProject.id)}
                  >
                    Supprimer définitivement
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
