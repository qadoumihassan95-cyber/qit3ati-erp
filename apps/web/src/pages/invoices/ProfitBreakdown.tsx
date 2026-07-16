/**
 * ProfitBreakdown — expandable panel that shows "how was this invoice's
 * gross profit calculated?" with a full FIFO-layer walk-through.
 *
 * Drop it into any invoice detail modal / page:
 *
 *   <ProfitBreakdown invoiceId={invoice.id} />
 *
 * Renders as a collapsed row by default (Revenue / Cost / Profit /
 * Margin summary). Click to expand and see per-line + per-layer detail.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, TrendingUp, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtMoney } from '@/lib/format';

interface BreakdownLine {
  salesItemId: string;
  part: { id: string; sku: string; name: string } | null;
  qty: number;
  unitPrice: number;
  lineRevenue: number;
  unitCost: number;
  totalCost: number;
  grossProfit: number;
  fifoTraced: boolean;
  consumed: Array<{
    qty: number;
    unitCost: number;
    lineCost: number;
    receivedAt: string;
    source: {
      invoiceNo: string | null;
      supplierRef: string | null;
      invoiceDate: string;
      supplier: string | null;
    } | null;
  }>;
}

interface BreakdownData {
  invoice: {
    id: string;
    invoiceNo: string | null;
    invoiceDate: string;
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
  };
  lines: BreakdownLine[];
  totals: {
    revenue: number;
    subtotal: number;
    discount: number;
    tax: number;
    totalCost: number;
    grossProfit: number;
    netProfit: number;
    marginPct: number;
    fullyTraced: boolean;
  };
}

export default function ProfitBreakdown({ invoiceId }: { invoiceId: string }) {
  const [expanded, setExpanded] = useState(false);

  const q = useQuery<BreakdownData>({
    queryKey: ['profit-breakdown', invoiceId],
    queryFn: async () => (await api.get(`/sales/${invoiceId}/profit-breakdown`)).data,
    enabled: !!invoiceId,
    staleTime: 60_000,
  });

  if (q.isLoading) {
    return <div className="text-muted text-sm py-2">جاري حساب هامش الربح...</div>;
  }
  if (q.isError || !q.data) {
    return <div className="text-muted text-sm py-2">تعذّر تحميل تفاصيل الربح.</div>;
  }

  const d = q.data;
  const profitColor = d.totals.grossProfit >= 0 ? 'text-green-700' : 'text-red-700';

  return (
    <div className="border border-line rounded-xl bg-bg/40 overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between p-3 hover:bg-bg/60 transition"
      >
        <div className="flex items-center gap-3">
          <TrendingUp size={18} className={profitColor} />
          <div className="text-right">
            <div className="font-extrabold text-sm">
              الربح الإجمالي: <span className={profitColor}>{fmtMoney(d.totals.grossProfit)}</span>
              <span className="text-xs text-muted mr-2">
                ({d.totals.marginPct.toFixed(1)}% هامش)
              </span>
            </div>
            <div className="text-xs text-muted">
              الإيراد {fmtMoney(d.totals.subtotal)} • التكلفة {fmtMoney(d.totals.totalCost)}
              {!d.totals.fullyTraced && (
                <span className="inline-flex items-center gap-1 mr-2 text-amber-600">
                  <AlertTriangle size={11} /> جزئياً مقدّرة
                </span>
              )}
            </div>
          </div>
        </div>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-line p-3 space-y-3">
          {/* Summary row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <SummaryBox label="الإيراد قبل الضريبة" value={fmtMoney(d.totals.subtotal)} />
            <SummaryBox label="تكلفة البضاعة (COGS)" value={fmtMoney(d.totals.totalCost)} />
            <SummaryBox label="الربح الإجمالي" value={fmtMoney(d.totals.grossProfit)} color={profitColor} />
            <SummaryBox label="الهامش %" value={d.totals.marginPct.toFixed(2) + '%'} color={profitColor} />
          </div>

          {/* Per-line breakdown */}
          {d.lines.map((line) => (
            <div key={line.salesItemId} className="border border-line rounded-lg overflow-hidden">
              <div className="bg-bg/60 px-3 py-2 flex items-center justify-between flex-wrap gap-2 text-sm">
                <div>
                  <div className="font-bold">{line.part?.name ?? '—'} <span className="text-xs text-muted">({line.part?.sku ?? '—'})</span></div>
                  <div className="text-xs text-muted">
                    {line.qty} × {fmtMoney(line.unitPrice)} = {fmtMoney(line.lineRevenue)}
                  </div>
                </div>
                <div className="text-left">
                  <div className={`font-extrabold ${line.grossProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    ربح: {fmtMoney(line.grossProfit)}
                  </div>
                  <div className="text-xs text-muted">تكلفة: {fmtMoney(line.totalCost)}</div>
                </div>
              </div>

              {line.consumed.length > 0 ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-right text-muted border-b border-line">
                      <th className="px-3 py-1.5">الطبقة</th>
                      <th className="px-3 py-1.5">المورد</th>
                      <th className="px-3 py-1.5">تاريخ الاستلام</th>
                      <th className="px-3 py-1.5">الكمية</th>
                      <th className="px-3 py-1.5">سعر التكلفة</th>
                      <th className="px-3 py-1.5">التكلفة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {line.consumed.map((c, i) => (
                      <tr key={i} className="border-b border-line last:border-0">
                        <td className="px-3 py-1.5 font-mono">#{i + 1}</td>
                        <td className="px-3 py-1.5">{c.source?.supplier ?? '—'} <span className="text-muted">{c.source?.invoiceNo ?? ''}</span></td>
                        <td className="px-3 py-1.5 text-muted">{new Date(c.receivedAt).toLocaleDateString()}</td>
                        <td className="px-3 py-1.5">{c.qty}</td>
                        <td className="px-3 py-1.5">{fmtMoney(c.unitCost)}</td>
                        <td className="px-3 py-1.5 font-bold">{fmtMoney(c.lineCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="px-3 py-2 text-xs text-amber-700 bg-amber-50">
                  ⚠ هذه الفاتورة سبقت تفعيل FIFO — التكلفة محسوبة بمتوسّط التكلفة وقت البيع ({fmtMoney(line.unitCost)}).
                </div>
              )}
            </div>
          ))}

          <p className="text-xs text-muted leading-6 border-t border-line pt-2">
            💡 FIFO (First In, First Out) — القطع الأقدم تُباع أولاً. كل بيع يُخصم من أقدم شحنة شراء
            متوفّرة في نفس الفرع، والربح يُحسب من فرق سعر البيع مقارنةً بالتكلفة الفعلية لتلك الشحنة.
          </p>
        </div>
      )}
    </div>
  );
}

function SummaryBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-white border border-line rounded-lg px-3 py-2">
      <div className="text-[10px] text-muted mb-0.5">{label}</div>
      <div className={`font-extrabold ${color ?? ''}`}>{value}</div>
    </div>
  );
}
