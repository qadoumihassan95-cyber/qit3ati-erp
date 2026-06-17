import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Plus, Search, FileUp } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface Part {
  id: string; sku: string; name: string;
  partNumber: string | null; oemNumber: string | null;
  manufacturer: string | null; countryOrigin: string | null;
  retailPrice: number; quantity: number; minStock: number;
  status: 'available' | 'low' | 'out';
}

export default function PartsPage() {
  const [q, setQ] = useState('');
  const branchId = useAuth((s) => s.branchId);
  const { data, isLoading } = useQuery<{ items: Part[] }>({
    queryKey: ['parts', q, branchId],
    queryFn: async () => (await api.get('/parts', { params: { q, branchId, perPage: 100 } })).data,
  });

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-1">الأصناف وقطع السيارات</h1>
      <p className="text-muted text-sm mb-6">
        الكتالوج الكامل — بحث بأي رقم (Part Number / OEM / بديل / باركود)
      </p>

      <div className="card">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[280px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
            <input className="input pr-10" placeholder="ابحث..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button className="btn-primary"><Plus size={16} /> صنف جديد</button>
          <button className="btn-ghost"><FileUp size={16} /> استيراد Excel</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-muted text-xs font-bold border-b-2 border-line">
                <th className="px-2.5 py-3">الصنف</th>
                <th className="px-2.5 py-3">Part Number</th>
                <th className="px-2.5 py-3">OEM</th>
                <th className="px-2.5 py-3">المصنّع</th>
                <th className="px-2.5 py-3">المتوفر</th>
                <th className="px-2.5 py-3">سعر البيع</th>
                <th className="px-2.5 py-3">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td className="p-8 text-center text-muted" colSpan={7}>جاري التحميل...</td></tr>}
              {!isLoading && (data?.items ?? []).length === 0 && (
                <tr><td className="p-8 text-center text-muted" colSpan={7}>لا نتائج</td></tr>
              )}
              {(data?.items ?? []).map((p) => (
                <tr key={p.id} className="border-b border-line hover:bg-slate-50">
                  <td className="px-2.5 py-3">
                    <div className="font-bold">{p.name}</div>
                    <div className="text-xs text-muted">{p.manufacturer} {p.countryOrigin && ` — ${p.countryOrigin}`}</div>
                  </td>
                  <td className="px-2.5 py-3">{p.partNumber ?? '—'}</td>
                  <td className="px-2.5 py-3">{p.oemNumber ?? '—'}</td>
                  <td className="px-2.5 py-3">{p.manufacturer ?? '—'}</td>
                  <td className="px-2.5 py-3 font-bold">{p.quantity}</td>
                  <td className="px-2.5 py-3 font-bold">{p.retailPrice.toFixed(2)} د.أ</td>
                  <td className="px-2.5 py-3">
                    <span className={'pill ' + (p.status === 'out' ? 'pill-red' : p.status === 'low' ? 'pill-amber' : 'pill-green')}>
                      {p.status === 'out' ? 'نفدت' : p.status === 'low' ? 'منخفضة' : 'متوفرة'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
