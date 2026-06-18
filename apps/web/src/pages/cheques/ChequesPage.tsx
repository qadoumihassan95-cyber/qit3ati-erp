import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import {
  Plus, Search, AlertCircle, AlertTriangle, Pencil, Trash2, FileText,
  History, CheckCircle2, ArrowDownToLine, ArrowUpFromLine, Ban, XCircle,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import Modal from '@/components/ui/Modal';
import { fmtMoney, fmtDate, errMsg } from '@/lib/format';

type Direction = 'incoming' | 'outgoing';
type Status = 'new' | 'due_soon' | 'due_today' | 'collected' | 'paid' | 'bounced' | 'cancelled';

const STATUS_LABEL: Record<Status, string> = {
  new: 'جديد', due_soon: 'مستحق قريباً', due_today: 'مستحق اليوم',
  collected: 'محصّل', paid: 'مدفوع', bounced: 'مرتجع', cancelled: 'ملغي',
};
const STATUS_PILL: Record<Status, string> = {
  new: 'pill-green', due_soon: 'pill-amber', due_today: 'pill-amber',
  collected: 'pill-green', paid: 'pill-green', bounced: 'pill-red', cancelled: 'pill-amber',
};

interface Cheque {
  id: string; tenantId: string; branchId: string | null;
  direction: Direction; chequeNo: string;
  bankId: string | null; bankName: string | null;
  partyName: string | null;
  customerId: string | null; supplierId: string | null;
  amount: string | number; dueDate: string;
  status: Status; liveStatus: Status; daysLeft: number;
  notes: string | null; fileUrl: string | null;
  bounceReason: string | null; bouncedAt: string | null; settledAt: string | null;
  branch?: { id: string; name: string } | null;
  bank?:   { id: string; name: string } | null;
  customer?: { id: string; name: string } | null;
  supplier?: { id: string; name: string } | null;
  receiptId?: string | null; paymentId?: string | null;
}

interface Dashboard {
  incoming:     { count: number; amount: number };
  outgoing:     { count: number; amount: number };
  dueThisWeek:  { count: number; amount: number };
  overdue:      { count: number; amount: number };
  bounced:      { count: number; amount: number };
}

interface ChequeForm {
  direction: Direction; chequeNo: string;
  bankId: string; bankName: string;
  partyName: string;
  customerId: string; supplierId: string;
  amount: string; dueDate: string;
  branchId: string; notes: string; fileUrl: string;
}
const emptyForm: ChequeForm = {
  direction: 'incoming', chequeNo: '',
  bankId: '', bankName: '', partyName: '',
  customerId: '', supplierId: '',
  amount: '', dueDate: new Date().toISOString().slice(0, 10),
  branchId: '', notes: '', fileUrl: '',
};

export default function ChequesPage() {
  const qc = useQueryClient();
  const branchesFromAuth = useAuth((s) => s.user?.branches ?? []);
  const [tab, setTab] = useState<'incoming' | 'outgoing'>('incoming');
  const [q, setQ]         = useState('');
  const [statusF, setF]   = useState<'all' | Status>('all');
  const [bankF, setBank]  = useState<string>('');
  const [from, setFrom]   = useState<string>('');
  const [to, setTo]       = useState<string>('');

  const { data: dash } = useQuery<Dashboard>({
    queryKey: ['cheques-dashboard'],
    queryFn: async () => (await api.get('/cheques/dashboard')).data,
  });

  const { data, isLoading, isFetching } = useQuery<{ items: Cheque[]; total: number }>({
    queryKey: ['cheques', tab, q, statusF, bankF, from, to],
    queryFn: async () => (await api.get('/cheques', {
      params: {
        direction: tab,
        q, status: statusF === 'all' ? undefined : statusF,
        bankId: bankF || undefined,
        from: from || undefined,
        to:   to   || undefined,
      },
    })).data,
  });
  const items = data?.items ?? [];

  // ---- customers + suppliers (for dropdowns) ----
  // Both endpoints may return either a plain array OR { items: [...] } — normalize.
  const normList = (raw: any): Array<{id:string; name:string}> =>
    Array.isArray(raw) ? raw : (raw?.items ?? []);
  const { data: customers } = useQuery<Array<{id:string; name:string}>>({
    queryKey: ['customers-mini'],
    queryFn: async () => normList((await api.get('/customers')).data),
  });
  const { data: suppliers } = useQuery<Array<{id:string; name:string}>>({
    queryKey: ['suppliers-mini'],
    queryFn: async () => normList((await api.get('/suppliers')).data),
  });
  const { data: banks } = useQuery<Array<{id:string; name:string}>>({
    queryKey: ['banks-mini'],
    queryFn: async () => {
      // banks endpoint may not exist yet — return empty list gracefully
      try { return normList((await api.get('/banks')).data); }
      catch { return []; }
    },
  });

  // ---- create / edit ----
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing]     = useState<Cheque | null>(null);
  const [form, setForm]           = useState<ChequeForm>({ ...emptyForm, direction: tab });
  const [formErr, setFormErr]     = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);
  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, direction: tab });
    setFormErr(null); setModalOpen(true);
  };
  const openEdit = (c: Cheque) => {
    setEditing(c);
    setForm({
      direction: c.direction,
      chequeNo: c.chequeNo,
      bankId: c.bankId ?? '', bankName: c.bankName ?? '',
      partyName: c.partyName ?? '',
      customerId: c.customerId ?? '', supplierId: c.supplierId ?? '',
      amount: String(c.amount ?? ''),
      dueDate: c.dueDate ? c.dueDate.slice(0, 10) : '',
      branchId: c.branchId ?? '',
      notes: c.notes ?? '',
      fileUrl: c.fileUrl ?? '',
    });
    setFormErr(null); setModalOpen(true);
  };
  const save = async () => {
    setFormErr(null);
    if (!form.chequeNo.trim()) { setFormErr('رقم الشيك مطلوب'); return; }
    if (!form.dueDate)         { setFormErr('تاريخ الاستحقاق مطلوب'); return; }
    const amount = Number(form.amount);
    if (!(amount > 0))         { setFormErr('المبلغ يجب أن يكون أكبر من صفر'); return; }
    setSaving(true);
    try {
      const payload: any = {
        direction: form.direction,
        chequeNo: form.chequeNo.trim(),
        bankId: form.bankId || undefined,
        bankName: form.bankName.trim() || undefined,
        partyName: form.partyName.trim() || undefined,
        customerId: form.direction === 'incoming' ? (form.customerId || undefined) : undefined,
        supplierId: form.direction === 'outgoing' ? (form.supplierId || undefined) : undefined,
        amount,
        dueDate: form.dueDate,
        branchId: form.branchId || undefined,
        notes: form.notes || undefined,
        fileUrl: form.fileUrl || undefined,
      };
      if (editing) await api.put(`/cheques/${editing.id}`, payload);
      else         await api.post('/cheques', payload);
      await qc.invalidateQueries({ queryKey: ['cheques'] });
      await qc.invalidateQueries({ queryKey: ['cheques-dashboard'] });
      setModalOpen(false);
    } catch (e: any) { setFormErr(errMsg(e)); }
    finally          { setSaving(false); }
  };

  // ---- collect / pay / bounce / cancel ----
  const settle = async (c: Cheque) => {
    if (!confirm(c.direction === 'incoming'
        ? `تأكيد تحصيل الشيك ${c.chequeNo} بمبلغ ${fmtMoney(c.amount)}؟ سيتم إنشاء سند قبض تلقائي.`
        : `تأكيد دفع الشيك ${c.chequeNo} بمبلغ ${fmtMoney(c.amount)}؟ سيتم إنشاء سند صرف تلقائي.`)) return;
    try {
      await api.patch(`/cheques/${c.id}/${c.direction === 'incoming' ? 'collect' : 'pay'}`, {});
      await qc.invalidateQueries({ queryKey: ['cheques'] });
      await qc.invalidateQueries({ queryKey: ['cheques-dashboard'] });
    } catch (e: any) { alert(errMsg(e)); }
  };

  const [bounceOf, setBounceOf] = useState<Cheque | null>(null);
  const [bounceReason, setBounceReason] = useState('');
  const [bounceBusy, setBounceBusy] = useState(false);
  const [bounceErr, setBounceErr] = useState<string | null>(null);
  const doBounce = async () => {
    if (!bounceOf) return;
    if (!bounceReason.trim()) { setBounceErr('سبب الرجوع مطلوب'); return; }
    setBounceBusy(true); setBounceErr(null);
    try {
      await api.patch(`/cheques/${bounceOf.id}/bounce`, { reason: bounceReason.trim() });
      await qc.invalidateQueries({ queryKey: ['cheques'] });
      await qc.invalidateQueries({ queryKey: ['cheques-dashboard'] });
      setBounceOf(null); setBounceReason('');
    } catch (e: any) { setBounceErr(errMsg(e)); }
    finally          { setBounceBusy(false); }
  };

  const cancel = async (c: Cheque) => {
    const reason = prompt('سبب الإلغاء (اختياري):') ?? undefined;
    if (reason === null) return;
    try {
      await api.patch(`/cheques/${c.id}/cancel`, { reason });
      await qc.invalidateQueries({ queryKey: ['cheques'] });
      await qc.invalidateQueries({ queryKey: ['cheques-dashboard'] });
    } catch (e: any) { alert(errMsg(e)); }
  };

  const [delTarget, setDelTarget] = useState<Cheque | null>(null);
  const [delErr, setDelErr] = useState<string | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const doDelete = async () => {
    if (!delTarget) return;
    setDelBusy(true); setDelErr(null);
    try {
      await api.delete(`/cheques/${delTarget.id}`);
      await qc.invalidateQueries({ queryKey: ['cheques'] });
      await qc.invalidateQueries({ queryKey: ['cheques-dashboard'] });
      setDelTarget(null);
    } catch (e: any) { setDelErr(errMsg(e)); }
    finally          { setDelBusy(false); }
  };

  // ---- history ----
  const [historyOf, setHistoryOf] = useState<Cheque | null>(null);
  const { data: detail } = useQuery<Cheque & { logs: Array<{ id: string; toStatus: Status; fromStatus: Status | null; note: string | null; createdAt: string; user?: { fullName: string } }> }>({
    queryKey: ['cheque-detail', historyOf?.id],
    queryFn: async () => (await api.get(`/cheques/${historyOf!.id}`)).data,
    enabled: !!historyOf,
  });

  // ---- export to CSV (client-side) ----
  const exportCsv = () => {
    const rows = [
      ['رقم الشيك','البنك','الطرف','المبلغ','تاريخ الاستحقاق','الحالة','المتبقّي بالأيام','ملاحظات'],
      ...items.map((c) => [
        c.chequeNo,
        c.bank?.name ?? c.bankName ?? '',
        c.customer?.name ?? c.supplier?.name ?? c.partyName ?? '',
        String(c.amount),
        c.dueDate?.slice(0, 10) ?? '',
        STATUS_LABEL[c.liveStatus],
        String(c.daysLeft),
        c.notes ?? '',
      ]),
    ];
    const csv = '﻿' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cheques-${tab}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-1">الشيكات</h1>
      <p className="text-muted text-sm mb-6">
        تتبّع شيكاتك الواردة (مستحقّة لك) والصادرة (مستحقّة عليك) — مع تحصيل/دفع تلقائي وربط بالمحاسبة.
      </p>

      {/* dashboard cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
        <DashCard label="إجمالي لنا" amount={dash?.incoming.amount ?? 0} count={dash?.incoming.count ?? 0} color="text-green-700" />
        <DashCard label="إجمالي علينا" amount={dash?.outgoing.amount ?? 0} count={dash?.outgoing.count ?? 0} color="text-red-700" />
        <DashCard label="مستحقّ هذا الأسبوع" amount={dash?.dueThisWeek.amount ?? 0} count={dash?.dueThisWeek.count ?? 0} color="text-amber-700" />
        <DashCard label="متأخّر" amount={dash?.overdue.amount ?? 0} count={dash?.overdue.count ?? 0} color="text-red-700" />
        <DashCard label="مرتجع" amount={dash?.bounced.amount ?? 0} count={dash?.bounced.count ?? 0} color="text-red-700" />
      </div>

      {/* tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-line">
        <button onClick={() => setTab('incoming')}
                className={'px-4 py-2 text-sm font-bold border-b-2 -mb-px ' +
                  (tab === 'incoming' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-muted')}>
          <ArrowDownToLine size={16} className="inline -mt-0.5" /> شيكات لنا (واردة)
        </button>
        <button onClick={() => setTab('outgoing')}
                className={'px-4 py-2 text-sm font-bold border-b-2 -mb-px ' +
                  (tab === 'outgoing' ? 'border-rose-600 text-rose-700' : 'border-transparent text-muted')}>
          <ArrowUpFromLine size={16} className="inline -mt-0.5" /> شيكات علينا (صادرة)
        </button>
      </div>

      <div className="card">
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
            <input className="input pr-10" placeholder="ابحث برقم الشيك / البنك / الطرف..."
                   value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="input max-w-[180px]" value={statusF} onChange={(e) => setF(e.target.value as any)}>
            <option value="all">كل الحالات</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select className="input max-w-[170px]" value={bankF} onChange={(e) => setBank(e.target.value)}>
            <option value="">كل البنوك</option>
            {(banks ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input className="input max-w-[160px]" type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="من" />
          <input className="input max-w-[160px]" type="date" value={to}   onChange={(e) => setTo(e.target.value)}   title="إلى" />
          <button className="btn-ghost" onClick={exportCsv}>تصدير CSV</button>
          <button className="btn-primary" onClick={openCreate}>
            <Plus size={16} /> شيك جديد
          </button>
        </div>

        <div className="text-xs text-muted mb-2">
          العدد: <b>{items.length}</b>
          {data && ` من إجمالي ${data.total}`}
          {isFetching && ' • يحدّث...'}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[950px]">
            <thead>
              <tr className="text-right text-muted text-xs font-bold border-b-2 border-line">
                <th className="px-2.5 py-3">رقم الشيك</th>
                <th className="px-2.5 py-3">البنك</th>
                <th className="px-2.5 py-3">{tab === 'incoming' ? 'صاحب الشيك / العميل' : 'المستفيد / المورد'}</th>
                <th className="px-2.5 py-3">المبلغ</th>
                <th className="px-2.5 py-3">الاستحقاق</th>
                <th className="px-2.5 py-3">المتبقّي</th>
                <th className="px-2.5 py-3">الحالة</th>
                <th className="px-2.5 py-3">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td className="p-8 text-center text-muted" colSpan={8}>جاري التحميل...</td></tr>}
              {!isLoading && items.length === 0 && (
                <tr><td className="p-8 text-center text-muted" colSpan={8}>لا توجد شيكات مطابقة</td></tr>
              )}
              {items.map((c) => {
                const isTerminal = ['collected','paid','cancelled','bounced'].includes(c.liveStatus);
                return (
                  <tr key={c.id} className="border-b border-line hover:bg-slate-50">
                    <td className="px-2.5 py-3 font-mono font-bold">{c.chequeNo}</td>
                    <td className="px-2.5 py-3">{c.bank?.name ?? c.bankName ?? '—'}</td>
                    <td className="px-2.5 py-3">
                      <div className="font-bold">{c.customer?.name ?? c.supplier?.name ?? c.partyName ?? '—'}</div>
                      {c.notes && <div className="text-xs text-muted line-clamp-1">{c.notes}</div>}
                    </td>
                    <td className="px-2.5 py-3 font-bold">{fmtMoney(c.amount)}</td>
                    <td className="px-2.5 py-3 whitespace-nowrap">{fmtDate(c.dueDate)}</td>
                    <td className="px-2.5 py-3 font-bold whitespace-nowrap">
                      {isTerminal ? '—' :
                       c.daysLeft < 0 ? <span className="text-red-700">متأخّر {Math.abs(c.daysLeft)} يوم</span> :
                       c.daysLeft === 0 ? <span className="text-red-700">اليوم</span> :
                       c.daysLeft <= 3 ? <span className="text-red-700">{c.daysLeft} يوم</span> :
                       c.daysLeft <= 7 ? <span className="text-amber-700">{c.daysLeft} يوم</span> :
                       <span>{c.daysLeft} يوم</span>}
                    </td>
                    <td className="px-2.5 py-3">
                      <span className={'pill ' + STATUS_PILL[c.liveStatus]}>{STATUS_LABEL[c.liveStatus]}</span>
                    </td>
                    <td className="px-2.5 py-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        {!isTerminal && (
                          <button onClick={() => settle(c)}
                                  className="p-1.5 rounded hover:bg-green-50 text-green-700"
                                  title={c.direction === 'incoming' ? 'تحصيل' : 'دفع'}>
                            <CheckCircle2 size={16} />
                          </button>
                        )}
                        {!isTerminal && (
                          <button onClick={() => { setBounceOf(c); setBounceReason(''); setBounceErr(null); }}
                                  className="p-1.5 rounded hover:bg-red-50 text-red-600" title="رجع">
                            <Ban size={16} />
                          </button>
                        )}
                        {!['collected','paid'].includes(c.liveStatus) && (
                          <button onClick={() => cancel(c)} className="p-1.5 rounded hover:bg-amber-50 text-amber-700" title="إلغاء">
                            <XCircle size={16} />
                          </button>
                        )}
                        {!['collected','paid'].includes(c.liveStatus) && (
                          <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-blue-50 text-blue-600" title="تعديل">
                            <Pencil size={16} />
                          </button>
                        )}
                        <button onClick={() => setHistoryOf(c)} className="p-1.5 rounded hover:bg-slate-100 text-slate-600" title="السجل">
                          <History size={16} />
                        </button>
                        {c.fileUrl && (
                          <a href={c.fileUrl} target="_blank" rel="noopener noreferrer"
                             className="p-1.5 rounded hover:bg-slate-100 text-slate-700" title="فتح المرفق">
                            <FileText size={16} />
                          </a>
                        )}
                        {!['collected','paid'].includes(c.liveStatus) && (
                          <button onClick={() => { setDelTarget(c); setDelErr(null); }}
                                  className="p-1.5 rounded hover:bg-red-50 text-red-600" title="حذف">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
             title={editing ? `تعديل شيك ${editing.chequeNo}` : `شيك جديد (${form.direction === 'incoming' ? 'لنا' : 'علينا'})`} size="lg">
        <form onSubmit={(e) => { e.preventDefault(); save(); }}>
          {formErr && (
            <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
              <AlertCircle size={18} className="shrink-0 mt-0.5" /><span>{formErr}</span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="نوع الشيك *">
              <select className="input" value={form.direction} disabled={!!editing}
                      onChange={(e) => setForm({ ...form, direction: e.target.value as Direction })}>
                <option value="incoming">لنا (واردة)</option>
                <option value="outgoing">علينا (صادرة)</option>
              </select>
            </Field>
            <Field label="رقم الشيك *">
              <input className="input" required maxLength={60}
                     value={form.chequeNo} onChange={(e) => setForm({ ...form, chequeNo: e.target.value })} />
            </Field>
            <Field label="البنك (من القائمة)">
              <select className="input" value={form.bankId}
                      onChange={(e) => setForm({ ...form, bankId: e.target.value })}>
                <option value="">— (أو اكتب اسم البنك أدناه)</option>
                {(banks ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="اسم البنك (إن لم يكن في القائمة)">
              <input className="input" maxLength={150}
                     value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                     placeholder="بنك الإسكان، الأهلي، عربي..." />
            </Field>
            {form.direction === 'incoming' ? (
              <Field label="العميل">
                <select className="input" value={form.customerId}
                        onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
                  <option value="">— (أو اكتب الاسم أدناه)</option>
                  {(customers ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            ) : (
              <Field label="المورد">
                <select className="input" value={form.supplierId}
                        onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
                  <option value="">— (أو اكتب الاسم أدناه)</option>
                  {(suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            )}
            <Field label={form.direction === 'incoming' ? 'صاحب الشيك (إن لم يكن في القائمة)' : 'المستفيد (إن لم يكن في القائمة)'}>
              <input className="input" maxLength={200}
                     value={form.partyName} onChange={(e) => setForm({ ...form, partyName: e.target.value })} />
            </Field>
            <Field label="المبلغ (د.أ) *">
              <input className="input" type="number" required min="0.001" step="0.001"
                     value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </Field>
            <Field label="تاريخ الاستحقاق *">
              <input className="input" type="date" required
                     value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </Field>
            <Field label="الفرع">
              <select className="input" value={form.branchId}
                      onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                <option value="">—</option>
                {branchesFromAuth.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="رابط صورة/مرفق الشيك">
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
              {saving ? 'جاري الحفظ...' : (editing ? 'حفظ التعديلات' : 'إنشاء الشيك')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Bounce modal */}
      <Modal open={!!bounceOf} onClose={() => !bounceBusy && setBounceOf(null)}
             title={`تسجيل ارتجاع: ${bounceOf?.chequeNo ?? ''}`} size="sm">
        {bounceErr && (
          <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
            <AlertCircle size={18} className="shrink-0 mt-0.5" /><span>{bounceErr}</span>
          </div>
        )}
        <Field label="سبب الرجوع *">
          <textarea className="input" rows={3} value={bounceReason}
                    onChange={(e) => setBounceReason(e.target.value)}
                    placeholder="رصيد غير كاف، إيقاف صرف، توقيع غير مطابق..." />
        </Field>
        <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-line">
          <button className="btn-ghost" onClick={() => setBounceOf(null)} disabled={bounceBusy}>إلغاء</button>
          <button className="btn-primary bg-red-600 hover:bg-red-700" onClick={doBounce} disabled={bounceBusy}>
            {bounceBusy ? '...' : 'تأكيد الارتجاع'}
          </button>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal open={!!delTarget} onClose={() => !delBusy && setDelTarget(null)} title="تأكيد الحذف" size="sm">
        <p className="text-sm mb-3">حذف الشيك <b className="text-red-600">{delTarget?.chequeNo}</b>؟</p>
        {delErr && (
          <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
            <AlertCircle size={18} className="shrink-0 mt-0.5" /><span>{delErr}</span>
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <button className="btn-ghost" onClick={() => setDelTarget(null)} disabled={delBusy}>إلغاء</button>
          <button className="btn-primary bg-red-600 hover:bg-red-700" onClick={doDelete} disabled={delBusy}>
            {delBusy ? '...' : 'تأكيد'}
          </button>
        </div>
      </Modal>

      {/* History */}
      <Modal open={!!historyOf} onClose={() => setHistoryOf(null)} title={`سجل الشيك ${historyOf?.chequeNo ?? ''}`} size="lg">
        {!detail && <p className="text-muted text-sm">جاري التحميل...</p>}
        {detail && (
          <>
            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
              <Info k="البنك" v={detail.bank?.name ?? detail.bankName ?? '—'} />
              <Info k="الطرف" v={detail.customer?.name ?? detail.supplier?.name ?? detail.partyName ?? '—'} />
              <Info k="المبلغ" v={fmtMoney(detail.amount)} />
              <Info k="الاستحقاق" v={fmtDate(detail.dueDate)} />
              {detail.bounceReason && <Info k="سبب الرجوع" v={detail.bounceReason} />}
              {detail.settledAt && <Info k="تاريخ التسوية" v={fmtDate(detail.settledAt)} />}
              {detail.receiptId && <Info k="سند القبض المرتبط" v={detail.receiptId.slice(0, 8) + '...'} />}
              {detail.paymentId && <Info k="سند الصرف المرتبط" v={detail.paymentId.slice(0, 8) + '...'} />}
            </div>
            <div className="border-t border-line pt-2 mt-2">
              <h3 className="text-xs font-bold text-muted mb-2">تغيّرات الحالة</h3>
              {detail.logs?.length === 0 && <p className="text-muted text-sm">لا سجلّات.</p>}
              <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                {detail.logs?.map((l) => (
                  <div key={String(l.id)} className="border border-line rounded p-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold">
                        {l.fromStatus && <>{STATUS_LABEL[l.fromStatus]} → </>}
                        <span className={'pill ' + STATUS_PILL[l.toStatus]}>{STATUS_LABEL[l.toStatus]}</span>
                      </span>
                      <span className="text-xs text-muted">{fmtDate(l.createdAt)} • {l.user?.fullName ?? 'النظام'}</span>
                    </div>
                    {l.note && <div className="mt-1 text-xs">{l.note}</div>}
                  </div>
                ))}
              </div>
            </div>
          </>
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
function DashCard({ label, amount, count, color }: { label: string; amount: number; count: number; color: string }) {
  return (
    <div className="bg-white border border-line rounded-lg p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={'text-xl font-extrabold ' + color}>{fmtMoney(amount)}</div>
      <div className="text-xs text-muted mt-0.5">{count} شيك</div>
    </div>
  );
}
function Info({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="bg-slate-50 rounded p-2">
      <div className="text-muted">{k}</div>
      <div className="font-bold">{v}</div>
    </div>
  );
}
