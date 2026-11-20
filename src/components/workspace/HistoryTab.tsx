"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderOpen, Loader2, RotateCcw } from "lucide-react";
import { analysisKeys, fetchSnapshots } from "@/api/analyses";
import type { SnapshotRecord } from "@/types/analyses";
import { useDebounce } from "@/hooks/useDebounce";
import { useHistoryColumns } from "@/hooks/useHistoryColumns";
import {
  DataTable,
  DataTableConfig,
  useDataTableState,
} from "@/components/shared/datatable-builder";

export interface HistoryTabProps {
  projectId?: string;
  isReplaying: boolean;
  replayingSnapshotId?: number | string;
  onReopenSnapshot: (snap: SnapshotRecord) => void;
  onReplaySnapshot: (snapshotId: number | string) => void;
}

export function HistoryTab({
  projectId,
  isReplaying,
  replayingSnapshotId,
  onReopenSnapshot,
  onReplaySnapshot,
}: HistoryTabProps) {
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
  } = useDataTableState("workspace-history", {
    order: true,
    sortKey: "createdAt",
    size: 10,
  });

  const debouncedSearch = useDebounce(searchTerm, 300);

  const sort = sortDetails.order
    ? `-${sortDetails.sortKey}`
    : sortDetails.sortKey;

  const queryParams = React.useMemo(
    () => ({
      page,
      limit: size,
      sort,
      search: debouncedSearch,
    }),
    [page, size, sort, debouncedSearch],
  );

  const snapshotsQuery = useQuery({
    queryKey: analysisKeys.snapshots(projectId, queryParams),
    queryFn: () => fetchSnapshots({ projectId, ...queryParams }),
    enabled: Boolean(projectId),
  });

  const snapshots = snapshotsQuery.data?.docs ?? [];
  const totalPageCount = Math.max(1, snapshotsQuery.data?.totalPages ?? 1);

  const context: DataTableConfig<SnapshotRecord> = React.useMemo(
    () => ({
      singularName: "analyse",
      pluralName: "analyses",
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
            actionLabel: "Rouvrir",
            actionIcon: <FolderOpen className="h-3.5 w-3.5" />,
            actionCallback: (snap) => onReopenSnapshot(snap),
          },
          {
            actionLabel: "Rejouer",
            actionIcon: isReplaying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            ),
            actionCallback: (snap) => {
              if (isReplaying && replayingSnapshotId === snap.id) return;
              onReplaySnapshot(snap.id);
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
      onReopenSnapshot,
      onReplaySnapshot,
      isReplaying,
      replayingSnapshotId,
    ],
  );

  const columns = useHistoryColumns(context);

  return (
    <DataTable
      columns={columns}
      data={snapshots}
      context={context}
      isPending={snapshotsQuery.isLoading}
      footerPagination={true}
    />
  );
}
