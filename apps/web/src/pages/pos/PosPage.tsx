import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Banknote, CreditCard, Search, X } from 'lucide-react';

interface Part {
  id: string; sku: string; name: string;
  partNumber: string | null; oemNumber: string | null;
  retailPrice: number; quantity: number; taxRate: number;
}

interface CartItem { partId: string; name: string; unitPrice: number; qty: number; }

export default function PosPage() {
  const branchId = useAuth((s) => s.branchId);
  const taxRate  = useAuth((s) => s.user?.settings?.taxRate ?? 16);
  const qc = useQueryClient();

  const [q, setQ] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);

  const { data, isLoading } = useQuery<{ items: Part[] }>({
    queryKey: ['pos-parts', q, branchId],
    queryFn: async () => (await api.get('/parts', { params: { q, branchId, perPage: 24 } })).data,
  });

  const sub = useMemo(() => cart.reduce((s, c) => s + c.unitPrice * c.qty, 0), [cart]);
  const tax = +(sub * (taxRate / 100)).toFixed(3);
  const tot = +(sub + tax).toFixed(3);

  const add = (p: Part) =>
    setCart((c) => {
      const ex = c.find((i) => i.partId === p.id);
      if (ex) return c.map((i) => i.partId === p.id ? { ...i, qty: i.qty + 1 } : i);
      return [...c, { partId: p.id, name: p.name, unitPrice: Number(p.retailPrice), qty: 1 }];
    });

  const updateQty = (id: string, qty: number) =>
    setCart((c) => qty <= 0 ? c.filter((i) => i.partId !== id) : c.map((i) => i.partId === id ? { ...i, qty } : i));

  const sale = useMutation({
    mutationFn: async (paymentType: 'cash' | 'credit') => {
      if (!branchId) throw new Error('اختر فرعاً أولاً');
      return (await api.post('/sales', {
        branchId, paymentType,
        items: cart.map((c) => ({ partId: c.partId, qty: c.qty, unitPrice: c.unitPrice })),
      })).data;
    },
    onSuccess: (invoice: any) => {
      setCart([]);
      qc.invalidateQueries({ queryKey: ['pos-parts'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      // Open printable invoice in a new tab — uses JWT via cookie? No, JWT is in auth header.
      // Solution: open backend URL with token query param (already requires JWT via Bearer);
      // pragmatic alternative: ask if user wants to print, then fetch with auth + open blob.
      if (window.confirm(`✅ تم إصدار الفاتورة ${invoice.invoiceNo}\n\nهل تريد طباعتها الآن؟`)) {
        printInvoice(invoice.id).catch((e) => alert('فشل تحميل الفاتورة: ' + e.message));
      }
    },
    onError: (e: any) => alert(e?.response?.data?.message ?? e.message),
  });

  async function printInvoice(id: string) {
    // Fetch HTML with our JWT, then open in a new window for printing.
    const res = await api.get(`/invoices/${id}/print`, { responseType: 'text' });
    const html = res.data as string;
    const w = window.open('', '_blank');
    if (!w) { alert('السماح بالنوافذ المنبثقة مطلوب للطباعة'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-1">نقطة البيع (POS)</h1>
      <p className="text-muted text-sm mb-6">بيع سريع بالباركود — اضغط القطعة لإضافتها للسلة</p>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_380px] gap-4">
        <div>
          <div className="relative mb-3">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
            <input className="input pr-10" placeholder="امسح الباركود أو ابحث عن قطعة..."
                   value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {isLoading && <p className="col-span-3 text-center text-muted py-10">جاري التحميل…</p>}
            {!isLoading && (data?.items ?? []).map((p) => (
              <button key={p.id} onClick={() => add(p)} disabled={p.quantity <= 0}
                      className="card text-right hover:border-accent hover:-translate-y-0.5 transition disabled:opacity-50 disabled:cursor-not-allowed">
                <div className="text-xs text-muted">{p.partNumber ?? p.sku}</div>
                <div className="font-bold text-sm my-1">{p.name}</div>
                <div className="text-primary font-extrabold">{Number(p.retailPrice).toFixed(2)} د.أ</div>
                <div className="text-xs text-muted mt-1">المتوفر: {p.quantity}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Cart */}
        <div className="card h-fit lg:sticky lg:top-24">
          <h3 className="font-extrabold mb-3">🛒 سلة البيع</h3>
          {cart.length === 0 ? (
            <p className="text-center text-muted text-sm py-8">السلة فارغة — اختر قطعة</p>
          ) : (
            <div className="space-y-2">
              {cart.map((c) => (
                <div key={c.partId} className="flex items-center justify-between gap-2 text-sm py-2 border-b border-dashed border-line">
                  <span className="font-semibold flex-1">{c.name}</span>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => updateQty(c.partId, c.qty - 1)} className="w-6 h-6 rounded bg-bg hover:bg-line">−</button>
                    <span className="font-bold w-6 text-center">{c.qty}</span>
                    <button onClick={() => updateQty(c.partId, c.qty + 1)} className="w-6 h-6 rounded bg-bg hover:bg-line">+</button>
                    <button onClick={() => updateQty(c.partId, 0)} className="text-red-500 ms-1"><X size={14} /></button>
                  </div>
                  <span className="font-bold w-16 text-left">{(c.unitPrice * c.qty).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 pt-4 border-t-2 border-line space-y-1.5 text-sm">
            <div className="flex justify-between text-muted"><span>المجموع قبل الضريبة</span><b>{sub.toFixed(2)} د.أ</b></div>
            <div className="flex justify-between text-muted"><span>ضريبة المبيعات {taxRate}%</span><b>{tax.toFixed(2)} د.أ</b></div>
            <div className="flex justify-between font-extrabold text-lg text-primary"><span>الإجمالي</span><b>{tot.toFixed(2)} د.أ</b></div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-3.5">
            <button onClick={() => sale.mutate('cash')} disabled={cart.length === 0 || sale.isPending} className="btn-primary"><Banknote size={16} /> نقدي (F9)</button>
            <button onClick={() => sale.mutate('credit')} disabled={cart.length === 0 || sale.isPending} className="btn-ghost"><CreditCard size={16} /> آجل</button>
          </div>
        </div>
      </div>
    </div>
  );
}
