/**
 * ReportDetailDrawer
 * ─────────────────────────────────────────────────────────────────
 * One generic drawer that powers the drill-down for every KPI card
 * on the financial reports page.
 *
 * mode = 'revenue' | 'cogs' | 'profit' | 'expenses' | 'net-profit'
 *      | 'invoices' | 'purchases' | 'returns' | 'tax'
 *
 * Each mode hits its own /reports/details/<mode> endpoint, renders a
 * tailored layout, and exposes Print / PDF / Excel via PrintBar.
 *
 * • lazy: only fetches when `open` is true
 * • RTL + print-friendly (id="print-area" wraps the report body)
 * • clicking a row that has a deep-link navigates to that resource
 */
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { X, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtMoney, fmtNum, fmtDate } from '@/lib/format';
import PrintBar from '@/components/print/PrintBar';

export type DetailMode =
  | 'revenue' | 'cogs' | 'profit' | 'expenses' | 'net-profit'
  | 'invoices' | 'purchases' | 'returns' | 'tax';

const TITLES: Record<DetailMode, string> = {
  'revenue':     'تفاصيل الإيراد',
  'cogs':        'تفاصيل تكلفة البضاعة',
  'profit':      'تفاصيل إجمالي الربح',
  'expenses':    'تفاصيل المصاريف',
  'net-profit':  'تفاصيل صافي الربح',
  'invoices':    'كل الفواتير',
  'purchases':   'كل المشتريات',
  'returns':     'كل المرتجعات',
  'tax':         'الضريبة المحصّلة',
};

interface Props {
  open:  boolean;
  mode:  DetailMode | null;
  from:  string;
  to:    string;
  onClose: () => void;
}

export default function ReportDetailDrawer({ open, mode, from, to, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open || !mode) return null;
  const title = TITLES[mode];
  const subtitle = `الفترة: ${from} → ${to}`;

  return (
    <div className="fixed inset-0 z-50 flex bg-black/50">
      {/* RTL: drawer slides from the right (which is visually the "right" in our RTL layout — Tailwind ml-auto in RTL = right side) */}
      <div className="fixed top-0 left-0 sm:left-auto sm:right-0 bottom-0 w-full sm:w-[88vw] lg:w-[78vw] xl:w-[68vw] bg-white shadow-2xl flex flex-col print-drawer">
        <div className="flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-line shrink-0 no-print">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-xl font-extrabold truncate">{title}</h2>
            <p className="text-muted text-xs sm:text-sm mt-0.5">{subtitle}</p>
          </div>
          <button onClick={onClose} aria-label="إغلاق"
                  className="text-muted hover:text-ink p-1.5 -mr-1 rounded-lg hover:bg-bg shrink-0">
            <X size={22} />
          </button>
        </div>

        <div id="print-area" className="flex-1 overflow-y-auto p-4 sm:p-5">
          <DetailBody mode={mode} from={from} to={to} subtitle={subtitle} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
//  Body — switches on mode
// ─────────────────────────────────────────────────────────────────────

function DetailBody({
  mode, from, to, subtitle,
}: { mode: DetailMode; from: string; to: string; subtitle: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['report-details', mode, from, to],
    queryFn: async () => (await api.get(`/reports/details/${mode}`, { params: { from, to } })).data,
    enabled: !!mode,
  });

  if (isLoading) return <SkeletonTable />;
  if (error)     return <p className="text-red-700 text-center py-10 font-semibold">فشل تحميل التقرير — حاول مجدّداً</p>;
  if (!data)     return null;

  switch (mode) {
    case 'revenue':    return <RevenueView    data={data} subtitle={subtitle} />;
    case 'cogs':       return <CogsView       data={data} subtitle={subtitle} />;
    case 'profit':     return <ProfitView     data={data} subtitle={subtitle} />;
    case 'expenses':   return <ExpensesView   data={data} subtitle={subtitle} />;
    case 'net-profit': return <NetProfitView  data={data} subtitle={subtitle} />;
    case 'invoices':   return <InvoicesView   data={data} subtitle={subtitle} />;
    case 'purchases':  return <PurchasesView  data={data} subtitle={subtitle} />;
    case 'returns':    return <ReturnsView    data={data} subtitle={subtitle} />;
    case 'tax':        return <TaxView        data={data} subtitle={subtitle} />;
  }
}

// ─────────────────────────────────────────────────────────────────────
//  Reusable bits
// ─────────────────────────────────────────────────────────────────────

function SkeletonTable() {
  return (
    <div className="animate-pulse space-y-2.5">
      <div className="h-9 bg-bg rounded w-1/3"></div>
      <div className="h-6 bg-bg rounded w-1/2"></div>
      <div className="h-px bg-line my-3"></div>
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="h-9 bg-bg rounded"></div>
      ))}
    </div>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return <h3 className="font-extrabold text-base mb-2 mt-4 first:mt-0">{children}</h3>;
}

