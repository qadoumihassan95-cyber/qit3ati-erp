import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import PrintBar from '@/components/print/PrintBar';
import { useTranslation } from 'react-i18next';

interface Row {
  id: string; branchId: string; branchName: string;
  partId: string; sku: string; name: string;
  partNumber: string | null; oemNumber: string | null;
  quantity: number; minStock: number; location: string | null; status: string;
}

const STATUS_PILL: Record<string, string> = {
  available: 'pill-green', low: 'pill-amber', out: 'pill-red', damaged: 'pill-gray', returned: 'pill-blue', reserved: 'pill-blue',
};
const STATUS_LABEL: Record<string, string> = {
  available: 'متوفرة', low: 'منخفضة', out: 'نفدت', damaged: 'تالفة', returned: 'مرتجعة', reserved: 'محجوزة',
};

export default function StockPage() {
  const { t } = useTranslation();
  const branchId = useAuth((s) => s.branchId);
  const { data, isLoading } = useQuery<Row[]>({
    queryKey: ['stock', branchId],
    queryFn: async () => (await api.get('/stock', { params: { branchId } })).data,
  });

  const rows = data ?? [];
  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
        <h1 className="text-2xl font-extrabold">{t('stock.title')}</h1>
        <PrintBar
          title="المخزون والفروع"
          columns={[
            { key: 'name',       label: 'القطعة',       width: '25%' },
            { key: 'sku',        label: 'SKU' },
            { key: 'partNumber', label: 'Part Number', format: (v) => v ?? '—' },
            { key: 'branchName', label: 'الفرع' },
            { key: 'quantity',   label: 'الكمية',       number: true },
            { key: 'minStock',   label: 'الحد الأدنى',  number: true },
            { key: 'location',   label: 'الموقع',       format: (v) => v ?? '—' },
            { key: 'status',     label: 'الحالة',       format: (v) => STATUS_LABEL[v] || v },
          ]}
          rows={rows}
          summary={[
            { label: 'إجمالي السطور', value: rows.length },
            { label: 'متوفرة', value: rows.filter((r) => r.status === 'available').length },
            { label: 'منخفضة', value: rows.filter((r) => r.status === 'low').length },
            { label: 'نفدت',   value: rows.filter((r) => r.status === 'out').length },
          ]}
        />
      </div>
      <p className="text-muted text-sm mb-6">{t('stock.subtitle')}</p>

      <div className="card">
        <h3 className="font-extrabold mb-3">حركة المخزون الحالية</h3>
        <div className="overflow-x-auto -mx-3 sm:mx-0">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-right text-muted text-xs font-bold border-b-2 border-line">
              <th className="px-2 py-3">القطعة</th>
              <th className="px-2 py-3">Part Number</th>
              <th className="px-2 py-3">الفرع</th>
              <th className="px-2 py-3">الكمية</th>
              <th className="px-2 py-3">الحد الأدنى</th>
              <th className="px-2 py-3">الموقع</th>
              <th className="px-2 py-3">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td className="p-8 text-center text-muted" colSpan={7}>جاري التحميل…</td></tr>}
            {(data ?? []).map((s) => (
              <tr key={s.id} className="border-b border-line">
                <td className="px-2 py-3 font-bold">{s.name}</td>
                <td className="px-2 py-3">{s.partNumber ?? '—'}</td>
                <td className="px-2 py-3">{s.branchName}</td>
                <td className="px-2 py-3 font-extrabold">{s.quantity}</td>
                <td className="px-2 py-3">{s.minStock}</td>
                <td className="px-2 py-3">{s.location ?? '—'}</td>
                <td className="px-2 py-3"><span className={'pill ' + (STATUS_PILL[s.status] || 'pill-gray')}>{STATUS_LABEL[s.status] || s.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
