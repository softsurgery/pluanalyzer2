"use client";

import { Loader2, RotateCcw } from "lucide-react";
import type { SnapshotRecord } from "@/types/analyses";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export interface HistoryTabProps {
  snapshots: SnapshotRecord[];
  activeSnapshot: SnapshotRecord | null;
  isLoading: boolean;
  isReplaying: boolean;
  replayingSnapshotId?: number | string;
  onReopenSnapshot: (snap: SnapshotRecord) => void;
  onReplaySnapshot: (snapshotId: number | string) => void;
}

export function HistoryTab({
  snapshots,
  activeSnapshot,
  isLoading,
  isReplaying,
  replayingSnapshotId,
  onReopenSnapshot,
  onReplaySnapshot,
}: HistoryTabProps) {
  return (
    <div className="space-y-3">
      {isLoading ? (
        <div
          className="space-y-3"
          aria-busy="true"
          aria-label="Chargement de l'historique"
        >
          {Array.from({ length: 3 }).map((_, idx) => (
            <Card key={idx}>
              <CardContent className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Skeleton className="h-[22px] w-8 rounded" />
                    <Skeleton className="h-5 w-44" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                  <Skeleton className="mt-1 h-4 w-3/4" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-8 w-20 rounded-md" />
                  <Skeleton className="h-8 w-24 rounded-md" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        snapshots.map((snap) => {
          const isRowReplaying =
            isReplaying && replayingSnapshotId === snap.id;
          return (
            <Card
              key={snap.id}
              className={
                activeSnapshot?.id === snap.id
                  ? "border-primary bg-primary/5"
                  : ""
              }
            >
              <CardContent className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="default"
                      className="rounded font-mono text-[11px]"
                    >
                      v{snap.version}
                    </Badge>
                    <span className="text-sm font-bold text-foreground">
                      {snap.snapshotLabel}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(snap.createdAt).toLocaleString("fr-FR")}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {snap.originalPrompt}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onReopenSnapshot(snap)}
                  >
                    Rouvrir
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onReplaySnapshot(snap.id)}
                    disabled={isRowReplaying}
                  >
                    {isRowReplaying ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" />
                    )}
                    Rejouer
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
