import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { api } from '@/lib/api';
import { fmtMoney, errMsg } from '@/lib/format';
import PageHeader from '@/components/ui/PageHeader';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import { Plus, Search, Building2, Banknote, Edit3 } from 'lucide-react';
import PrintBar from '@/components/print/PrintBar';

interface Supplier {
  id: string; name: string; phone: string | null; email: string | null;
  taxNumber: string | null; address: string | null; balance: number | string;
}

export default function SuppliersPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showPay, setShowPay] = useState<Supplier | null>(null);

  const { data, isLoading } = useQuery<Supplier[]>({
    queryKey: ['suppliers', q],
    queryFn: async () => (await api.get('/suppliers', { params: { q } })).data,
  });

  const closeForm = () => { setEditing(null); setShowForm(false); };

  return (
    <div>
      <PageHeader
        title="الموردون"
        subtitle="إدارة الموردين ومتابعة ما لهم علينا"
        actions={
          <div className="flex items-center gap-1.5 flex-wrap">
            <PrintBar<Supplier>
              title="الموردون"
              subtitle={q ? `بحث: "${q}"` : undefined}
              columns={[
                { key: 'name',      label: 'الاسم',          width: '30%' },
                { key: 'phone',     label: 'الهاتف',          format: (v) => v ?? '—' },
                { key: 'email',     label: 'البريد',          format: (v) => v ?? '—' },
                { key: 'taxNumber', label: 'الرقم الضريبي',   format: (v) => v ?? '—' },
                { key: 'balance',   label: 'الرصيد المستحق',  number: true, format: (v) => fmtMoney(v) },
              ]}
              rows={data ?? []}
              summary={[
                { label: 'عدد الموردين',  value: (data ?? []).length },
                { label: 'إجمالي المستحقات', value: fmtMoney((data ?? []).reduce((s, x) => s + Number(x.balance ?? 0), 0)) },
              ]}
            />
            <button className="btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
              <Plus size={16} /> مورد جديد
            </button>
          </div>
        }
      />

      <div className="card">
        <div className="relative mb-4">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
          <input className="input pr-10" placeholder="ابحث عن مورد..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {isLoading ? (
          <p className="text-muted text-center py-8">جاري التحميل...</p>
        ) : (data?.length ?? 0) === 0 ? (
          <EmptyState icon={<Building2 size={28} />} title={q ? 'لا نتائج' : 'لا موردين بعد'}
            description={q ? 'جرّب بحثاً مختلفاً' : 'أنشئ مورّدك الأوّل لتتبّع المشتريات والمدفوعات'}
            action={!q && <button className="btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}><Plus size={16} /> مورد جديد</button>}
          />
        ) : (
          <div className="overflow-x-auto -mx-3 sm:mx-0">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="text-right text-muted text-xs font-bold border-b-2 border-line">
                  <th className="px-3 py-3">الاسم</th>
                  <th className="px-3 py-3">الهاتف</th>
                  <th className="px-3 py-3">الرقم الضريبي</th>
                  <th className="px-3 py-3">المستحق له (علينا)</th>
                  <th className="px-3 py-3 text-left">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((s) => (
                  <tr key={s.id} className="border-b border-line hover:bg-slate-50">
                    <td className="px-3 py-3 font-bold">{s.name}</td>
                    <td className="px-3 py-3 text-muted">{s.phone ?? '—'}</td>
                    <td className="px-3 py-3 text-muted">{s.taxNumber ?? '—'}</td>
                    <td className="px-3 py-3">
                      {Number(s.balance) > 0 ? <span className="text-amber-700 font-bold">{fmtMoney(s.balance)}</span>
                        : <span className="text-muted">صفر</span>}
                    </td>
                    <td className="px-3 py-3 text-left">
                      <div className="flex gap-2 justify-end">
                        {Number(s.balance) > 0 && (
                          <button onClick={() => setShowPay(s)} className="btn-ghost py-1 px-3 text-xs">
                            <Banknote size={14} /> دفع
                          </button>
                        )}
                        <button onClick={() => { setEditing(s); setShowForm(true); }} className="btn-ghost py-1 px-3 text-xs">
                          <Edit3 size={14} /> تعديل
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={showForm} onClose={closeForm} title={editing ? 'تعديل المورد' : 'مورد جديد'}>
        <SupplierForm editing={editing} onDone={() => { closeForm(); qc.invalidateQueries({ queryKey: ['suppliers'] }); }} />
      </Modal>
      <Modal open={!!showPay} onClose={() => setShowPay(null)} title="تسجيل دفعة لمورد">
        {showPay && <PaymentForm supplier={showPay} onDone={() => {
          setShowPay(null);
          qc.invalidateQueries({ queryKey: ['suppliers'] });
          qc.invalidateQueries({ queryKey: ['payments'] });
          qc.invalidateQueries({ queryKey: ['dashboard'] });
        }} />}
      </Modal>
    </div>
  );
}

function SupplierForm({ editing, onDone }: { editing: Supplier | null; onDone: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<{ name: string; phone?: string; email?: string; taxNumber?: string; address?: string }>({
    defaultValues: editing ? {
      name: editing.name, phone: editing.phone ?? '', email: editing.email ?? '',
      taxNumber: editing.taxNumber ?? '', address: editing.address ?? '',
    } : {},
  });
  const mut = useMutation({
    mutationFn: async (d: any) => editing
      ? (await api.put('/suppliers/' + editing.id, d)).data
      : (await api.post('/suppliers', d)).data,
    onSuccess: onDone,
    onError: (e) => alert(errMsg(e)),
  });
  return (
    <form onSubmit={handleSubmit((d) => mut.mutate(d))} className="space-y-3">
      <div>
        <label className="block text-sm font-bold mb-1.5">الاسم *</label>
        <input className="input" autoFocus {...register('name', { required: 'الاسم مطلوب' })} />
        {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label className="block text-sm font-bold mb-1.5">الهاتف</label><input className="input" {...register('phone')} /></div>
        <div><label className="block text-sm font-bold mb-1.5">البريد</label><input className="input" type="email" {...register('email')} /></div>
      </div>
      <div><label className="block text-sm font-bold mb-1.5">الرقم الضريبي</label><input className="input" {...register('taxNumber')} /></div>
      <div><label className="block text-sm font-bold mb-1.5">العنوان</label><textarea className="input" rows={2} {...register('address')} /></div>
      <div className="flex justify-end pt-2">
        <button type="submit" className="btn-primary" disabled={mut.isPending}>
          {mut.isPending ? 'جاري الحفظ...' : 'حفظ'}
        </button>
      </div>
    </form>
  );
}

function PaymentForm({ supplier, onDone }: { supplier: Supplier; onDone: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<{ amount: number; method: 'cash'|'bank'|'cheque' }>({
    defaultValues: { amount: Number(supplier.balance), method: 'cash' },
  });
  const mut = useMutation({
    mutationFn: async (d: any) => (await api.post('/payments', { ...d, supplierId: supplier.id })).data,
    onSuccess: () => { alert('✅ تم تسجيل الدفعة'); onDone(); },
    onError: (e) => alert(errMsg(e)),
  });
  return (
    <form onSubmit={handleSubmit((d) => mut.mutate(d))} className="space-y-3">
      <div className="bg-bg p-3 rounded-xl text-sm flex justify-between">
        <span>المورد: <b>{supplier.name}</b></span>
        <span>المستحق: <b className="text-amber-700">{fmtMoney(supplier.balance)}</b></span>
      </div>
      <div>
        <label className="block text-sm font-bold mb-1.5">المبلغ المدفوع *</label>
        <input className="input" autoFocus type="number" min={0.01} step={0.01}
               {...register('amount', { required: 'المبلغ مطلوب', valueAsNumber: true, min: { value: 0.01, message: 'أكبر من 0' } })} />
        {errors.amount && <p className="text-red-500 text-xs mt-1">{errors.amount.message}</p>}
      </div>
      <div>
        <label className="block text-sm font-bold mb-1.5">طريقة الدفع</label>
        <select className="input" {...register('method')}>
          <option value="cash">نقدي</option><option value="bank">حوالة بنكية</option><option value="cheque">شيك</option>
        </select>
      </div>
      <div className="flex justify-end pt-2">
        <button type="submit" className="btn-primary" disabled={mut.isPending}>
          {mut.isPending ? 'جاري الحفظ...' : 'تسجيل الدفعة'}
        </button>
      </div>
    </form>
  );
}
