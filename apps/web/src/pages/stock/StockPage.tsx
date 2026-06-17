import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

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
  const branchId = useAuth((s) => s.branchId);
  const { data, isLoading } = useQuery<Row[]>({
    queryKey: ['stock', branchId],
    queryFn: async () => (await api.get('/stock', { params: { branchId } })).data,
  });

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-1">المخزون والفروع</h1>
      <p className="text-muted text-sm mb-6">مخزون مستقل لكل فرع + تحويل بضاعة بينها</p>

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
