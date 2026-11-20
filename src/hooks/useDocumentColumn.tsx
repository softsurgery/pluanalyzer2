"use client";

import React from "react";
import { ColumnDef } from "@tanstack/react-table";
import { ExternalLink } from "lucide-react";
import { DocumentItem } from "@/types/documents";
import {
  DataTableCell,
  DataTableCellVariant,
  DataTableColumnHeader,
  DataTableConfig,
  DataTableRowActions,
} from "@/components/shared/datatable-builder";

export function useDocumentColumn(
  context: DataTableConfig<DocumentItem>,
): ColumnDef<DocumentItem>[] {
  return React.useMemo(
    () => [
      {
        accessorKey: "title",
        meta: { title: "Document" },
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Document"
            attribute="title"
            context={context}
          />
        ),
        cell: ({ row }) => {
          const doc = row.original;
          const mediaObj =
            doc.media && typeof doc.media === "object" ? doc.media : null;
          const fileName = mediaObj?.filename || doc.filename || null;

          return (
            <div className="flex items-center gap-2 py-1 font-medium">
              <div className="text-foreground">{doc.title}</div>
            </div>
          );
        },
      },
      {
        accessorKey: "filename",
        meta: { title: "Nom du fichier" },
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Nom du fichier"
            attribute="filename"
            context={context}
          />
        ),
        cell: ({ row }) => {
          const doc = row.original;
          const mediaObj =
            doc.media && typeof doc.media === "object" ? doc.media : null;
          const fileName = mediaObj?.filename || doc.filename || null;

          return fileName ? (
            <div className="flex items-center gap-2">
              <span className="text-xs">{fileName}</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          );
        },
      },
      {
        accessorKey: "commune",
        meta: { title: "Commune" },
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Commune"
            attribute="commune"
            context={context}
          />
        ),
        cell: ({ row }) => row.original.commune || "—",
      },
      {
        accessorKey: "codeInsee",
        meta: { title: "INSEE" },
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="INSEE"
            attribute="codeInsee"
            context={context}
          />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.codeInsee || "—"}
          </span>
        ),
      },
      {
        accessorKey: "zoneCode",
        meta: { title: "Zone" },
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Zone"
            attribute="zoneCode"
            context={context}
          />
        ),
        cell: ({ row }) => row.original.zoneCode || "—",
      },
      {
        accessorKey: "pageCount",
        meta: { title: "Pages" },
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Pages"
            attribute="pageCount"
            context={context}
          />
        ),
        cell: ({ row }) => <div>{row.original.pageCount ?? "—"}</div>,
      },
      {
        accessorKey: "updatedAt",
        meta: { title: "Mis à jour" },
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Mis à jour"
            attribute="updatedAt"
            context={context}
          />
        ),
        cell: ({ row }) => (
          <DataTableCell
            variant={DataTableCellVariant.DATE_TIME}
            value={row.original.updatedAt}
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
