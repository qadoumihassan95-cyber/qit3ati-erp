import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { Plus, Search, AlertCircle, AlertTriangle, RefreshCw, Pencil, Trash2, FileText, History, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import Modal from '@/components/ui/Modal';
import { errMsg, fmtDate } from '@/lib/format';
import PrintBar from '@/components/print/PrintBar';
import type { PrintColumn } from '@/lib/print';

type PaperType =
  | 'shop_license' | 'commercial_reg' | 'profession_license' | 'tax'
  | 'insurance' | 'lease' | 'customs' | 'authorization' | 'other';

type PaperStatus = 'active' | 'expiring_soon' | 'expired' | 'renewal_needed' | 'in_progress';

const TYPE_LABEL: Record<PaperType, string> = {
  shop_license:       'رخصة محل',
  commercial_reg:     'سجل تجاري',
  profession_license: 'رخصة مهن',
  tax:                'ضريبة',
  insurance:          'تأمين',
  lease:              'عقد إيجار',
  customs:            'جمارك',
  authorization:      'تفويض',
  other:              'أخرى',
};

const STATUS_LABEL: Record<PaperStatus, string> = {
  active:         'سارية',
  expiring_soon:  'قاربت على الانتهاء',
  expired:        'منتهية',
  renewal_needed: 'تحتاج تجديد',
  in_progress:    'قيد المعاملة',
};

const STATUS_PILL: Record<PaperStatus, string> = {
  active:         'pill-green',
  expiring_soon:  'pill-amber',
  expired:        'pill-red',
  renewal_needed: 'pill-amber',
  in_progress:    'pill-amber',
};

interface Paper {
  id: string; tenantId: string; branchId: string | null;
  type: PaperType; title: string;
  docNumber: string | null; issuer: string | null;
  issuedAt: string | null; expiresAt: string | null;
  statusOverride: PaperStatus | null;
  liveStatus: PaperStatus;
  daysLeft: number | null;
  notes: string | null; fileUrl: string | null;
  createdAt: string; updatedAt: string;
  branch?: { id: string; name: string } | null;
  creator?: { id: string; fullName: string } | null;
}

interface PaperForm {
  type: PaperType; title: string; docNumber: string; issuer: string;
  issuedAt: string; expiresAt: string; branchId: string;
  notes: string; fileUrl: string;
}
const EMPTY: PaperForm = {
  type: 'shop_license', title: '', docNumber: '', issuer: '',
  issuedAt: '', expiresAt: '', branchId: '', notes: '', fileUrl: '',
};

export default function PapersPage() {
  const qc = useQueryClient();
  const branchesFromAuth = useAuth((s) => s.user?.branches ?? []);

  const [q, setQ]                 = useState('');
  const [typeF, setTypeF]         = useState<'all' | PaperType>('all');
  const [statusF, setStatusF]     = useState<'all' | PaperStatus>('all');
  const [branchF, setBranchF]     = useState<string>('');
  const [expiringIn, setExpIn]    = useState<number | ''>('');

  const params = {
    q, branchId: branchF || undefined,
    type:   typeF   === 'all' ? undefined : typeF,
    status: statusF === 'all' ? undefined : statusF,
    expiringWithinDays: expiringIn === '' ? undefined : Number(expiringIn),
  };

  const { data, isLoading, isFetching } = useQuery<{ items: Paper[]; total: number }>({
    queryKey: ['papers', params],
    queryFn: async () => (await api.get('/papers', { params })).data,
  });
  const items = data?.items ?? [];

  const summary = useMemo(() => {
    const byStatus: Record<PaperStatus, number> = {
      active: 0, expiring_soon: 0, expired: 0, renewal_needed: 0, in_progress: 0,
    };
    items.forEach((p) => { byStatus[p.liveStatus] = (byStatus[p.liveStatus] ?? 0) + 1; });
    return byStatus;
  }, [items]);

  // ---- create / edit ----
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing]     = useState<Paper | null>(null);
  const [form, setForm]           = useState<PaperForm>(EMPTY);
  const [formErr, setFormErr]     = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);
  const openCreate = () => { setEditing(null); setForm(EMPTY); setFormErr(null); setModalOpen(true); };
  const openEdit   = (p: Paper) => {
    setEditing(p);
    setForm({
      type: p.type, title: p.title,
      docNumber: p.docNumber ?? '', issuer: p.issuer ?? '',
      issuedAt:  p.issuedAt  ? p.issuedAt.slice(0, 10)  : '',
      expiresAt: p.expiresAt ? p.expiresAt.slice(0, 10) : '',
      branchId: p.branchId ?? '',
      notes: p.notes ?? '',
      fileUrl: p.fileUrl ?? '',
    });
    setFormErr(null); setModalOpen(true);
  };
  const save = async () => {
    setFormErr(null);
    if (!form.title.trim())    { setFormErr('العنوان مطلوب'); return; }
    if (form.issuedAt && form.expiresAt && form.expiresAt < form.issuedAt) {
      setFormErr('تاريخ الانتهاء قبل تاريخ الإصدار'); return;
    }
    setSaving(true);
    try {
      const payload: any = {
        type: form.type,
        title: form.title.trim(),
        docNumber: form.docNumber.trim() || undefined,
        issuer:    form.issuer.trim()    || undefined,
        issuedAt:  form.issuedAt  || undefined,
        expiresAt: form.expiresAt || undefined,
        branchId:  form.branchId  || undefined,
        notes:     form.notes     || undefined,
        fileUrl:   form.fileUrl   || undefined,
      };
      if (editing) await api.put(`/papers/${editing.id}`, payload);
      else         await api.post('/papers', payload);
      await qc.invalidateQueries({ queryKey: ['papers'] });
      setModalOpen(false);
    } catch (e: any) { setFormErr(errMsg(e)); }
    finally          { setSaving(false); }
  };

  // ---- renew ----
  const [renewing, setRenewing]   = useState<Paper | null>(null);
  const [renewIssued, setRenewIssued] = useState('');
  const [renewExpires, setRenewExpires] = useState('');
  const [renewBusy, setRenewBusy] = useState(false);
  const [renewErr, setRenewErr]   = useState<string | null>(null);
  const openRenew = (p: Paper) => {
    setRenewing(p); setRenewIssued(''); setRenewExpires(''); setRenewErr(null);
  };
  const doRenew = async () => {
    if (!renewing) return;
    if (!renewIssued || !renewExpires) { setRenewErr('الحقلين مطلوبين'); return; }
    if (renewExpires <= renewIssued)   { setRenewErr('تاريخ الانتهاء يجب أن يكون بعد الإصدار'); return; }
    setRenewBusy(true); setRenewErr(null);
    try {
      await api.patch(`/papers/${renewing.id}/renew`, { issuedAt: renewIssued, expiresAt: renewExpires });
      await qc.invalidateQueries({ queryKey: ['papers'] });
      setRenewing(null);
    } catch (e: any) { setRenewErr(errMsg(e)); }
    finally          { setRenewBusy(false); }
  };

  // ---- change-status (manual statuses only) ----
  const setManualStatus = async (p: Paper, status: PaperStatus) => {
    try {
      await api.patch(`/papers/${p.id}/status`, { status });
      await qc.invalidateQueries({ queryKey: ['papers'] });
    } catch (e: any) { alert(errMsg(e)); }
  };

  // ---- delete ----
  const [delTarget, setDelTarget] = useState<Paper | null>(null);
  const [delErr, setDelErr]       = useState<string | null>(null);
  const [delBusy, setDelBusy]     = useState(false);
  const doDelete = async () => {
    if (!delTarget) return;
    setDelBusy(true); setDelErr(null);
    try {
      await api.delete(`/papers/${delTarget.id}`);
      await qc.invalidateQueries({ queryKey: ['papers'] });
      setDelTarget(null);
    } catch (e: any) { setDelErr(errMsg(e)); }
    finally          { setDelBusy(false); }
  };

  // ---- history viewer ----
  const [historyOf, setHistoryOf] = useState<Paper | null>(null);
  const { data: detail } = useQuery<Paper & { logs: Array<{ id: string; action: string; createdAt: string; user?: { fullName: string }; details: any }> }>({
    queryKey: ['paper-detail', historyOf?.id],
    queryFn: async () => (await api.get(`/papers/${historyOf!.id}`)).data,
    enabled: !!historyOf,
  });

  const printCols: PrintColumn<Paper>[] = [
    { key: 'title',      label: 'العنوان',      width: '25%' },
    { key: 'type',       label: 'النوع',         format: (v) => TYPE_LABEL[v as PaperType] ?? v },
    { key: 'docNumber',  label: 'الرقم',         format: (v) => v ?? '—' },
    { key: 'issuer',     label: 'الجهة المصدرة', format: (v) => v ?? '—' },
    { key: 'branch',     label: 'الفرع',         format: (_, r) => r.branch?.name ?? '—' },
    { key: 'issuedAt',   label: 'تاريخ الإصدار',  format: (v) => fmtDate(v) },
    { key: 'expiresAt',  label: 'تاريخ الانتهاء', format: (v) => fmtDate(v) },
    { key: 'daysLeft',   label: 'المتبقّي (يوم)',  number: true,
      format: (v) => v === null ? '—' : Number(v) < 0 ? `متأخّر ${Math.abs(Number(v))}` : String(v) },
    { key: 'liveStatus', label: 'الحالة',         format: (v) => STATUS_LABEL[v as PaperStatus] ?? String(v ?? '') },
  ];

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
        <h1 className="text-2xl font-extrabold">الأوراق الرسمية</h1>
        <PrintBar
          title="الأوراق الرسمية"
          subtitle={[
            q && `بحث: "${q}"`,
            typeF   !== 'all' && `النوع: ${TYPE_LABEL[typeF]}`,
            statusF !== 'all' && `الحالة: ${STATUS_LABEL[statusF]}`,
            expiringIn !== '' && `تنتهي خلال ${expiringIn} يوم`,
          ].filter(Boolean).join(' • ') || undefined}
          columns={printCols}
          rows={items}
          summary={[
            { label: 'الإجمالي', value: items.length },
            { label: 'سارية', value: summary.active },
            { label: 'قاربت', value: summary.expiring_soon },
            { label: 'منتهية', value: summary.expired },
            { label: 'تحتاج تجديد', value: summary.renewal_needed },
          ]}
        />
      </div>
      <p className="text-muted text-sm mb-6">
        إدارة وتتبع الرخص، السجلات التجارية، الضرائب، التأمين، عقود الإيجار، الجمارك...
      </p>

      {/* status summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
        <SummaryCard label="سارية" value={summary.active} color="text-green-700" />
        <SummaryCard label="قاربت على الانتهاء" value={summary.expiring_soon} color="text-amber-700" />
        <SummaryCard label="منتهية" value={summary.expired} color="text-red-700" />
        <SummaryCard label="تحتاج تجديد" value={summary.renewal_needed} color="text-amber-700" />
        <SummaryCard label="قيد المعاملة" value={summary.in_progress} color="text-blue-700" />
      </div>

      <div className="card">
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
            <input className="input pr-10" placeholder="ابحث بالعنوان أو الرقم..."
                   value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="input max-w-[180px]" value={typeF}
                  onChange={(e) => setTypeF(e.target.value as any)}>
            <option value="all">كل الأنواع</option>
            {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select className="input max-w-[170px]" value={statusF}
                  onChange={(e) => setStatusF(e.target.value as any)}>
            <option value="all">كل الحالات</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select className="input max-w-[180px]" value={branchF}
                  onChange={(e) => setBranchF(e.target.value)}>
            <option value="">كل الفروع</option>
            {branchesFromAuth.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select className="input max-w-[170px]" value={expiringIn}
                  onChange={(e) => setExpIn(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">تنتهي خلال…</option>
            <option value="7">خلال 7 أيام</option>
            <option value="15">خلال 15 يوم</option>
            <option value="30">خلال 30 يوم</option>
            <option value="60">خلال 60 يوم</option>
          </select>
          <button className="btn-primary" onClick={openCreate}>
            <Plus size={16} /> ورقة جديدة
          </button>
        </div>

        <div className="text-xs text-muted mb-2">
          العدد المعروض: <b>{items.length}</b>
          {data && ` من إجمالي ${data.total}`}
          {isFetching && ' • يحدّث...'}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-right text-muted text-xs font-bold border-b-2 border-line">
                <th className="px-2.5 py-3">العنوان</th>
                <th className="px-2.5 py-3">النوع</th>
                <th className="px-2.5 py-3">الرقم</th>
                <th className="px-2.5 py-3">الجهة المصدرة</th>
                <th className="px-2.5 py-3">الفرع</th>
                <th className="px-2.5 py-3">تاريخ الإصدار</th>
                <th className="px-2.5 py-3">تاريخ الانتهاء</th>
                <th className="px-2.5 py-3">المتبقّي</th>
                <th className="px-2.5 py-3">الحالة</th>
                <th className="px-2.5 py-3">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td className="p-8 text-center text-muted" colSpan={10}>جاري التحميل...</td></tr>}
              {!isLoading && items.length === 0 && (
                <tr><td className="p-8 text-center text-muted" colSpan={10}>لا توجد أوراق مطابقة</td></tr>
              )}
              {items.map((p) => (
                <tr key={p.id} className="border-b border-line hover:bg-slate-50">
                  <td className="px-2.5 py-3">
                    <div className="font-bold">{p.title}</div>
                    {p.notes && <div className="text-xs text-muted line-clamp-1">{p.notes}</div>}
                  </td>
                  <td className="px-2.5 py-3">{TYPE_LABEL[p.type]}</td>
                  <td className="px-2.5 py-3 font-mono text-xs">{p.docNumber || '—'}</td>
                  <td className="px-2.5 py-3">{p.issuer || '—'}</td>
                  <td className="px-2.5 py-3">{p.branch?.name || '—'}</td>
                  <td className="px-2.5 py-3 whitespace-nowrap">{fmtDate(p.issuedAt)}</td>
                  <td className="px-2.5 py-3 whitespace-nowrap">{fmtDate(p.expiresAt)}</td>
                  <td className="px-2.5 py-3 font-bold whitespace-nowrap">
                    {p.daysLeft === null ? '—' :
                      p.daysLeft < 0 ? <span className="text-red-700">متأخّر {Math.abs(p.daysLeft)} يوم</span> :
                      p.daysLeft <= 7 ? <span className="text-red-700">{p.daysLeft} يوم</span> :
                      p.daysLeft <= 30 ? <span className="text-amber-700">{p.daysLeft} يوم</span> :
                      <span>{p.daysLeft} يوم</span>}
                  </td>
                  <td className="px-2.5 py-3">
                    <span className={'pill ' + STATUS_PILL[p.liveStatus]}>
                      {STATUS_LABEL[p.liveStatus]}
                    </span>
                  </td>
                  <td className="px-2.5 py-3">
                    <div className="flex items-center gap-1 flex-wrap">
                      <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-blue-50 text-blue-600" title="تعديل">
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => openRenew(p)} className="p-1.5 rounded hover:bg-emerald-50 text-emerald-600" title="تجديد">
                        <RefreshCw size={16} />
                      </button>
                      <button onClick={() => setManualStatus(p, 'renewal_needed')} className="p-1.5 rounded hover:bg-amber-50 text-amber-600" title="وضع: تحتاج تجديد">
                        <AlertTriangle size={16} />
                      </button>
                      <button onClick={() => setManualStatus(p, 'in_progress')} className="p-1.5 rounded hover:bg-blue-50 text-blue-600" title="وضع: قيد المعاملة">
                        <FileText size={16} />
                      </button>
                      <button onClick={() => setHistoryOf(p)} className="p-1.5 rounded hover:bg-slate-100 text-slate-600" title="سجل التعديلات">
                        <History size={16} />
                      </button>
                      {p.fileUrl && (
                        <a href={p.fileUrl} target="_blank" rel="noopener noreferrer"
                           className="p-1.5 rounded hover:bg-slate-100 text-slate-700" title="فتح الملف">
                          <FileText size={16} />
                        </a>
                      )}
                      <button onClick={() => { setDelTarget(p); setDelErr(null); }}
                              className="p-1.5 rounded hover:bg-red-50 text-red-600" title="حذف">
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

      {/* ---- Create / Edit modal ---- */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
             title={editing ? `تعديل: ${editing.title}` : 'ورقة رسمية جديدة'} size="lg">
        <form onSubmit={(e) => { e.preventDefault(); save(); }}>
          {formErr && (
            <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
              <AlertCircle size={18} className="shrink-0 mt-0.5" /><span>{formErr}</span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="نوع الورقة *">
              <select className="input" value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value as PaperType })}>
                {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="الفرع المرتبط">
              <select className="input" value={form.branchId}
                      onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                <option value="">— (عامة لجميع الفروع)</option>
                {branchesFromAuth.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="العنوان *">
              <input className="input" required maxLength={200}
                     value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                     placeholder="مثلاً: رخصة محل وادي صقرة 2026" />
            </Field>
            <Field label="رقم الوثيقة">
              <input className="input" maxLength={100}
                     value={form.docNumber} onChange={(e) => setForm({ ...form, docNumber: e.target.value })} />
            </Field>
            <Field label="الجهة المصدرة">
              <input className="input" maxLength={200}
                     value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })}
                     placeholder="أمانة عمّان، دائرة الضريبة..." />
            </Field>
            <div />
            <Field label="تاريخ الإصدار">
              <input className="input" type="date"
                     value={form.issuedAt} onChange={(e) => setForm({ ...form, issuedAt: e.target.value })} />
            </Field>
            <Field label="تاريخ الانتهاء">
              <input className="input" type="date"
                     value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
            </Field>
            <Field label="رابط الملف (PDF/صورة)">
              <input className="input" type="url"
                     value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })}
                     placeholder="https://..." />
            </Field>
            <Field label="ملاحظات">
              <textarea className="input" rows={2}
                        value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </div>
          <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-line">
            <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>إلغاء</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'جاري الحفظ...' : (editing ? 'حفظ التعديلات' : 'إنشاء')}
            </button>
          </div>
        </form>
      </Modal>

      {/* ---- Renew modal ---- */}
      <Modal open={!!renewing} onClose={() => !renewBusy && setRenewing(null)} title={`تجديد: ${renewing?.title ?? ''}`} size="sm">
        {renewErr && (
          <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
            <AlertCircle size={18} className="shrink-0 mt-0.5" /><span>{renewErr}</span>
          </div>
        )}
        <Field label="تاريخ الإصدار الجديد *">
          <input className="input" type="date" value={renewIssued} onChange={(e) => setRenewIssued(e.target.value)} />
        </Field>
        <div className="h-2" />
        <Field label="تاريخ الانتهاء الجديد *">
          <input className="input" type="date" value={renewExpires} onChange={(e) => setRenewExpires(e.target.value)} />
        </Field>
        <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-line">
          <button className="btn-ghost" onClick={() => setRenewing(null)} disabled={renewBusy}>إلغاء</button>
          <button className="btn-primary" onClick={doRenew} disabled={renewBusy}>
            {renewBusy ? 'جاري التجديد...' : 'تأكيد التجديد'}
          </button>
        </div>
      </Modal>

      {/* ---- Delete confirm ---- */}
      <Modal open={!!delTarget} onClose={() => !delBusy && setDelTarget(null)} title="تأكيد الحذف" size="sm">
        <p className="text-sm mb-3">هل أنت متأكّد من حذف <b className="text-red-600">{delTarget?.title}</b>؟</p>
        <p className="text-xs text-muted mb-4">الحذف ناعم — السجل يبقى محفوظاً مع علامة محذوف.</p>
        {delErr && (
          <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
            <AlertCircle size={18} className="shrink-0 mt-0.5" /><span>{delErr}</span>
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <button className="btn-ghost" onClick={() => setDelTarget(null)} disabled={delBusy}>إلغاء</button>
          <button className="btn-primary bg-red-600 hover:bg-red-700" onClick={doDelete} disabled={delBusy}>
            {delBusy ? 'جاري الحذف...' : 'تأكيد'}
          </button>
        </div>
      </Modal>

      {/* ---- History viewer ---- */}
      <Modal open={!!historyOf} onClose={() => setHistoryOf(null)} title={`سجل التعديلات: ${historyOf?.title ?? ''}`} size="lg">
        {!detail && <p className="text-muted text-sm">جاري التحميل...</p>}
        {detail && detail.logs && detail.logs.length === 0 && <p className="text-muted text-sm">لا توجد سجلّات بعد.</p>}
        {detail && detail.logs && detail.logs.length > 0 && (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {detail.logs.map((l) => (
              <div key={l.id} className="border border-line rounded p-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold">
                    {l.action === 'created'         && <CheckCircle2 size={14} className="inline text-green-700" />}
                    {l.action === 'updated'         && <Pencil       size={14} className="inline text-blue-600" />}
                    {l.action === 'renewed'         && <RefreshCw    size={14} className="inline text-emerald-600" />}
                    {l.action === 'status_changed'  && <AlertTriangle size={14} className="inline text-amber-600" />}
                    {l.action === 'deleted'         && <Trash2       size={14} className="inline text-red-600" />}
                    {' '}{l.action}
                  </span>
                  <span className="text-xs text-muted">{fmtDate(l.createdAt)} • {l.user?.fullName ?? 'النظام'}</span>
                </div>
                {l.details && <pre className="mt-1 text-xs text-muted whitespace-pre-wrap">{JSON.stringify(l.details, null, 2)}</pre>}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-muted mb-1">{label}</span>
      {children}
    </label>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white border border-line rounded-lg p-3 text-center">
      <div className="text-xs text-muted">{label}</div>
      <div className={'text-2xl font-extrabold ' + color}>{value}</div>
    </div>
  );
}
