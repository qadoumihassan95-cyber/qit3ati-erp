/**
 * DashboardPage — fully bilingual (AR/EN) via react-i18next.
 * Numbers and dates are locale-aware via the i18n helpers.
 */
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { DollarSign, FileText, Wallet, AlertTriangle } from 'lucide-react';
import { formatCurrency, formatDate, formatNumber } from '@/i18n';

interface DashboardData {
  salesTodayTotal: number; salesTodayCount: number;
  salesMonthTotal: number; invoiceCountTotal: number;
  lowStockAlerts: any[];   receivables: number;
}

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get('/tenants/dashboard')).data,
  });

  // re-format whenever language changes
  const dateLabel = formatDate(new Date(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-1">{t('dashboard.title')}</h1>
      <p className="text-muted text-sm mb-6">
        {t('dashboard.subtitle', { date: dateLabel })}
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <div data-tour="dash-today">
          <KpiCard color="green" icon={<DollarSign />}
            label={t('dashboard.salesToday')}
            value={isLoading ? '—' : formatCurrency(data?.salesTodayTotal ?? 0)} />
        </div>
        <div data-tour="dash-invoices">
          <KpiCard color="blue" icon={<FileText />}
            label={t('dashboard.invoicesCount')}
            value={isLoading ? '—' : formatNumber(data?.salesTodayCount ?? 0)} />
        </div>
        <div data-tour="dash-month">
          <KpiCard color="amber" icon={<Wallet />}
            label={t('dashboard.salesMonth')}
            value={isLoading ? '—' : formatCurrency(data?.salesMonthTotal ?? 0)} />
        </div>
        <div data-tour="dash-low-stock">
          <KpiCard color="red" icon={<AlertTriangle />}
            label={t('dashboard.lowStock')}
            value={isLoading ? '—' : formatNumber(data?.lowStockAlerts?.length ?? 0)} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="font-extrabold mb-3">{t('dashboard.stockAlerts')}</h3>
          {(data?.lowStockAlerts?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted py-6 text-center">{t('dashboard.noAlerts')}</p>
          ) : data!.lowStockAlerts.slice(0, 6).map((s: any, i: number) => (
            <div key={i} className="row-divide">
              <div>
                <div className="font-bold">{s.part?.name}</div>
                <div className="text-xs text-muted">
                  {t('stock.qtyAvailable')}: {formatNumber(Number(s.quantity))}
                  {' — '}
                  {t('parts.stockMin')}: {formatNumber(Number(s.part?.minStock ?? 0))}
                </div>
              </div>
              <span className={'pill ' + (Number(s.quantity) === 0 ? 'pill-red' : 'pill-amber')}>
                {Number(s.quantity) === 0 ? t('parts.outOfStock') : t('parts.lowStock')}
              </span>
            </div>
          ))}
        </div>
        <div className="card" data-tour="dash-receivables">
          <h3 className="font-extrabold mb-3">{t('dashboard.outstandingDebts')}</h3>
          <p className="text-sm text-muted py-2">
            {t('dashboard.outstandingDebtsTotal', {
              value: formatCurrency(data?.receivables ?? 0),
            })}
          </p>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ color, icon, label, value }: { color: 'green'|'blue'|'amber'|'red'; icon: ReactNode; label: string; value: string }) {
  const tones: Record<string, string> = {
    green: 'bg-green-100 text-green-700',
    blue:  'bg-blue-100 text-blue-700',
    amber: 'bg-amber-100 text-amber-700',
    red:   'bg-red-100 text-red-700',
  };
  return (
    <div className="kpi">
      <div className={'w-10 h-10 rounded-xl grid place-items-center mb-2.5 ' + tones[color]}>{icon}</div>
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
    </div>
  );
}
