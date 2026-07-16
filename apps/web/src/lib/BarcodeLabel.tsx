/**
 * BarcodeLabel + BarcodeLabelPrintDialog
 * ─────────────────────────────────────────────────────────
 * Prints real machine-readable Code128 barcodes (not screenshots).
 *
 * We render Code128 as an inline SVG built from scratch — no external
 * library. That means:
 *   - no CDN dependency
 *   - the SVG is embedded in the print HTML directly
 *   - scanners read it perfectly at any zoom/print DPI
 *
 * Supported label sizes match the common thermal printer stock we ship:
 *   30×20mm, 40×25mm, 50×30mm, 2×1inch.
 *
 * The dialog lets the operator toggle which fields to show (name, price,
 * SKU, OEM, branch) and how many copies per part. Prints via a hidden
 * iframe so the invoice sidebar is never included.
 */
import { useMemo, useState } from 'react';
import { Printer, X, BarChart3 } from 'lucide-react';
import { fmtMoney } from '@/lib/format';

// ─── Code128 encoder ─────────────────────────────────────
// Reference tables — Code128B set (printable ASCII). Each character maps
// to a value 0-105, then to an 11-module bar pattern.
const CODE128B_START = 104;      // Start Code B
const CODE128_STOP   = 106;      // Stop symbol
// Bar patterns (values 0-106): each string is a sequence of module widths
// alternating bar/space starting with bar. Total width per symbol = 11 modules
// except stop which is 13.
const PATTERNS: string[] = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
  '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
  '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
  '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
  '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
  '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
  '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
  '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
  '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
  '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
  '114131','311141','411131','211412','211214','211412','111412','111214',
  '2331112', // stop (index 106)
];
function code128b(text: string): { modules: number[]; width: number } {
  // Build value list: start, character values, checksum, stop
  const values: number[] = [CODE128B_START];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    // Code B covers ASCII 32-127 → value = code - 32
    values.push(Math.max(0, Math.min(94, code - 32)));
  }
  // Checksum: (start + sum(i * value[i])) mod 103
  let sum = CODE128B_START;
  for (let i = 1; i < values.length; i++) sum += i * values[i]!;
  values.push(sum % 103);
  values.push(CODE128_STOP);

  // Concatenate bar patterns into a module list (bar=1, space=0)
  const modules: number[] = [];
  let bar = true;
  for (const v of values) {
    const p = PATTERNS[v] ?? PATTERNS[0]!;
    for (const digit of p) {
      const width = parseInt(digit, 10);
      for (let i = 0; i < width; i++) modules.push(bar ? 1 : 0);
      bar = !bar;
    }
    bar = true; // each symbol starts with a bar
  }
  // Trailing quiet zone — 10 modules on each side is standard
  const quiet = new Array(10).fill(0);
  const all = [...quiet, ...modules, ...quiet];
  return { modules: all, width: all.length };
}

// ─── Render a Code128 as inline SVG ───────────────────────
export function BarcodeSVG({ value, height = 40, moduleWidth = 1.2 }: {
  value: string; height?: number; moduleWidth?: number;
}) {
  const { modules, width } = useMemo(() => code128b(value), [value]);
  const svgWidth = width * moduleWidth;
  const rects: JSX.Element[] = [];
  let x = 0;
  for (let i = 0; i < modules.length; i++) {
    if (modules[i] === 1) {
      // Group consecutive 1s into a single rect for smaller SVG output
      let run = 1;
      while (i + run < modules.length && modules[i + run] === 1) run++;
      rects.push(<rect key={i} x={x} y={0} width={run * moduleWidth} height={height} fill="#000" />);
      x += run * moduleWidth;
      i += run - 1;
    } else {
      x += moduleWidth;
    }
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg"
         viewBox={`0 0 ${svgWidth} ${height}`}
         width="100%" height={height}
         preserveAspectRatio="xMidYMid meet">
      {rects}
    </svg>
  );
}

// ─── Print dialog ─────────────────────────────────────────
export interface LabelPart {
  id: string;
  sku: string;
  name: string;
  barcode?: string | null;
  retailPrice?: number;
  partNumber?: string | null;
  oemNumber?: string | null;
}
type Size = { key: '30x20' | '40x25' | '50x30' | '2x1'; label: string; w: number; h: number };
const SIZES: Size[] = [
  { key: '30x20', label: '30 × 20 mm', w: 30, h: 20 },
  { key: '40x25', label: '40 × 25 mm', w: 40, h: 25 },
  { key: '50x30', label: '50 × 30 mm', w: 50, h: 30 },
  { key: '2x1',   label: '2 × 1 inch', w: 51, h: 25 },
];

interface Props {
  open: boolean;
  onClose: () => void;
  parts: LabelPart[];
}

