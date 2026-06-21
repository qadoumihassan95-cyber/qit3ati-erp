/**
 * PartsImportWizard
 * ─────────────────────────────────────────────────────────────────
 * 5-step wizard for migrating parts catalogs from any ERP / Excel / CSV
 * into the qit3ati database.
 *
 *   1. File     — pick xlsx/xls/csv from PC or mobile
 *   2. Mapping  — auto-detect headers, let user remap columns
 *   3. Preview  — first 20 rows with validation badges
 *   4. Options  — mode (create/update/upsert), branch, autoCreateSuppliers
 *   5. Result   — full per-row breakdown + downloadable errors.xlsx
 *
 * Templates: 3 styles (full Excel, simple Excel, CSV) downloadable.
 * Field aliases support Arabic, English variants, common ERPs.
 *
 * IMPORTANT: this component never touches other features; it only POSTs
 * to /parts/import and reads /parts (for export) and /branches.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, FileDown, ChevronLeft, ChevronRight, AlertCircle, CheckCircle2, X, Settings, Eye, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/format';
import { useBranches } from '@/hooks/useBranches';

// ─────────────────────────────────────────────────────────────────────
//  Field definitions — what we can import into
// ─────────────────────────────────────────────────────────────────────

type FieldKey =
  | 'sku' | 'name' | 'nameEn'
  | 'partNumber' | 'oemNumber' | 'barcode'
  | 'manufacturer' | 'countryOrigin' | 'unit'
  | 'costPrice' | 'retailPrice' | 'wholesalePrice'
  | 'minStock' | 'warrantyMonths' | 'taxRate'
  | 'supplier' | 'branch' | 'quantity' | 'notes';

interface FieldDef {
  key: FieldKey;
  label: string;
  required?: boolean;
  numeric?: boolean;
  aliases: string[]; // lowercase, no spaces
}

const FIELDS: FieldDef[] = [
  { key: 'sku',            label: 'SKU / الرمز',          required: true,
    aliases: ['sku', 'code', 'itemcode', 'productcode', 'partcode', 'partno', 'partnum', 'الرمز', 'كود', 'رمز', 'كود الصنف', 'رمز المنتج'] },
  { key: 'name',           label: 'اسم الصنف',
    aliases: ['name', 'productname', 'itemname', 'partname', 'description', 'الاسم', 'اسم', 'اسم الصنف', 'وصف', 'المنتج', 'الصنف', 'الوصف'] },
  { key: 'nameEn',         label: 'الاسم بالإنجليزي',
    aliases: ['nameen', 'englishname', 'name_english', 'الاسم بالانجليزي', 'الاسم بالإنجليزي', 'english'] },
  { key: 'partNumber',     label: 'Part Number',
    aliases: ['partnumber', 'part_number', 'pn', 'partno', 'p/n', 'رقم القطعة'] },
  { key: 'oemNumber',      label: 'OEM Number',
    aliases: ['oem', 'oemnumber', 'oem_number', 'رقم oem', 'الرقم الأصلي'] },
  { key: 'barcode',        label: 'Barcode',
    aliases: ['barcode', 'ean', 'upc', 'gtin', 'باركود', 'الباركود'] },
  { key: 'manufacturer',   label: 'المصنّع',
    aliases: ['manufacturer', 'brand', 'maker', 'vendor', 'المصنع', 'المصنّع', 'الصانع', 'العلامة', 'الماركة'] },
  { key: 'countryOrigin',  label: 'بلد المنشأ',
    aliases: ['country', 'countryorigin', 'origin', 'made_in', 'بلد المنشأ', 'بلد', 'المنشأ'] },
  { key: 'unit',           label: 'الوحدة',
    aliases: ['unit', 'uom', 'الوحدة', 'وحدة'] },
  { key: 'costPrice',      label: 'سعر الشراء (التكلفة)',  numeric: true,
    aliases: ['cost', 'costprice', 'cost_price', 'purchaseprice', 'purchase_price', 'buy', 'buyprice', 'سعر الشراء', 'تكلفة', 'سعر التكلفة', 'الكلفة'] },
  { key: 'retailPrice',    label: 'سعر البيع',             numeric: true,
    aliases: ['price', 'retail', 'retailprice', 'sellprice', 'sell_price', 'unitprice', 'unit_price', 'سعر', 'سعر البيع', 'السعر', 'البيع'] },
  { key: 'wholesalePrice', label: 'سعر الجملة',            numeric: true,
    aliases: ['wholesale', 'wholesaleprice', 'wholesale_price', 'سعر الجملة', 'الجملة'] },
  { key: 'minStock',       label: 'الحد الأدنى للمخزون',   numeric: true,
    aliases: ['minstock', 'min_stock', 'reorder', 'reorderpoint', 'minimum', 'الحد الأدنى', 'حد أدنى'] },
  { key: 'warrantyMonths', label: 'مدة الضمان (شهر)',      numeric: true,
    aliases: ['warranty', 'warrantymonths', 'warranty_months', 'الضمان', 'مدة الضمان'] },
  { key: 'taxRate',        label: 'نسبة الضريبة %',        numeric: true,
    aliases: ['tax', 'taxrate', 'vat', 'الضريبة', 'نسبة الضريبة', 'ضريبة'] },
  { key: 'supplier',       label: 'المورد',
    aliases: ['supplier', 'vendor', 'المورد', 'الموزع', 'المزود'] },
  { key: 'branch',         label: 'الفرع',
    aliases: ['branch', 'location', 'store', 'warehouse', 'الفرع', 'المتجر', 'الفروع'] },
  { key: 'quantity',       label: 'الكمية',                numeric: true,
    aliases: ['qty', 'quantity', 'stock', 'onhand', 'on_hand', 'الكمية', 'كمية', 'المخزون', 'المتوفر'] },
  { key: 'notes',          label: 'ملاحظات',
    aliases: ['notes', 'note', 'remark', 'remarks', 'ملاحظات', 'ملاحظة'] },
];

const normalize = (s: string) =>
  String(s ?? '').trim().toLowerCase().replace(/[\s_\-]/g, '');

function autoMap(headers: string[]): Record<string, FieldKey | ''> {
  const result: Record<string, FieldKey | ''> = {};
  for (const h of headers) {
    const n = normalize(h);
    let found: FieldKey | '' = '';
    for (const f of FIELDS) {
      if (f.aliases.some((a) => normalize(a) === n)) { found = f.key; break; }
    }
    result[h] = found;
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────
//  Templates
// ─────────────────────────────────────────────────────────────────────

function downloadTemplate(kind: 'full' | 'simple' | 'csv') {
  if (kind === 'csv') {
    const csv =
      'sku,name,nameEn,partNumber,oemNumber,barcode,manufacturer,countryOrigin,unit,costPrice,retailPrice,wholesalePrice,minStock,warrantyMonths,taxRate,supplier,branch,quantity,notes\n' +
      'BAT-70A,بطارية 70 أمبير,Battery 70Ah,B70,OEM-B70,1234567890123,Varta,ألمانيا,حبة,55,80,75,3,12,16,شركة المورد,الفرع الرئيسي,10,\n';
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    triggerDownload(blob, 'parts-import-template.csv');
    return;
  }
  const headers: Record<'full' | 'simple', string[]> = {
    full:   FIELDS.map((f) => f.key),
    simple: ['sku', 'name', 'manufacturer', 'costPrice', 'retailPrice', 'quantity'],
  };
  const example: Record<string, any> = {
    sku: 'BAT-70A', name: 'بطارية 70 أمبير', nameEn: 'Battery 70Ah',
    partNumber: 'B70', oemNumber: 'OEM-B70', barcode: '1234567890123',
    manufacturer: 'Varta', countryOrigin: 'ألمانيا', unit: 'حبة',
    costPrice: 55, retailPrice: 80, wholesalePrice: 75,
    minStock: 3, warrantyMonths: 12, taxRate: 16,
    supplier: 'شركة المورد', branch: 'الفرع الرئيسي', quantity: 10, notes: '',
  };
  const row: Record<string, any> = {};
  for (const h of headers[kind]) row[h] = example[h];
  const ws = XLSX.utils.json_to_sheet([row], { header: headers[kind] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  const buf = (XLSX as any).write(wb, { bookType: 'xlsx', type: 'array' });
  triggerDownload(new Blob([buf], { type: 'application/octet-stream' }),
    kind === 'full' ? 'parts-template-full.xlsx' : 'parts-template-simple.xlsx');
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─────────────────────────────────────────────────────────────────────
//  Main wizard component
// ─────────────────────────────────────────────────────────────────────

interface ImportResult {
  total: number;
  created: number;
  updated?: number;
  skipped: number;
  failed: number;
  details: {
    created: Array<{ row: number; sku: string; name: string }>;
    updated?: Array<{ row: number; sku: string; name: string }>;
    skipped: Array<{ row: number; sku: string; reason: string }>;
    failed:  Array<{ row: number; sku: string; reason: string }>;
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  onDone?: () => void; // called after a successful import (to refetch parts)
}

type Step = 'file' | 'map' | 'preview' | 'options' | 'result';

export default function PartsImportWizard({ open, onClose, onDone }: Props) {
  const [step, setStep]         = useState<Step>('file');
  const [fileName, setFileName] = useState<string>('');
  const [headers, setHeaders]   = useState<string[]>([]);
  const [rawRows, setRawRows]   = useState<Record<string, any>[]>([]);
  const [mapping, setMapping]   = useState<Record<string, FieldKey | ''>>({});
  const [mode, setMode]         = useState<'create-only' | 'update-existing' | 'upsert'>('create-only');
  const [importBranchId, setImportBranchId] = useState<string>(''); // optional
  const [autoCreateSuppliers, setAutoCreateSuppliers] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult]       = useState<ImportResult | null>(null);
  const [err, setErr]             = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const branchesQ = useBranches();
  const branches = branchesQ.data ?? [];

  // reset everything when closed
  useEffect(() => {
    if (!open) {
      setStep('file');
      setFileName(''); setHeaders([]); setRawRows([]); setMapping({});
      setMode('create-only'); setImportBranchId(''); setAutoCreateSuppliers(false);
      setImporting(false); setResult(null); setErr(null);
    }
  }, [open]);

  if (!open) return null;

  // ──────── Step 1: file pick / parse ────────
  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr(null);
    setFileName(f.name);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) { setErr('الملف فارغ — لا توجد أوراق'); return; }
      const ws = wb.Sheets[sheetName]!;
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '', raw: true });
      if (rows.length === 0) { setErr('لا توجد بيانات في الورقة الأولى'); return; }
      if (rows.length > 5000) { setErr(`الحدّ الأقصى 5000 صف (الملف يحوي ${rows.length})`); return; }

      const cols = Object.keys(rows[0]!);
      setHeaders(cols);
      setRawRows(rows);
      setMapping(autoMap(cols));
      setStep('map');
    } catch (e: any) {
      setErr(`فشل قراءة الملف: ${e?.message ?? 'صيغة غير مدعومة'}`);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // ──────── Computed: mapped rows ────────
  const mappedRows = useMemo(() => {
    return rawRows.map((r) => {
      const out: Record<string, any> = {};
      for (const [src, dest] of Object.entries(mapping)) {
        if (dest && r[src] !== undefined && r[src] !== null && r[src] !== '') {
          out[dest] = r[src];
        }
      }
      return out;
    });
  }, [rawRows, mapping]);

  // ──────── Computed: validation ────────
  const validation = useMemo(() => {
    const seenSku = new Set<string>();
    const issues = mappedRows.map((r, idx) => {
      const errs: string[] = [];
      const sku = String(r.sku ?? '').trim();
      const name = String(r.name ?? '').trim();
      if (!sku) errs.push('SKU فارغ');
      else if (sku.length > 60) errs.push('SKU طويل (>60)');
      else if (seenSku.has(sku)) errs.push('SKU مكرّر في الملف');
      seenSku.add(sku);
      if (!name && mode !== 'update-existing') errs.push('الاسم فارغ');
      for (const f of FIELDS.filter((x) => x.numeric)) {
        const v = r[f.key];
        if (v !== undefined && v !== '' && Number.isNaN(Number(v))) errs.push(`${f.label} ليس رقماً`);
        if (v !== undefined && v !== '' && Number(v) < 0) errs.push(`${f.label} سالب`);
      }
      const br = String(r.branch ?? '').trim().toLowerCase();
      if (br && !branches.some((b: any) => b.name.toLowerCase() === br)) {
        errs.push(`الفرع "${r.branch}" غير معروف`);
      }
      return { idx, errs };
    });
    const errorCount = issues.filter((x) => x.errs.length > 0).length;
    return { issues, errorCount };
  }, [mappedRows, branches, mode]);

  // ──────── Submit ────────
  const doImport = async () => {
    setImporting(true); setErr(null);
    try {
      const r = await api.post('/parts/import', {
        rows: mappedRows,
        mode,
        skipDuplicates: mode === 'create-only',
        branchId: importBranchId || undefined,
        autoCreateSuppliers,
      });
      setResult(r.data);
      setStep('result');
      onDone?.();
    } catch (e: any) {
      setErr(errMsg(e));
    } finally {
      setImporting(false);
    }
  };

  const downloadErrorReport = () => {
    if (!result) return;
    const failed = result.details.failed ?? [];
    if (failed.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(failed);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Errors');
    const buf = (XLSX as any).write(wb, { bookType: 'xlsx', type: 'array' });
    triggerDownload(new Blob([buf], { type: 'application/octet-stream' }), 'import-errors.xlsx');
  };

  // ──────── Render ────────
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="bg-white w-full max-w-5xl rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header with steps */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-line shrink-0">
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold">معالج استيراد الأصناف</h2>
            <p className="text-muted text-xs mt-0.5">من Excel أو CSV أو أي نظام آخر</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink p-1.5 rounded-lg hover:bg-bg"><X size={20} /></button>
        </div>

        <Stepper step={step} />

        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {err && (
            <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{err}</span>
            </div>
          )}

          {step === 'file'    && <StepFile onPick={() => fileRef.current?.click()} />}
          {step === 'map'     && <StepMap headers={headers} mapping={mapping} setMapping={setMapping} sampleRow={rawRows[0] ?? {}} />}
          {step === 'preview' && <StepPreview mappedRows={mappedRows} issues={validation.issues} errorCount={validation.errorCount} />}
          {step === 'options' && (
            <StepOptions
              mode={mode} setMode={setMode}
              branches={branches} importBranchId={importBranchId} setImportBranchId={setImportBranchId}
              autoCreateSuppliers={autoCreateSuppliers} setAutoCreateSuppliers={setAutoCreateSuppliers}
              rowCount={mappedRows.length}
              errorCount={validation.errorCount}
              hasQuantityColumn={Object.values(mapping).includes('quantity')}
            />
          )}
          {step === 'result' && result && <StepResult result={result} onDownloadErrors={downloadErrorReport} />}

          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onPickFile} className="hidden" />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 p-3 sm:p-4 border-t border-line shrink-0">
          <div className="text-xs text-muted truncate">
            {fileName && <span>📂 {fileName} — {rawRows.length} صف</span>}
          </div>
          <div className="flex items-center gap-1.5">
            {step === 'map'     && <button className="btn-ghost" onClick={() => setStep('file')}><ChevronRight size={14} /> رجوع</button>}
            {step === 'preview' && <button className="btn-ghost" onClick={() => setStep('map')}><ChevronRight size={14} /> رجوع</button>}
            {step === 'options' && <button className="btn-ghost" onClick={() => setStep('preview')}><ChevronRight size={14} /> رجوع</button>}

            {step === 'file' && (
              <button className="btn-primary" onClick={() => fileRef.current?.click()}>
                <Upload size={14} /> اختر ملفاً
              </button>
            )}
            {step === 'map' && (
              <button className="btn-primary" onClick={() => setStep('preview')}
                      disabled={!Object.values(mapping).includes('sku')}>
                التالي <ChevronLeft size={14} />
              </button>
            )}
            {step === 'preview' && (
              <button className="btn-primary" onClick={() => setStep('options')}>
                التالي <ChevronLeft size={14} />
              </button>
            )}
            {step === 'options' && (
              <button className="btn-primary" onClick={doImport} disabled={importing}>
                {importing ? <><Loader2 size={14} className="animate-spin" /> جاري الاستيراد...</> : <>تنفيذ الاستيراد <ChevronLeft size={14} /></>}
              </button>
            )}
            {step === 'result' && (
              <button className="btn-primary" onClick={onClose}>إغلاق</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
//  Sub-components
// ─────────────────────────────────────────────────────────────────────

function Stepper({ step }: { step: Step }) {
  const STEPS: Array<{ id: Step; label: string }> = [
    { id: 'file',    label: '1. الملف' },
    { id: 'map',     label: '2. الربط' },
    { id: 'preview', label: '3. المعاينة' },
    { id: 'options', label: '4. الخيارات' },
    { id: 'result',  label: '5. النتيجة' },
  ];
  const activeIdx = STEPS.findIndex((s) => s.id === step);
  return (
    <div className="flex items-center justify-between gap-1 px-4 sm:px-5 py-2.5 bg-bg/70 border-b border-line text-xs">
      {STEPS.map((s, i) => (
        <div key={s.id} className={'flex items-center gap-1 ' + (i === activeIdx ? 'font-bold text-primary' : 'text-muted')}>
          <span className={'w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] ' +
            (i < activeIdx ? 'bg-green-500 text-white' : i === activeIdx ? 'bg-primary text-white' : 'bg-line text-muted')}>
            {i < activeIdx ? '✓' : i + 1}
          </span>
          <span className="hidden sm:inline">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

function StepFile({ onPick }: { onPick: () => void }) {
  return (
    <div className="space-y-4">
      <div className="border-2 border-dashed border-line rounded-xl p-8 text-center bg-bg/40">
        <FileSpreadsheet size={48} className="text-primary mx-auto mb-3" />
        <h3 className="font-extrabold text-base mb-1">ارفع ملف الأصناف</h3>
        <p className="text-muted text-sm mb-4">يدعم Excel (xlsx, xls) و CSV — حتى 5000 صف</p>
        <button onClick={onPick} className="btn-primary mx-auto">
          <Upload size={16} /> اختر الملف
        </button>
      </div>

      <div className="text-sm">
        <h4 className="font-bold mb-2 flex items-center gap-1.5"><FileDown size={16} /> أو حمّل قالباً جاهزاً:</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button className="btn-ghost border border-line" onClick={() => downloadTemplate('full')}>
            📊 Excel كامل (19 حقل)
          </button>
          <button className="btn-ghost border border-line" onClick={() => downloadTemplate('simple')}>
            📋 Excel مبسّط (6 حقول)
          </button>
          <button className="btn-ghost border border-line" onClick={() => downloadTemplate('csv')}>
            📄 CSV نصّي
          </button>
        </div>
      </div>

      <div className="text-xs text-muted bg-bg/50 rounded-lg p-3 leading-6">
        <b>ملاحظات:</b> النظام يكتشف أعمدة الملف تلقائياً ويتعرّف على الأسماء العربية والإنجليزية لأنظمة شائعة
        (QuickBooks, Zoho, Odoo, SAP Business One...). في الخطوة التالية تستطيع تعديل الربط يدوياً.
      </div>
    </div>
  );
}

function StepMap({
  headers, mapping, setMapping, sampleRow,
}: {
  headers: string[]; mapping: Record<string, FieldKey | ''>;
  setMapping: (m: Record<string, FieldKey | ''>) => void;
  sampleRow: Record<string, any>;
}) {
  const usedDestinations = new Set(Object.values(mapping).filter(Boolean));
  return (
    <div className="space-y-3">
      <div className="text-sm">
        <b>اربط أعمدة ملفك</b> مع حقول النظام. الأعمدة التي يتم التعرّف عليها مظلّلة بالأخضر.
        <br /><span className="text-muted text-xs">العمود الإلزامي: SKU. الأعمدة بدون ربط ستُتجاهل.</span>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted text-xs">
            <tr className="border-b-2 border-line text-right">
              <th className="px-3 py-2.5">عمود الملف</th>
              <th className="px-3 py-2.5">عيّنة</th>
              <th className="px-3 py-2.5">حقل النظام</th>
            </tr>
          </thead>
          <tbody>
            {headers.map((h) => {
              const cur = mapping[h] ?? '';
              const recognized = !!cur;
              return (
                <tr key={h} className={'border-b border-line ' + (recognized ? 'bg-green-50/50' : '')}>
                  <td className="px-3 py-2 font-bold">{h}</td>
                  <td className="px-3 py-2 text-muted text-xs truncate max-w-[200px]">
                    {sampleRow[h] !== undefined && sampleRow[h] !== '' ? String(sampleRow[h]).slice(0, 60) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <select className="input py-1.5" value={cur} onChange={(e) => {
                      setMapping({ ...mapping, [h]: e.target.value as any });
                    }}>
                      <option value="">— تجاهل —</option>
                      {FIELDS.map((f) => (
                        <option key={f.key} value={f.key}
                                disabled={cur !== f.key && usedDestinations.has(f.key)}>
                          {f.label}{f.required ? ' *' : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!Object.values(mapping).includes('sku') && (
        <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          ⚠️ يجب ربط عمود واحد على الأقل بـ <b>SKU</b> قبل المتابعة.
        </div>
      )}
    </div>
  );
}

function StepPreview({
  mappedRows, issues, errorCount,
}: {
  mappedRows: Record<string, any>[];
  issues: Array<{ idx: number; errs: string[] }>;
  errorCount: number;
}) {
  const preview = mappedRows.slice(0, 30);
  const issueByIdx = new Map(issues.map((x) => [x.idx, x.errs]));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2 text-sm">
        <div>
          <b>{mappedRows.length}</b> صف جاهز للمعالجة
          {errorCount > 0 ? <span className="text-red-700 font-bold mr-2">• {errorCount} صف فيه أخطاء</span>
                          : <span className="text-green-700 font-bold mr-2">✓ كل الصفوف سليمة</span>}
        </div>
        <span className="text-xs text-muted">يظهر أول 30 صف فقط</span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-xs min-w-[900px]">
          <thead className="text-muted">
            <tr className="border-b-2 border-line text-right">
              <th className="px-2 py-2 w-8">#</th>
              <th className="px-2 py-2">SKU</th>
              <th className="px-2 py-2">الاسم</th>
              <th className="px-2 py-2">المصنع</th>
              <th className="px-2 py-2">سعر الشراء</th>
              <th className="px-2 py-2">سعر البيع</th>
              <th className="px-2 py-2">الكمية</th>
              <th className="px-2 py-2">الفرع</th>
              <th className="px-2 py-2">المورد</th>
              <th className="px-2 py-2">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((r, i) => {
              const errs = issueByIdx.get(i) ?? [];
              return (
                <tr key={i} className={'border-b border-line ' + (errs.length ? 'bg-red-50/40' : '')}>
                  <td className="px-2 py-1.5 text-muted">{i + 1}</td>
                  <td className="px-2 py-1.5 font-mono">{r.sku || '—'}</td>
                  <td className="px-2 py-1.5">{r.name || '—'}</td>
                  <td className="px-2 py-1.5">{r.manufacturer || '—'}</td>
                  <td className="px-2 py-1.5">{r.costPrice ?? '—'}</td>
                  <td className="px-2 py-1.5">{r.retailPrice ?? '—'}</td>
                  <td className="px-2 py-1.5">{r.quantity ?? '—'}</td>
                  <td className="px-2 py-1.5">{r.branch || '—'}</td>
                  <td className="px-2 py-1.5">{r.supplier || '—'}</td>
                  <td className="px-2 py-1.5">
                    {errs.length ? (
                      <span className="pill pill-red" title={errs.join('، ')}>
                        {errs.length} مشكلة
                      </span>
                    ) : <span className="pill pill-green">سليم</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StepOptions({
  mode, setMode, branches, importBranchId, setImportBranchId,
  autoCreateSuppliers, setAutoCreateSuppliers,
  rowCount, errorCount, hasQuantityColumn,
}: {
  mode: 'create-only' | 'update-existing' | 'upsert';
  setMode: (m: any) => void;
  branches: Array<{ id: string; name: string }>;
  importBranchId: string;
  setImportBranchId: (v: string) => void;
  autoCreateSuppliers: boolean;
  setAutoCreateSuppliers: (v: boolean) => void;
  rowCount: number;
  errorCount: number;
  hasQuantityColumn: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="card">
        <h4 className="font-bold mb-2 flex items-center gap-1.5"><Settings size={16} /> سلوك الاستيراد</h4>
        <div className="space-y-2 text-sm">
          {([
            { id: 'create-only',      title: 'إضافة الأصناف الجديدة فقط', desc: 'الأصناف الموجودة (نفس الـSKU) يتم تخطّيها بدون لمس.' },
            { id: 'update-existing',  title: 'تحديث الأصناف الموجودة فقط', desc: 'الأصناف الجديدة يتم تجاهلها، الموجودة يتم تحديثها بالقيم الجديدة.' },
            { id: 'upsert',           title: 'إضافة وتحديث (Upsert)',        desc: 'الجديد يُضاف، والموجود يتم تحديثه. مناسب لمزامنة كاتالوج كامل.' },
          ] as const).map((opt) => (
            <label key={opt.id} className={'flex items-start gap-2 p-2 rounded-lg cursor-pointer hover:bg-bg/50 border ' +
              (mode === opt.id ? 'border-primary bg-primary/5' : 'border-line')}>
              <input type="radio" name="mode" checked={mode === opt.id} onChange={() => setMode(opt.id)} className="mt-1" />
              <div>
                <div className="font-bold">{opt.title}</div>
                <div className="text-xs text-muted">{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {hasQuantityColumn && (
        <div className="card">
          <h4 className="font-bold mb-2">📦 وضع المخزون</h4>
          <label className="block text-xs text-muted mb-1">الفرع الذي ستُضاف فيه الكميات (إذا كان عمود "الفرع" غير مرتبط):</label>
          <select className="input" value={importBranchId} onChange={(e) => setImportBranchId(e.target.value)}>
            <option value="">— لا تُضف مخزون —</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}

      <div className="card">
        <h4 className="font-bold mb-2">🏢 الموردون</h4>
        <label className="flex items-start gap-2 cursor-pointer text-sm">
          <input type="checkbox" checked={autoCreateSuppliers} onChange={(e) => setAutoCreateSuppliers(e.target.checked)} className="mt-1" />
          <div>
            <div className="font-bold">إنشاء الموردين غير الموجودين تلقائياً</div>
            <div className="text-xs text-muted">إذا كان عمود "المورد" يحوي اسماً غير مسجّل في النظام، سيُنشأ سجل مورد جديد بالاسم نفسه.</div>
          </div>
        </label>
      </div>

      <div className="card bg-bg/40">
        <div className="text-sm space-y-1">
          <div className="flex justify-between"><span>عدد الصفوف:</span><b>{rowCount}</b></div>
          <div className="flex justify-between"><span>صفوف فيها مشاكل:</span>
            <b className={errorCount > 0 ? 'text-red-700' : 'text-green-700'}>{errorCount}</b>
          </div>
        </div>
        {errorCount > 0 && (
          <div className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 leading-5">
            ⚠️ الصفوف التي تحوي أخطاء سيتم تجاهلها وستظهر في تقرير الأخطاء.
          </div>
        )}
      </div>
    </div>
  );
}

function StepResult({ result, onDownloadErrors }: { result: ImportResult; onDownloadErrors: () => void }) {
  const u = result.updated ?? 0;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Stat label="إجمالي" value={result.total} color="bg-bg" />
        <Stat label="مُنشأة" value={result.created} color="bg-green-50 text-green-700" />
        <Stat label="مُحدّثة" value={u} color="bg-blue-50 text-blue-700" />
        <Stat label="مُتخطّاة" value={result.skipped} color="bg-amber-50 text-amber-700" />
        <Stat label="فاشلة" value={result.failed} color="bg-red-50 text-red-700" />
      </div>

      {result.failed > 0 && (
        <button className="btn-ghost border border-line" onClick={onDownloadErrors}>
          <FileDown size={14} /> تحميل تقرير الأخطاء (Excel)
        </button>
      )}

      {result.details.failed && result.details.failed.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer text-sm font-bold">عرض تفاصيل الأخطاء ({result.details.failed.length})</summary>
          <div className="mt-2 max-h-60 overflow-y-auto text-xs">
            <table className="w-full">
              <thead><tr className="text-muted text-right border-b border-line">
                <th className="py-1.5 px-2">صف</th><th className="py-1.5 px-2">SKU</th><th className="py-1.5 px-2">السبب</th>
              </tr></thead>
              <tbody>
                {result.details.failed.map((f, i) => (
                  <tr key={i} className="border-b border-line">
                    <td className="py-1 px-2">{f.row}</td>
                    <td className="py-1 px-2 font-mono">{f.sku || '—'}</td>
                    <td className="py-1 px-2 text-red-700">{f.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm flex items-start gap-2">
        <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
        <span>اكتمل الاستيراد. يمكنك إغلاق هذه النافذة الآن.</span>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={'p-3 rounded-lg text-center ' + color}>
      <div className="text-2xl font-extrabold">{value}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}
