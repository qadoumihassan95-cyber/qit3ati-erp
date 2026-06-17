import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Plus, Search, Trash2 } from 'lucide-react';

interface PurchaseInvoice {
  id: string;
  invoiceNo: string | null;
  invoiceDate: string;
  total: string | number;
  paymentType: string;
  status: string;
  supplier: { id: string; name: string } | null;
  items: Array<{ qty: number | string; unitCost: number | string }>;
}

interface Supplier { id: string; name: string }
interface Part {
  id: string; sku: string; name: string;
  partNumber: string | null; costPrice: number; retailPrice: number;
}

interface CartLine { partId: string; name: string; sku: string; qty: number; unitCost: number; }

const fmt = (n: number | string | null | undefined) =>
  new Intl.NumberFormat('ar-JO', { maximumFractionDigits: 2 }).format(Number(n ?? 0)) + ' د.أ';

export default function PurchasesPage() {
  const branchId = useAuth((s) => s.branchId);
  const taxRate  = useAuth((s) => s.user?.settings?.taxRate ?? 16);
  const qc = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [supplierId, setSupplierId] = useState<string>('');
  const [paymentType, setPaymentType] = useState<'cash' | 'credit'>('cash');
  const [partQuery, setPartQuery] = useState('');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [supplierRef, setSupplierRef] = useState('');

  const purchasesQ = useQuery<{ items: PurchaseInvoice[] }>({
    queryKey: ['purchases', branchId],
    queryFn: async () => (await api.get('/purchases', { params: { branchId, perPage: 50 } })).data,
  });

  const suppliersQ = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: async () => (await api.get('/suppliers')).data,
  });

  const partsQ = useQuery<{ items: Part[] }>({
    queryKey: ['purchase-parts', partQuery],
    queryFn: async () => (await api.get('/parts', { params: { q: partQuery, perPage: 12 } })).data,
    enabled: showForm,
  });

  const addLine = (p: Part) => {
    setLines((c) => {
      const ex = c.find((l) => l.partId === p.id);
      if (ex) return c.map((l) => l.partId === p.id ? { ...l, qty: l.qty + 1 } : l);
      return [...c, { partId: p.id, name: p.name, sku: p.sku, qty: 1, unitCost: Number(p.costPrice) || 0 }];
    });
  };
  const updateLine = (id: string, patch: Partial<CartLine>) =>
    setLines((c) => c.map((l) => l.partId === id ? { ...l, ...patch } : l));
  const removeLine = (id: string) => setLines((c) => c.filter((l) => l.partId !== id));

  const subtotal = lines.reduce((s, l) => s + l.qty * l.unitCost, 0);
  const tax = +(subtotal * (taxRate / 100)).toFixed(3);
  const total = +(subtotal + tax).toFixed(3);

  const submit = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new Error('اختر فرعاً أولاً');
      if (lines.length === 0) throw new Error('أضف قطعة واحدة على الأقل');
      return (await api.post('/purchases', {
        branchId,
        supplierId: supplierId || undefined,
        supplierRef: supplierRef || undefined,
        paymentType,
        items: lines.map((l) => ({ partId: l.partId, qty: l.qty, unitCost: l.unitCost })),
      })).data;
    },
    onSuccess: () => {
      setLines([]); setSupplierId(''); setSupplierRef(''); setPaymentType('cash');
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      alert('✅ تم استلام فاتورة الشراء وتحديث المخزون');
    },
    onError: (e: any) => alert(e?.response?.data?.message ?? e.message),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-extrabold">المشتريات</h1>
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          <Plus size={16} /> {showForm ? 'إخفاء النموذج' : 'فاتورة شراء جديدة'}
        </button>
      </div>
      <p className="text-muted text-sm mb-6">فواتير المشتريات من الموردين — تزيد المخزون وتحدّث متوسط التكلفة تلقائياً</p>

      {showForm && (
        <div className="card mb-6">
          <h3 className="font-extrabold text-lg mb-4">فاتورة شراء جديدة</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="block text-sm font-bold mb-1.5">المورد</label>
              <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">— اختر مورّداً —</option>
                {(suppliersQ.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold mb-1.5">رقم فاتورة المورد (اختياري)</label>
              <input className="input" value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} placeholder="مثال: INV-1234" />
            </div>
            <div>
              <label className="block text-sm font-bold mb-1.5">طريقة الدفع</label>
              <select className="input" value={paymentType} onChange={(e) => setPaymentType(e.target.value as any)}>
                <option value="cash">نقدي</option>
                <option value="credit">آجل (على الذمّة)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
            <div>
              <div className="relative mb-3">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
                <input
                  className="input pr-10"
                  placeholder="ابحث عن قطعة لإضافتها..."
                  value={partQuery}
                  onChange={(e) => setPartQuery(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[420px] overflow-y-auto pr-1">
                {(partsQ.data?.items ?? []).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addLine(p)}
                    className="card text-right hover:border-accent transition p-3"
                  >
                    <div className="text-xs text-muted">{p.partNumber ?? p.sku}</div>
                    <div className="font-bold text-sm my-1">{p.name}</div>
                    <div className="text-muted text-xs">تكلفة سابقة: {fmt(p.costPrice)}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="card h-fit">
              <h4 className="font-extrabold mb-3">عناصر الفاتورة</h4>
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
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <div>
                          <label className="block text-xs text-muted mb-1">الكمية</label>
                          <input type="number" min="0.01" step="0.01" className="input py-1.5"
                                 value={l.qty}
                                 onChange={(e) => updateLine(l.partId, { qty: +e.target.value })} />
                        </div>
                        <div>
                          <label className="block text-xs text-muted mb-1">سعر الشراء</label>
                          <input type="number" min="0" step="0.01" className="input py-1.5"
                                 value={l.unitCost}
                                 onChange={(e) => updateLine(l.partId, { unitCost: +e.target.value })} />
                        </div>
                      </div>
                      <div className="text-left text-xs text-muted mt-1">إجمالي: {fmt(l.qty * l.unitCost)}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 pt-4 border-t-2 border-line space-y-1.5 text-sm">
                <div className="flex justify-between text-muted"><span>المجموع قبل الضريبة</span><b>{fmt(subtotal)}</b></div>
                <div className="flex justify-between text-muted"><span>ضريبة {taxRate}%</span><b>{fmt(tax)}</b></div>
                <div className="flex justify-between font-extrabold text-lg text-primary"><span>الإجمالي</span><b>{fmt(total)}</b></div>
              </div>

              <button
                className="btn-primary w-full mt-4"
                onClick={() => submit.mutate()}
                disabled={lines.length === 0 || submit.isPending}>
                {submit.isPending ? 'جاري الحفظ...' : 'حفظ الفاتورة'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="font-extrabold mb-3">آخر فواتير الشراء</h3>
        <div className="overflow-x-auto -mx-3 sm:mx-0">
        <table className="w-full text-sm min-w-[680px]">
          <thead>
            <tr className="text-right text-muted text-xs font-bold border-b-2 border-line">
              <th className="px-2 py-3">رقم الفاتورة</th>
              <th className="px-2 py-3">التاريخ</th>
              <th className="px-2 py-3">المورد</th>
              <th className="px-2 py-3">عدد القطع</th>
              <th className="px-2 py-3">الدفع</th>
              <th className="px-2 py-3">الإجمالي</th>
              <th className="px-2 py-3">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {purchasesQ.isLoading && <tr><td className="p-8 text-center text-muted" colSpan={7}>جاري التحميل…</td></tr>}
            {!purchasesQ.isLoading && (purchasesQ.data?.items ?? []).length === 0 && (
              <tr><td className="p-8 text-center text-muted" colSpan={7}>لا فواتير شراء بعد</td></tr>
            )}
            {(purchasesQ.data?.items ?? []).map((p) => (
              <tr key={p.id} className="border-b border-line hover:bg-slate-50">
                <td className="px-2 py-3 font-bold">{p.invoiceNo ?? '—'}</td>
                <td className="px-2 py-3">{new Date(p.invoiceDate).toLocaleDateString('ar-JO')}</td>
                <td className="px-2 py-3">{p.supplier?.name ?? '—'}</td>
                <td className="px-2 py-3">{p.items.length}</td>
                <td className="px-2 py-3">
                  <span className={'pill ' + (p.paymentType === 'credit' ? 'pill-amber' : 'pill-blue')}>
                    {p.paymentType === 'credit' ? 'آجل' : 'نقدي'}
                  </span>
                </td>
                <td className="px-2 py-3 font-bold">{fmt(p.total)}</td>
                <td className="px-2 py-3">
                  <span className={'pill ' + (p.status === 'received' ? 'pill-green' : 'pill-gray')}>
                    {p.status === 'received' ? 'تم الاستلام' : p.status}
                  </span>
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
