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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function DocumentsClient() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [zoneCode, setZoneCode] = useState("UA");
  const [codeInsee, setCodeInsee] = useState("13001");
  const [projectId, setProjectId] = useState("");
  const [file, setFile] = useState<File | null>(null);
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

  useEffect(() => {
    if (!projectId && projects.length > 0) {
      setProjectId(String(projects[0].id));
    }
  }, [projectId, projects]);

  useEffect(() => {
    if (!selectedDoc && documents.length > 0) {
      setSelectedDoc(documents[0]);
    }
  }, [selectedDoc, documents]);

  const uploadMutation = useMutation({
    mutationFn: async () => {
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
      setTitle("");
      setFile(null);
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
          <form
            onSubmit={handleUpload}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
          >
            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="doc-title">Titre</Label>
              <Input
                id="doc-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Règlement Zone UA Aix-en-Provence"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-zone">Zone</Label>
              <Input
                id="doc-zone"
                value={zoneCode}
                onChange={(e) => setZoneCode(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-insee">Code INSEE</Label>
              <Input
                id="doc-insee"
                value={codeInsee}
                onChange={(e) => setCodeInsee(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-project">Projet</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger id="doc-project">
                  <SelectValue placeholder="Sélectionner un projet" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2 lg:col-span-5">
              <Input
                type="file"
                accept=".pdf,.txt"
                required
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="max-w-sm cursor-pointer text-xs file:mr-3 file:rounded-md file:bg-secondary file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-secondary-foreground"
              />
              <Button
                type="submit"
                size="sm"
                disabled={uploadMutation.isPending || !file}
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
            <Card>
              <CardContent className="flex items-center justify-center gap-2 p-8 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Chargement des documents...
              </CardContent>
            </Card>
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
