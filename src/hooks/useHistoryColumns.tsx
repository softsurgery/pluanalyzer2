"use client";

import React from "react";
import { ColumnDef } from "@tanstack/react-table";
import type { SnapshotRecord } from "@/types/analyses";
import {
  DataTableCell,
  DataTableCellVariant,
  DataTableColumnHeader,
  DataTableConfig,
  DataTableRowActions,
} from "@/components/shared/datatable-builder";

function getSnapshotLocation(snap: SnapshotRecord): string {
  const geoLabel = snap.geocodingResult?.label;
  if (typeof geoLabel === "string" && geoLabel.trim()) {
    return geoLabel;
  }
  if (snap.addressQuery?.trim()) {
    return snap.addressQuery;
  }
  const commune = snap.cadastralReferences?.commune;
  if (typeof commune === "string" && commune.trim()) {
    return commune;
  }
  return "—";
}

function getSnapshotCadastre(snap: SnapshotRecord): string {
  const cadastre = snap.cadastralReferences;
  if (!cadastre) return "—";
  const idu = typeof cadastre.idu === "string" ? cadastre.idu : "";
  if (idu) return idu;
  const section =
    typeof cadastre.section === "string" ? cadastre.section : "";
  const numero = typeof cadastre.numero === "string" ? cadastre.numero : "";
  if (section && numero) return `${section} ${numero}`;
  return section || numero || "—";
}

export function useHistoryColumns(
  context: DataTableConfig<SnapshotRecord>,
): ColumnDef<SnapshotRecord>[] {
  return React.useMemo(
    () => [
      {
        accessorKey: "addressQuery",
        meta: { title: "Localisation" },
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Localisation"
            attribute="addressQuery"
            context={context}
          />
        ),
        cell: ({ row }) => (
          <span className="font-medium text-foreground">
            {getSnapshotLocation(row.original)}
          </span>
        ),
      },
      {
        id: "cadastre",
        enableSorting: false,
        meta: { title: "Cadastre" },
        header: "Cadastre",
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {getSnapshotCadastre(row.original)}
          </span>
        ),
      },
      {
        accessorKey: "createdAt",
        meta: { title: "Date et heure" },
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Date et heure"
            attribute="createdAt"
            context={context}
          />
        ),
        cell: ({ row }) => (
          <DataTableCell
            variant={DataTableCellVariant.DATE_TIME}
            value={row.original.createdAt}
            className="text-xs"
          />
        ),
      },
      {
        id: "actions",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => <DataTableRowActions row={row} context={context} />,
      },
    ],
    [context],
  );
}
