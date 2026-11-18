"use client";

import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import type { ProjectItem } from "@/types/projects";
import { projectKeys, updateProject } from "@/api/projects";
import { FormBuilder } from "@/components/shared/form-builder";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectInfoFormStructure } from "@/hooks/forms/useProjectInfoFormStructure";
import { useProjectStore } from "@/hooks/stores/useProjectStore";
import { updateProjectSchema, validateForm } from "@/validations";

export interface ProjectInfoCardProps {
  currentProject: ProjectItem | null;
  isLoading?: boolean;
}

export function ProjectInfoCard({
  currentProject,
  isLoading = false,
}: ProjectInfoCardProps) {
  const queryClient = useQueryClient();
  const projectStore = useProjectStore();

  useEffect(() => {
    if (currentProject) {
      projectStore.set("updateDto", {
        name: currentProject.name ?? "",
        description: currentProject.description ?? "",
      });
      projectStore.set("updateDtoErrors", {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id, currentProject?.name, currentProject?.description]);

  const territoryLabel =
    currentProject?.territory === "amp" ? "Métropole AMP" : "GPU National";

  const { projectInfoFormStructure } = useProjectInfoFormStructure({
    projectStore,
    commune: currentProject?.commune ?? "",
    codeInsee: currentProject?.codeInsee ?? "",
    territoryLabel,
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!currentProject) {
        throw new Error("Aucun projet sélectionné.");
      }
      return updateProject(currentProject.id, {
        name: projectStore.updateDto.name.trim(),
        description: projectStore.updateDto.description.trim(),
      });
    },
    onSuccess: async () => {
      toast.success("Informations du projet mises à jour avec succès.");
      await queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
          <div className="space-y-2">
            <div className="grid gap-4 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="space-y-1.5">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-9 w-full rounded-lg" />
                </div>
              ))}
            </div>
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
          <div className="flex justify-end">
            <Skeleton className="h-9 w-48 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!currentProject) {
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateForm(updateProjectSchema, projectStore.updateDto);
    if (!result.success) {
      projectStore.set("updateDtoErrors", result.errors);
      return;
    }
    projectStore.set("updateDtoErrors", {});
    updateMutation.mutate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Informations du projet</CardTitle>
        <CardDescription className="text-xs">
          Paramètres généraux du projet sélectionné dans l&apos;espace de
          travail
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormBuilder structure={projectInfoFormStructure} />

          {updateMutation.isError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {updateMutation.error instanceof Error
                  ? updateMutation.error.message
                  : "Impossible de mettre à jour le projet."}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Enregistrer les modifications
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