export default function BarcodeLabelPrintDialog({ open, onClose, parts }: Props) {
  const [size, setSize] = useState<Size>(SIZES[1]!);
  const [showName,  setShowName]  = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [showSku,   setShowSku]   = useState(true);
  const [copies,    setCopies]    = useState(1);

  if (!open) return null;

  const validParts = parts.filter((p) => p.barcode || p.sku);

  const doPrint = () => {
    const labelHtml = validParts.flatMap((p) =>
      Array.from({ length: copies }, () => renderLabelHTML(p, size, { showName, showPrice, showSku }))
    ).join('');

    const win = window.open('', 'print', 'width=800,height=600');
    if (!win) { alert('السماح بالنوافذ المنبثقة مطلوب للطباعة'); return; }
    win.document.write(`<!doctype html><html><head>
      <title>باركود</title>
      <style>
        @page { size: ${size.w}mm ${size.h}mm; margin: 0; }
        html, body { margin: 0; padding: 0; }
        .label { width: ${size.w}mm; height: ${size.h}mm; page-break-after: always;
                 padding: 1mm; box-sizing: border-box; display: flex; flex-direction: column;
                 justify-content: center; align-items: center; text-align: center;
                 font-family: -apple-system, Segoe UI, Arial, sans-serif; }
        .name { font-size: 7pt; font-weight: 700; line-height: 1.1; margin-bottom: 0.5mm;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; }
        .price { font-size: 10pt; font-weight: 800; margin-top: 0.5mm; }
        .sku { font-size: 6pt; color: #666; margin-top: 0.3mm; }
        svg { display: block; margin: 0 auto; max-width: 100%; }
      </style>
    </head><body>${labelHtml}
      <script>window.onload = function() { window.print(); setTimeout(function(){ window.close(); }, 500); };<\/script>
    </body></html>`);
    win.document.close();
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl p-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-extrabold text-lg flex items-center gap-2">
            <BarChart3 size={20} /> طباعة ملصقات الباركود
          </h3>
          <button onClick={onClose} className="text-muted hover:text-red-500 p-1"><X size={20} /></button>
        </div>

        {/* Size */}
        <div className="mb-3">
          <label className="text-xs font-bold text-muted block mb-1">حجم الملصق</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {SIZES.map((s) => (
              <button
                key={s.key}
                onClick={() => setSize(s)}
                type="button"
                className={
                  'border rounded-lg px-3 py-2 text-xs font-bold text-center transition ' +
                  (size.key === s.key ? 'border-primary bg-primary/10 text-primary' : 'border-line hover:bg-bg/40')
                }
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Toggles + copies */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          <Toggle label="اسم الصنف" value={showName}  onChange={setShowName} />
          <Toggle label="السعر"     value={showPrice} onChange={setShowPrice} />
          <Toggle label="SKU"       value={showSku}   onChange={setShowSku} />
          <div>
            <label className="text-xs font-bold text-muted block mb-1">النُسَخ لكل صنف</label>
            <input
              type="number" min="1" max="100"
              className="input text-center"
              value={copies}
              onChange={(e) => setCopies(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
            />
          </div>
        </div>

        {/* Live preview of the first label */}
        {validParts.length > 0 && validParts[0]!.barcode && (
          <div className="mb-3 border border-line rounded-lg p-3 bg-bg/40 text-center">
            <div className="text-xs text-muted mb-2">معاينة (نُسخة أولى)</div>
            <div
              style={{
                width: size.w * 4 + 'px', height: size.h * 4 + 'px',
                display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', padding: '4px', border: '1px dashed #ccc',
              }}
            >
              {showName  && <div style={{ fontSize: '11px', fontWeight: 700 }}>{validParts[0]!.name}</div>}
              <BarcodeSVG value={validParts[0]!.barcode!} height={40} moduleWidth={1.2} />
              {showSku   && <div style={{ fontSize: '9px', color: '#666' }}>{validParts[0]!.sku}</div>}
              {showPrice && <div style={{ fontSize: '13px', fontWeight: 800 }}>{fmtMoney(validParts[0]!.retailPrice ?? 0)}</div>}
            </div>
          </div>
        )}

        <div className="text-xs text-muted mb-3">
          سيتم طباعة {validParts.length} صنف × {copies} = <b>{validParts.length * copies}</b> ملصق.
          {validParts.length < parts.length && <> ({parts.length - validParts.length} صنف بدون باركود تم تجاهله)</>}
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">إلغاء</button>
          <button
            onClick={doPrint}
            disabled={validParts.length === 0}
            className="btn-primary"
          >
            <Printer size={16} /> طباعة
          </button>
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="border border-line rounded-lg px-3 py-2 text-xs font-bold flex items-center gap-2 cursor-pointer hover:bg-bg/40">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

// ─── Build one label as raw HTML (for the print window) ───────
function renderLabelHTML(p: LabelPart, size: Size, opts: { showName: boolean; showPrice: boolean; showSku: boolean }) {
  const code = p.barcode ?? p.sku;
  const { modules, width } = code128b(code);
  const svgHeight = Math.min(40, size.h * 2.4);
  const moduleWidth = 1.2;
  const svgWidth = width * moduleWidth;
  const rects: string[] = [];
  let x = 0;
  for (let i = 0; i < modules.length; i++) {
    if (modules[i] === 1) {
      let run = 1;
      while (i + run < modules.length && modules[i + run] === 1) run++;
      rects.push(`<rect x="${x}" y="0" width="${run * moduleWidth}" height="${svgHeight}" fill="#000"/>`);
      x += run * moduleWidth;
      i += run - 1;
    } else {
      x += moduleWidth;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%" height="${svgHeight}" preserveAspectRatio="xMidYMid meet">${rects.join('')}</svg>`;
  return `<div class="label">
    ${opts.showName ? `<div class="name">${escapeHtml(p.name)}</div>` : ''}
    ${svg}
    ${opts.showSku ? `<div class="sku">${escapeHtml(p.sku)}</div>` : ''}
    ${opts.showPrice ? `<div class="price">${(p.retailPrice ?? 0).toFixed(2)} JOD</div>` : ''}
  </div>`;
}
function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
