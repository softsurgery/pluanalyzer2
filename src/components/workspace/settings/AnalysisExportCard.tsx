"use client";

import { Download, FileText } from "lucide-react";
import type { SnapshotRecord } from "@/types/analyses";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export interface AnalysisExportCardProps {
  activeSnapshot: SnapshotRecord | null;
  isLoading?: boolean;
}

function ArchicadIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" />
      <path d="M3 7l9 5 9-5" />
      <path d="M12 12v10" />
    </svg>
  );
}

export function AnalysisExportCard({
  activeSnapshot,
  isLoading = false,
}: AnalysisExportCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </CardHeader>
        <CardContent>
          <ul className="divide-y rounded-lg border">
            {Array.from({ length: 2 }).map((_, idx) => (
              <li
                key={idx}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
                  <div>
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                </div>
                <Skeleton className="h-4 w-20" />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    );
  }

  const exportItems = activeSnapshot
    ? [
        {
          id: "archicad",
          label: "Archicad",
          description: "Export JSON structuré pour Archicad",
          href: `/api/plu/export/${activeSnapshot.id}?format=archicad`,
          icon: <ArchicadIcon className="h-4 w-4" />,
          iconContainerClass: "bg-primary/10 text-primary",
        },
        {
          id: "pdf",
          label: "Rapport PDF",
          description: "Synthèse réglementaire et constructibilité",
          href: `/api/plu/export/${activeSnapshot.id}?format=pdf`,
          icon: <FileText className="h-4 w-4" />,
          iconContainerClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
        },
      ]
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Export de l&apos;analyse</CardTitle>
        <CardDescription className="text-xs">
          {activeSnapshot
            ? `Téléchargez les données de l'analyse active (${activeSnapshot.snapshotLabel}) au format Archicad ou PDF.`
            : "Aucune analyse sélectionnée. Lancez ou ouvrez une analyse pour exporter les données."}
        </CardDescription>
      </CardHeader>
      {activeSnapshot && (
        <CardContent>
          <ul className="divide-y rounded-lg border">
            {exportItems.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${item.iconContainerClass}`}
                  >
                    {item.icon}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {item.label}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {item.description}
                    </div>
                  </div>
                </div>
                <a
                  href={item.href}
                  download
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  <Download className="h-3.5 w-3.5" />
                  Télécharger
                </a>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}
