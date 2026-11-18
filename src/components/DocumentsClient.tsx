"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Info, Loader2, Sparkles, Upload } from "lucide-react";
import type { DocumentItem } from "@/types/documents";
import {
  documentKeys,
  extractDocumentPdf,
  fetchDocuments,
  uploadDocument,
} from "@/api/documents";
import { fetchProjects, projectKeys } from "@/api/projects";
import { FormBuilder } from "@/components/shared/form-builder";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useUploadDocumentFormStructure } from "@/hooks/forms/useUploadDocumentFormStructure";
import { useDocumentStore } from "@/hooks/stores/useDocumentStore";
import { uploadDocumentSchema, validateForm } from "@/validations";

export function DocumentsClient() {
  const queryClient = useQueryClient();
  const documentStore = useDocumentStore();
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const documentsQuery = useQuery({
    queryKey: documentKeys.list(50),
    queryFn: () => fetchDocuments(50),
  });

  const projectsQuery = useQuery({
    queryKey: projectKeys.list(50),
    queryFn: () => fetchProjects(50),
  });

  const documents = documentsQuery.data?.docs ?? [];
  const projects = projectsQuery.data?.docs ?? [];

  const { uploadDocumentFormStructure } = useUploadDocumentFormStructure({
    documentStore,
    projects,
  });

  useEffect(() => {
    if (!documentStore.createDto.projectId && projects.length > 0) {
      documentStore.setNested("createDto.projectId", String(projects[0].id));
    }
  }, [documentStore, projects]);

  useEffect(() => {
    if (!selectedDoc && documents.length > 0) {
      setSelectedDoc(documents[0]);
    }
  }, [selectedDoc, documents]);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const { file, title, zoneCode, codeInsee, projectId } =
        documentStore.createDto;
      if (!file) throw new Error("Veuillez sélectionner un fichier.");
      return uploadDocument({
        file,
        title,
        zoneCode,
        codeInsee,
        projectId,
      });
    },
    onSuccess: async () => {
      documentStore.setNested("createDto.title", "");
      documentStore.setNested("createDto.file", null);
      setMessage("Document enregistré dans Payload CMS.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: documentKeys.all }),
        queryClient.invalidateQueries({ queryKey: projectKeys.stats }),
      ]);
    },
    onError: (err) => {
      setMessage(
        err instanceof Error
          ? err.message
          : "Erreur lors de l'upload vers Payload CMS.",
      );
    },
  });

  const extractMutation = useMutation({
    mutationFn: (id: number | string) => extractDocumentPdf(id),
    onSuccess: async (data) => {
      setSelectedDoc(data.document);
      setMessage(
        `Extraction terminée (${data.articles?.length || 0} article(s) détecté(s)).`,
      );
      await queryClient.invalidateQueries({ queryKey: documentKeys.all });
    },
    onError: (err) => {
      setMessage(
        err instanceof Error ? err.message : "Échec de l'extraction PDF",
      );
    },
  });

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const result = validateForm(uploadDocumentSchema, documentStore.createDto);
    if (!result.success) {
      documentStore.set("createDtoErrors", result.errors);
      return;
    }
    documentStore.set("createDtoErrors", {});
    uploadMutation.mutate();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Gestion des Documents PLU
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Stockage Payload CMS, extraction de texte PDF & découpage automatique
          par articles
        </p>
      </div>

      {/* Upload Form */}
      <Card>
        <CardContent className="p-5">
          <form onSubmit={handleUpload} className="space-y-4">
            <FormBuilder structure={uploadDocumentFormStructure} />

            <div className="flex justify-end">
              <Button
                type="submit"
                size="sm"
                disabled={
                  uploadMutation.isPending || !documentStore.createDto.file
                }
              >
                {uploadMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Téléverser dans Payload
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {message && (
        <Alert variant="info">
          <Info className="h-4 w-4" />
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Documents ({documents.length})
          </h2>
          {documentsQuery.isLoading ? (
            <div
              className="space-y-3"
              aria-busy="true"
              aria-label="Chargement des documents"
            >
              {Array.from({ length: 3 }).map((_, idx) => (
                <Card key={idx}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-1 items-start gap-3">
                        <Skeleton className="mt-0.5 h-5 w-5 shrink-0 rounded" />
                        <div className="flex-1">
                          <Skeleton className="h-5 w-2/3" />
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <Skeleton className="h-4 w-16" />
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-5 w-16 rounded-full" />
                          </div>
                        </div>
                      </div>
                      <Skeleton className="h-8 w-28 shrink-0 rounded-md" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : documents.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center text-xs text-muted-foreground">
                Aucun document téléversé pour le moment.
              </CardContent>
            </Card>
          ) : (
            documents.map((doc) => {
              const isExtracting =
                extractMutation.isPending &&
                extractMutation.variables === doc.id;
              return (
                <Card
                  key={doc.id}
                  onClick={() => setSelectedDoc(doc)}
                  className={`cursor-pointer transition ${
                    selectedDoc?.id === doc.id
                      ? "border-primary bg-primary/5"
                      : "hover:border-muted-foreground/40"
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                        <div>
                          <div className="text-sm font-bold text-foreground">
                            {doc.title}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            <span>Zone {doc.zoneCode || "—"}</span>
                            <span>·</span>
                            <span>INSEE {doc.codeInsee || "—"}</span>
                            <span>·</span>
                            <Badge variant="secondary" className="text-[10px]">
                              {doc.extractionStatus || "pending"}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMessage(null);
                          extractMutation.mutate(doc.id);
                        }}
                        disabled={isExtracting}
                      >
                        {isExtracting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                        )}
                        Extraire PDF
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Visionneuse de texte extrait
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedDoc ? (
              <div className="space-y-2">
                <div className="text-sm font-bold text-foreground">
                  {selectedDoc.title}
                </div>
                <pre className="max-h-[460px] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-900 p-4 font-mono text-xs text-slate-100">
                  {selectedDoc.extractedText ||
                    'Aucun texte extrait. Cliquez sur "Extraire PDF" pour lancer l\'analyse.'}
                </pre>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Sélectionnez un document pour inspecter son contenu
                réglementaire.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
