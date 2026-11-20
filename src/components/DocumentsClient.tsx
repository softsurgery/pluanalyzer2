"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText, RefreshCw } from "lucide-react";
import { documentKeys, fetchDocuments } from "@/api/documents";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function DocumentsClient() {
  const documentsQuery = useQuery({
    queryKey: documentKeys.list(50),
    queryFn: () => fetchDocuments(50),
  });

  const documents = documentsQuery.data?.docs ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Documents PLU disponibles ({documents.length})
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Documents réglementaires stockés et utilisés dans le flux d’analyse
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => documentsQuery.refetch()}
          disabled={documentsQuery.isFetching}
        >
          <RefreshCw
            className={`h-4 w-4 ${documentsQuery.isFetching ? "animate-spin" : ""}`}
          />
          Actualiser
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {documentsQuery.isLoading ? (
            <div className="space-y-3 p-5" aria-busy="true">
              {Array.from({ length: 4 }).map((_, idx) => (
                <Skeleton key={idx} className="h-10 w-full rounded" />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Aucun document disponible pour le moment.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Commune</TableHead>
                  <TableHead>INSEE</TableHead>
                  <TableHead>Zone</TableHead>
                  <TableHead className="text-right">Pages</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Fichier</TableHead>
                  <TableHead className="text-right">Mis à jour</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => {
                  const mediaObj =
                    doc.media && typeof doc.media === "object"
                      ? doc.media
                      : null;
                  const fileUrl = mediaObj?.url || doc.sourceUrl || null;
                  const fileName = mediaObj?.filename || doc.filename || null;

                  return (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 shrink-0 text-primary" />
                          <div>
                            <div className="text-foreground">{doc.title}</div>
                            {fileName && (
                              <div className="text-xs text-muted-foreground">
                                {fileName}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{doc.commune || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {doc.codeInsee || "—"}
                      </TableCell>
                      <TableCell>{doc.zoneCode || "—"}</TableCell>
                      <TableCell className="text-right">
                        {doc.pageCount ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[11px]">
                          {doc.extractionStatus || "pending"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {fileUrl ? (
                          <a
                            href={fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            Ouvrir
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {new Date(doc.updatedAt).toLocaleDateString("fr-FR")}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
