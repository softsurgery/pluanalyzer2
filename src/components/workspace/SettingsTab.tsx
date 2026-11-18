"use client";

import type { SnapshotRecord } from "@/types/analyses";
import type { ProjectItem } from "@/types/projects";
import { Card, CardContent } from "@/components/ui/card";
import { AnalysisExportCard } from "@/components/workspace/settings/AnalysisExportCard";
import { DangerZoneCard } from "@/components/workspace/settings/DangerZoneCard";
import { ProjectInfoCard } from "@/components/workspace/settings/ProjectInfoCard";

export interface SettingsTabProps {
  currentProject: ProjectItem | null;
  activeSnapshot: SnapshotRecord | null;
  isLoading?: boolean;
  isSnapshotLoading?: boolean;
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
  isSnapshotLoading = false,
  userRole,
  canDeleteProject,
  isDeleting,
  deleteError,
  onDeleteProject,
}: SettingsTabProps) {
  if (!isLoading && !currentProject) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Sélectionnez un projet pour accéder à ses paramètres.
        </CardContent>
      </Card>
    );
  }

  return (
    <div
      className="space-y-6"
      aria-busy={isLoading || isSnapshotLoading || undefined}
      aria-label={
        isLoading || isSnapshotLoading
          ? "Chargement des paramètres du projet"
          : undefined
      }
    >
      <ProjectInfoCard currentProject={currentProject} isLoading={isLoading} />
      <AnalysisExportCard
        activeSnapshot={activeSnapshot}
        isLoading={isLoading || isSnapshotLoading}
      />
      <DangerZoneCard
        currentProject={currentProject}
        isLoading={isLoading}
        userRole={userRole}
        canDeleteProject={canDeleteProject}
        isDeleting={isDeleting}
        deleteError={deleteError}
        onDeleteProject={onDeleteProject}
      />
    </div>
  );
}
