/**
 * Export a list of rows to a styled .xlsx file.
 * Uses the SheetJS library already installed for parts-import.
 */
import * as XLSX from 'xlsx';
import { PrintColumn, rowsToMatrix } from './print';

export interface XlsxExportInput<T> {
  filename: string;            // without extension
  sheetName?: string;
  title?: string;              // optional title row at the top
  columns: PrintColumn<T>[];
  rows: T[];
}

export function exportXlsx<T>({
  filename,
  sheetName = 'Sheet1',
  title,
  columns,
  rows,
}: XlsxExportInput<T>) {
  const matrix = rowsToMatrix(columns, rows);

  // Prepend an optional title row (merged across all columns)
  let aoa: (string | number)[][];
  if (title) {
    const titleRow: (string | number)[] = [title, ...Array(columns.length - 1).fill('')];
    aoa = [titleRow, [], ...matrix];
  } else {
    aoa = matrix;
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Auto-size columns based on max length per column
  const colWidths = columns.map((_, idx) => {
    let max = 8;
    for (const row of aoa) {
      const cell = String(row[idx] ?? '');
      if (cell.length > max) max = Math.min(40, cell.length);
    }
    return { wch: max + 2 };
  });
  ws['!cols'] = colWidths;

  // RTL workbook view (Excel will render right-to-left)
  ws['!sheetViews'] = [{ rightToLeft: true } as any];

  // Merge title across header if provided
  if (title) {
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: columns.length - 1 } } as any];
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 30));
  // Workbook-level RTL view too (some viewers honor this)
  (wb as any).Workbook = { Views: [{ RTL: true }] };

  const safe = filename.replace(/[^\w\-؀-ۿ]+/g, '_').slice(0, 60) || 'export';
  XLSX.writeFile(wb, `${safe}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
