import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { ArrowLeftRight, Plus, Search, Trash2, CheckCircle2, X } from 'lucide-react';

interface Branch { id: string; name: string; isMain: boolean }
interface Part {
  id: string; sku: string; name: string; partNumber: string | null; quantity: number;
}

interface Transfer {
  id: string; status: 'pending'|'in_transit'|'received'|'cancelled';
  fromBranch: string | null; toBranch: string | null;
  from: { id: string; name: string } | null;
  to:   { id: string; name: string } | null;
  createdAt: string;
  items: Array<{ partId: string; qtySent: string | number; qtyReceived?: string | number | null;
                 part: { id: string; sku: string; name: string } }>;
}

interface CartLine { partId: string; name: string; sku: string; qty: number; max: number; }

const STATUS_PILL: Record<string, string> = {
  pending: 'pill-gray', in_transit: 'pill-amber', received: 'pill-green', cancelled: 'pill-red',
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'قيد الإنشاء', in_transit: 'قيد النقل', received: 'تم الاستلام', cancelled: 'ملغى',
};

export default function TransfersPage() {
  const branchId = useAuth((s) => s.branchId);
  const qc = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [fromBranch, setFromBranch] = useState<string>(branchId ?? '');
  const [toBranch, setToBranch] = useState<string>('');
  const [partQuery, setPartQuery] = useState('');
  const [lines, setLines] = useState<CartLine[]>([]);

  const branchesQ = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: async () => (await api.get('/branches')).data,
  });

  const transfersQ = useQuery<Transfer[]>({
    queryKey: ['transfers', branchId],
    queryFn: async () => (await api.get('/transfers', { params: { branchId } })).data,
  });

  const partsQ = useQuery<{ items: Part[] }>({
    queryKey: ['transfer-parts', partQuery, fromBranch],
    queryFn: async () => (await api.get('/parts', { params: { q: partQuery, branchId: fromBranch, perPage: 12 } })).data,
    enabled: showForm && !!fromBranch,
  });

  const addLine = (p: Part) => {
    setLines((c) => {
      const ex = c.find((l) => l.partId === p.id);
      if (ex) return c.map((l) => l.partId === p.id ? { ...l, qty: Math.min(l.qty + 1, p.quantity) } : l);
      return [...c, { partId: p.id, name: p.name, sku: p.sku, qty: 1, max: p.quantity }];
    });
  };
  const updateLine = (id: string, qty: number) =>
    setLines((c) => c.map((l) => l.partId === id ? { ...l, qty } : l));
  const removeLine = (id: string) => setLines((c) => c.filter((l) => l.partId !== id));

  const createTransfer = useMutation({
    mutationFn: async () => {
      if (!fromBranch || !toBranch) throw new Error('اختر الفرعين');
      if (fromBranch === toBranch) throw new Error('لا يمكن التحويل لنفس الفرع');
      if (lines.length === 0) throw new Error('أضف قطعة واحدة على الأقل');
      return (await api.post('/transfers', {
        fromBranch, toBranch,
        items: lines.map((l) => ({ partId: l.partId, qty: l.qty })),
      })).data;
    },
    onSuccess: () => {
      setLines([]); setToBranch(''); setShowForm(false);
      qc.invalidateQueries({ queryKey: ['transfers'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      alert('✅ تم إنشاء التحويل — الكميات الآن قيد النقل');
    },
    onError: (e: any) => alert(e?.response?.data?.message ?? e.message),
  });

  const receive = useMutation({
    mutationFn: async (t: Transfer) => (await api.post(`/transfers/${t.id}/receive`, {
      items: t.items.map((it) => ({ partId: it.partId, qtyReceived: Number(it.qtySent) })),
    })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      alert('✅ تم استلام التحويل وتحديث المخزون');
    },
    onError: (e: any) => alert(e?.response?.data?.message ?? e.message),
  });

  const cancel = useMutation({
    mutationFn: async (t: Transfer) => (await api.post(`/transfers/${t.id}/cancel`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
    },
    onError: (e: any) => alert(e?.response?.data?.message ?? e.message),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-extrabold">تحويلات الفروع</h1>
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          <Plus size={16} /> {showForm ? 'إخفاء النموذج' : 'تحويل جديد'}
        </button>
      </div>
      <p className="text-muted text-sm mb-6">انقل البضاعة بين فروعك — الكمية تُحجز من المصدر، وتُضاف عند الوصول للوجهة</p>

      {showForm && (
        <div className="card mb-6">
          <h3 className="font-extrabold text-lg mb-4">إنشاء تحويل جديد</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-sm font-bold mb-1.5">من الفرع</label>
              <select className="input" value={fromBranch}
                      onChange={(e) => { setFromBranch(e.target.value); setLines([]); }}>
                <option value="">— اختر —</option>
                {(branchesQ.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold mb-1.5">إلى الفرع</label>
              <select className="input" value={toBranch} onChange={(e) => setToBranch(e.target.value)}>
                <option value="">— اختر —</option>
                {(branchesQ.data ?? []).filter((b) => b.id !== fromBranch).map((b) =>
                  <option key={b.id} value={b.id}>{b.name}</option>
                )}
              </select>
            </div>
          </div>

          {fromBranch && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
              <div>
                <div className="relative mb-3">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
                  <input className="input pr-10" placeholder="ابحث عن قطعة..."
                         value={partQuery} onChange={(e) => setPartQuery(e.target.value)} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[420px] overflow-y-auto pr-1">
                  {(partsQ.data?.items ?? []).map((p) => (
                    <button key={p.id} onClick={() => addLine(p)}
                            disabled={p.quantity <= 0}
                            className="card text-right hover:border-accent transition p-3 disabled:opacity-50">
                      <div className="text-xs text-muted">{p.partNumber ?? p.sku}</div>
                      <div className="font-bold text-sm my-1">{p.name}</div>
                      <div className="text-muted text-xs">المتوفر: {p.quantity}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="card h-fit">
                <h4 className="font-extrabold mb-3">عناصر التحويل</h4>
                {lines.length === 0 ? (
                  <p className="text-center text-muted text-sm py-6">اختر قطعة من اليمين</p>
                ) : (
                  <div className="space-y-2">
                    {lines.map((l) => (
                      <div key={l.partId} className="border-b border-dashed border-line pb-2">
                        <div className="flex justify-between items-start gap-2 text-sm font-semibold">
                          <span className="flex-1">{l.name}</span>
                          <button onClick={() => removeLine(l.partId)} className="text-red-500"><Trash2 size={14} /></button>
                        </div>
                        <div className="mt-2">
                          <label className="block text-xs text-muted mb-1">الكمية (متاح: {l.max})</label>
                          <input type="number" min="1" max={l.max} step="1" className="input py-1.5"
                                 value={l.qty}
                                 onChange={(e) => updateLine(l.partId, Math.min(+e.target.value, l.max))} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  className="btn-primary w-full mt-4"
                  onClick={() => createTransfer.mutate()}
                  disabled={!toBranch || lines.length === 0 || createTransfer.isPending}>
                  {createTransfer.isPending ? 'جاري الإرسال...' : 'إنشاء التحويل'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h3 className="font-extrabold mb-3">حركة التحويلات</h3>
        <div className="overflow-x-auto -mx-3 sm:mx-0">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="text-right text-muted text-xs font-bold border-b-2 border-line">
              <th className="px-2 py-3">التاريخ</th>
              <th className="px-2 py-3">من</th>
              <th className="px-2 py-3"></th>
              <th className="px-2 py-3">إلى</th>
              <th className="px-2 py-3">القطع</th>
              <th className="px-2 py-3">الحالة</th>
              <th className="px-2 py-3 text-left">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {transfersQ.isLoading && <tr><td className="p-8 text-center text-muted" colSpan={7}>جاري التحميل…</td></tr>}
            {!transfersQ.isLoading && (transfersQ.data ?? []).length === 0 && (
              <tr><td className="p-8 text-center text-muted" colSpan={7}>لا تحويلات بعد</td></tr>
            )}
            {(transfersQ.data ?? []).map((t) => (
              <tr key={t.id} className="border-b border-line hover:bg-slate-50">
                <td className="px-2 py-3">{new Date(t.createdAt).toLocaleDateString('ar-JO')}</td>
                <td className="px-2 py-3 font-bold">{t.from?.name ?? '—'}</td>
                <td className="px-2 py-3 text-muted"><ArrowLeftRight size={14} /></td>
                <td className="px-2 py-3 font-bold">{t.to?.name ?? '—'}</td>
                <td className="px-2 py-3">{t.items.length} قطعة</td>
                <td className="px-2 py-3">
                  <span className={'pill ' + (STATUS_PILL[t.status] || 'pill-gray')}>
                    {STATUS_LABEL[t.status] || t.status}
                  </span>
                </td>
                <td className="px-2 py-3 text-left">
                  {t.status === 'in_transit' && (
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => receive.mutate(t)} className="btn-primary py-1 px-3 text-xs">
                        <CheckCircle2 size={14} /> استلم
                      </button>
                      <button onClick={() => { if (confirm('إلغاء التحويل وإرجاع البضاعة للمصدر؟')) cancel.mutate(t); }}
                              className="btn-ghost py-1 px-3 text-xs">
                        <X size={14} /> إلغاء
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
