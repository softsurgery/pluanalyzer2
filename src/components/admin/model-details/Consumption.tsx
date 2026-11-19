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
import type { OpenRouterQuotaInfo } from "@/types/openrouter";

const QUOTA_REFRESH_INTERVAL_MS = 30000;

function formatUsd(value: number | null | undefined): string {
  if (typeof value !== "number") return "Unavailable";
  return `$${value.toFixed(4)}`;
}

function formatRateLimit(quota: OpenRouterQuotaInfo): string {
  const rl = quota.rateLimit;
  if (!rl || (rl.requests === null && rl.interval === null)) {
    return "Unavailable";
  }
  const reqLabel =
    rl.requests === -1
      ? "Illimité (-1)"
      : rl.requests !== null
        ? `${rl.requests} req`
        : "Unavailable";
  const intervalLabel = rl.interval ? ` / ${rl.interval}` : "";
  return `${reqLabel}${intervalLabel}`;
}

export interface ConsumptionProps {
  className?: string;
  refreshTrigger?: number;
}

export const Consumption: React.FC<ConsumptionProps> = ({
  className,
  refreshTrigger = 0,
}) => {
  const [quota, setQuota] = useState<OpenRouterQuotaInfo | null>(null);
  const [isLoadingQuota, setIsLoadingQuota] = useState(false);

  const loadQuota = useCallback(async () => {
    setIsLoadingQuota(true);
    try {
      const res = await axios.get<OpenRouterQuotaInfo>("/api/plu/ai-quota", {
        headers: { "Cache-Control": "no-store" },
        validateStatus: () => true,
      });
      const data = res.data;
      if ((res.status < 200 || res.status >= 300) && data?.ok !== false) {
        setQuota({ ok: false, error: `HTTP ${res.status}` });
        return;
      }
      setQuota(data);
    } catch (err) {
      setQuota({
        ok: false,
        error: err instanceof Error ? err.message : "Erreur réseau",
      });
    } finally {
      setIsLoadingQuota(false);
    }
  }, []);

  useEffect(() => {
    loadQuota();
    const timer = window.setInterval(loadQuota, QUOTA_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadQuota]);

  useEffect(() => {
    if (refreshTrigger > 0) {
      loadQuota();
    }
  }, [refreshTrigger, loadQuota]);

  const freeDaily = quota?.freeModelDailyRequests;

  const accountRows = quota?.ok
    ? [
        {
          metric: "is_free_tier",
          value:
            quota.isFreeTier === null || quota.isFreeTier === undefined
              ? "Unavailable"
              : quota.isFreeTier
                ? "true (Palier gratuit)"
                : "false (Compte payant)",
        },
        {
          metric: "usage",
          value: `${formatUsd(quota.usage)}${
            typeof quota.usageDaily === "number"
              ? ` · jour : ${formatUsd(quota.usageDaily)}`
              : ""
          }${
            typeof quota.usageMonthly === "number"
              ? ` · mois : ${formatUsd(quota.usageMonthly)}`
              : ""
          }`,
        },
        {
          metric: "limit",
          value:
            quota.limit === null || quota.limit === undefined
              ? "Aucun plafond (null)"
              : `${formatUsd(quota.limit)} (restant : ${formatUsd(quota.limitRemaining)})`,
        },
        {
          metric: "rate_limit",
          value: `${formatRateLimit(quota)}${
            quota.rateLimit?.note ? ` — ${quota.rateLimit.note}` : ""
          }`,
        },
      ]
    : [];

  const freeDailyRows = quota?.ok
    ? [
        {
          metric: "Requêtes utilisées",
          value:
            typeof freeDaily?.used === "number"
              ? String(freeDaily.used)
              : "Unavailable",
        },
        {
          metric: "Limite quotidienne",
          value:
            typeof freeDaily?.limit === "number"
              ? String(freeDaily.limit)
              : "Unavailable",
        },
        {
          metric: "Quota restant",
          value:
            typeof freeDaily?.remaining === "number"
              ? String(freeDaily.remaining)
              : "Unavailable",
        },
      ]
    : [];

  return (
    <div className={cn("mb-4", className)}>
      <div className="flex flex-col gap-3 rounded bg-[var(--theme-elevation-50)] p-4 text-sm">
        <div className="text-base font-semibold">
          Monitoring OpenRouter
          {quota?.fetchedAt
            ? ` · Maj ${new Date(quota.fetchedAt).toLocaleTimeString("fr-FR")}`
            : ""}
        </div>

        {isLoadingQuota && !quota ? (
          <span>Chargement des métriques OpenRouter...</span>
        ) : quota?.ok ? (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
            <div className="bg-transparent">
              <div className="mb-2 text-sm font-semibold">
                Limites du compte (Account Limits)
              </div>
              <Table className="bg-transparent text-sm">
                <TableHeader>
                  <TableRow className="border-b border-solid border-[var(--theme-elevation-150)] hover:bg-transparent">
                    <TableHead className="h-9 px-3 text-sm text-[var(--theme-elevation-600)]">
                      Métrique
                    </TableHead>
                    <TableHead className="h-9 px-3 text-sm text-[var(--theme-elevation-600)]">
                      Valeur
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accountRows.map((row) => (
                    <TableRow
                      key={row.metric}
                      className="border-b border-solid border-[var(--theme-elevation-150)] hover:bg-[var(--theme-elevation-100)]"
                    >
                      <TableCell className="px-3 py-2.5 font-mono text-sm font-semibold">
                        {row.metric}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-sm">
                        {row.value}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="bg-transparent">
              <div className="mb-2 text-sm font-semibold">
                Quota quotidien modèles gratuits (Free-Model Daily)
              </div>
              <Table className="bg-transparent text-sm">
                <TableHeader>
                  <TableRow className="border-b border-solid border-[var(--theme-elevation-150)] hover:bg-transparent">
                    <TableHead className="h-9 px-3 text-sm text-[var(--theme-elevation-600)]">
                      Métrique
                    </TableHead>
                    <TableHead className="h-9 px-3 text-sm text-[var(--theme-elevation-600)]">
                      Valeur
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {freeDailyRows.map((row) => (
                    <TableRow
                      key={row.metric}
                      className="border-b border-solid border-[var(--theme-elevation-150)] hover:bg-[var(--theme-elevation-100)]"
                    >
                      <TableCell className="px-3 py-2.5 text-sm font-semibold">
                        {row.metric}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-sm">
                        {row.value}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          <div className="text-[var(--theme-error-500)]">
            Quota indisponible{quota?.error ? ` : ${quota.error}` : ""}
          </div>
        )}
      </div>

      <div className="mt-3">
        <Button
          type="button"
          buttonStyle="primary"
          onClick={loadQuota}
          disabled={isLoadingQuota}
        >
          {isLoadingQuota ? "Actualisation..." : "Actualiser quota"}
        </Button>
      </div>
    </div>
  );
};
