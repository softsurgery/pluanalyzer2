"use client";

import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Button } from "@payloadcms/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type {
  OllamaAccountConsumptionResult,
  OllamaUsageRange,
} from "@/types/ollama";

const PAGE_SIZE = 5;

const RANGES: Array<{ value: OllamaUsageRange; label: string }> = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7 jours" },
  { value: "30d", label: "30 jours" },
];

function formatNumber(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "0";
  return n.toLocaleString("fr-FR");
}

function formatUsd(amount: number | undefined): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "$0.00";
  if (amount > 0 && amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

function formatBucketDate(iso: string, granularity: string): string {
  const date = new Date(iso);
  if (granularity === "hour") {
    return date.toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export interface ConsumptionProps {
  className?: string;
  refreshTrigger?: number;
}

export const Consumption: React.FC<ConsumptionProps> = ({
  className,
  refreshTrigger = 0,
}) => {
  const [range, setRange] = useState<OllamaUsageRange>("7d");
  const [limit, setLimit] = useState<number>(PAGE_SIZE);
  const [data, setData] = useState<OllamaAccountConsumptionResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadConsumption = useCallback(
    async (selectedRange: OllamaUsageRange, selectedLimit: number) => {
      setIsLoading(true);
      try {
        const res = await axios.get<OllamaAccountConsumptionResult>(
          `/api/plu/model-consumption?range=${selectedRange}&limit=${selectedLimit}&offset=0`,
          {
            headers: { "Cache-Control": "no-store" },
            validateStatus: () => true,
          },
        );
        const body = res.data;
        if ((res.status < 200 || res.status >= 300) && body?.ok !== false) {
          setData({
            ok: false,
            range: selectedRange,
            fetchedAt: new Date().toISOString(),
            error: `HTTP ${res.status}`,
          });
          return;
        }
        setData(body);
      } catch (err) {
        setData({
          ok: false,
          range: selectedRange,
          fetchedAt: new Date().toISOString(),
          error: err instanceof Error ? err.message : "Erreur réseau",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    loadConsumption(range, limit);
  }, [range, limit, loadConsumption]);

  useEffect(() => {
    if (refreshTrigger > 0) {
      loadConsumption(range, limit);
    }
  }, [refreshTrigger, range, limit, loadConsumption]);

  const handleRangeChange = (nextRange: OllamaUsageRange) => {
    setLimit(PAGE_SIZE);
    setRange(nextRange);
  };

  const buckets = data?.usage?.buckets ?? [];
  const granularity = data?.usage?.granularity || "day";
  const totals = data?.usage?.totals;
  const included = data?.balance?.included;
  const purchased = data?.balance?.purchased;
  const pagination = data?.pagination;

  return (
    <div className={cn("mb-4", className)}>
      <div className="flex flex-col gap-4 rounded bg-[var(--theme-elevation-50)] p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-base font-semibold">
            Coûts & Historique Ollama Cloud
            {data?.fetchedAt
              ? ` · Maj ${new Date(data.fetchedAt).toLocaleTimeString("fr-FR")}`
              : ""}
          </div>

          <div className="flex items-center gap-1.5">
            {RANGES.map((r) => (
              <Button
                key={r.value}
                type="button"
                size="small"
                buttonStyle={range === r.value ? "primary" : "secondary"}
                onClick={() => handleRangeChange(r.value)}
                disabled={isLoading}
                className="m-0"
              >
                {r.label}
              </Button>
            ))}
          </div>
        </div>

        {isLoading && !data ? (
          <span>Chargement des coûts et de l’historique Ollama...</span>
        ) : data?.ok && data.usage ? (
          <>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
              {included && (
                <div className="rounded border border-solid border-[var(--theme-elevation-150)] bg-[var(--theme-elevation-0)] p-3">
                  <div className="text-xs text-[var(--theme-elevation-600)]">
                    Solde inclus
                  </div>
                  <div className="mt-1 text-base font-semibold">
                    {formatUsd(included.balance_usd)}
                    <span className="ml-1 text-xs font-normal text-[var(--theme-elevation-600)]">
                      / {formatUsd(included.allowance_usd)}
                    </span>
                  </div>
                  {included.period?.until && (
                    <div className="mt-1 text-[11px] text-[var(--theme-elevation-500)]">
                      Renouvellement le{" "}
                      {new Date(included.period.until).toLocaleDateString(
                        "fr-FR",
                      )}
                    </div>
                  )}
                </div>
              )}

              {purchased && (
                <div className="rounded border border-solid border-[var(--theme-elevation-150)] bg-[var(--theme-elevation-0)] p-3">
                  <div className="text-xs text-[var(--theme-elevation-600)]">
                    Crédits achetés
                  </div>
                  <div className="mt-1 text-base font-semibold">
                    {formatUsd(purchased.balance_usd)}
                  </div>
                </div>
              )}

              <div className="rounded border border-solid border-[var(--theme-elevation-150)] bg-[var(--theme-elevation-0)] p-3">
                <div className="text-xs text-[var(--theme-elevation-600)]">
                  Coût ({range})
                </div>
                <div className="mt-1 text-base font-semibold">
                  {formatUsd(totals?.usage_usd)}
                </div>
                <div className="mt-1 text-[11px] text-[var(--theme-elevation-500)]">
                  {formatNumber(totals?.request_count)} requêtes
                </div>
              </div>

              <div className="rounded border border-solid border-[var(--theme-elevation-150)] bg-[var(--theme-elevation-0)] p-3">
                <div className="text-xs text-[var(--theme-elevation-600)]">
                  Tokens ({range})
                </div>
                <div className="mt-1 text-base font-semibold">
                  {formatNumber(
                    (totals?.input_tokens ?? 0) + (totals?.output_tokens ?? 0),
                  )}
                </div>
                <div className="mt-1 text-[11px] text-[var(--theme-elevation-500)]">
                  {formatNumber(totals?.input_tokens)} in ·{" "}
                  {formatNumber(totals?.output_tokens)} out
                  {totals?.cached_input_tokens
                    ? ` · ${formatNumber(totals.cached_input_tokens)} cache`
                    : ""}
                </div>
              </div>
            </div>

            {data.error && (
              <div className="text-xs text-[var(--theme-warning-500)]">
                Avertissement : {data.error}
              </div>
            )}

            <Table className="bg-transparent text-sm">
              <TableHeader>
                <TableRow className="border-b border-solid border-[var(--theme-elevation-150)] hover:bg-transparent">
                  <TableHead className="h-9 px-3 text-sm text-[var(--theme-elevation-600)]">
                    Période
                  </TableHead>
                  <TableHead className="h-9 px-3 text-right text-sm text-[var(--theme-elevation-600)]">
                    Requêtes
                  </TableHead>
                  <TableHead className="h-9 px-3 text-right text-sm text-[var(--theme-elevation-600)]">
                    Input Tokens
                  </TableHead>
                  <TableHead className="h-9 px-3 text-right text-sm text-[var(--theme-elevation-600)]">
                    Output Tokens
                  </TableHead>
                  <TableHead className="h-9 px-3 text-right text-sm text-[var(--theme-elevation-600)]">
                    Coût (USD)
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {buckets.length === 0 ? (
                  <TableRow className="border-b border-solid border-[var(--theme-elevation-150)]">
                    <TableCell colSpan={5} className="px-3 py-2.5 text-sm">
                      Aucune donnée sur cette période.
                    </TableCell>
                  </TableRow>
                ) : (
                  buckets.map((bucket) => (
                    <TableRow
                      key={bucket.from}
                      className="border-b border-solid border-[var(--theme-elevation-150)] hover:bg-[var(--theme-elevation-100)]"
                    >
                      <TableCell className="px-3 py-2 text-sm font-medium">
                        {formatBucketDate(bucket.from, granularity)}
                        {bucket.partial ? (
                          <span className="ml-1.5 text-xs text-[var(--theme-elevation-500)]">
                            (en cours)
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right text-sm">
                        {formatNumber(bucket.request_count)}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right text-sm">
                        {formatNumber(bucket.input_tokens)}
                        {bucket.cached_input_tokens > 0 ? (
                          <span className="ml-1 text-xs text-[var(--theme-elevation-500)]">
                            ({formatNumber(bucket.cached_input_tokens)} cache)
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right text-sm">
                        {formatNumber(bucket.output_tokens)}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right font-mono text-sm font-semibold">
                        {formatUsd(bucket.usage_usd)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {pagination && pagination.total > PAGE_SIZE && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-[var(--theme-elevation-600)]">
                <span>
                  Affichage de {buckets.length} sur {pagination.total} périodes
                </span>
                <div className="flex items-center gap-2">
                  {limit > PAGE_SIZE && (
                    <Button
                      type="button"
                      size="small"
                      buttonStyle="secondary"
                      onClick={() => setLimit(PAGE_SIZE)}
                      disabled={isLoading}
                      className="m-0"
                    >
                      Afficher moins
                    </Button>
                  )}
                  {pagination.hasMore && (
                    <Button
                      type="button"
                      size="small"
                      buttonStyle="secondary"
                      onClick={() => setLimit((prev) => prev + PAGE_SIZE)}
                      disabled={isLoading}
                      className="m-0"
                    >
                      Afficher plus
                    </Button>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-[var(--theme-error-500)]">
            Impossible de charger les données Ollama Cloud
            {data?.error ? ` : ${data.error}` : ""}
          </div>
        )}
      </div>

      <div className="mt-3">
        <Button
          type="button"
          buttonStyle="primary"
          onClick={() => loadConsumption(range, limit)}
          disabled={isLoading}
        >
          {isLoading ? "Actualisation..." : "Actualiser Ollama Cloud"}
        </Button>
      </div>
    </div>
  );
};
