/**
 * Print library — generates self-contained HTML, drops it into a hidden iframe,
 * and triggers the browser print dialog.
 *
 * Why iframe instead of @media print + window.print()?
 *   - The app uses Tailwind RTL + complex layouts. Trying to bend the live DOM
 *     into print-friendly shape (hiding sidebar/header, resetting widths,
 *     fixing colors, splitting tables) leads to fragile CSS war and inconsistent
 *     results across browsers.
 *   - An iframe gives us a clean document with our own CSS — pixel-perfect,
 *     deterministic, and identical in every browser.
 *   - Also lets us produce thermal 80mm / 58mm receipts that have nothing to
 *     do with the on-screen layout.
 */

import { fmtDate, fmtMoney } from './format';

export type PaperSize     = 'A4' | 'A5' | '80mm' | '58mm';
export type Orientation   = 'portrait' | 'landscape';

export interface PrintColumn<T = any> {
  /** Property path on the row object, or pass a custom render function. */
  key:     string;
  /** Column header (Arabic) — shown both on screen and in the print header. */
  label:   string;
  /** Optional formatter. Receives the cell value AND the whole row. */
  format?: (value: any, row: T) => string | number;
  /** Right-align numbers; defaults to false (text). */
  number?: boolean;
  /** Hide from print by default (still selectable). */
  hideInPrint?: boolean;
  /** Optional explicit width like '120px' or '20%'. */
  width?:  string;
}

export interface PrintBranding {
  companyName:  string;
  branchName?:  string | null;
  address?:     string | null;
  phone?:       string | null;
  taxNumber?:   string | null;
  logoUrl?:     string | null;
  footerText?:  string | null;  // override default footer
  colorPrimary?: string;
}

export interface PrintOptions {
  paperSize:        PaperSize;
  orientation:      Orientation;
  showLogo:         boolean;
  showDate:         boolean;
  showUser:         boolean;
  showPageNumber:   boolean;
  blackAndWhite:    boolean;
  showSignature:    boolean;
}

export const DEFAULT_OPTIONS: PrintOptions = {
  paperSize:      'A4',
  orientation:    'portrait',
  showLogo:       true,
  showDate:       true,
  showUser:       true,
  showPageNumber: true,
  blackAndWhite:  false,
  showSignature:  false,
};

export interface PrintDocumentInput<T = any> {
  title:     string;          // Report name (also used as <title>)
  subtitle?: string;          // e.g. filter summary
  user:      string;          // who printed (full name)
  branding:  PrintBranding;
  options:   PrintOptions;
  columns:   PrintColumn<T>[];
  rows:      T[];
  /** Optional summary KPIs rendered above the table. */
  summary?:  Array<{ label: string; value: string | number }>;
  /** Free-text notes (Arabic), shown at the bottom right above footer. */
  notes?:    string;
}

// ---------- helpers ----------

