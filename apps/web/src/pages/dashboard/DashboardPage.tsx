import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DollarSign, FileText, Wallet, AlertTriangle } from 'lucide-react';

interface DashboardData {
  salesTodayTotal: number; salesTodayCount: number;
  salesMonthTotal: number; invoiceCountTotal: number;
  lowStockAlerts: any[];   receivables: number;
}

const fmtJOD = (n: number) =>
  new Intl.NumberFormat('ar-JO', { maximumFractionDigits: 2 }).format(n) + ' د.أ';

export default function DashboardPage() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get('/tenants/dashboard')).data,
  });

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-1">لوحة التحكم</h1>
      <p className="text-muted text-sm mb-6">
        نظرة سريعة على أداء المحل اليوم — {new Date().toLocaleDateString('ar-JO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <KpiCard color="green" icon={<DollarSign />} label="مبيعات اليوم" value={isLoading ? '—' : fmtJOD(data?.salesTodayTotal ?? 0)} />
        <KpiCard color="blue"  icon={<FileText />}   label="عدد الفواتير" value={isLoading ? '—' : String(data?.salesTodayCount ?? 0)} />
        <KpiCard color="amber" icon={<Wallet />}     label="مبيعات الشهر"  value={isLoading ? '—' : fmtJOD(data?.salesMonthTotal ?? 0)} />
        <KpiCard color="red"   icon={<AlertTriangle />} label="قطع تحت الحد الأدنى" value={isLoading ? '—' : String(data?.lowStockAlerts?.length ?? 0)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="font-extrabold mb-3">تنبيهات نفاد المخزون</h3>
          {(data?.lowStockAlerts?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted py-6 text-center">لا تنبيهات حالياً ✔</p>
          ) : data!.lowStockAlerts.slice(0, 6).map((s: any, i: number) => (
            <div key={i} className="row-divide">
              <div>
                <div className="font-bold">{s.part?.name}</div>
                <div className="text-xs text-muted">المتوفر: {Number(s.quantity)} — الحد الأدنى: {Number(s.part?.minStock ?? 0)}</div>
              </div>
              <span className={'pill ' + (Number(s.quantity) === 0 ? 'pill-red' : 'pill-amber')}>
                {Number(s.quantity) === 0 ? 'نفد' : 'منخفض'}
              </span>
            </div>
          ))}
        </div>
        <div className="card">
          <h3 className="font-extrabold mb-3">الذمم المستحقة</h3>
          <p className="text-sm text-muted py-2">إجمالي الذمم: <span className="font-extrabold text-primary">{fmtJOD(data?.receivables ?? 0)}</span></p>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ color, icon, label, value }: { color: 'green'|'blue'|'amber'|'red'; icon: React.ReactNode; label: string; value: string }) {
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
