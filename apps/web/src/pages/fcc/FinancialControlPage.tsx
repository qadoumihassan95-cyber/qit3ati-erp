/**
 * FinancialControlPage
 * ────────────────────
 * A single-page read-only "does the money add up?" dashboard.
 * Every widget calls a different FCC endpoint and shows either a
 * GREEN check ("looks consistent") or a RED count with details.
 *
 * IMPORTANT: this page never writes. It only reads and reports.
 */
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Shield, AlertTriangle, CheckCircle2, Wallet, Users, Building2, Package, TrendingUp, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtMoney } from '@/lib/format';
import PageHeader from '@/components/ui/PageHeader';

interface Summary {
  generatedAt: string;
  redFlags: number;
  sales: {
    invoiceCount: number;
    invoiceTotal: number; invoiceSubtotal: number;
    itemsRevenue: number; revenueDrift: number; revenueOk: boolean;
    cogs: { fromSalesItemUnitCost: number; fromFifoConsumptionRows: number; fifoTracedFraction: number };
    grossProfit: number; grossMarginPct: number;
  };
  cust: { customersChecked: number; customersWithDrift: number; totalDrift: number;
          worstDrifters: Array<{ id: string; name: string; storedBalance: number; expectedBalance: number; delta: number }> };
  sup:  { suppliersChecked: number; suppliersWithDrift: number; totalDrift: number;
          worstDrifters: Array<{ id: string; name: string; storedBalance: number; expectedBalance: number; delta: number }> };
  cash: { receipts: { count: number; total: number }; payments: { count: number; total: number };
          expenses: { count: number; total: number }; netCashFlow: number };
  inv: {
    negative: { count: number; rows: Array<{ sku: string; name: string; branch: string; quantity: number }> };
    belowMin: { count: number; rows: Array<{ sku: string; name: string; branch: string; quantity: number; minStock: number; shortBy: number }> };
    corruptFifoLayers: { count: number; rows: Array<{ layerId: string; sku: string; qtyReceived: number; qtyRemaining: number }> };
    partsWithoutFifoLayers: { count: number; rows: Array<{ partId: string; sku: string; name: string; onHand: number }> };
  };
}

