import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fmtMoney, fmtNum } from '@/lib/format';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import { TrendingUp, Users, Building2, Package, BarChart3, ChevronLeft } from 'lucide-react';
import ReportDetailDrawer, { type DetailMode } from './ReportDetailDrawer';

type Tab = 'pnl' | 'aging-customers' | 'aging-suppliers' | 'turnover' | 'profit-by-part';

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'pnl',              label: 'الأرباح والخسائر',     icon: <TrendingUp size={16} /> },
  { id: 'profit-by-part',   label: 'الأرباح حسب القطعة',   icon: <BarChart3 size={16} /> },
  { id: 'turnover',         label: 'دوران المخزون',         icon: <Package size={16} /> },
  { id: 'aging-customers',  label: 'أعمار ديون العملاء',   icon: <Users size={16} /> },
  { id: 'aging-suppliers',  label: 'ديون للموردين',        icon: <Building2 size={16} /> },
];

const startOfMonth = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const endOfDay     = () => new Date().toISOString().slice(0, 10);

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('pnl');
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo]     = useState(endOfDay());
  const [drillMode, setDrillMode] = useState<DetailMode | null>(null);

  return (
    <div>
      <PageHeader
        title="التقارير المالية والمخزنية"
        subtitle="تحليلات فورية لمساعدتك في اتخاذ قرارات أفضل — انقر على أي بطاقة لرؤية التفاصيل الكاملة"
      />

      <div className="card mb-4">
        <div className="flex gap-2 mb-3 overflow-x-auto -mx-3 px-3 sm:flex-wrap sm:overflow-visible sm:mx-0 sm:px-0">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
                    className={'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition whitespace-nowrap shrink-0 ' +
                      (tab === t.id ? 'bg-primary text-white' : 'bg-bg text-muted hover:bg-line')}>
              {t.icon}<span>{t.label}</span>
            </button>
          ))}
        </div>
        {(tab === 'pnl' || tab === 'turnover' || tab === 'profit-by-part') && (
          <div className="grid grid-cols-2 gap-2 max-w-md">
            <div>
              <label className="block text-xs text-muted mb-1">من تاريخ</label>
              <input type="date" className="input py-1.5" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">إلى تاريخ</label>
              <input type="date" className="input py-1.5" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        )}
      </div>

      {tab === 'pnl'              && <PnLReport from={from} to={to} onDrill={setDrillMode} />}
      {tab === 'profit-by-part'   && <ProfitByPart from={from} to={to} />}
      {tab === 'turnover'         && <StockTurnover from={from} to={to} />}
      {tab === 'aging-customers'  && <CustomerAging />}
      {tab === 'aging-suppliers'  && <SupplierAging />}

      <ReportDetailDrawer
        open={!!drillMode}
        mode={drillMode}
        from={from}
        to={to}
        onClose={() => setDrillMode(null)}
      />
    </div>
  );
}

function PnLReport({ from, to, onDrill }: { from: string; to: string; onDrill: (m: DetailMode) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['report-pnl', from, to],
    queryFn: async () => (await api.get('/reports/pnl', { params: { from, to } })).data,
  });
  if (isLoading) return <p className="text-muted text-center py-10">جاري التحميل...</p>;
  if (!data) return null;
  const netClass = Number(data.netProfit) >= 0 ? 'text-green-700' : 'text-red-700';
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ClickableKpi color="green" label="الإيراد"        value={fmtMoney(data.revenue)}     onClick={() => onDrill('revenue')} />
        <ClickableKpi color="amber" label="تكلفة البضاعة"  value={fmtMoney(data.cogs)}        onClick={() => onDrill('cogs')} />
        <ClickableKpi color="blue"  label="إجمالي الربح"   value={fmtMoney(data.grossProfit)} sub={`هامش ${data.grossMargin}%`} onClick={() => onDrill('profit')} />
        <ClickableKpi color="red"   label="المصاريف"       value={fmtMoney(data.expenses)}    onClick={() => onDrill('expenses')} />
      </div>

      <button
        onClick={() => onDrill('net-profit')}
        className="card w-full text-center py-6 group cursor-pointer transition hover:shadow-md active:scale-[0.99]"
        type="button"
      >
        <div className="text-muted text-sm mb-1 group-hover:text-primary transition">
          صافي الربح للفترة
          <ChevronLeft size={14} className="inline mr-1 opacity-0 group-hover:opacity-100 transition" />
        </div>
        <div className={'text-4xl font-extrabold ' + netClass}>{fmtMoney(data.netProfit)}</div>
        <div className="text-muted text-sm mt-1">هامش صافي {data.netMargin}%</div>
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ClickableDetail label="عدد الفواتير"        value={fmtNum(data.salesCount)}                                       onClick={() => onDrill('invoices')} />
        <ClickableDetail label="إجمالي المرتجعات"    value={fmtMoney(data.returns)}                                        onClick={() => onDrill('returns')} />
        <ClickableDetail label="ضريبة محصّلة"        value={fmtMoney(data.taxCollected)}                                   onClick={() => onDrill('tax')} />
        <ClickableDetail label="إجمالي المشتريات"    value={fmtMoney(data.purchasesTotal)} sub={`${data.purchasesCount} فاتورة`} onClick={() => onDrill('purchases')} />
      </div>
    </div>
  );
}

