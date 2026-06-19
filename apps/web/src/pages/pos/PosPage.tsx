import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Banknote, CreditCard, Search, X, PackageX } from 'lucide-react';

interface Part {
  id: string; sku: string; name: string;
  partNumber: string | null; oemNumber: string | null;
  barcode?: string | null;
  manufacturer?: string | null;
  retailPrice: number; quantity: number; taxRate: number;
}

interface CartItem { partId: string; name: string; unitPrice: number; qty: number; }

/**
 * Debounce a value — useful for search boxes so we don't fire a request on
 * every keystroke. 150ms is fast enough to feel instant but slow enough that
 * a quick "Bosch" type doesn't fire 5 requests.
 */
function useDebounced<T>(value: T, delay = 150): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

/**
 * Strip control chars (including the null byte that crashed Prisma earlier),
 * normalise repeated whitespace, and trim. Send the cleaned text to backend.
 */
function sanitize(s: string): string {
  return s.replace(/[\x00-\x1F\x7F]/g, '').replace(/\s+/g, ' ').trim();
}

export default function PosPage() {
  const branchId = useAuth((s) => s.branchId);
  const taxRate  = useAuth((s) => s.user?.settings?.taxRate ?? 16);
  const qc = useQueryClient();

  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(sanitize(q), 150);
  const [cart, setCart] = useState<CartItem[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { data, isLoading, isFetching } = useQuery<{ items: Part[]; total: number }>({
    queryKey: ['pos-parts', debouncedQ, branchId],
    queryFn: async () => (await api.get('/parts', {
      params: { q: debouncedQ, branchId, perPage: 60 },
    })).data,
    // keep showing the previous results while the new ones load (no flicker)
    placeholderData: keepPreviousData,
  });
  const items = data?.items ?? [];

  const sub = useMemo(() => cart.reduce((s, c) => s + c.unitPrice * c.qty, 0), [cart]);
  const tax = +(sub * (taxRate / 100)).toFixed(3);
  const tot = +(sub + tax).toFixed(3);

  const add = (p: Part) => {
    if (p.quantity <= 0) return;
    setCart((c) => {
      const ex = c.find((i) => i.partId === p.id);
      if (ex) return c.map((i) => i.partId === p.id ? { ...i, qty: i.qty + 1 } : i);
      return [...c, { partId: p.id, name: p.name, unitPrice: Number(p.retailPrice), qty: 1 }];
    });
    // Pop the search back to empty so the cashier can scan the next item.
    // Don't blur — keep focus on the input for instant next-scan.
    setQ('');
    inputRef.current?.focus();
  };

  // Barcode-scanner workflow: most scanners send the code then a newline.
  // If Enter is pressed and there's exactly one match (or any match starts
  // with what's been typed exactly), add it to the cart immediately.
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (items.length === 0) return;
    // Prefer an exact barcode/SKU/partNumber/OEM match if present.
    const term = debouncedQ.toLowerCase();
    const exact = items.find((p) =>
      [p.barcode, p.sku, p.partNumber, p.oemNumber]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase())
        .includes(term),
    );
    const target = exact ?? items[0];
    if (target) add(target);
  };

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
      if (window.confirm(`✅ تم إصدار الفاتورة ${invoice.invoiceNo}\n\nهل تريد طباعتها الآن؟`)) {
        printInvoice(invoice.id).catch((e) => alert('فشل تحميل الفاتورة: ' + e.message));
      }
    },
    onError: (e: any) => alert(e?.response?.data?.message ?? e.message),
  });

  async function printInvoice(id: string) {
    const res = await api.get(`/invoices/${id}/print`, { responseType: 'text' });
    const html = res.data as string;
    // Open in new tab via Blob URL — Chrome doesn't block tab-opens, only popups.
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) {
      URL.revokeObjectURL(url);
      alert('السماح بفتح علامات تبويب جديدة مطلوب للطباعة');
      return;
    }
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-1">نقطة البيع (POS)</h1>
      <p className="text-muted text-sm mb-6">
        امسح الباركود أو اكتب رقم القطعة / OEM / الاسم — Enter يضيف أوّل نتيجة للسلة
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_380px] gap-4">
        <div>
          <div className="relative mb-3">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" size={18} />
            <input
              ref={inputRef}
              className="input pr-10 pl-10"
              placeholder="امسح الباركود أو ابحث (اسم، SKU، رقم القطعة، OEM، الباركود)..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              inputMode="search"
              dir="auto"
            />
            {q && (
              <button
                type="button"
                onClick={() => { setQ(''); inputRef.current?.focus(); }}
                aria-label="مسح البحث"
                className="absolute left-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-bg text-muted hover:text-ink"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Result counter — small but useful proof the search worked */}
          <div className="text-xs text-muted mb-2 flex items-center justify-between">
            <span>
              {isLoading
                ? 'جاري التحميل...'
                : debouncedQ
                  ? `${items.length} نتيجة للبحث: "${debouncedQ}"`
                  : `يعرض ${items.length} صنف`}
              {isFetching && !isLoading && ' • يحدّث...'}
            </span>
          </div>

          {/* Skeleton on first load only — afterwards we keep the previous results */}
          {isLoading && items.length === 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="card animate-pulse h-28 bg-slate-100" />
              ))}
            </div>
          )}

          {/* Empty state — show ONLY when load finished and no items */}
          {!isLoading && items.length === 0 && (
            <div className="card text-center py-12 text-muted">
              <PackageX className="mx-auto mb-3 text-slate-400" size={40} />
              <div className="font-bold text-base mb-1">لا توجد نتائج مطابقة</div>
              <div className="text-xs">
                {debouncedQ
                  ? `لا يوجد صنف بـ"${debouncedQ}" — جرّب بحثاً آخر`
                  : 'لا توجد أصناف معروضة — أضف صنفاً جديداً من صفحة الأصناف'}
              </div>
            </div>
          )}

          {/* Results grid */}
          {items.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {items.map((p) => {
                const isOut = p.quantity <= 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => add(p)}
                    disabled={isOut}
                    type="button"
                    className={
                      'card text-right transition relative ' +
                      (isOut
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:border-accent hover:-translate-y-0.5 active:translate-y-0')
                    }
                  >
                    <div className="text-xs text-muted">{p.partNumber ?? p.sku}</div>
                    <div className="font-bold text-sm my-1 line-clamp-2">{p.name}</div>
                    <div className="text-primary font-extrabold">{Number(p.retailPrice).toFixed(2)} د.أ</div>
                    <div className={'text-xs mt-1 ' + (isOut ? 'text-red-600 font-bold' : 'text-muted')}>
                      {isOut ? 'نفدت' : `المتوفر: ${p.quantity}`}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Cart — sticky على mobile (تحت الـheader مباشرة) و desktop (top-24) */}
        <div className="card h-fit sticky top-[68px] z-20 lg:top-24 shadow-md lg:shadow-none">
          <h3 className="font-extrabold mb-3 flex items-center justify-between">
            <span>🛒 سلة البيع</span>
            {cart.length > 0 && <span className="text-xs bg-primary text-white px-2 py-0.5 rounded-full">{cart.length}</span>}
          </h3>
          {cart.length === 0 ? (
            <p className="text-center text-muted text-sm py-6">السلة فارغة — اختر قطعة</p>
          ) : (
            <div className="space-y-2 max-h-[40vh] lg:max-h-none overflow-y-auto">
              {cart.map((c) => (
                <div key={c.partId} className="flex items-center justify-between gap-2 text-sm py-2 border-b border-dashed border-line">
                  <span className="font-semibold flex-1 line-clamp-2">{c.name}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateQty(c.partId, c.qty - 1)}
                            className="w-9 h-9 lg:w-7 lg:h-7 rounded bg-bg hover:bg-line text-lg font-bold"
                            aria-label="إنقاص">−</button>
                    <span className="font-bold w-7 text-center">{c.qty}</span>
                    <button onClick={() => updateQty(c.partId, c.qty + 1)}
                            className="w-9 h-9 lg:w-7 lg:h-7 rounded bg-bg hover:bg-line text-lg font-bold"
                            aria-label="زيادة">+</button>
                    <button onClick={() => updateQty(c.partId, 0)}
                            className="text-red-500 ms-1 p-1.5 rounded hover:bg-red-50"
                            aria-label="إزالة"><X size={16} /></button>
                  </div>
                  <span className="font-bold w-16 text-left whitespace-nowrap">{(c.unitPrice * c.qty).toFixed(2)}</span>
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