function ExportToolbar({
  title, subtitle, columns, rows, summary,
}: {
  title: string; subtitle: string;
  columns: { key: string; label: string; format?: (v: any) => string; width?: number }[];
  rows: any[];
  summary?: { label: string; value: string | number }[];
}) {
  return (
    <div className="no-print mb-3 flex items-center justify-between gap-2 flex-wrap">
      <div className="text-xs text-muted">
        المعروض: <span className="font-bold text-ink">{fmtNum(rows.length)}</span> سجلّ
      </div>
      <PrintBar title={title} subtitle={subtitle} columns={columns as any} rows={rows} summary={summary} />
    </div>
  );
}

function DeepLinkCell({ to, children }: { to: string; children: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(to)}
      className="text-primary hover:underline inline-flex items-center gap-1 font-bold"
      type="button"
    >
      {children}
      <ExternalLink size={12} className="opacity-60" />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
//  Mode views — each has tailored columns & layout
// ─────────────────────────────────────────────────────────────────────

function RevenueView({ data, subtitle }: { data: any; subtitle: string }) {
  const rows = data.rows ?? [];
  const cols = [
    { key: 'invoiceNo',   label: 'رقم الفاتورة', width: 18 },
    { key: 'date',        label: 'التاريخ',     width: 14, format: (v: any) => fmtDate(v) },
    { key: 'customer',    label: 'العميل',      width: 20 },
    { key: 'branch',      label: 'الفرع',       width: 14 },
    { key: 'paymentType', label: 'الدفع',       width: 10 },
    { key: 'net',         label: 'الصافي',      width: 12, format: (v: number) => fmtMoney(v) },
  ];
  return (
    <>
      <ExportToolbar
        title="تفاصيل الإيراد" subtitle={subtitle}
        columns={cols} rows={rows}
        summary={[
          { label: 'إجمالي الإيراد', value: fmtMoney(data.total ?? 0) },
          { label: 'عدد الفواتير',   value: fmtNum(data.count ?? 0) },
        ]}
      />
      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="text-muted text-xs">
            <tr className="border-b-2 border-line text-right">
              <th className="px-3 py-2.5">رقم الفاتورة</th>
              <th className="px-3 py-2.5">التاريخ</th>
              <th className="px-3 py-2.5">العميل</th>
              <th className="px-3 py-2.5">الفرع</th>
              <th className="px-3 py-2.5">الدفع</th>
              <th className="px-3 py-2.5">المبلغ</th>
              <th className="px-3 py-2.5 no-print"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} className="border-b border-line hover:bg-bg/60">
                <td className="px-3 py-2 font-bold">{r.invoiceNo}</td>
                <td className="px-3 py-2 text-muted text-xs">{fmtDate(r.date)}</td>
                <td className="px-3 py-2">{r.customer}</td>
                <td className="px-3 py-2 text-xs">{r.branch}</td>
                <td className="px-3 py-2 text-xs">{r.paymentType === 'cash' ? 'نقدي' : 'آجل'}</td>
                <td className="px-3 py-2 font-bold text-green-700">{fmtMoney(r.net)}</td>
                <td className="px-3 py-2 no-print">
                  <DeepLinkCell to={`/invoices?focus=${r.id}`}>فتح</DeepLinkCell>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="text-center text-muted py-8">لا فواتير في هذه الفترة</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CogsView({ data, subtitle }: { data: any; subtitle: string }) {
  const rows = data.rows ?? [];
  const cols = [
    { key: 'sku',       label: 'SKU',         width: 16 },
    { key: 'name',      label: 'القطعة',      width: 28 },
    { key: 'qty',       label: 'الكمية',      width: 10, format: (v: number) => fmtNum(v) },
    { key: 'avgCost',   label: 'متوسط الشراء', width: 14, format: (v: number) => fmtMoney(v) },
    { key: 'totalCost', label: 'إجمالي التكلفة', width: 14, format: (v: number) => fmtMoney(v) },
    { key: 'branches',  label: 'الفروع',      width: 18 },
    { key: 'suppliers', label: 'المورّدون',   width: 18 },
  ];
  return (
    <>
      <ExportToolbar
        title="تفاصيل تكلفة البضاعة" subtitle={subtitle}
        columns={cols} rows={rows}
        summary={[
          { label: 'إجمالي التكلفة', value: fmtMoney(data.total ?? 0) },
          { label: 'عدد القطع',     value: fmtNum(data.count ?? 0) },
        ]}
      />
      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="text-muted text-xs">
            <tr className="border-b-2 border-line text-right">
              <th className="px-3 py-2.5">SKU</th>
              <th className="px-3 py-2.5">القطعة</th>
              <th className="px-3 py-2.5">الكمية</th>
              <th className="px-3 py-2.5">متوسط الشراء</th>
              <th className="px-3 py-2.5">إجمالي التكلفة</th>
              <th className="px-3 py-2.5">الفروع</th>
              <th className="px-3 py-2.5">المورّد الأخير</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.partId} className="border-b border-line hover:bg-bg/60">
                <td className="px-3 py-2 text-muted text-xs">{r.sku}</td>
                <td className="px-3 py-2 font-bold">{r.name}</td>
                <td className="px-3 py-2">{fmtNum(r.qty)}</td>
                <td className="px-3 py-2">{fmtMoney(r.avgCost)}</td>
                <td className="px-3 py-2 font-bold text-amber-700">{fmtMoney(r.totalCost)}</td>
                <td className="px-3 py-2 text-xs">{r.branches || '—'}</td>
                <td className="px-3 py-2 text-xs">{r.suppliers || '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="text-center text-muted py-8">لا قطع مباعة</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ProfitView({ data, subtitle }: { data: any; subtitle: string }) {
  // Combined: top 3 sections + per-invoice profit
  const perInv = data.perInvoice ?? [];
  const cols = [
    { key: 'invoiceNo', label: 'الفاتورة',  width: 16 },
    { key: 'customer',  label: 'العميل',    width: 20 },
    { key: 'branch',    label: 'الفرع',     width: 12 },
    { key: 'revenue',   label: 'الإيراد',   width: 12, format: (v: number) => fmtMoney(v) },
    { key: 'cost',      label: 'التكلفة',   width: 12, format: (v: number) => fmtMoney(v) },
    { key: 'profit',    label: 'الربح',     width: 12, format: (v: number) => fmtMoney(v) },
    { key: 'margin',    label: 'الهامش %',  width: 10, format: (v: number) => `${v}%` },
  ];
  return (
    <>
      <ExportToolbar
        title="تفاصيل إجمالي الربح" subtitle={subtitle}
        columns={cols} rows={perInv}
        summary={[{ label: 'إجمالي الربح', value: fmtMoney(data.total ?? 0) }]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <TopList title="🏆 أعلى القطع ربحاً"   rows={data.topParts ?? []} />
        <TopList title="👤 أعلى العملاء ربحاً" rows={data.topCustomers ?? []} />
        <TopList title="🏢 أعلى الفروع ربحاً" rows={data.topBranches ?? []} />
      </div>

      {/* Simple bar chart (CSS only — no external libs) */}
      <SectionHead>📊 توزيع الربح (Top 10 فواتير)</SectionHead>
      <div className="card no-print">
        <ProfitBars rows={perInv.slice(0, 10)} />
      </div>

      <SectionHead>هامش الربح لكل فاتورة</SectionHead>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="text-muted text-xs">
            <tr className="border-b-2 border-line text-right">
              <th className="px-3 py-2.5">الفاتورة</th>
              <th className="px-3 py-2.5">العميل</th>
              <th className="px-3 py-2.5">الفرع</th>
              <th className="px-3 py-2.5">الإيراد</th>
              <th className="px-3 py-2.5">التكلفة</th>
              <th className="px-3 py-2.5">الربح</th>
              <th className="px-3 py-2.5">الهامش</th>
            </tr>
          </thead>
          <tbody>
            {perInv.map((r: any) => (
              <tr key={r.invoiceId} className="border-b border-line hover:bg-bg/60">
                <td className="px-3 py-2 font-bold">{r.invoiceNo}</td>
                <td className="px-3 py-2">{r.customer}</td>
                <td className="px-3 py-2 text-xs">{r.branch}</td>
                <td className="px-3 py-2">{fmtMoney(r.revenue)}</td>
                <td className="px-3 py-2">{fmtMoney(r.cost)}</td>
                <td className={'px-3 py-2 font-bold ' + (r.profit >= 0 ? 'text-green-700' : 'text-red-700')}>
                  {fmtMoney(r.profit)}
                </td>
                <td className="px-3 py-2">
                  <span className={'pill ' + (r.margin >= 25 ? 'pill-green' : r.margin >= 10 ? 'pill-amber' : 'pill-red')}>
                    {r.margin}%
                  </span>
                </td>
              </tr>
            ))}
            {perInv.length === 0 && (
              <tr><td colSpan={7} className="text-center text-muted py-8">لا فواتير ربحية في الفترة</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TopList({ title, rows }: { title: string; rows: any[] }) {
  return (
    <div className="card">
      <h4 className="font-extrabold mb-2 text-sm">{title}</h4>
      {rows.length === 0 ? <p className="text-muted text-center py-4 text-xs">لا بيانات</p> : (
        <ul className="text-sm space-y-1.5">
          {rows.slice(0, 7).map((r) => (
            <li key={r.id} className="row-divide">
              <span className="font-semibold truncate">{r.name}</span>
              <span className={'font-bold ' + (r.profit >= 0 ? 'text-green-700' : 'text-red-700')}>
                {fmtMoney(r.profit)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProfitBars({ rows }: { rows: any[] }) {
  if (rows.length === 0) return <p className="text-muted text-center py-6 text-sm">لا فواتير</p>;
  const max = Math.max(...rows.map((r) => Math.abs(r.profit)), 1);
  return (
    <div className="space-y-1.5">
      {rows.map((r) => {
        const w = (Math.abs(r.profit) / max) * 100;
        const isPos = r.profit >= 0;
        return (
          <div key={r.invoiceId} className="text-xs">
            <div className="flex justify-between mb-0.5">
              <span className="font-semibold">{r.invoiceNo}</span>
              <span className={'font-bold ' + (isPos ? 'text-green-700' : 'text-red-700')}>{fmtMoney(r.profit)}</span>
            </div>
            <div className="h-2 bg-bg rounded overflow-hidden">
              <div
                className={(isPos ? 'bg-green-500' : 'bg-red-500')}
                style={{ width: `${w}%`, height: '100%' }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ExpensesView({ data, subtitle }: { data: any; subtitle: string }) {
  const rows = data.rows ?? [];
  const cols = [
    { key: 'date',        label: 'التاريخ',  width: 14, format: (v: any) => fmtDate(v) },
    { key: 'category',    label: 'التصنيف',  width: 14 },
    { key: 'description', label: 'الوصف',   width: 24 },
    { key: 'branch',      label: 'الفرع',    width: 14 },
    { key: 'user',        label: 'بواسطة',  width: 14 },
    { key: 'amount',      label: 'المبلغ',  width: 12, format: (v: number) => fmtMoney(v) },
  ];
  return (
    <>
      <ExportToolbar
        title="تفاصيل المصاريف" subtitle={subtitle}
        columns={cols} rows={rows}
        summary={[
          { label: 'إجمالي المصاريف', value: fmtMoney(data.total ?? 0) },
          { label: 'عدد المصاريف',   value: fmtNum(data.count ?? 0) },
        ]}
      />
      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="text-muted text-xs">
            <tr className="border-b-2 border-line text-right">
              <th className="px-3 py-2.5">التاريخ</th>
              <th className="px-3 py-2.5">التصنيف</th>
              <th className="px-3 py-2.5">الوصف</th>
              <th className="px-3 py-2.5">الفرع</th>
              <th className="px-3 py-2.5">بواسطة</th>
              <th className="px-3 py-2.5">المبلغ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} className="border-b border-line hover:bg-bg/60">
                <td className="px-3 py-2 text-muted text-xs">{fmtDate(r.date)}</td>
                <td className="px-3 py-2">{r.category}</td>
                <td className="px-3 py-2">{r.description}</td>
                <td className="px-3 py-2 text-xs">{r.branch}</td>
                <td className="px-3 py-2 text-xs">{r.user}</td>
                <td className="px-3 py-2 font-bold text-red-700">{fmtMoney(r.amount)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted py-8">لا مصاريف في الفترة</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function NetProfitView({ data, subtitle }: { data: any; subtitle: string }) {
  const eq = data.equation ?? {};
  const rows = [
    { item: 'الإيرادات (مبيعات صافية)', value: eq.revenue,    op: '+' },
    { item: 'تكلفة البضاعة (COGS)',      value: eq.cogs,       op: '−' },
    { item: 'المصاريف التشغيلية',         value: eq.expenses,   op: '−' },
    { item: 'مرتجعات المبيعات',           value: eq.returns,    op: '−' },
    { item: 'صافي الربح',                value: eq.netProfit,  op: '=' },
  ];
  const cols = [
    { key: 'op',    label: 'العملية', width: 8 },
    { key: 'item',  label: 'البند',   width: 40 },
    { key: 'value', label: 'القيمة',  width: 16, format: (v: number) => fmtMoney(v) },
  ];
  const isProfit = (eq.netProfit ?? 0) > 0;
  return (
    <>
      <ExportToolbar
        title="تفاصيل صافي الربح" subtitle={subtitle}
        columns={cols} rows={rows}
        summary={[
          { label: 'صافي الربح',  value: fmtMoney(eq.netProfit ?? 0) },
          { label: 'هامش الصافي', value: `${data.netMargin ?? 0}%` },
        ]}
      />

      <div className={'card text-center py-6 ' + (isProfit ? 'border-r-4 border-green-500' : 'border-r-4 border-red-500')}>
        <div className="text-muted text-xs mb-1">صافي الربح للفترة</div>
        <div className={'text-4xl font-extrabold ' + (isProfit ? 'text-green-700' : 'text-red-700')}>
          {fmtMoney(eq.netProfit ?? 0)}
        </div>
        <div className="text-muted text-xs mt-1">هامش الصافي {data.netMargin ?? 0}%</div>
      </div>

      <SectionHead>المعادلة</SectionHead>
      <div className="card">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={'border-b border-line ' + (r.op === '=' ? 'bg-bg font-extrabold' : '')}>
                <td className="px-3 py-2.5 text-center font-mono text-lg w-12">{r.op}</td>
                <td className="px-3 py-2.5">{r.item}</td>
                <td className={'px-3 py-2.5 font-bold text-left ltr ' + (r.op === '−' ? 'text-red-700' : r.op === '=' ? (isProfit ? 'text-green-700' : 'text-red-700') : 'text-green-700')}>
                  {fmtMoney(r.value ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionHead>التفسير</SectionHead>
      <div className="card text-sm leading-7">
        {data.explanation ?? '—'}
        <div className="mt-2 text-xs text-muted">
          ملاحظة: الضريبة المحصّلة ({fmtMoney(eq.taxIncluded ?? 0)}) ليست ربحاً —
          هي مبلغ يُدفع للجهات الضريبية وتُعرض هنا للمرجعية فقط.
        </div>
      </div>
    </>
  );
}

function InvoicesView({ data, subtitle }: { data: any; subtitle: string }) {
  const rows = data.rows ?? [];
  const cols = [
    { key: 'invoiceNo',   label: 'الفاتورة', width: 16 },
    { key: 'date',        label: 'التاريخ',  width: 14, format: (v: any) => fmtDate(v) },
    { key: 'customer',    label: 'العميل',   width: 20 },
    { key: 'branch',      label: 'الفرع',    width: 14 },
    { key: 'user',        label: 'بواسطة',   width: 14 },
    { key: 'paymentType', label: 'الدفع',    width: 10 },
    { key: 'status',      label: 'الحالة',   width: 10 },
    { key: 'total',       label: 'الإجمالي', width: 12, format: (v: number) => fmtMoney(v) },
  ];
  return (
    <>
      <ExportToolbar
        title="كل الفواتير" subtitle={subtitle}
        columns={cols} rows={rows}
        summary={[
          { label: 'إجمالي القيمة', value: fmtMoney(data.total ?? 0) },
          { label: 'عدد الفواتير', value: fmtNum(data.count ?? 0) },
        ]}
      />
      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead className="text-muted text-xs">
            <tr className="border-b-2 border-line text-right">
              <th className="px-3 py-2.5">الفاتورة</th>
              <th className="px-3 py-2.5">التاريخ</th>
              <th className="px-3 py-2.5">العميل</th>
              <th className="px-3 py-2.5">الفرع</th>
              <th className="px-3 py-2.5">بواسطة</th>
              <th className="px-3 py-2.5">الدفع</th>
              <th className="px-3 py-2.5">الحالة</th>
              <th className="px-3 py-2.5">الإجمالي</th>
              <th className="px-3 py-2.5 no-print"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} className="border-b border-line hover:bg-bg/60">
                <td className="px-3 py-2 font-bold">{r.invoiceNo}</td>
                <td className="px-3 py-2 text-muted text-xs">{fmtDate(r.date)}</td>
                <td className="px-3 py-2">{r.customer}</td>
                <td className="px-3 py-2 text-xs">{r.branch}</td>
                <td className="px-3 py-2 text-xs">{r.user}</td>
                <td className="px-3 py-2 text-xs">{r.paymentType === 'cash' ? 'نقدي' : 'آجل'}</td>
                <td className="px-3 py-2 text-xs">
                  <span className={'pill ' + (r.status === 'completed' ? 'pill-green' : r.status === 'cancelled' ? 'pill-red' : 'pill-amber')}>
                    {r.status === 'completed' ? 'مكتمل' : r.status === 'cancelled' ? 'ملغى' : r.status}
                  </span>
                </td>
                <td className="px-3 py-2 font-bold">{fmtMoney(r.total)}</td>
                <td className="px-3 py-2 no-print">
                  <DeepLinkCell to={`/invoices?focus=${r.id}`}>فتح</DeepLinkCell>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={9} className="text-center text-muted py-8">لا فواتير</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function PurchasesView({ data, subtitle }: { data: any; subtitle: string }) {
  const rows = data.rows ?? [];
  const cols = [
    { key: 'invoiceNo',   label: 'فاتورة',   width: 16 },
    { key: 'date',        label: 'التاريخ',  width: 14, format: (v: any) => fmtDate(v) },
    { key: 'supplier',    label: 'المورد',   width: 20 },
    { key: 'branch',      label: 'الفرع',    width: 14 },
    { key: 'paymentType', label: 'الدفع',    width: 10 },
    { key: 'total',       label: 'القيمة',   width: 12, format: (v: number) => fmtMoney(v) },
  ];
  return (
    <>
      <ExportToolbar
        title="كل المشتريات" subtitle={subtitle}
        columns={cols} rows={rows}
        summary={[
          { label: 'إجمالي المشتريات', value: fmtMoney(data.total ?? 0) },
          { label: 'عدد الفواتير',     value: fmtNum(data.count ?? 0) },
        ]}
      />
      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="text-muted text-xs">
            <tr className="border-b-2 border-line text-right">
              <th className="px-3 py-2.5">فاتورة</th>
              <th className="px-3 py-2.5">التاريخ</th>
              <th className="px-3 py-2.5">المورد</th>
              <th className="px-3 py-2.5">الفرع</th>
              <th className="px-3 py-2.5">الدفع</th>
              <th className="px-3 py-2.5">القيمة</th>
              <th className="px-3 py-2.5 no-print"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} className="border-b border-line hover:bg-bg/60">
                <td className="px-3 py-2 font-bold">{r.invoiceNo}</td>
                <td className="px-3 py-2 text-muted text-xs">{fmtDate(r.date)}</td>
                <td className="px-3 py-2">{r.supplier}</td>
                <td className="px-3 py-2 text-xs">{r.branch}</td>
                <td className="px-3 py-2 text-xs">{r.paymentType === 'cash' ? 'نقدي' : 'آجل'}</td>
                <td className="px-3 py-2 font-bold text-amber-700">{fmtMoney(r.total)}</td>
                <td className="px-3 py-2 no-print">
                  <DeepLinkCell to={`/purchases?focus=${r.id}`}>فتح</DeepLinkCell>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="text-center text-muted py-8">لا مشتريات</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ReturnsView({ data, subtitle }: { data: any; subtitle: string }) {
  const rows = data.rows ?? [];
  const cols = [
    { key: 'date',         label: 'التاريخ',     width: 14, format: (v: any) => fmtDate(v) },
    { key: 'invoiceNo',    label: 'الفاتورة',    width: 14 },
    { key: 'customer',     label: 'العميل',      width: 18 },
    { key: 'branch',       label: 'الفرع',       width: 12 },
    { key: 'reason',       label: 'السبب',       width: 22 },
    { key: 'refundMethod', label: 'الاسترداد',   width: 10 },
    { key: 'total',        label: 'القيمة',      width: 12, format: (v: number) => fmtMoney(v) },
  ];
  return (
    <>
      <ExportToolbar
        title="كل المرتجعات" subtitle={subtitle}
        columns={cols} rows={rows}
        summary={[
          { label: 'إجمالي المرتجعات', value: fmtMoney(data.total ?? 0) },
          { label: 'عدد العمليات',     value: fmtNum(data.count ?? 0) },
        ]}
      />
      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="text-muted text-xs">
            <tr className="border-b-2 border-line text-right">
              <th className="px-3 py-2.5">التاريخ</th>
              <th className="px-3 py-2.5">الفاتورة</th>
              <th className="px-3 py-2.5">العميل</th>
              <th className="px-3 py-2.5">الفرع</th>
              <th className="px-3 py-2.5">السبب</th>
              <th className="px-3 py-2.5">الاسترداد</th>
              <th className="px-3 py-2.5">القطع</th>
              <th className="px-3 py-2.5">القيمة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} className="border-b border-line hover:bg-bg/60">
                <td className="px-3 py-2 text-muted text-xs">{fmtDate(r.date)}</td>
                <td className="px-3 py-2 font-bold">{r.invoiceNo}</td>
                <td className="px-3 py-2">{r.customer}</td>
                <td className="px-3 py-2 text-xs">{r.branch}</td>
                <td className="px-3 py-2 text-xs">{r.reason}</td>
                <td className="px-3 py-2 text-xs">{r.refundMethod}</td>
                <td className="px-3 py-2 text-xs">
                  {(r.items ?? []).map((i: any, ix: number) => (
                    <div key={ix} className="truncate">{fmtNum(i.qty)} × {i.name}</div>
                  ))}
                </td>
                <td className="px-3 py-2 font-bold text-red-700">{fmtMoney(r.total)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="text-center text-muted py-8">لا مرتجعات</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TaxView({ data, subtitle }: { data: any; subtitle: string }) {
  const rows = data.perInvoice ?? [];
  const monthly = data.monthly ?? [];
  const cols = [
    { key: 'invoiceNo', label: 'الفاتورة', width: 14 },
    { key: 'date',      label: 'التاريخ',  width: 12, format: (v: any) => fmtDate(v) },
    { key: 'customer',  label: 'العميل',   width: 20 },
    { key: 'branch',    label: 'الفرع',    width: 14 },
    { key: 'subtotal',  label: 'قبل الضريبة', width: 12, format: (v: number) => fmtMoney(v) },
    { key: 'tax',       label: 'الضريبة',  width: 10, format: (v: number) => fmtMoney(v) },
    { key: 'total',     label: 'الإجمالي', width: 12, format: (v: number) => fmtMoney(v) },
  ];
  return (
    <>
      <ExportToolbar
        title="الضريبة المحصّلة" subtitle={subtitle}
        columns={cols} rows={rows}
        summary={[
          { label: 'إجمالي الضريبة', value: fmtMoney(data.total ?? 0) },
          { label: 'عدد الفواتير',  value: fmtNum(data.count ?? 0) },
        ]}
      />

      <SectionHead>ملخّص شهري — للمحاسب</SectionHead>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted text-xs">
            <tr className="border-b-2 border-line text-right">
              <th className="px-3 py-2.5">الشهر</th>
              <th className="px-3 py-2.5">عدد الفواتير</th>
              <th className="px-3 py-2.5">إجمالي الضريبة</th>
            </tr>
          </thead>
          <tbody>
            {monthly.map((m: any) => (
              <tr key={m.month} className="border-b border-line hover:bg-bg/60">
                <td className="px-3 py-2 font-bold">{m.month}</td>
                <td className="px-3 py-2">{fmtNum(m.count)}</td>
                <td className="px-3 py-2 font-bold text-blue-700">{fmtMoney(m.tax)}</td>
              </tr>
            ))}
            {monthly.length === 0 && (
              <tr><td colSpan={3} className="text-center text-muted py-6">لا ضريبة في الفترة</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <SectionHead>التفصيل الكامل — كل فاتورة فيها ضريبة</SectionHead>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="text-muted text-xs">
            <tr className="border-b-2 border-line text-right">
              <th className="px-3 py-2.5">الفاتورة</th>
              <th className="px-3 py-2.5">التاريخ</th>
              <th className="px-3 py-2.5">العميل</th>
              <th className="px-3 py-2.5">الفرع</th>
              <th className="px-3 py-2.5">قبل الضريبة</th>
              <th className="px-3 py-2.5">الضريبة</th>
              <th className="px-3 py-2.5">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} className="border-b border-line hover:bg-bg/60">
                <td className="px-3 py-2 font-bold">{r.invoiceNo}</td>
                <td className="px-3 py-2 text-muted text-xs">{fmtDate(r.date)}</td>
                <td className="px-3 py-2">{r.customer}</td>
                <td className="px-3 py-2 text-xs">{r.branch}</td>
                <td className="px-3 py-2">{fmtMoney(r.subtotal)}</td>
                <td className="px-3 py-2 font-bold text-blue-700">{fmtMoney(r.tax)}</td>
                <td className="px-3 py-2 font-bold">{fmtMoney(r.total)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="text-center text-muted py-8">لا فواتير ضريبية</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
