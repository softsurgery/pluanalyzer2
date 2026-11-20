"use client";

import type { ProjectItem } from "@/types/projects";
import { FormBuilder } from "@/components/shared/form-builder";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectInfoFormStructure } from "@/hooks/forms/useProjectInfoFormStructure";

export interface ProjectInfoCardProps {
  currentProject: ProjectItem | null;
  isLoading?: boolean;
}

export function ProjectInfoCard({
  currentProject,
  isLoading = false,
}: ProjectInfoCardProps) {
  const territoryLabel =
    currentProject?.territory === "amp" ? "Métropole AMP" : "GPU National";

  const { projectInfoFormStructure } = useProjectInfoFormStructure({
    commune: currentProject?.commune ?? "",
    codeInsee: currentProject?.codeInsee ?? "",
    territoryLabel,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>
    );
  }

  if (!currentProject) {
    return null;
  }

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
        <FormBuilder structure={projectInfoFormStructure} />
      </CardContent>
    </Card>
  );
}
