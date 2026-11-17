"use client";

import type { SnapshotRecord } from "@/types/analyses";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface CompareTabProps {
  snapshots: SnapshotRecord[];
  compareA: string;
  compareB: string;
  onCompareAChange: (value: string) => void;
  onCompareBChange: (value: string) => void;
  onCompare: () => void;
  isComparing: boolean;
  compareResult: Record<string, unknown> | null;
}

export function CompareTab({
  snapshots,
  compareA,
  compareB,
  onCompareAChange,
  onCompareBChange,
  onCompare,
  isComparing,
  compareResult,
}: CompareTabProps) {
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] space-y-1.5">
            <Label htmlFor="compare-a">Snapshot A</Label>
            <Select value={compareA} onValueChange={onCompareAChange}>
              <SelectTrigger id="compare-a" className="text-xs">
                <SelectValue placeholder="Sélectionner Snapshot A" />
              </SelectTrigger>
              <SelectContent>
                {snapshots.map((s) => (
                  <SelectItem
                    key={s.id}
                    value={String(s.id)}
                    className="text-xs"
                  >
                    {s.snapshotLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[220px] space-y-1.5">
            <Label htmlFor="compare-b">Snapshot B</Label>
            <Select value={compareB} onValueChange={onCompareBChange}>
              <SelectTrigger id="compare-b" className="text-xs">
                <SelectValue placeholder="Sélectionner Snapshot B" />
              </SelectTrigger>
              <SelectContent>
                {snapshots.map((s) => (
                  <SelectItem
                    key={s.id}
                    value={String(s.id)}
                    className="text-xs"
                  >
                    {s.snapshotLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={onCompare}
            disabled={isComparing || !compareA || !compareB}
          >
            {isComparing ? "Comparaison..." : "Comparer les versions"}
          </Button>
        </div>

        {compareResult && Array.isArray(compareResult.constructibilityDiff) && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Métrique</TableHead>
                <TableHead>Snapshot A</TableHead>
                <TableHead>Snapshot B</TableHead>
                <TableHead>Delta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(
                compareResult.constructibilityDiff as Array<{
                  metric: string;
                  snapshotA: unknown;
                  snapshotB: unknown;
                  delta: number | null;
                }>
              ).map((row) => (
                <TableRow key={row.metric}>
                  <TableCell className="font-mono font-semibold">
                    {row.metric}
                  </TableCell>
                  <TableCell>{String(row.snapshotA ?? "—")}</TableCell>
                  <TableCell>{String(row.snapshotB ?? "—")}</TableCell>
                  <TableCell className="font-semibold text-primary">
                    {row.delta !== null
                      ? row.delta > 0
                        ? `+${row.delta}`
                        : row.delta
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