const esc = (s: any): string => {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const getCell = (row: any, col: PrintColumn): string => {
  const raw = col.key.split('.').reduce<any>((acc, k) => acc?.[k], row);
  const v   = col.format ? col.format(raw, row) : raw;
  if (v === null || v === undefined || v === '') return '—';
  return esc(v);
};

const pageSizeCss = (opt: PrintOptions): string => {
  switch (opt.paperSize) {
    case 'A4':
      return `@page { size: A4 ${opt.orientation}; margin: 14mm 12mm 18mm 12mm; }`;
    case 'A5':
      return `@page { size: A5 ${opt.orientation}; margin: 10mm 10mm 14mm 10mm; }`;
    case '80mm':
      return `@page { size: 80mm auto; margin: 4mm 3mm; }`;
    case '58mm':
      return `@page { size: 58mm auto; margin: 3mm 2mm; }`;
  }
};

const isThermal = (opt: PrintOptions) => opt.paperSize === '80mm' || opt.paperSize === '58mm';

// ---------- HTML builders ----------

const buildHeader = (input: PrintDocumentInput, now: Date): string => {
  const { branding, options, title, subtitle } = input;
  if (isThermal(options)) {
    return `
      <div class="thermal-header">
        ${options.showLogo && branding.logoUrl ? `<img src="${esc(branding.logoUrl)}" alt="logo" class="thermal-logo" />` : ''}
        <div class="thermal-co">${esc(branding.companyName)}</div>
        ${branding.branchName ? `<div class="thermal-sub">${esc(branding.branchName)}</div>` : ''}
        ${branding.phone      ? `<div class="thermal-sub">${esc(branding.phone)}</div>`      : ''}
        ${branding.taxNumber  ? `<div class="thermal-sub">رقم ضريبي: ${esc(branding.taxNumber)}</div>` : ''}
        <div class="thermal-rule"></div>
        <div class="thermal-title">${esc(title)}</div>
        ${subtitle ? `<div class="thermal-sub">${esc(subtitle)}</div>` : ''}
      </div>
    `;
  }
  return `
    <div class="header">
      <div class="header-left">
        ${options.showLogo && branding.logoUrl
          ? `<img src="${esc(branding.logoUrl)}" alt="logo" class="logo" />`
          : `<div class="logo-fallback">${esc((branding.companyName || 'ق').slice(0, 1))}</div>`}
      </div>
      <div class="header-right">
        <div class="co-name">${esc(branding.companyName || '—')}</div>
        ${branding.branchName ? `<div class="co-meta">الفرع: ${esc(branding.branchName)}</div>` : ''}
        ${branding.address    ? `<div class="co-meta">${esc(branding.address)}</div>`           : ''}
        <div class="co-meta">
          ${branding.phone     ? `هاتف: ${esc(branding.phone)} • ` : ''}
          ${branding.taxNumber ? `ضريبي: ${esc(branding.taxNumber)}` : ''}
        </div>
      </div>
    </div>
    <div class="title-row">
      <h1>${esc(title)}</h1>
      ${subtitle ? `<div class="subtitle">${esc(subtitle)}</div>` : ''}
      ${options.showDate
        ? `<div class="meta">طُبع في: ${esc(fmtDate(now))} — ${esc(now.toLocaleTimeString('ar-JO'))}${
            options.showUser ? ` — بواسطة: ${esc(input.user)}` : ''}</div>`
        : ''}
    </div>
  `;
};

const buildSummary = (input: PrintDocumentInput): string => {
  if (!input.summary || input.summary.length === 0) return '';
  if (isThermal(input.options)) {
    return `
      <div class="thermal-summary">
        ${input.summary.map((s) => `
          <div class="thermal-summary-row">
            <span>${esc(s.label)}:</span>
            <span>${esc(s.value)}</span>
          </div>
        `).join('')}
        <div class="thermal-rule"></div>
      </div>
    `;
  }
  return `
    <div class="summary">
      ${input.summary.map((s) => `
        <div class="summary-card">
          <div class="summary-label">${esc(s.label)}</div>
          <div class="summary-value">${esc(s.value)}</div>
        </div>
      `).join('')}
    </div>
  `;
};

const buildTable = (input: PrintDocumentInput): string => {
  const cols = input.columns.filter((c) => !c.hideInPrint);
  if (isThermal(input.options)) {
    // Thermal receipts use a stacked compact list rather than a wide table
    return `
      <div class="thermal-rows">
        ${input.rows.map((row, i) => `
          <div class="thermal-row">
            ${cols.map((c) => `
              <div class="thermal-cell">
                <span class="thermal-cell-label">${esc(c.label)}:</span>
                <span class="thermal-cell-value">${getCell(row, c)}</span>
              </div>
            `).join('')}
            ${i < input.rows.length - 1 ? '<div class="thermal-rule-thin"></div>' : ''}
          </div>
        `).join('')}
      </div>
    `;
  }
  return `
    <table class="data">
      <thead>
        <tr>
          ${cols.map((c) => `<th style="${c.width ? `width:${c.width};` : ''}${c.number ? 'text-align:end;' : ''}">${esc(c.label)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${input.rows.length === 0
          ? `<tr><td colspan="${cols.length}" class="empty">لا توجد بيانات للطباعة</td></tr>`
          : input.rows.map((row) => `
              <tr>
                ${cols.map((c) => `<td${c.number ? ' class="num"' : ''}>${getCell(row, c)}</td>`).join('')}
              </tr>
            `).join('')}
      </tbody>
    </table>
  `;
};

const buildFooter = (input: PrintDocumentInput): string => {
  const { branding, options } = input;
  const footerText = branding.footerText ?? 'تم إنشاء هذا التقرير بواسطة نظام قِطَعتي — AutoParts Cloud';
  if (isThermal(options)) {
    return `
      <div class="thermal-footer">
        <div class="thermal-rule"></div>
        ${input.notes ? `<div class="thermal-notes">${esc(input.notes)}</div>` : ''}
        <div class="thermal-thanks">${esc(footerText)}</div>
        ${options.showSignature ? `<div class="thermal-sign">التوقيع: ____________</div>` : ''}
      </div>
    `;
  }
  return `
    <div class="footer-block">
      ${input.notes      ? `<div class="notes">ملاحظات: ${esc(input.notes)}</div>` : ''}
      ${options.showSignature ? `<div class="signature">التوقيع: __________________</div>` : ''}
    </div>
    <div class="page-footer">
      <span>${esc(footerText)}</span>
      ${options.showPageNumber ? '<span class="page-num"></span>' : ''}
    </div>
  `;
};

const CSS = (opt: PrintOptions): string => {
  const thermal = isThermal(opt);
  const fontSize = opt.paperSize === '58mm' ? '10px' : opt.paperSize === '80mm' ? '11px' : '12px';
  const bw = opt.blackAndWhite;
  return `
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      direction: rtl;
      font-family: 'Cairo', 'Tajawal', 'Segoe UI', 'Tahoma', sans-serif;
      font-size: ${fontSize};
      color: ${bw ? '#000' : '#111827'};
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    ${pageSizeCss(opt)}

    /* ===== A4 / A5 ===== */
    .header {
      display: flex; align-items: center; gap: 12px;
      border-bottom: 2px solid ${bw ? '#000' : '#1E5F74'};
      padding-bottom: 8px; margin-bottom: 10px;
    }
    .header-left { flex: 0 0 70px; text-align: start; }
    .header-right { flex: 1; text-align: end; }
    .logo { max-height: 64px; max-width: 64px; }
    .logo-fallback {
      width: 56px; height: 56px; border-radius: 12px;
      background: ${bw ? '#000' : '#FF7A00'}; color: #fff;
      display: grid; place-items: center; font-weight: 800; font-size: 24px;
    }
    .co-name { font-size: 16px; font-weight: 800; }
    .co-meta { font-size: 10.5px; color: ${bw ? '#000' : '#475569'}; margin-top: 2px; }
    .title-row { margin: 8px 0 12px; }
    .title-row h1 {
      margin: 0; font-size: 16px; font-weight: 800;
      color: ${bw ? '#000' : '#1E5F74'};
    }
    .subtitle { font-size: 11px; color: ${bw ? '#000' : '#64748b'}; margin-top: 2px; }
    .meta { font-size: 10.5px; color: ${bw ? '#000' : '#64748b'}; margin-top: 4px; }

    .summary {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
      gap: 6px; margin-bottom: 10px;
    }
    .summary-card {
      border: 1px solid ${bw ? '#000' : '#e2e8f0'};
      border-radius: 6px; padding: 6px 8px; text-align: center;
    }
    .summary-label { font-size: 9.5px; color: ${bw ? '#000' : '#64748b'}; }
    .summary-value { font-size: 13px; font-weight: 800; margin-top: 2px; }

    table.data {
      width: 100%; border-collapse: collapse; font-size: ${fontSize};
      page-break-inside: auto;
    }
    table.data thead {
      display: table-header-group; /* repeat header on each page */
    }
    table.data tbody { page-break-inside: auto; }
    table.data tr {
      page-break-inside: avoid; page-break-after: auto;
    }
    table.data th {
      background: ${bw ? '#fff' : '#f1f5f9'};
      color: ${bw ? '#000' : '#0f172a'};
      font-weight: 800; text-align: start; padding: 6px 8px;
      border-bottom: 2px solid ${bw ? '#000' : '#cbd5e1'};
    }
    table.data td {
      padding: 6px 8px;
      border-bottom: 1px solid ${bw ? '#000' : '#e2e8f0'};
      vertical-align: middle;
    }
    table.data td.num { text-align: end; font-variant-numeric: tabular-nums; }
    table.data .empty {
      text-align: center; padding: 24px; color: ${bw ? '#000' : '#64748b'};
    }

    .footer-block {
      margin-top: 14px; padding-top: 6px;
      border-top: 1px dashed ${bw ? '#000' : '#cbd5e1'};
      font-size: 10.5px;
    }
    .notes { color: ${bw ? '#000' : '#475569'}; }
    .signature { margin-top: 28px; text-align: start; font-weight: 700; }
    .page-footer {
      position: fixed; bottom: 4mm; left: 12mm; right: 12mm;
      display: flex; justify-content: space-between;
      font-size: 9.5px; color: ${bw ? '#000' : '#64748b'};
      border-top: 1px solid ${bw ? '#000' : '#e2e8f0'};
      padding-top: 3px;
    }

    /* ===== Thermal 80mm / 58mm ===== */
    .thermal-header { text-align: center; }
    .thermal-logo { max-height: 40px; margin-bottom: 4px; }
    .thermal-co { font-weight: 800; font-size: 13px; }
    .thermal-sub { font-size: 10px; color: ${bw ? '#000' : '#475569'}; margin-top: 2px; }
    .thermal-rule { border-top: 1px dashed #000; margin: 4px 0; }
    .thermal-rule-thin { border-top: 1px dotted #999; margin: 4px 0; }
    .thermal-title { font-weight: 800; font-size: 11px; margin-top: 4px; }
    .thermal-rows { margin-top: 4px; }
    .thermal-row { padding: 2px 0; }
    .thermal-cell { display: flex; justify-content: space-between; font-size: 10px; }
    .thermal-cell-label { color: ${bw ? '#000' : '#475569'}; }
    .thermal-cell-value { font-weight: 700; text-align: end; }
    .thermal-summary { margin-top: 6px; }
    .thermal-summary-row { display: flex; justify-content: space-between; font-size: 10.5px; padding: 1px 0; }
    .thermal-footer { text-align: center; margin-top: 6px; font-size: 10px; }
    .thermal-notes { text-align: start; margin: 4px 0; }
    .thermal-thanks { font-weight: 700; }
    .thermal-sign { margin-top: 14px; text-align: start; }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page-footer { ${thermal ? 'position: static; border: 0; padding: 0;' : ''} }
    }
  `;
};

// ---------- The single public function ----------

/**
 * Build a complete HTML document for printing.
 * Returns a string — caller decides what to do (iframe.write, preview window,
 * or save to PDF via browser's "Save as PDF" in the print dialog).
 */
export function buildPrintHtml(input: PrintDocumentInput): string {
  const now = new Date();
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>${esc(input.title)}</title>
  <style>${CSS(input.options)}</style>
</head>
<body>
  ${buildHeader(input, now)}
  ${buildSummary(input)}
  ${buildTable(input)}
  ${buildFooter(input)}
</body>
</html>`;
}

/**
 * Open print dialog using a hidden iframe. Cleans up after the dialog closes
 * (or after a 2s grace period if the browser swallows the afterprint event).
 *
 * Caller can pass `mode: 'preview'` to open in a NEW WINDOW instead, so the
 * user can scroll, zoom, and decide whether to print — useful for PDF saving.
 */
export function printDocument(html: string, mode: 'print' | 'preview' = 'print') {
  if (mode === 'preview') {
    // Open in a new TAB (not a popup window).
    //   - `window.open('', '_blank')` without width/height = browser opens a tab
    //   - any size hint makes Chrome treat it as a popup and block it by default
    // We also write via Blob URL: faster, avoids the "about:blank" flash, and
    // sidesteps Chrome's same-origin restrictions on document.write() on cross-
    // origin blank tabs.
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, '_blank');
    if (!win) {
      // very rare — only if user explicitly blocked even tab-opens
      URL.revokeObjectURL(url);
      alert('فشل فتح المعاينة — يرجى السماح للموقع بفتح علامات تبويب جديدة');
      return;
    }
    // free the blob once the new tab has had a chance to load it
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return;
  }

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  document.body.appendChild(iframe);

  const cleanup = () => {
    try { document.body.removeChild(iframe); } catch { /* already removed */ }
  };

  const doc = iframe.contentWindow!.document;
  doc.open(); doc.write(html); doc.close();

  // wait for layout then print
  const triggerPrint = () => {
    try {
      const w = iframe.contentWindow!;
      w.focus();
      w.onafterprint = cleanup;
      w.print();
      // some browsers don't fire afterprint — fallback removal
      setTimeout(cleanup, 60_000);
    } catch (e) {
      cleanup();
      alert('فشل بدء الطباعة');
    }
  };
  // wait a tick so images (logo) start loading
  setTimeout(triggerPrint, 250);
}

/**
 * Convert columns+rows to a 2D array suitable for Excel export.
 * Returns header row first.
 */
export function rowsToMatrix<T>(columns: PrintColumn<T>[], rows: T[]): (string | number)[][] {
  const cols = columns.filter((c) => !c.hideInPrint);
  const out: (string | number)[][] = [cols.map((c) => c.label)];
  for (const r of rows) {
    out.push(cols.map((c) => {
      const raw = c.key.split('.').reduce<any>((acc, k) => acc?.[k], r);
      const v = c.format ? c.format(raw, r) : raw;
      if (v === null || v === undefined) return '';
      // strip currency suffix for cleaner Excel cells (numbers stay numbers)
      const s = String(v);
      const justNum = s.replace(/\s*[د\.أ]+\s*$/u, '').replace(/,/g, '');
      const n = Number(justNum);
      return Number.isFinite(n) && /^[\d.]+$/.test(justNum.trim()) ? n : s;
    }));
  }
  return out;
}

/** Convenience helpers re-exported so pages don't need to import them. */
export { fmtDate, fmtMoney };
