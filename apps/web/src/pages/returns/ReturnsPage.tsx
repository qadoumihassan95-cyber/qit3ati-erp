import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { fmtMoney, fmtDate, errMsg } from '@/lib/format';
import PageHeader from '@/components/ui/PageHeader';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import { Plus, RotateCcw, Trash2, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Return {
  id: string;
  total: number | string;
  reason: string | null;
  refundMethod: string;
  createdAt: string;
  invoice: { id: string; invoiceNo: string } | null;
  items: Array<{ partId: string; qty: number | string; unitPrice: number | string; condition: string; backToStock: boolean;
                 part: { id: string; sku: string; name: string } }>;
  branch:  { id: string; name: string } | null;
  creator: { id: string; fullName: string } | null;
}

interface SaleInvoice {
  id: string; invoiceNo: string; invoiceDate: string; total: number | string;
  customer: { id: string; name: string } | null;
  items: Array<{ id: string; partId: string; qty: number | string; unitPrice: number | string;
                 part: { id: string; sku: string; name: string } }>;
}

interface ReturnLine { partId: string; name: string; sku: string; qty: number; maxQty: number; condition: 'good'|'damaged'; backToStock: boolean; }

export default function ReturnsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const branchId = useAuth((s) => s.branchId);
  const [show, setShow] = useState(false);

  const { data, isLoading } = useQuery<Return[]>({
    queryKey: ['returns', branchId],
    queryFn: async () => (await api.get('/returns/sales', { params: { branchId } })).data,
  });

  return (
    <div>
      <PageHeader
        title={t("returns.title")}
        subtitle={t("returns.title")}
        actions={<button className="btn-primary" onClick={() => setShow(true)}><Plus size={16} /> مرتجع جديد</button>}
      />

      <div className="card">
        {isLoading ? (
          <p className="text-muted text-center py-8">جاري التحميل...</p>
        ) : (data?.length ?? 0) === 0 ? (
          <EmptyState icon={<RotateCcw size={28} />} title="لا مرتجعات بعد"
            description="عند رجوع البضاعة، اضغط «مرتجع جديد» لاختيار الفاتورة الأصلية"
            action={<button className="btn-primary" onClick={() => setShow(true)}><Plus size={16} /> مرتجع جديد</button>} />
        ) : (
          <div className="overflow-x-auto -mx-3 sm:mx-0">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="text-right text-muted text-xs font-bold border-b-2 border-line">
                  <th className="px-3 py-3">التاريخ</th>
                  <th className="px-3 py-3">الفاتورة الأصلية</th>
                  <th className="px-3 py-3">القطع</th>
                  <th className="px-3 py-3">الإجمالي</th>
                  <th className="px-3 py-3">طريقة الرد</th>
                  <th className="px-3 py-3">السبب</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((r) => (
                  <tr key={r.id} className="border-b border-line hover:bg-slate-50">
                    <td className="px-3 py-3 text-muted">{fmtDate(r.createdAt)}</td>
                    <td className="px-3 py-3 font-bold">{r.invoice?.invoiceNo ?? '—'}</td>
                    <td className="px-3 py-3">{r.items.length} قطعة</td>
                    <td className="px-3 py-3 font-bold text-red-700">{fmtMoney(r.total)}</td>
                    <td className="px-3 py-3"><span className="pill pill-gray">{r.refundMethod === 'credit' ? 'خصم من الذمم' : r.refundMethod === 'bank' ? 'حوالة' : 'نقدي'}</span></td>
                    <td className="px-3 py-3 text-muted text-xs">{r.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={show} onClose={() => setShow(false)} title="إنشاء مرتجع مبيعات" size="lg">
        <ReturnForm onDone={() => {
          setShow(false);
          qc.invalidateQueries({ queryKey: ['returns'] });
          qc.invalidateQueries({ queryKey: ['stock'] });
          qc.invalidateQueries({ queryKey: ['customers'] });
          qc.invalidateQueries({ queryKey: ['dashboard'] });
        }} />
      </Modal>
    </div>
  );
}

function ReturnForm({ onDone }: { onDone: () => void }) {
  const branchId = useAuth((s) => s.branchId);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<SaleInvoice | null>(null);
  const [lines, setLines] = useState<ReturnLine[]>([]);
  const [reason, setReason] = useState('');
  const [refundMethod, setRefundMethod] = useState<'cash' | 'bank' | 'credit'>('cash');

  const salesQ = useQuery<{ items: SaleInvoice[] }>({
    queryKey: ['sales-for-return', invoiceSearch],
    queryFn: async () => (await api.get('/sales', { params: { perPage: 30 } })).data,
    enabled: !selectedInvoice,
  });

  const filteredInvoices = (salesQ.data?.items ?? []).filter((s) =>
    !invoiceSearch || s.invoiceNo?.toLowerCase().includes(invoiceSearch.toLowerCase())
  );

  const pickInvoice = async (s: SaleInvoice) => {
    // Fetch full invoice with items
    const full = (await api.get('/sales/' + s.id)).data as SaleInvoice;
    setSelectedInvoice(full);
    setLines(full.items.map((it) => ({
      partId: it.partId, name: it.part.name, sku: it.part.sku,
      qty: 0, maxQty: Number(it.qty),
      condition: 'good', backToStock: true,
    })));
  };

  const total = lines.reduce((s, l) => {
    const inv = selectedInvoice;
    const origLine = inv?.items.find((i) => i.partId === l.partId);
    const price = Number(origLine?.unitPrice ?? 0);
    return s + (price * l.qty);
  }, 0);

  const updateLine = (id: string, patch: Partial<ReturnLine>) =>
    setLines((c) => c.map((l) => l.partId === id ? { ...l, ...patch } : l));

  const submit = useMutation({
    mutationFn: async () => {
      const items = lines.filter((l) => l.qty > 0).map((l) => ({
        partId: l.partId, qty: l.qty, condition: l.condition, backToStock: l.backToStock,
      }));
      if (items.length === 0) throw new Error('حدّد كمية للإرجاع');
      if (!branchId) throw new Error('اختر فرعاً');
      return (await api.post('/returns/sales', {
        branchId, invoiceId: selectedInvoice?.id, reason: reason || undefined, refundMethod, items,
      })).data;
    },
    onSuccess: () => { alert('✅ تم تسجيل المرتجع'); onDone(); },
    onError: (e) => alert(errMsg(e)),
  });

  if (!selectedInvoice) {
    return (
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
          <input className="input pr-10" placeholder="ابحث عن رقم فاتورة..." value={invoiceSearch} onChange={(e) => setInvoiceSearch(e.target.value)} autoFocus />
        </div>
        <div className="max-h-[400px] overflow-y-auto space-y-2">
          {filteredInvoices.length === 0 ? (
            <p className="text-center text-muted text-sm py-6">لا فواتير لاختيارها</p>
          ) : filteredInvoices.map((s) => (
            <button key={s.id} onClick={() => pickInvoice(s)}
                    className="w-full text-right p-3 border border-line rounded-xl hover:border-accent transition flex justify-between items-center">
              <div>
                <div className="font-bold">{s.invoiceNo}</div>
                <div className="text-xs text-muted">{fmtDate(s.invoiceDate)} · {s.customer?.name ?? 'زبون نقدي'}</div>
              </div>
              <div className="font-bold text-primary">{fmtMoney(s.total)}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-primary text-white p-3 rounded-xl text-sm flex justify-between flex-wrap gap-2">
        <span>الفاتورة: <b>{selectedInvoice.invoiceNo}</b></span>
        <span>{fmtDate(selectedInvoice.invoiceDate)}</span>
        <button onClick={() => { setSelectedInvoice(null); setLines([]); }} className="underline text-xs">تغيير</button>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {lines.map((l) => (
          <div key={l.partId} className="border border-line rounded-xl p-3">
            <div className="flex justify-between items-start gap-2 mb-2">
              <div>
                <div className="font-bold text-sm">{l.name}</div>
                <div className="text-xs text-muted">{l.sku} · كمية بيعت: {l.maxQty}</div>
              </div>
              {l.qty > 0 && <button onClick={() => updateLine(l.partId, { qty: 0 })}
                                   className="text-red-500"><Trash2 size={14} /></button>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-xs text-muted mb-1">كمية الإرجاع</label>
                <input type="number" min={0} max={l.maxQty} step={1} className="input py-1.5"
                       value={l.qty} onChange={(e) => updateLine(l.partId, { qty: Math.min(+e.target.value, l.maxQty) })} />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">الحالة</label>
                <select className="input py-1.5" value={l.condition}
                        onChange={(e) => updateLine(l.partId, { condition: e.target.value as 'good'|'damaged', backToStock: e.target.value === 'good' })}>
                  <option value="good">جيدة</option>
                  <option value="damaged">تالفة</option>
                </select>
              </div>
              {l.condition === 'good' && (
                <div>
                  <label className="block text-xs text-muted mb-1">إرجاع للمخزون؟</label>
                  <select className="input py-1.5" value={l.backToStock ? 'yes' : 'no'}
                          onChange={(e) => updateLine(l.partId, { backToStock: e.target.value === 'yes' })}>
                    <option value="yes">نعم</option>
                    <option value="no">لا، شطب</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-bold mb-1.5">طريقة رد المبلغ</label>
          <select className="input" value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as any)}>
            <option value="cash">نقدي للعميل</option>
            <option value="bank">حوالة بنكية</option>
            <option value="credit">خصم من ذمّة العميل</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-bold mb-1.5">السبب</label>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="عيب تصنيع، تالف، خطأ في الطلب..." />
        </div>
      </div>

      <div className="border-t-2 border-line pt-3 flex justify-between items-center">
        <span className="font-bold text-lg">قيمة المرتجع: <span className="text-red-700">{fmtMoney(total)}</span></span>
        <button onClick={() => submit.mutate()} className="btn-primary" disabled={submit.isPending || total === 0}>
          {submit.isPending ? 'جاري الحفظ...' : 'تأكيد المرتجع'}
        </button>
      </div>
    </div>
  );
}