export default function FinancialControlPage() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch, isFetching } = useQuery<Summary>({
    queryKey: ['fcc-summary'],
    queryFn: async () => (await api.get('/fcc/summary')).data,
    staleTime: 60_000,
  });

  return (
    <div>
      <PageHeader
        title={t('fcc.title', { defaultValue: 'مركز التحكم المالي' })}
        subtitle={t('fcc.subtitle', { defaultValue: 'تحقّق شامل للاتساق المالي والمخزوني — قراءة فقط' })}
        actions={
          <button className="btn-ghost text-sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} /> {t('common.refresh', { defaultValue: 'تحديث' })}
          </button>
        }
      />

      {isLoading ? (
        <div className="card p-8 text-center text-muted">{t('common.loading')}</div>
      ) : isError || !data ? (
        <div className="card p-8 text-center text-red-600">
          <AlertTriangle size={32} className="mx-auto mb-2" />
          {t('fcc.loadError', { defaultValue: 'فشل تحميل بيانات مركز التحكم المالي' })}
        </div>
      ) : (
        <>
          {/* Top banner — red flag count */}
          <div className={
            'card p-5 mb-4 flex items-center gap-4 ' +
            (data.redFlags === 0 ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50')
          }>
            {data.redFlags === 0 ? (
              <CheckCircle2 className="text-emerald-600" size={40} />
            ) : (
              <AlertTriangle className="text-red-600" size={40} />
            )}
            <div className="flex-1">
              <h2 className="font-extrabold text-lg">
                {data.redFlags === 0
                  ? t('fcc.allGood', { defaultValue: 'كل الأرقام متطابقة — لا توجد تنبيهات' })
                  : t('fcc.hasFlags', { defaultValue: '{{count}} تنبيه(ات) بحاجة لمراجعة', count: data.redFlags })}
              </h2>
              <p className="text-xs text-muted mt-0.5">
                {t('fcc.generatedAt', { defaultValue: 'تاريخ التحقق' })}: {new Date(data.generatedAt).toLocaleString()}
              </p>
            </div>
          </div>

          {/* KPI cards row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <KpiCard
              icon={<TrendingUp />}
              title={t('fcc.salesReconciliation', { defaultValue: 'مطابقة المبيعات' })}
              good={data.sales.revenueOk}
              main={fmtMoney(data.sales.invoiceTotal)}
              subtitle={
                data.sales.revenueOk
                  ? t('fcc.noDrift', { defaultValue: 'مطابق — الفرق أقل من فلس واحد' }) as string
                  : t('fcc.drift', { defaultValue: 'فرق {{amount}}', amount: fmtMoney(data.sales.revenueDrift) }) as string
              }
            />
            <KpiCard
              icon={<Users />}
              title={t('fcc.customerBalances', { defaultValue: 'أرصدة العملاء' })}
              good={data.cust.customersWithDrift === 0}
              main={`${data.cust.customersChecked - data.cust.customersWithDrift}/${data.cust.customersChecked}`}
              subtitle={
                data.cust.customersWithDrift === 0
                  ? t('fcc.balancedAll', { defaultValue: 'كل الأرصدة متوازنة' }) as string
                  : t('fcc.driftAmount', { defaultValue: 'انحراف إجمالي {{amount}}', amount: fmtMoney(data.cust.totalDrift) }) as string
              }
            />
            <KpiCard
              icon={<Building2 />}
              title={t('fcc.supplierBalances', { defaultValue: 'أرصدة الموردين' })}
              good={data.sup.suppliersWithDrift === 0}
              main={`${data.sup.suppliersChecked - data.sup.suppliersWithDrift}/${data.sup.suppliersChecked}`}
              subtitle={
                data.sup.suppliersWithDrift === 0
                  ? t('fcc.balancedAll', { defaultValue: 'كل الأرصدة متوازنة' }) as string
                  : t('fcc.driftAmount', { defaultValue: 'انحراف إجمالي {{amount}}', amount: fmtMoney(data.sup.totalDrift) }) as string
              }
            />
            <KpiCard
              icon={<Wallet />}
              title={t('fcc.cashFlow', { defaultValue: 'التدفق النقدي الصافي' })}
              good={data.cash.netCashFlow >= 0}
              main={fmtMoney(data.cash.netCashFlow)}
              subtitle={t('fcc.netCashHint',
                { defaultValue: 'قبض {{r}} — دفع {{p}} — مصاريف {{e}}',
                  r: fmtMoney(data.cash.receipts.total),
                  p: fmtMoney(data.cash.payments.total),
                  e: fmtMoney(data.cash.expenses.total) }) as string}
            />
          </div>

          {/* Inventory health card */}
          <section className="card mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold flex items-center gap-2 text-primary">
                <Package size={18} /> {t('fcc.inventoryHealth', { defaultValue: 'صحة المخزون' })}
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <MiniStat
                label={t('fcc.negativeStock', { defaultValue: 'مخزون سالب' }) as string}
                count={data.inv.negative.count} bad={data.inv.negative.count > 0}
              />
              <MiniStat
                label={t('fcc.belowMin', { defaultValue: 'تحت الحد الأدنى' }) as string}
                count={data.inv.belowMin.count} warn={data.inv.belowMin.count > 0}
              />
              <MiniStat
                label={t('fcc.corruptFifo', { defaultValue: 'طبقات FIFO تالفة' }) as string}
                count={data.inv.corruptFifoLayers.count} bad={data.inv.corruptFifoLayers.count > 0}
              />
              <MiniStat
                label={t('fcc.untraced', { defaultValue: 'أصناف بدون FIFO' }) as string}
                count={data.inv.partsWithoutFifoLayers.count} warn={data.inv.partsWithoutFifoLayers.count > 0}
              />
            </div>

            {data.inv.negative.count > 0 && (
              <DetailTable
                title={t('fcc.negativeStock')}
                columns={['SKU', t('common.name') as string, t('vehicles.branch', { defaultValue: 'الفرع' }) as string, t('common.qty', { defaultValue: 'الكمية' }) as string]}
                rows={data.inv.negative.rows.map(r => [r.sku, r.name, r.branch, String(r.quantity)])}
              />
            )}
            {data.inv.belowMin.count > 0 && (
              <DetailTable
                title={t('fcc.belowMin')}
                columns={['SKU', t('common.name') as string, t('vehicles.branch', { defaultValue: 'الفرع' }) as string,
                          t('common.qty') as string, t('fcc.min', { defaultValue: 'الحد الأدنى' }) as string,
                          t('fcc.shortBy', { defaultValue: 'العجز' }) as string]}
                rows={data.inv.belowMin.rows.slice(0, 20).map(r => [r.sku, r.name, r.branch, String(r.quantity), String(r.minStock), String(r.shortBy)])}
              />
            )}
          </section>

          {/* Customer / Supplier drifts */}
          {(data.cust.worstDrifters.length > 0 || data.sup.worstDrifters.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              {data.cust.worstDrifters.length > 0 && (
                <DriftCard
                  title={t('fcc.customerDrift', { defaultValue: 'انحراف أرصدة العملاء' }) as string}
                  rows={data.cust.worstDrifters}
                />
              )}
              {data.sup.worstDrifters.length > 0 && (
                <DriftCard
                  title={t('fcc.supplierDrift', { defaultValue: 'انحراف أرصدة الموردين' }) as string}
                  rows={data.sup.worstDrifters}
                />
              )}
            </div>
          )}

          {/* Read-only banner at bottom */}
          <div className="text-xs text-muted text-center py-3 flex items-center justify-center gap-1">
            <Shield size={12} /> {t('fcc.readOnlyNote',
              { defaultValue: 'مركز التحكم المالي يعمل بوضع القراءة فقط ولا يعدّل أي بيانات محاسبية.' })}
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({ icon, title, main, subtitle, good }: {
  icon: React.ReactNode; title: string; main: string; subtitle: string; good: boolean;
}) {
  return (
    <div className={'card p-4 border-l-4 ' + (good ? 'border-emerald-400' : 'border-red-400')}>
      <div className="flex items-center gap-2 text-xs text-muted mb-1">
        <span className={good ? 'text-emerald-600' : 'text-red-600'}>{icon}</span>
        {title}
      </div>
      <div className="text-xl font-extrabold">{main}</div>
      <div className={'text-xs mt-1 ' + (good ? 'text-emerald-700' : 'text-red-700')}>{subtitle}</div>
    </div>
  );
}

function MiniStat({ label, count, bad, warn }: { label: string; count: number; bad?: boolean; warn?: boolean }) {
  const cls = bad ? 'bg-red-50 border-red-200 text-red-700'
            : warn ? 'bg-amber-50 border-amber-200 text-amber-700'
            : 'bg-emerald-50 border-emerald-200 text-emerald-700';
  return (
    <div className={'rounded-lg border p-3 ' + cls}>
      <div className="text-xs">{label}</div>
      <div className="text-2xl font-extrabold mt-0.5">{count}</div>
    </div>
  );
}

function DetailTable({ title, columns, rows }: { title: any; columns: string[]; rows: string[][] }) {
  return (
    <div className="mt-4">
      <div className="text-sm font-bold mb-1.5">{title}</div>
      <div className="overflow-x-auto">
        <table className="table-clean text-xs min-w-full">
          <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DriftCard({ title, rows }: { title: string; rows: Array<{ id: string; name: string; storedBalance: number; expectedBalance: number; delta: number }> }) {
  return (
    <section className="card p-4">
      <h3 className="font-bold mb-2 text-red-700">{title}</h3>
      <table className="table-clean text-xs min-w-full">
        <thead>
          <tr>
            <th>الاسم</th>
            <th>الرصيد المسجّل</th>
            <th>الرصيد المتوقّع</th>
            <th>الفارق</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 10).map(r => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>{fmtMoney(r.storedBalance)}</td>
              <td>{fmtMoney(r.expectedBalance)}</td>
              <td className="text-red-700 font-bold">{fmtMoney(r.delta)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
