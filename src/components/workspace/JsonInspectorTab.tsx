"use client";

import { useState } from "react";
import type { SnapshotRecord } from "@/types/analyses";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export interface JsonInspectorTabProps {
  activeSnapshot: SnapshotRecord | null;
}

type JsonSection = "snapshot" | "archicad" | "gis" | "logs";

export function JsonInspectorTab({ activeSnapshot }: JsonInspectorTabProps) {
  const [jsonSection, setJsonSection] = useState<JsonSection>("snapshot");

  if (!activeSnapshot) {
    return null;
  }

  const payload =
    jsonSection === "snapshot"
      ? activeSnapshot
      : jsonSection === "archicad"
        ? activeSnapshot.archicadExport
        : jsonSection === "gis"
          ? activeSnapshot.zoningAndGis
          : {
              logs: activeSnapshot.executionLogs,
              errors: activeSnapshot.executionErrors,
            };

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap gap-2">
          {(["snapshot", "archicad", "gis", "logs"] as const).map((sec) => (
            <Button
              key={sec}
              type="button"
              size="sm"
              variant={jsonSection === sec ? "default" : "secondary"}
              onClick={() => setJsonSection(sec)}
            >
              {sec.toUpperCase()}
            </Button>
          ))}
        </div>
        <pre className="max-h-[500px] overflow-auto rounded-lg bg-slate-900 p-4 font-mono text-xs text-emerald-300">
          {JSON.stringify(payload, null, 2)}
        </pre>
      </CardContent>
    </Card>
  );
}
