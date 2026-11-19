"use client";

import { useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  RotateCcw,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { createProject, projectKeys } from "@/api/projects";
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
import { useFooter } from "@/contexts/FooterProvider";
import { useCreateProjectFormStructure } from "@/hooks/forms/useCreateProjectFormStructure";
import { useProjectStore } from "@/hooks/stores/useProjectStore";
import { createProjectSchema, validateForm } from "@/validations";

const CREATE_PROJECT_FORM_ID = "create-project-form";

export function CreateProjectClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const projectStore = useProjectStore();
  const { setContent, clearContent } = useFooter();

  const { createProjectFormStructure } = useCreateProjectFormStructure({
    projectStore,
  });

  const createProjectMutation = useMutation({
    mutationFn: () => createProject(projectStore.createDto),
    onSuccess: async (created) => {
      projectStore.reset();
      toast.success("Projet créé avec succès.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: projectKeys.all }),
        queryClient.invalidateQueries({ queryKey: projectKeys.stats }),
      ]);
      router.push(created?.id ? `/workspace?projectId=${created.id}` : "/");
    },
  });

  const handleReset = useCallback(() => {
    projectStore.reset();
    createProjectMutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectStore.reset, createProjectMutation.reset]);

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

  useEffect(() => {
    setContent?.(
      <>
        <Button
          type="button"
          variant="outline"
          onClick={handleReset}
          disabled={createProjectMutation.isPending}
        >
          <RotateCcw className="h-4 w-4" />
          Réinitialiser
        </Button>

        <Button
          type="submit"
          form={CREATE_PROJECT_FORM_ID}
          disabled={createProjectMutation.isPending}
        >
          {createProjectMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Enregistrer le projet
        </Button>
      </>,
    );

    return () => {
      clearContent?.();
    };
  }, [
    setContent,
    clearContent,
    handleReset,
    createProjectMutation.isPending,
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-2">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            Retour aux projets
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Nouveau projet de faisabilité
        </h1>
        <p className="text-sm text-muted-foreground">
          Renseignez les informations générales de l&apos;opération et son
          territoire de référence.
        </p>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Informations du projet</CardTitle>
          <CardDescription>
            Les champs marqués d&apos;un astérisque sont obligatoires.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            id={CREATE_PROJECT_FORM_ID}
            onSubmit={handleCreate}
            className="space-y-4"
          >
            <FormBuilder structure={createProjectFormStructure} />

            {createProjectMutation.isError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {createProjectMutation.error instanceof Error
                    ? createProjectMutation.error.message
                    : "Impossible de créer le projet."}
                </AlertDescription>
              </Alert>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
