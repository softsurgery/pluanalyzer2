import * as XLSX from 'xlsx';
import { Table } from '@tanstack/react-table';
import { getDeepValue } from '@/lib/object';

function formatExportValue(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return value.toLocaleString();
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return JSON.stringify(value);
}

export function buildExportRows<T>(table: Table<T>, rows: T[]): Record<string, unknown>[] {
  const columns = table
    .getVisibleLeafColumns()
    .filter((column) => column.id !== 'actions' && !column.columnDef.meta?.skipExport);

  return rows.map((row) => {
    const exportRow: Record<string, unknown> = {};

    for (const column of columns) {
      const meta = column.columnDef.meta;
      const label = meta?.exportLabel ?? column.id;
      let value: unknown;

      if (meta?.exportValue) {
        value = meta.exportValue(row);
      } else if (meta?.exportKey) {
        value = getDeepValue(row, meta.exportKey);
      } else {
        value = '';
      }

      exportRow[label] = formatExportValue(value);
    }

    return exportRow;
  });
}

export function downloadExcel(rows: Record<string, unknown>[], filename: string): void {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}
