"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { SnapshotRecord } from "@/types/analyses";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export interface RegulationsTabProps {
  activeSnapshot: SnapshotRecord | null;
  isLoading?: boolean;
}

export function RegulationsTab({
  activeSnapshot,
  isLoading = false,
}: RegulationsTabProps) {
  if (isLoading) {
    return (
      <div
        className="grid gap-6 lg:grid-cols-2"
        aria-busy="true"
        aria-label="Chargement de la réglementation"
      >
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
            <Skeleton className="h-3.5 w-52" />
            <Skeleton className="h-[22px] w-24 rounded-full" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 6 }).map((_, idx) => (
                <Skeleton key={idx} className="h-8 w-full rounded-lg" />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <Skeleton className="h-3.5 w-44" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="rounded-lg border p-3">
                <Skeleton className="h-4 w-1/2" />
                <div className="mt-1 space-y-1">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!activeSnapshot) {
    return null;
  }

  const interp = (activeSnapshot.regulatoryInterpretation || {}) as Record<
    string,
    unknown
  >;
  const rules = (interp.rules || {}) as Record<string, unknown>;
  const valReport = (activeSnapshot.validationReport || {}) as Record<
    string,
    unknown
  >;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-sm font-bold">
            Validation & Paramètres extraits
          </CardTitle>
          <Badge
            variant={
              activeSnapshot.validationStatus === "valid"
                ? "success"
                : "warning"
            }
          >
            {activeSnapshot.validationStatus === "valid" ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5" />
            )}
            {activeSnapshot.validationStatus} (
            {String(valReport.completenessScore ?? 0)}%)
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-xs">
            {Object.entries(rules).map(([k, v]) => (
              <div
                key={k}
                className="flex items-center justify-between rounded-lg bg-muted px-3 py-2"
              >
                <span className="font-mono text-muted-foreground">{k}</span>
                <span className="font-bold text-foreground">
                  {v !== null ? String(v) : "—"}
                </span>
              </div>
            ))}
          </div>

          {Array.isArray(valReport.issues) && valReport.issues.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-bold text-muted-foreground">
                Alertes de validation
              </div>
              {(
                valReport.issues as Array<{
                  severity: string;
                  message: string;
                }>
              ).map((issue, idx) => (
                <Alert key={idx} variant="warning">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>[{issue.severity}]</strong> {issue.message}
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold">
            Articles PLU extraits (
            {activeSnapshot.extractedArticles?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[420px] space-y-3 overflow-auto">
            {(activeSnapshot.extractedArticles || []).map((art, i) => (
              <div key={i} className="rounded-lg border bg-muted/50 p-3">
                <div className="text-xs font-bold text-primary">
                  {art.articleNumber} — {art.title}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-xs text-foreground/80">
                  {art.content}
                </p>
              </div>
            ))}
            {(!activeSnapshot.extractedArticles ||
              activeSnapshot.extractedArticles.length === 0) && (
              <p className="text-xs text-muted-foreground">
                Aucun article officiel lié. Téléversez un règlement PLU dans
                &quot;Documents PLU&quot;.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
