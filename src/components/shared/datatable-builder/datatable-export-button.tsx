"use client";

import React from "react";
import { Table } from "@tanstack/react-table";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { DataTableConfig } from "./types";
import { buildExportRows, downloadExcel } from "./export-to-excel";

interface DataTableExportButtonProps<TData> {
  table: Table<TData>;
  data: TData[];
  context: DataTableConfig<TData>;
}

export function DataTableExportButton<TData>({
  table,
  data,
  context,
}: DataTableExportButtonProps<TData>) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [open, setOpen] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);

  const exportConfig = context.exportConfig;
  if (!exportConfig?.enabled) return null;

  const handleExport = async (scope: "currentPage" | "all") => {
    setIsExporting(true);
    try {
      const rows =
        scope === "currentPage" ? data : await exportConfig.fetchAll?.();
      if (!rows?.length) {
        toast.error("Aucune donnée à exporter");
        return;
      }

      const exportRows = buildExportRows(table, rows);
      downloadExcel(exportRows, exportConfig.filename);
      setOpen(false);
      toast.success("Exportation réussie");
    } catch {
      toast.error("Erreur lors de l'exportation");
    } finally {
      setIsExporting(false);
    }
  };

  const content = (
    <div className="flex flex-col gap-3">
      <Button
        variant="outline"
        disabled={isExporting || !data.length}
        onClick={() => handleExport("currentPage")}
      >
        {isExporting ? <Spinner /> : "Page actuelle"}
      </Button>
      <Button
        variant="outline"
        disabled={isExporting || !exportConfig.fetchAll}
        onClick={() => handleExport("all")}
      >
        {isExporting ? <Spinner /> : "Toutes les données"}
      </Button>
    </div>
  );

  return (
    <>
      <Button size="icon" variant="outline" onClick={() => setOpen(true)}>
        <FileSpreadsheet className="h-4 w-4" />
      </Button>
      {isDesktop ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="w-[400px]">
            <DialogHeader>
              <DialogTitle>Exporter les données</DialogTitle>
              <DialogDescription>
                Choisissez la portée de l&apos;exportation Excel.
              </DialogDescription>
            </DialogHeader>
            {content}
          </DialogContent>
        </Dialog>
      ) : (
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent className="px-4 pb-6">
            <DrawerHeader>
              <DrawerTitle>Exporter les données</DrawerTitle>
              <DrawerDescription>
                Choisissez la portée de l&apos;exportation Excel.
              </DrawerDescription>
            </DrawerHeader>
            {content}
          </DrawerContent>
        </Drawer>
      )}
    </>
  );
}
