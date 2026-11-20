"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink } from "lucide-react";
import { documentKeys, fetchDocuments } from "@/api/documents";
import { DocumentItem } from "@/types/documents";
import { useIntro } from "@/contexts/IntroProvider";
import { useDebounce } from "@/hooks/useDebounce";
import { useDocumentColumn } from "@/hooks/useDocumentColumn";
import {
  DataTable,
  DataTableConfig,
  useDataTableState,
} from "@/components/shared/datatable-builder";

function getDocumentFileInfo(doc: DocumentItem): {
  url: string | null;
  filename: string;
} {
  const mediaObj =
    doc.media && typeof doc.media === "object" ? doc.media : null;
  const url = mediaObj?.url || doc.sourceUrl || null;
  const filename = mediaObj?.filename || doc.filename || `${doc.title}.pdf`;
  return { url, filename };
}

export function DocumentsClient() {
  const {
    page,
    setPage,
    size,
    setSize,
    sortDetails,
    setSortDetails,
    searchTerm,
    setSearchTerm,
    tableReset,
  } = useDataTableState("documents", {
    order: true,
    sortKey: "updatedAt",
    size: 10,
  });

  const debouncedSearch = useDebounce(searchTerm, 300);

  const sort = sortDetails.order
    ? `-${sortDetails.sortKey}`
    : sortDetails.sortKey;

  const documentsQuery = useQuery({
    queryKey: documentKeys.list({
      page,
      limit: size,
      sort,
      search: debouncedSearch,
    }),
    queryFn: () =>
      fetchDocuments({
        page,
        limit: size,
        sort,
        search: debouncedSearch,
      }),
  });

  const documents = documentsQuery.data?.docs ?? [];
  const totalDocs = documentsQuery.data?.totalDocs ?? documents.length;
  const totalPageCount = Math.max(1, documentsQuery.data?.totalPages ?? 1);

  const { setIntro, clearIntro } = useIntro();
  React.useEffect(() => {
    setIntro?.(
      `Documents PLU disponibles (${totalDocs})`,
      "Documents réglementaires stockés et utilisés dans le flux d’analyse",
    );
    return () => {
      clearIntro?.();
    };
  }, [setIntro, clearIntro, totalDocs]);

  const context: DataTableConfig<DocumentItem> = React.useMemo(
    () => ({
      singularName: "document",
      pluralName: "documents",
      page,
      size,
      totalPageCount,
      setPage,
      setSize,
      order: sortDetails.order,
      sortKey: sortDetails.sortKey,
      setSortDetails: (order, sortKey) => {
        setPage(1);
        setSortDetails({ order, sortKey });
      },
      searchTerm,
      setSearchTerm,
      clearFiltersAndSort: tableReset.clearFiltersAndSort,
      hasActiveFiltersOrSort: tableReset.hasActiveFiltersOrSort,
      additionalActions: {
        1: [
          {
            actionLabel: "Ouvrir",
            actionIcon: <ExternalLink className="h-3.5 w-3.5" />,
            isActionVisible: (doc) => Boolean(getDocumentFileInfo(doc).url),
            actionCallback: (doc) => {
              const { url } = getDocumentFileInfo(doc);
              if (url) {
                window.open(url, "_blank", "noopener,noreferrer");
              }
            },
          },
          {
            actionLabel: "Télécharger",
            actionIcon: <Download className="h-3.5 w-3.5" />,
            isActionVisible: (doc) => Boolean(getDocumentFileInfo(doc).url),
            actionCallback: (doc) => {
              const { url, filename } = getDocumentFileInfo(doc);
              if (!url) return;
              const link = document.createElement("a");
              link.href = url;
              link.download = filename;
              link.target = "_blank";
              link.rel = "noreferrer";
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            },
          },
        ],
      },
    }),
    [
      page,
      size,
      totalPageCount,
      setPage,
      setSize,
      sortDetails.order,
      sortDetails.sortKey,
      setSortDetails,
      searchTerm,
      setSearchTerm,
      tableReset.clearFiltersAndSort,
      tableReset.hasActiveFiltersOrSort,
    ],
  );

  const columns = useDocumentColumn(context);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <DataTable
        columns={columns}
        data={documents}
        context={context}
        isPending={documentsQuery.isLoading}
        footerPagination={true}
      />
    </div>
  );
}
