import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fmtDateLong } from '@/lib/format';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import { Shield, FileText } from 'lucide-react';

interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  newValue: any;
  oldValue: any;
  ipAddress: string | null;
  createdAt: string;
  user: { id: string; fullName: string } | null;
}

const ACTION_LABEL: Record<string, string> = { create: 'إنشاء', update: 'تعديل', delete: 'حذف' };
const ACTION_COLOR: Record<string, string> = { create: 'pill-green', update: 'pill-blue', delete: 'pill-red' };

const ENTITY_LABEL: Record<string, string> = {
  parts: 'قطعة', stock: 'مخزون', customers: 'عميل', suppliers: 'مورد',
  sales: 'فاتورة بيع', purchases: 'فاتورة شراء', transfers: 'تحويل',
  receipts: 'سند قبض', payments: 'سند صرف', expenses: 'مصروف',
  returns: 'مرتجع', branches: 'فرع', settings: 'إعدادات',
};

export default function AuditPage() {
  const [entity, setEntity] = useState('');
  const { data, isLoading } = useQuery<AuditEntry[]>({
    queryKey: ['audit', entity],
    queryFn: async () => (await api.get('/audit', { params: { entity: entity || undefined, limit: 200 } })).data,
  });

  return (
    <div>
      <PageHeader title="سجل التدقيق" subtitle="من فعل ماذا ومتى — كل عملية إنشاء أو تعديل أو حذف مسجّلة هنا" />

      <div className="card mb-4">
        <label className="block text-sm font-bold mb-1.5">تصفية حسب النوع</label>
        <select className="input max-w-xs" value={entity} onChange={(e) => setEntity(e.target.value)}>
          <option value="">— كل العمليات —</option>
          {Object.entries(ENTITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="card">
        {isLoading ? (
          <p className="text-muted text-center py-8">جاري التحميل...</p>
        ) : (data?.length ?? 0) === 0 ? (
          <EmptyState icon={<Shield size={28} />} title="لا أحداث بعد"
            description="كل عملية إنشاء/تعديل/حذف يقوم بها أي مستخدم ستظهر هنا" />
        ) : (
          <ul className="divide-y divide-line">
            {(data ?? []).map((e) => (
              <li key={e.id} className="py-3 flex items-start gap-3">
                <FileText size={18} className="text-muted mt-1 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={'pill ' + (ACTION_COLOR[e.action] ?? 'pill-gray')}>{ACTION_LABEL[e.action] ?? e.action}</span>
                    <span className="font-bold text-sm">{ENTITY_LABEL[e.entity] ?? e.entity}</span>
                    {e.entityId && <span className="text-xs text-muted font-mono">#{e.entityId.slice(0, 8)}</span>}
                  </div>
                  <div className="text-xs text-muted mt-1">
                    بواسطة <b className="text-ink">{e.user?.fullName ?? 'مجهول'}</b>
                    {' · '}{fmtDateLong(e.createdAt)}
                    {e.ipAddress && <> · IP: {e.ipAddress}</>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
