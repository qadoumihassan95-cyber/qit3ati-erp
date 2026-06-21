import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { Plus, Search, FileUp, Pencil, Trash2, Download, AlertCircle, CheckCircle2, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import Modal from '@/components/ui/Modal';
import { fmtMoney, errMsg } from '@/lib/format';
import * as XLSX from 'xlsx';
import PrintBar from '@/components/print/PrintBar';
import type { PrintColumn } from '@/lib/print';
import PartDetailsModal from './PartDetailsModal';
import PartImagesEditor from './PartImagesEditor';
import PartsImportWizard from './PartsImportWizard';

interface Part {
  id: string; sku: string; name: string; nameEn?: string | null;
  partNumber: string | null; oemNumber: string | null; barcode?: string | null;
  manufacturer: string | null; countryOrigin: string | null; unit?: string | null;
  costPrice?: number;
  retailPrice: number; wholesalePrice?: number;
  quantity: number; minStock: number;
  warrantyMonths?: number; taxRate?: number;
  status: 'available' | 'low' | 'out';
  imageUrl?: string | null;
}

interface PartForm {
  sku: string; name: string; nameEn: string;
  partNumber: string; oemNumber: string; barcode: string;
  manufacturer: string; countryOrigin: string; unit: string;
  costPrice: string; retailPrice: string; wholesalePrice: string;
  minStock: string; warrantyMonths: string; taxRate: string;
}

const EMPTY_FORM: PartForm = {
  sku: '', name: '', nameEn: '',
  partNumber: '', oemNumber: '', barcode: '',
  manufacturer: '', countryOrigin: '', unit: 'حبة',
  costPrice: '', retailPrice: '', wholesalePrice: '',
  minStock: '', warrantyMonths: '', taxRate: '16',
};

interface ImportResult {
  total: number; created: number; skipped: number; failed: number;
  details: {
    created: Array<{ row: number; sku: string; name: string }>;
    skipped: Array<{ row: number; sku: string; reason: string }>;
    failed:  Array<{ row: number; sku: string; reason: string }>;
  };
}

export default function PartsPage() {
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'low' | 'out'>('all');
  const branchId = useAuth((s) => s.branchId);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);

  // ---------- list ----------
  const { data, isLoading, isFetching } = useQuery<{ items: Part[]; total: number }>({
    queryKey: ['parts', q, branchId],
    queryFn: async () => (await api.get('/parts', { params: { q, branchId, perPage: 100 } })).data,
  });
  const allItems = data?.items ?? [];
  const items = useMemo(
    () => statusFilter === 'all' ? allItems : allItems.filter((p) => p.status === statusFilter),
    [allItems, statusFilter],
  );

  // ---------- create / edit modal ----------
  const [modalOpen, setModalOpen]   = useState(false);
  const [editing, setEditing]       = useState<Part | null>(null);
  const [form, setForm]             = useState<PartForm>(EMPTY_FORM);
  const [formErr, setFormErr]       = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setFormErr(null); setModalOpen(true); };
  const openEdit   = (p: Part) => {
    setEditing(p);
    setForm({
      sku: p.sku, name: p.name, nameEn: p.nameEn ?? '',
      partNumber: p.partNumber ?? '', oemNumber: p.oemNumber ?? '', barcode: p.barcode ?? '',
      manufacturer: p.manufacturer ?? '', countryOrigin: p.countryOrigin ?? '', unit: p.unit ?? 'حبة',
      costPrice: String(p.costPrice ?? ''), retailPrice: String(p.retailPrice ?? ''), wholesalePrice: String(p.wholesalePrice ?? ''),
      minStock: String(p.minStock ?? ''), warrantyMonths: String(p.warrantyMonths ?? ''), taxRate: String(p.taxRate ?? 16),
    });
    setFormErr(null); setModalOpen(true);
  };

  const validate = (f: PartForm): string | null => {
    if (!f.sku.trim())  return 'الـSKU مطلوب';
    if (f.sku.length > 60)  return 'الـSKU أطول من 60 حرفاً';
    if (!f.name.trim()) return 'اسم الصنف مطلوب';
    if (f.name.length > 200) return 'اسم الصنف أطول من 200 حرف';
    const numFields: Array<[keyof PartForm, string]> = [
      ['costPrice', 'سعر التكلفة'],
      ['retailPrice', 'سعر البيع'],
      ['wholesalePrice', 'سعر الجملة'],
      ['minStock', 'الحدّ الأدنى'],
      ['warrantyMonths', 'مدة الضمان'],
      ['taxRate', 'نسبة الضريبة'],
    ];
    for (const [k, label] of numFields) {
      const v = (f[k] ?? '').toString().trim();
      if (v === '') continue;
      const n = Number(v);
      if (Number.isNaN(n)) return `${label} يجب أن يكون رقماً`;
      if (n < 0) return `${label} لا يمكن أن يكون سالباً`;
    }
    return null;
  };

  const toPayload = (f: PartForm) => {
    const out: Record<string, any> = {
      sku: f.sku.trim(),
      name: f.name.trim(),
    };
    const opt = (k: keyof PartForm) => { const v = (f[k] ?? '').toString().trim(); if (v) out[k] = v; };
    opt('nameEn'); opt('partNumber'); opt('oemNumber'); opt('barcode');
    opt('manufacturer'); opt('countryOrigin'); opt('unit');
    const num = (k: keyof PartForm) => {
      const v = (f[k] ?? '').toString().trim();
      if (v === '') return;
      const n = Number(v);
      if (!Number.isNaN(n)) out[k] = n;
    };
    num('costPrice'); num('retailPrice'); num('wholesalePrice');
    num('minStock'); num('warrantyMonths'); num('taxRate');
    return out;
  };

  const save = async () => {
    setFormErr(null);
    const v = validate(form);
    if (v) { setFormErr(v); return; }
    setSaving(true);
    try {
      const payload = toPayload(form);
      if (editing) await api.put(`/parts/${editing.id}`, payload);
      else         await api.post('/parts', payload);
      await qc.invalidateQueries({ queryKey: ['parts'] });
      setModalOpen(false);
    } catch (e: any) {
      setFormErr(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  // ---------- details modal (opens when user clicks a row) ----------
  // Whole row is clickable. Action buttons (edit/delete) use stopPropagation
  // so they don't trigger the details modal accidentally.
  const [detailsPartId, setDetailsPartId] = useState<string | null>(null);

  // ---------- delete ----------
  const [delTarget, setDelTarget] = useState<Part | null>(null);
  const [delErr, setDelErr]       = useState<string | null>(null);
  const [deleting, setDeleting]   = useState(false);
  const doDelete = async () => {
    if (!delTarget) return;
    setDeleting(true); setDelErr(null);
    try {
      await api.delete(`/parts/${delTarget.id}`);
      await qc.invalidateQueries({ queryKey: ['parts'] });
      setDelTarget(null);
    } catch (e: any) {
      setDelErr(errMsg(e));
    } finally {
      setDeleting(false);
    }
  };

  // ---------- new wizard ----------
  const [wizardOpen, setWizardOpen] = useState(false);

  // ---------- legacy excel import (kept for backwards compatibility, unused via UI) ----------
  const [importOpen, setImportOpen]   = useState(false);
  const [importRows, setImportRows]   = useState<any[]>([]);
  const [importFile, setImportFile]   = useState<string>('');
  const [importErr, setImportErr]     = useState<string | null>(null);
  const [importing, setImporting]     = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const openImport = () => {
    setImportRows([]); setImportFile(''); setImportErr(null); setImportResult(null);
    setSkipDuplicates(true);
    setImportOpen(true);
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImportErr(null); setImportResult(null);
    setImportFile(f.name);
    try {
      const buf  = await f.arrayBuffer();
      const wb   = XLSX.read(buf, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) { setImportErr('الملف فارغ — لا توجد أوراق'); return; }
      const ws = wb.Sheets[sheetName]!;
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '', raw: true });
      if (rows.length === 0) { setImportErr('لا توجد بيانات في الورقة الأولى'); return; }
      if (rows.length > 5000) { setImportErr(`الحدّ الأقصى 5000 صف (الملف يحوي ${rows.length})`); return; }

      // normalize headers — accept Arabic + English aliases
      const map: Record<string, string> = {
        // English (canonical)
        'sku': 'sku', 'name': 'name', 'nameen': 'nameEn',
        'partnumber': 'partNumber', 'part_number': 'partNumber', 'part number': 'partNumber',
        'oem': 'oemNumber', 'oemnumber': 'oemNumber', 'oem_number': 'oemNumber',
        'barcode': 'barcode', 'manufacturer': 'manufacturer', 'brand': 'manufacturer',
        'country': 'countryOrigin', 'countryorigin': 'countryOrigin', 'country_origin': 'countryOrigin',
        'unit': 'unit',
        'cost': 'costPrice', 'costprice': 'costPrice', 'cost_price': 'costPrice',
        'retail': 'retailPrice', 'retailprice': 'retailPrice', 'price': 'retailPrice', 'retail_price': 'retailPrice',
        'wholesale': 'wholesalePrice', 'wholesaleprice': 'wholesalePrice', 'wholesale_price': 'wholesalePrice',
        'minstock': 'minStock', 'min_stock': 'minStock', 'min': 'minStock',
        'warranty': 'warrantyMonths', 'warrantymonths': 'warrantyMonths',
        'tax': 'taxRate', 'taxrate': 'taxRate',
        // Arabic aliases
        'الرمز': 'sku', 'رمز': 'sku', 'كود': 'sku',
        'الاسم': 'name', 'اسم الصنف': 'name', 'الصنف': 'name',
        'الاسم بالإنجليزي': 'nameEn', 'الاسم بالانجليزي': 'nameEn', 'english name': 'nameEn',
        'رقم القطعة': 'partNumber',
        'رقم oem': 'oemNumber',
        'الباركود': 'barcode',
        'المصنّع': 'manufacturer', 'المصنع': 'manufacturer', 'الشركة': 'manufacturer',
        'بلد المنشأ': 'countryOrigin', 'البلد': 'countryOrigin',
        'الوحدة': 'unit',
        'التكلفة': 'costPrice', 'سعر التكلفة': 'costPrice',
        'سعر البيع': 'retailPrice', 'البيع': 'retailPrice',
        'سعر الجملة': 'wholesalePrice', 'الجملة': 'wholesalePrice',
        'الحدّ الأدنى': 'minStock', 'الحد الادنى': 'minStock', 'الحد الأدنى للمخزون': 'minStock',
        'الضمان': 'warrantyMonths', 'مدة الضمان': 'warrantyMonths',
        'الضريبة': 'taxRate', 'نسبة الضريبة': 'taxRate',
      };
      const normalize = (r: Record<string, any>): Record<string, any> => {
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(r)) {
          const key = String(k).trim().toLowerCase();
          const canon = map[key] ?? k;
          out[canon] = v;
        }
        return out;
      };
      setImportRows(rows.map(normalize));
    } catch (e: any) {
      setImportErr(`فشل قراءة الملف: ${e?.message ?? e}`);
    }
  };

  const doImport = async () => {
    if (importRows.length === 0) { setImportErr('اختر ملفاً أوّلاً'); return; }
    setImporting(true); setImportErr(null);
    try {
      const r = await api.post<ImportResult>('/parts/import', {
        rows: importRows,
        skipDuplicates,
      });
      setImportResult(r.data);
      await qc.invalidateQueries({ queryKey: ['parts'] });
    } catch (e: any) {
      setImportErr(errMsg(e));
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const sample = [
      { sku: 'OIL-5W30-4L', name: 'زيت محرك 5W-30 4 لتر', partNumber: '5W-30', oemNumber: '', manufacturer: 'Mobil', countryOrigin: 'الإمارات', unit: 'حبة', costPrice: 15, retailPrice: 22, wholesalePrice: 19, minStock: 5, warrantyMonths: 0, taxRate: 16 },
      { sku: 'BAT-70A',     name: 'بطارية 70 أمبير',       partNumber: 'E44',    oemNumber: '', manufacturer: 'Varta', countryOrigin: 'ألمانيا', unit: 'حبة', costPrice: 40, retailPrice: 55, wholesalePrice: 48, minStock: 2, warrantyMonths: 12, taxRate: 16 },
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'parts');
    XLSX.writeFile(wb, 'parts-template.xlsx');
  };

  // ---------- render ----------
  // ---- print columns ----
  const printCols: PrintColumn<Part>[] = [
    { key: 'sku',          label: 'SKU',          width: '15%' },
    { key: 'name',         label: 'الاسم',         width: '25%' },
    { key: 'partNumber',   label: 'Part Number',  format: (v) => v ?? '—' },
    { key: 'oemNumber',    label: 'OEM',          format: (v) => v ?? '—' },
    { key: 'manufacturer', label: 'المصنّع',       format: (v) => v ?? '—' },
    { key: 'quantity',     label: 'المتوفر',       number: true },
    { key: 'retailPrice',  label: 'سعر البيع',     number: true, format: (v) => fmtMoney(v) },
    { key: 'status',       label: 'الحالة',         format: (v) => v === 'out' ? 'نفدت' : v === 'low' ? 'منخفضة' : 'متوفرة' },
  ];

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
        <h1 className="text-2xl font-extrabold">الأصناف وقطع السيارات</h1>
        <PrintBar
          title="الأصناف وقطع السيارات"
          subtitle={[
            q && `بحث: "${q}"`,
            statusFilter !== 'all' && `الحالة: ${statusFilter === 'out' ? 'نفدت' : statusFilter === 'low' ? 'منخفضة' : 'متوفرة'}`,
          ].filter(Boolean).join(' • ') || undefined}
          columns={printCols}
          rows={items}
          summary={[
            { label: 'إجمالي السجلات', value: items.length },
            { label: 'متوفرة', value: items.filter((p) => p.status === 'available').length },
            { label: 'منخفضة', value: items.filter((p) => p.status === 'low').length },
            { label: 'نفدت',  value: items.filter((p) => p.status === 'out').length },
          ]}
        />
      </div>
      <p className="text-muted text-sm mb-6">
        الكتالوج الكامل — بحث بأي رقم (Part Number / OEM / بديل / باركود)
      </p>

      <div className="card">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
            <input className="input pr-10" placeholder="ابحث بـSKU أو الاسم أو OEM..."
                   value={q} onChange={(e) => setQ(e.target.value)} />
          </div>

          <select className="input max-w-[160px]"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}>
            <option value="all">كل الحالات</option>
            <option value="available">متوفرة</option>
            <option value="low">منخفضة</option>
            <option value="out">نفدت</option>
          </select>

          <button className="btn-primary" onClick={openCreate}>
            <Plus size={16} /> صنف جديد
          </button>
          <button className="btn-ghost" onClick={() => setWizardOpen(true)}>
            <FileUp size={16} /> استيراد متطوّر
          </button>
          <ExportMenu items={items} allItems={allItems} totalCount={data?.total ?? 0} />
        </div>

        <div className="text-xs text-muted mb-2 flex items-center justify-between flex-wrap gap-2">
          <span>
            العدد المعروض: <b>{items.length}</b>
            {data && ` من إجمالي ${data.total}`}
            {isFetching && ' • يحدّث...'}
          </span>
          <span className="text-primary/80">
            💡 انقر على أيّ قطعة لعرض كل تفاصيلها (المخزون، المبيعات، الأرباح، الفواتير...)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="text-right text-muted text-xs font-bold border-b-2 border-line">
                <th className="px-2 py-3 w-14">صورة</th>
                <th className="px-2.5 py-3">الصنف</th>
                <th className="px-2.5 py-3">SKU</th>
                <th className="px-2.5 py-3">Part Number</th>
                <th className="px-2.5 py-3">OEM</th>
                <th className="px-2.5 py-3">المصنّع</th>
                <th className="px-2.5 py-3">المتوفر</th>
                <th className="px-2.5 py-3">سعر البيع</th>
                <th className="px-2.5 py-3">الحالة</th>
                <th className="px-2.5 py-3">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td className="p-8 text-center text-muted" colSpan={10}>جاري التحميل...</td></tr>}
              {!isLoading && items.length === 0 && (
                <tr><td className="p-8 text-center text-muted" colSpan={10}>لا نتائج مطابقة</td></tr>
              )}
              {items.map((p) => (
                <tr key={p.id}
                    onClick={() => setDetailsPartId(p.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailsPartId(p.id); } }}
                    title="انقر لعرض كل تفاصيل القطعة"
                    className="border-b border-line hover:bg-primary/5 cursor-pointer transition focus:outline-none focus:bg-primary/10">
                  <td className="px-2 py-2">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt="" loading="lazy" className="w-10 h-10 rounded object-cover border border-line" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-bg border border-line flex items-center justify-center text-muted">
                        <ImageIcon size={16} />
                      </div>
                    )}
                  </td>
                  <td className="px-2.5 py-3">
                    <div className="font-bold">{p.name}</div>
                    {p.nameEn && <div className="text-xs text-muted">{p.nameEn}</div>}
                    <div className="text-xs text-muted">{p.manufacturer}{p.countryOrigin && ` — ${p.countryOrigin}`}</div>
                  </td>
                  <td className="px-2.5 py-3 font-mono text-xs">{p.sku}</td>
                  <td className="px-2.5 py-3">{p.partNumber ?? '—'}</td>
                  <td className="px-2.5 py-3">{p.oemNumber ?? '—'}</td>
                  <td className="px-2.5 py-3">{p.manufacturer ?? '—'}</td>
                  <td className={'px-2.5 py-3 font-bold ' + (p.quantity < 0 ? 'text-red-600' : '')}>{p.quantity}</td>
                  <td className="px-2.5 py-3 font-bold">{fmtMoney(p.retailPrice)}</td>
                  <td className="px-2.5 py-3">
                    <span className={'pill ' + (p.status === 'out' ? 'pill-red' : p.status === 'low' ? 'pill-amber' : 'pill-green')}>
                      {p.status === 'out' ? 'نفدت' : p.status === 'low' ? 'منخفضة' : 'متوفرة'}
                    </span>
                  </td>
                  <td className="px-2.5 py-3"
                      onClick={(e) => e.stopPropagation()}>
                    {/* stopPropagation so clicks on edit/delete don't also open the details modal */}
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(p)}
                              className="p-2 sm:p-1.5 rounded hover:bg-blue-50 text-blue-600" title="تعديل"
                              aria-label={`تعديل ${p.name}`}>
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => { setDelTarget(p); setDelErr(null); }}
                              className="p-2 sm:p-1.5 rounded hover:bg-red-50 text-red-600" title="حذف"
                              aria-label={`حذف ${p.name}`}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* -------- Create/Edit Modal -------- */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
             title={editing ? `تعديل: ${editing.name}` : 'صنف جديد'} size="lg">
        <form onSubmit={(e) => { e.preventDefault(); save(); }}>
          {formErr && (
            <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <span>{formErr}</span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="SKU *">
              <input className="input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })}
                     placeholder="مثلاً BAT-70A" required maxLength={60} />
            </Field>
            <Field label="اسم الصنف *">
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                     placeholder="مثلاً بطارية 70 أمبير" required maxLength={200} />
            </Field>
            <Field label="الاسم بالإنجليزي">
              <input className="input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
                     placeholder="مثلاً Battery 70Ah" />
            </Field>
            <Field label="Part Number">
              <input className="input" value={form.partNumber} onChange={(e) => setForm({ ...form, partNumber: e.target.value })} />
            </Field>
            <Field label="OEM Number">
              <input className="input" value={form.oemNumber} onChange={(e) => setForm({ ...form, oemNumber: e.target.value })} />
            </Field>
            <Field label="Barcode">
              <input className="input" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
            </Field>
            <Field label="المصنّع">
              <input className="input" value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                     placeholder="Bosch, Varta, NGK..." />
            </Field>
            <Field label="بلد المنشأ">
              <input className="input" value={form.countryOrigin} onChange={(e) => setForm({ ...form, countryOrigin: e.target.value })}
                     placeholder="ألمانيا، اليابان، الصين..." />
            </Field>
            <Field label="الوحدة">
              <select className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                <option>حبة</option><option>علبة</option><option>كرتون</option>
                <option>لتر</option><option>متر</option><option>كغم</option>
              </select>
            </Field>
            <Field label="سعر التكلفة (د.أ)">
              <input className="input" type="number" min="0" step="0.01"
                     value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} />
            </Field>
            <Field label="سعر البيع (د.أ)">
              <input className="input" type="number" min="0" step="0.01"
                     value={form.retailPrice} onChange={(e) => setForm({ ...form, retailPrice: e.target.value })} />
            </Field>
            <Field label="سعر الجملة (د.أ)">
              <input className="input" type="number" min="0" step="0.01"
                     value={form.wholesalePrice} onChange={(e) => setForm({ ...form, wholesalePrice: e.target.value })} />
            </Field>
            <Field label="الحدّ الأدنى للمخزون">
              <input className="input" type="number" min="0" step="1"
                     value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} />
            </Field>
            <Field label="مدة الضمان (شهر)">
              <input className="input" type="number" min="0" step="1"
                     value={form.warrantyMonths} onChange={(e) => setForm({ ...form, warrantyMonths: e.target.value })} />
            </Field>
            <Field label="نسبة الضريبة %">
              <input className="input" type="number" min="0" max="100" step="0.01"
                     value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} />
            </Field>
          </div>

          {/* ─── Part images ─── */}
          <div className="mt-5 pt-4 border-t border-line">
            <div className="flex items-center gap-2 mb-2">
              <ImageIcon size={16} className="text-primary" />
              <h3 className="font-bold text-sm">صور الصنف</h3>
            </div>
            <PartImagesEditor
              partId={editing?.id ?? null}
              onChange={() => qc.invalidateQueries({ queryKey: ['parts'] })}
            />
          </div>

          <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-line">
            <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>إلغاء</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'جاري الحفظ...' : (editing ? 'حفظ التعديلات' : 'إنشاء الصنف')}
            </button>
          </div>
        </form>
      </Modal>

      {/* -------- Part 360° Details (opens when a row is clicked) -------- */}
      <PartDetailsModal
        partId={detailsPartId}
        onClose={() => setDetailsPartId(null)}
        onEdit={(id) => {
          const part = items.find((p) => p.id === id);
          if (part) { setDetailsPartId(null); openEdit(part); }
        }}
        onTransfer={() => {
          // Navigate to /transfers — user can pre-populate the from/to/part there.
          // Deep linking to the new-transfer form is a future improvement.
          setDetailsPartId(null);
          window.location.href = '/transfers';
        }}
      />

      {/* -------- Delete confirm -------- */}
      <Modal open={!!delTarget} onClose={() => !deleting && setDelTarget(null)} title="تأكيد الحذف" size="sm">
        <p className="text-sm mb-3">
          هل أنت متأكّد من حذف <b className="text-red-600">{delTarget?.name}</b>؟
        </p>
        <p className="text-xs text-muted mb-4">
          الحذف ناعم (soft delete) — الصنف يصبح غير مفعّل لكن السجل التاريخي يبقى محفوظاً.
        </p>
        {delErr && (
          <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <span>{delErr}</span>
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <button className="btn-ghost" onClick={() => setDelTarget(null)} disabled={deleting}>إلغاء</button>
          <button className="btn-primary bg-red-600 hover:bg-red-700" onClick={doDelete} disabled={deleting}>
            {deleting ? 'جاري الحذف...' : 'تأكيد الحذف'}
          </button>
        </div>
      </Modal>

      {/* -------- Import Excel -------- */}
      <Modal open={importOpen} onClose={() => !importing && setImportOpen(false)}
             title="استيراد أصناف من Excel" size="lg">
        <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs leading-6">
          الأعمدة المعتمدة (يدعم العربي والإنجليزي):<br />
          <b>إلزامي:</b> sku, name &nbsp; <b>اختياري:</b> nameEn, partNumber, oemNumber, barcode, manufacturer, countryOrigin, unit, costPrice, retailPrice, wholesalePrice, minStock, warrantyMonths, taxRate
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button className="btn-ghost" type="button" onClick={downloadTemplate}>
            <Download size={16} /> تحميل قالب فارغ
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv"
                 onChange={onPickFile}
                 className="hidden" />
          <button className="btn-primary" type="button" onClick={() => fileRef.current?.click()} disabled={importing}>
            <FileUp size={16} /> اختر ملفاً
          </button>
          {importFile && <span className="text-xs text-muted">📄 {importFile} — <b>{importRows.length}</b> صف</span>}
        </div>

        <label className="flex items-center gap-2 text-sm mb-3 cursor-pointer">
          <input type="checkbox" checked={skipDuplicates}
                 onChange={(e) => setSkipDuplicates(e.target.checked)} />
          تخطّي الأصناف المكرّرة (SKU موجود مسبقاً) بدل رفض الاستيراد
        </label>

        {importErr && (
          <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <span>{importErr}</span>
          </div>
        )}

        {importResult && (
          <div className="mb-3 p-3 rounded-lg bg-green-50 border border-green-200 text-sm">
            <div className="flex items-center gap-2 text-green-700 font-bold mb-2">
              <CheckCircle2 size={18} /> اكتمل الاستيراد
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <Stat label="الإجمالي" value={importResult.total} />
              <Stat label="منشأ" value={importResult.created} color="text-green-700" />
              <Stat label="مُتخطّى" value={importResult.skipped} color="text-amber-700" />
              <Stat label="فاشل" value={importResult.failed} color="text-red-700" />
            </div>
            {importResult.failed > 0 && (
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer text-red-700">عرض الفشل ({importResult.failed})</summary>
                <div className="mt-2 max-h-40 overflow-y-auto">
                  {importResult.details.failed.slice(0, 50).map((f, i) => (
                    <div key={i} className="border-b border-line py-1">
                      <span className="font-mono">صف {f.row}</span> — <span className="font-mono">{f.sku || '(فارغ)'}</span> — <span className="text-red-700">{f.reason}</span>
                    </div>
                  ))}
                  {importResult.details.failed.length > 50 && (
                    <div className="text-muted py-1">... + {importResult.details.failed.length - 50} صف آخر</div>
                  )}
                </div>
              </details>
            )}
            {importResult.skipped > 0 && (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-amber-700">عرض المُتخطّى ({importResult.skipped})</summary>
                <div className="mt-2 max-h-40 overflow-y-auto">
                  {importResult.details.skipped.slice(0, 50).map((s, i) => (
                    <div key={i} className="border-b border-line py-1">
                      <span className="font-mono">صف {s.row}</span> — <span className="font-mono">{s.sku}</span> — <span className="text-amber-700">{s.reason}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-line">
          <button className="btn-ghost" onClick={() => setImportOpen(false)} disabled={importing}>
            {importResult ? 'إغلاق' : 'إلغاء'}
          </button>
          {!importResult && (
            <button className="btn-primary" onClick={doImport} disabled={importing || importRows.length === 0}>
              {importing ? 'جاري الاستيراد...' : `استيراد ${importRows.length} صف`}
            </button>
          )}
        </div>
      </Modal>

      {/* -------- New Import Wizard (5 steps) -------- */}
      <PartsImportWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onDone={() => qc.invalidateQueries({ queryKey: ['parts'] })}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
//  Export dropdown — 3 modes
// ─────────────────────────────────────────────────────────────────────
function ExportMenu({ items, allItems, totalCount }: { items: Part[]; allItems: Part[]; totalCount: number }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // close on outside click
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const exportRows = (rows: Part[], format: 'xlsx' | 'csv', filename: string) => {
    const data = rows.map((p) => ({
      sku: p.sku, name: p.name, nameEn: p.nameEn ?? '',
      partNumber: p.partNumber ?? '', oemNumber: p.oemNumber ?? '', barcode: p.barcode ?? '',
      manufacturer: p.manufacturer ?? '', countryOrigin: p.countryOrigin ?? '', unit: p.unit ?? '',
      costPrice: p.costPrice ?? 0, retailPrice: p.retailPrice, wholesalePrice: p.wholesalePrice ?? 0,
      minStock: p.minStock, warrantyMonths: p.warrantyMonths ?? 0, taxRate: p.taxRate ?? 16,
      quantity: p.quantity,
    }));
    if (format === 'csv') {
      const headers = Object.keys(data[0] ?? { sku: '' });
      const lines = [
        headers.join(','),
        ...data.map((row) => headers.map((h) => {
          const v = String((row as any)[h] ?? '');
          return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
        }).join(',')),
      ];
      const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      triggerDl(blob, `${filename}.csv`);
    } else {
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Parts');
      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      triggerDl(new Blob([buf], { type: 'application/octet-stream' }), `${filename}.xlsx`);
    }
    setOpen(false);
  };

  const exportEmptyTemplate = () => {
    const headers = ['sku','name','nameEn','partNumber','oemNumber','barcode','manufacturer','countryOrigin','unit','costPrice','retailPrice','wholesalePrice','minStock','warrantyMonths','taxRate','supplier','branch','quantity','notes'];
    const ws = XLSX.utils.aoa_to_sheet([headers, []]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    triggerDl(new Blob([buf], { type: 'application/octet-stream' }), 'parts-template-empty.xlsx');
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button className="btn-ghost" onClick={() => setOpen((v) => !v)}>
        <Download size={16} /> تصدير
      </button>
      {open && (
        <div className="absolute z-20 mt-1 left-0 sm:right-0 sm:left-auto w-72 bg-white rounded-xl shadow-xl border border-line p-1.5 text-sm">
          <MenuItem
            title="تصدير المعروض (Excel)"
            sub={`${items.length} صف — يحترم الفلتر والبحث الحالي`}
            onClick={() => exportRows(items, 'xlsx', `parts-filtered-${new Date().toISOString().slice(0,10)}`)}
          />
          <MenuItem
            title="تصدير المعروض (CSV)"
            sub={`${items.length} صف`}
            onClick={() => exportRows(items, 'csv', `parts-filtered-${new Date().toISOString().slice(0,10)}`)}
          />
          <div className="h-px bg-line my-1" />
          <MenuItem
            title="تصدير كل الأصناف (Excel)"
            sub={`${allItems.length} من إجمالي ${totalCount}`}
            onClick={() => exportRows(allItems, 'xlsx', `parts-all-${new Date().toISOString().slice(0,10)}`)}
          />
          <MenuItem
            title="تصدير كل الأصناف (CSV)"
            sub={`${allItems.length} من إجمالي ${totalCount}`}
            onClick={() => exportRows(allItems, 'csv', `parts-all-${new Date().toISOString().slice(0,10)}`)}
          />
          <div className="h-px bg-line my-1" />
          <MenuItem
            title="📋 قالب فارغ للاستيراد"
            sub="ملف Excel جاهز للتعبئة"
            onClick={exportEmptyTemplate}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({ title, sub, onClick }: { title: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
            className="w-full text-right p-2 rounded-lg hover:bg-bg transition flex flex-col items-end">
      <span className="font-bold">{title}</span>
      <span className="text-xs text-muted">{sub}</span>
    </button>
  );
}

function triggerDl(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- small presentational helpers ---
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-muted mb-1">{label}</span>
      {children}
    </label>
  );
}
function Stat({ label, value, color = '' }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-white border border-line rounded p-2 text-center">
      <div className="text-muted">{label}</div>
      <div className={'text-lg font-extrabold ' + color}>{value}</div>
    </div>
  );
}
