import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { api } from '@/lib/api';
import { fmtMoney, errMsg } from '@/lib/format';
import PageHeader from '@/components/ui/PageHeader';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import { Plus, Search, Users, Banknote, Edit3 } from 'lucide-react';

interface Customer {
  id: string; name: string; phone: string | null; email: string | null;
  taxNumber: string | null; address: string | null;
  priceTier: 'retail' | 'wholesale' | 'special';
  creditLimit: number | string; balance: number | string;
}
interface CustomerForm {
  name: string; phone?: string; email?: string; taxNumber?: string;
  address?: string; priceTier?: 'retail' | 'wholesale' | 'special'; creditLimit?: number;
}

const TIER_LABEL: Record<string, string> = { retail: 'تجزئة', wholesale: 'جملة', special: 'خاص' };

export default function CustomersPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Customer | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showReceipt, setShowReceipt] = useState<Customer | null>(null);

  const { data, isLoading } = useQuery<Customer[]>({
    queryKey: ['customers', q],
    queryFn: async () => (await api.get('/customers', { params: { q } })).data,
  });

  const closeForm = () => { setEditing(null); setShowForm(false); };

  return (
    <div>
      <PageHeader
        title="العملاء"
        subtitle="إدارة قاعدة بيانات العملاء، أسعارهم، وسقوف ائتمانهم"
        actions={
          <button className="btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
            <Plus size={16} /> عميل جديد
          </button>
        }
      />

      <div className="card">
        <div className="relative mb-4">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
          <input className="input pr-10" placeholder="ابحث عن عميل..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {isLoading ? (
          <p className="text-muted text-center py-8">جاري التحميل...</p>
        ) : (data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<Users size={28} />}
            title={q ? 'لا نتائج' : 'لا عملاء بعد'}
            description={q ? 'جرّب بحثاً مختلفاً' : 'أنشئ عميلك الأوّل لتتبع المبيعات والذمم'}
            action={!q && <button className="btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}><Plus size={16} /> عميل جديد</button>}
          />
        ) : (
          <div className="overflow-x-auto -mx-3 sm:mx-0">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="text-right text-muted text-xs font-bold border-b-2 border-line">
                  <th className="px-3 py-3">الاسم</th>
                  <th className="px-3 py-3">الهاتف</th>
                  <th className="px-3 py-3">الفئة</th>
                  <th className="px-3 py-3">السقف الائتماني</th>
                  <th className="px-3 py-3">الرصيد المستحق</th>
                  <th className="px-3 py-3 text-left">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((c) => (
                  <tr key={c.id} className="border-b border-line hover:bg-slate-50">
                    <td className="px-3 py-3 font-bold">{c.name}</td>
                    <td className="px-3 py-3 text-muted">{c.phone ?? '—'}</td>
                    <td className="px-3 py-3">
                      <span className={'pill ' + (c.priceTier === 'wholesale' ? 'pill-blue' : c.priceTier === 'special' ? 'pill-amber' : 'pill-gray')}>
                        {TIER_LABEL[c.priceTier]}
                      </span>
                    </td>
                    <td className="px-3 py-3">{fmtMoney(c.creditLimit)}</td>
                    <td className="px-3 py-3">
                      {Number(c.balance) > 0 ? <span className="text-red-600 font-bold">{fmtMoney(c.balance)}</span>
                        : <span className="text-muted">صفر</span>}
                    </td>
                    <td className="px-3 py-3 text-left">
                      <div className="flex gap-2 justify-end">
                        {Number(c.balance) > 0 && (
                          <button onClick={() => setShowReceipt(c)} className="btn-ghost py-1 px-3 text-xs">
                            <Banknote size={14} /> تحصيل
                          </button>
                        )}
                        <button onClick={() => { setEditing(c); setShowForm(true); }} className="btn-ghost py-1 px-3 text-xs">
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

      <Modal open={showForm} onClose={closeForm} title={editing ? 'تعديل العميل' : 'عميل جديد'}>
        <CustomerForm editing={editing} onDone={() => { closeForm(); qc.invalidateQueries({ queryKey: ['customers'] }); }} />
      </Modal>

      <Modal open={!!showReceipt} onClose={() => setShowReceipt(null)} title="تسجيل تحصيل من عميل">
        {showReceipt && <ReceiptForm customer={showReceipt} onDone={() => {
          setShowReceipt(null);
          qc.invalidateQueries({ queryKey: ['customers'] });
          qc.invalidateQueries({ queryKey: ['receipts'] });
          qc.invalidateQueries({ queryKey: ['dashboard'] });
        }} />}
      </Modal>
    </div>
  );
}

function CustomerForm({ editing, onDone }: { editing: Customer | null; onDone: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<CustomerForm>({
    defaultValues: editing ? {
      name: editing.name, phone: editing.phone ?? '', email: editing.email ?? '',
      taxNumber: editing.taxNumber ?? '', address: editing.address ?? '',
      priceTier: editing.priceTier, creditLimit: Number(editing.creditLimit),
    } : { priceTier: 'retail', creditLimit: 0 },
  });

  const mut = useMutation({
    mutationFn: async (d: CustomerForm) => {
      const payload = { ...d, creditLimit: Number(d.creditLimit ?? 0) };
      if (editing) return (await api.put('/customers/' + editing.id, payload)).data;
      return (await api.post('/customers', payload)).data;
    },
    onSuccess: onDone,
    onError: (e) => alert(errMsg(e)),
  });

  return (
    <form onSubmit={handleSubmit((d) => mut.mutate(d))} className="space-y-3">
      <Field label="الاسم *" error={errors.name?.message}>
        <input className="input" {...register('name', { required: 'الاسم مطلوب', maxLength: { value: 150, message: '150 حرف كحد أقصى' } })} autoFocus />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="الهاتف"><input className="input" {...register('phone')} placeholder="+962 7..." /></Field>
        <Field label="البريد الإلكتروني"><input className="input" type="email" {...register('email')} /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="الرقم الضريبي"><input className="input" {...register('taxNumber')} /></Field>
        <Field label="فئة السعر">
          <select className="input" {...register('priceTier')}>
            <option value="retail">تجزئة</option>
            <option value="wholesale">جملة</option>
            <option value="special">خاص</option>
          </select>
        </Field>
      </div>
      <Field label="السقف الائتماني (د.أ)">
        <input className="input" type="number" min={0} step={0.01} {...register('creditLimit', { valueAsNumber: true, min: { value: 0, message: 'لا يمكن أن يكون سالباً' } })} />
      </Field>
      <Field label="العنوان"><textarea className="input" rows={2} {...register('address')} /></Field>
      <div className="flex justify-end gap-2 pt-2">
        <button type="submit" className="btn-primary" disabled={mut.isPending}>
          {mut.isPending ? 'جاري الحفظ...' : 'حفظ'}
        </button>
      </div>
    </form>
  );
}

function ReceiptForm({ customer, onDone }: { customer: Customer; onDone: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<{ amount: number; method: 'cash'|'bank'|'cheque'; chequeNo?: string; }>({
    defaultValues: { amount: Number(customer.balance), method: 'cash' },
  });
  const mut = useMutation({
    mutationFn: async (d: any) => (await api.post('/receipts', { ...d, customerId: customer.id })).data,
    onSuccess: () => { alert('✅ تم تسجيل التحصيل'); onDone(); },
    onError: (e) => alert(errMsg(e)),
  });
  return (
    <form onSubmit={handleSubmit((d) => mut.mutate(d))} className="space-y-3">
      <div className="bg-bg p-3 rounded-xl text-sm flex justify-between">
        <span>الزبون: <b>{customer.name}</b></span>
        <span>المستحق: <b className="text-red-600">{fmtMoney(customer.balance)}</b></span>
      </div>
      <Field label="المبلغ المُحصّل *" error={errors.amount?.message}>
        <input className="input" type="number" min={0.01} step={0.01} {...register('amount', { required: 'المبلغ مطلوب', valueAsNumber: true, min: { value: 0.01, message: 'أكبر من 0' } })} autoFocus />
      </Field>
      <Field label="طريقة الدفع">
        <select className="input" {...register('method')}>
          <option value="cash">نقدي</option>
          <option value="bank">حوالة بنكية</option>
          <option value="cheque">شيك</option>
        </select>
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <button type="submit" className="btn-primary" disabled={mut.isPending}>
          {mut.isPending ? 'جاري الحفظ...' : 'تسجيل التحصيل'}
        </button>
      </div>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-bold mb-1.5">{label}</label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}