function ProfitByPart({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useQuery<any[]>({
    queryKey: ['report-profit-part', from, to],
    queryFn: async () => (await api.get('/reports/profit-by-part', { params: { from, to } })).data,
  });
  if (isLoading) return <p className="text-muted text-center py-10">جاري التحميل...</p>;
  if (!data || data.length === 0) return <EmptyState icon={<BarChart3 size={28} />} title="لا مبيعات في الفترة" />;
  return (
    <div className="card">
      <div className="overflow-x-auto -mx-3 sm:mx-0">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="text-right text-muted text-xs font-bold border-b-2 border-line">
              <th className="px-3 py-3">القطعة</th>
              <th className="px-3 py-3">SKU</th>
              <th className="px-3 py-3">الكمية المباعة</th>
              <th className="px-3 py-3">الإيراد</th>
              <th className="px-3 py-3">التكلفة</th>
              <th className="px-3 py-3">الربح</th>
              <th className="px-3 py-3">الهامش</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.partId} className="border-b border-line hover:bg-slate-50">
                <td className="px-3 py-3 font-bold">{r.name}</td>
                <td className="px-3 py-3 text-muted">{r.sku}</td>
                <td className="px-3 py-3">{fmtNum(r.qtySold)}</td>
                <td className="px-3 py-3">{fmtMoney(r.revenue)}</td>
                <td className="px-3 py-3">{fmtMoney(r.cost)}</td>
                <td className={'px-3 py-3 font-bold ' + (r.profit >= 0 ? 'text-green-700' : 'text-red-700')}>{fmtMoney(r.profit)}</td>
                <td className="px-3 py-3">
                  <span className={'pill ' + (r.margin >= 25 ? 'pill-green' : r.margin >= 10 ? 'pill-amber' : 'pill-red')}>{r.margin}%</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StockTurnover({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ['report-turnover', from, to],
    queryFn: async () => (await api.get('/reports/stock-turnover', { params: { from, to } })).data,
  });
  if (isLoading) return <p className="text-muted text-center py-10">جاري التحميل...</p>;
  if (!data) return null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="card">
        <h3 className="font-extrabold mb-3">🔥 الأكثر مبيعاً</h3>
        {(data.topSold ?? []).length === 0 ? <p className="text-muted text-center py-6 text-sm">لا حركة</p>
        : <ul className="space-y-1.5 text-sm">
          {data.topSold.slice(0, 10).map((p: any) => (
            <li key={p.partId} className="row-divide">
              <span className="font-semibold">{p.name}</span>
              <span className="text-primary font-bold">{fmtNum(p.sold)} مباع</span>
            </li>
          ))}
        </ul>}
      </div>
      <div className="card">
        <h3 className="font-extrabold mb-3">🧊 مخزون راكد (لا مبيعات في الفترة)</h3>
        {(data.deadStock ?? []).length === 0 ? <p className="text-muted text-center py-6 text-sm">ممتاز — كل المخزون يتحرّك</p>
        : <ul className="space-y-1.5 text-sm">
          {data.deadStock.slice(0, 10).map((p: any) => (
            <li key={p.partId} className="row-divide">
              <span className="font-semibold">{p.name}</span>
              <span className="text-amber-700 font-bold">{fmtMoney(p.valueAtCost)} رأس مال معطّل</span>
            </li>
          ))}
        </ul>}
      </div>
    </div>
  );
}

