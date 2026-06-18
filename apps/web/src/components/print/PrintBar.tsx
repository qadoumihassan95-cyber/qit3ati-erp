import { useState } from 'react';
import { Printer, FileSpreadsheet } from 'lucide-react';
import PrintOptionsDialog from './PrintOptionsDialog';
import { useAuth } from '@/hooks/useAuth';
import { buildPrintHtml, printDocument } from '@/lib/print';
import type { PrintColumn, PrintBranding } from '@/lib/print';
import { exportXlsx } from '@/lib/exportXlsx';

interface Props<T> {
  /** Report title (e.g. "الأصناف والقطع") — also used in print header + filename */
  title:    string;
  /** Optional subtitle, e.g. summary of active filters */
  subtitle?: string;
  /** Column definitions */
  columns:  PrintColumn<T>[];
  /** Rows being displayed (post-filter) */
  rows:     T[];
  /** Optional summary KPIs (e.g. totals) to render above the table in print */
  summary?: Array<{ label: string; value: string | number }>;
  /** Free-text notes to print at the bottom (optional) */
  notes?:   string;
  /** Show the Excel export button (default: true) */
  showExcel?: boolean;
  /** Visual size — full bar or compact icons only */
  compact?: boolean;
}

/**
 * Universal print toolbar — drop this into ANY page's header to expose:
 *   🖨️ Print Now   👁️ Preview / PDF   📊 Excel
 *
 * Reads tenant branding from useAuth() automatically.
 */
export default function PrintBar<T>({
  title,
  subtitle,
  columns,
  rows,
  summary,
  notes,
  showExcel = true,
  compact = false,
}: Props<T>) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const user     = useAuth((s) => s.user);
  const branchId = useAuth((s) => s.branchId);

  const branchName =
    user?.branches?.find((b: any) => b.id === branchId)?.name ?? null;

  // TenantSettings already shipped by the auth response.
  const settings = (user as any)?.settings ?? {};

  const branding: PrintBranding = {
    companyName:  settings.legalName    ?? settings.companyName ?? 'قِطَعتي — AutoParts Cloud',
    branchName,
    phone:        settings.phone        ?? null,
    address:      settings.address      ?? null,
    taxNumber:    settings.taxNumber    ?? null,
    logoUrl:      settings.logoUrl      ?? null,
    footerText:   settings.invoiceFooter ?? null,
    colorPrimary: settings.colorPrimary ?? '#1E5F74',
  };

  const handle = (options: any, mode: 'print' | 'preview') => {
    const html = buildPrintHtml({
      title, subtitle,
      user: user?.fullName ?? '—',
      branding, options,
      columns, rows, summary, notes,
    });
    setDialogOpen(false);
    // give the modal a tick to close before opening print dialog
    setTimeout(() => printDocument(html, mode), 100);
  };

  const handleExcel = () => {
    exportXlsx({
      filename: title,
      sheetName: title.slice(0, 30),
      title: `${title}${subtitle ? ` — ${subtitle}` : ''}`,
      columns, rows,
    });
  };

  if (compact) {
    return (
      <>
        <div className="flex items-center gap-1">
          <button onClick={() => setDialogOpen(true)} className="p-1.5 rounded hover:bg-bg text-primary" title="طباعة">
            <Printer size={18} />
          </button>
          {showExcel && (
            <button onClick={handleExcel} className="p-1.5 rounded hover:bg-bg text-emerald-600" title="تصدير Excel">
              <FileSpreadsheet size={18} />
            </button>
          )}
        </div>
        <PrintOptionsDialog
          open={dialogOpen} onClose={() => setDialogOpen(false)}
          onAction={handle} rowCount={rows.length} title={title}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        <button onClick={() => setDialogOpen(true)} className="btn-ghost border border-line" title="طباعة" type="button">
          <Printer size={16} /> طباعة
        </button>
        {showExcel && (
          <button onClick={handleExcel} className="btn-ghost border border-line" title="تصدير Excel" type="button">
            <FileSpreadsheet size={16} /> Excel
          </button>
        )}
      </div>
      <PrintOptionsDialog
        open={dialogOpen} onClose={() => setDialogOpen(false)}
        onAction={handle} rowCount={rows.length} title={title}
      />
    </>
  );
}
