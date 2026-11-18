"use client";

import { AlertCircle, AlertTriangle, Loader2, Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export interface DangerZoneCardProps {
  currentProject: ProjectItem | null;
  isLoading?: boolean;
  userRole?: string;
  canDeleteProject: boolean;
  isDeleting: boolean;
  deleteError: Error | null;
  onDeleteProject: (projectId: number | string) => void;
}

export function DangerZoneCard({
  currentProject,
  isLoading = false,
  userRole,
  canDeleteProject,
  isDeleting,
  deleteError,
  onDeleteProject,
}: DangerZoneCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[68px] w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (!currentProject) {
    return null;
  }

  return (
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
              Cette action supprimera le projet de la liste des études actives.
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
  );
}