function CustomerAging() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ['report-aging-customers'],
    queryFn: async () => (await api.get('/reports/aging/customers')).data,
  });
  if (isLoading) return <p className="text-muted text-center py-10">جاري التحميل...</p>;
  if (!data) return null;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard color="green" label="0-30 يوم" value={fmtMoney(data.summary['0-30'])} />
        <KpiCard color="amber" label="31-60 يوم" value={fmtMoney(data.summary['31-60'])} />
        <KpiCard color="red"   label="61-90 يوم" value={fmtMoney(data.summary['61-90'])} />
        <KpiCard color="red"   label="+90 يوم" value={fmtMoney(data.summary['90+'])} />
      </div>
      <div className="card">
        <h3 className="font-extrabold mb-3">إجمالي ذمم العملاء: {fmtMoney(data.totalReceivables)}</h3>
        <div className="overflow-x-auto -mx-3 sm:mx-0">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-right text-muted text-xs font-bold border-b-2 border-line">
                <th className="px-3 py-3">العميل</th>
                <th className="px-3 py-3">الهاتف</th>
                <th className="px-3 py-3">الرصيد</th>
                <th className="px-3 py-3">الفئة العمرية</th>
                <th className="px-3 py-3">منذ</th>
              </tr>
            </thead>
            <tbody>
              {data.customers.map((c: any) => (
                <tr key={c.customerId} className="border-b border-line hover:bg-slate-50">
                  <td className="px-3 py-3 font-bold">{c.name}</td>
                  <td className="px-3 py-3 text-muted">{c.phone ?? '—'}</td>
                  <td className="px-3 py-3 font-bold text-red-700">{fmtMoney(c.balance)}</td>
                  <td className="px-3 py-3">
                    <span className={'pill ' + (c.bucket === '0-30' ? 'pill-green' : c.bucket === '31-60' ? 'pill-amber' : 'pill-red')}>{c.bucket}</span>
                  </td>
                  <td className="px-3 py-3 text-muted text-xs">{c.daysOld} يوم</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SupplierAging() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ['report-aging-suppliers'],
    queryFn: async () => (await api.get('/reports/aging/suppliers')).data,
  });
  if (isLoading) return <p className="text-muted text-center py-10">جاري التحميل...</p>;
  if (!data) return null;
  return (
    <div className="card">
      <h3 className="font-extrabold mb-3">إجمالي ما علينا للموردين: {fmtMoney(data.totalPayables)}</h3>
      <div className="overflow-x-auto -mx-3 sm:mx-0">
        <table className="w-full text-sm min-w-[500px]">
          <thead>
            <tr className="text-right text-muted text-xs font-bold border-b-2 border-line">
              <th className="px-3 py-3">المورد</th>
              <th className="px-3 py-3">الهاتف</th>
              <th className="px-3 py-3">المستحق</th>
            </tr>
          </thead>
          <tbody>
            {data.suppliers.map((s: any) => (
              <tr key={s.id} className="border-b border-line hover:bg-slate-50">
                <td className="px-3 py-3 font-bold">{s.name}</td>
                <td className="px-3 py-3 text-muted">{s.phone ?? '—'}</td>
                <td className="px-3 py-3 font-bold text-amber-700">{fmtMoney(s.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Static (non-clickable) KPI for aging tabs ─── */
function KpiCard({ color, label, value, sub }: { color: 'green'|'blue'|'amber'|'red'; label: string; value: string; sub?: string }) {
  const tones: Record<string, string> = {
    green: 'border-r-4 border-green-500',
    blue:  'border-r-4 border-blue-500',
    amber: 'border-r-4 border-amber-500',
    red:   'border-r-4 border-red-500',
  };
  return (
    <div className={'card ' + tones[color]}>
      <div className="text-muted text-xs font-semibold">{label}</div>
      <div className="text-xl sm:text-2xl font-extrabold mt-1">{value}</div>
      {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

/* ─── Clickable KPI (full button) for the PnL drill-down cards ─── */
function ClickableKpi({
  color, label, value, sub, onClick,
}: { color: 'green'|'blue'|'amber'|'red'; label: string; value: string; sub?: string; onClick: () => void }) {
  const tones: Record<string, string> = {
    green: 'border-r-4 border-green-500',
    blue:  'border-r-4 border-blue-500',
    amber: 'border-r-4 border-amber-500',
    red:   'border-r-4 border-red-500',
  };
  return (
    <button
      onClick={onClick}
      type="button"
      className={
        'card text-right cursor-pointer transition group ' +
        'hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ' +
        tones[color]
      }
    >
      <div className="flex items-center justify-between text-muted text-xs font-semibold">
        <span>{label}</span>
        <ChevronLeft size={14} className="opacity-0 group-hover:opacity-100 transition" />
      </div>
      <div className="text-xl sm:text-2xl font-extrabold mt-1">{value}</div>
      {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
    </button>
  );
}

/* ─── Clickable detail row ─── */
function ClickableDetail({
  label, value, sub, onClick,
}: { label: string; value: string; sub?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      type="button"
      className="card w-full flex justify-between items-center cursor-pointer transition group hover:shadow-md hover:bg-bg/40 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className="text-muted font-semibold flex items-center gap-1.5 group-hover:text-primary transition">
        <ChevronLeft size={14} className="opacity-0 group-hover:opacity-100 transition" />
        {label}
      </span>
      <div className="text-right">
        <div className="font-extrabold">{value}</div>
        {sub && <div className="text-xs text-muted">{sub}</div>}
      </div>
    </button>
  );
}
