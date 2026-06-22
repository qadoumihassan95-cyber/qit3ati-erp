import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { fmtMoney, fmtDate, errMsg } from '@/lib/format';
import PageHeader from '@/components/ui/PageHeader';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import { Plus, Receipt, Tag } from 'lucide-react';
import PrintBar from '@/components/print/PrintBar';
import { useTranslation } from 'react-i18next';

interface Expense {
  id: string; amount: number | string; description: string | null;
  expenseDate: string; createdAt: string;
  category: { id: string; name: string } | null;
  branch:   { id: string; name: string } | null;
  creator:  { id: string; fullName: string } | null;
}
interface ExpenseCategory { id: string; name: string }

export default function ExpensesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const branchId = useAuth((s) => s.branchId);
  const [show, setShow] = useState(false);
  const [showCats, setShowCats] = useState(false);

  const { data, isLoading } = useQuery<Expense[]>({
    queryKey: ['expenses', branchId],
    queryFn: async () => (await api.get('/expenses', { params: { branchId } })).data,
  });

  const total = (data ?? []).reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div>
      <PageHeader
        title={t("expenses.title")}
        subtitle={t("expenses.title")}
        actions={
          <div className="flex items-center gap-1.5 flex-wrap">
            <PrintBar
              title={t("expenses.title")}
              columns={[
                { key: 'expenseDate', label: 'التاريخ',  format: (v) => fmtDate(v) },
                { key: 'description', label: 'الوصف',    format: (v) => v ?? '—' },
                { key: 'category',    label: 'الفئة',     format: (_, r) => r.category?.name ?? '—' },
                { key: 'branch',      label: 'الفرع',     format: (_, r) => r.branch?.name ?? '—' },
                { key: 'creator',     label: 'بواسطة',   format: (_, r) => r.creator?.fullName ?? '—' },
                { key: 'amount',      label: 'المبلغ',    number: true, format: (v) => fmtMoney(v) },
              ]}
              rows={data ?? []}
              summary={[
                { label: 'عدد المصاريف', value: (data ?? []).length },
                { label: 'الإجمالي', value: fmtMoney(total) },
              ]}
            />
            <button className="btn-ghost" onClick={() => setShowCats(true)}><Tag size={16} /> فئات المصاريف</button>
            <button className="btn-primary" onClick={() => setShow(true)}><Plus size={16} /> مصروف جديد</button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className="kpi">
          <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 grid place-items-center mb-2"><Receipt size={20} /></div>
          <div className="lbl">إجمالي المصاريف المعروضة</div>
          <div className="val">{fmtMoney(total)}</div>
        </div>
        <div className="kpi">
          <div className="lbl">عدد القيود</div>
          <div className="val">{data?.length ?? 0}</div>
        </div>
        <div className="kpi">
          <div className="lbl">متوسط قيمة المصروف</div>
          <div className="val">{(data?.length ?? 0) > 0 ? fmtMoney(total / data!.length) : '—'}</div>
        </div>
      </div>

      <div className="card">
        {isLoading ? (
          <p className="text-muted text-center py-8">جاري التحميل...</p>
        ) : (data?.length ?? 0) === 0 ? (
          <EmptyState icon={<Receipt size={28} />} title="لا مصاريف بعد"
            description="ابدأ بتسجيل المصاريف اليومية لمتابعة الربحية بدقة"
            action={<button className="btn-primary" onClick={() => setShow(true)}><Plus size={16} /> مصروف جديد</button>} />
        ) : (
          <div className="overflow-x-auto -mx-3 sm:mx-0">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="text-right text-muted text-xs font-bold border-b-2 border-line">
                  <th className="px-3 py-3">التاريخ</th>
                  <th className="px-3 py-3">الفئة</th>
                  <th className="px-3 py-3">الوصف</th>
                  <th className="px-3 py-3">من سجّل</th>
                  <th className="px-3 py-3">المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((e) => (
                  <tr key={e.id} className="border-b border-line hover:bg-slate-50">
                    <td className="px-3 py-3 text-muted">{fmtDate(e.expenseDate)}</td>
                    <td className="px-3 py-3">{e.category?.name ?? <span className="text-muted">—</span>}</td>
                    <td className="px-3 py-3">{e.description ?? <span className="text-muted">—</span>}</td>
                    <td className="px-3 py-3 text-muted">{e.creator?.fullName ?? '—'}</td>
                    <td className="px-3 py-3 font-bold text-red-700">{fmtMoney(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={show} onClose={() => setShow(false)} title="تسجيل مصروف جديد">
        <ExpenseForm branchId={branchId ?? null} onDone={() => {
          setShow(false);
          qc.invalidateQueries({ queryKey: ['expenses'] });
          qc.invalidateQueries({ queryKey: ['dashboard'] });
        }} />
      </Modal>

      <Modal open={showCats} onClose={() => setShowCats(false)} title="فئات المصاريف">
        <CategoriesManager onDone={() => qc.invalidateQueries({ queryKey: ['expense-cats'] })} />
      </Modal>
    </div>
  );
}

function ExpenseForm({ branchId, onDone }: { branchId: string | null; onDone: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<{ amount: number; description: string; categoryId: string; expenseDate: string }>({
    defaultValues: { expenseDate: new Date().toISOString().slice(0, 10) },
  });
  const cats = useQuery<ExpenseCategory[]>({
    queryKey: ['expense-cats'],
    queryFn: async () => (await api.get('/expenses/categories')).data,
  });
  const mut = useMutation({
    mutationFn: async (d: any) => (await api.post('/expenses', { ...d, branchId, categoryId: d.categoryId || undefined })).data,
    onSuccess: () => { alert('✅ تم تسجيل المصروف'); onDone(); },
    onError: (e) => alert(errMsg(e)),
  });
  return (
    <form onSubmit={handleSubmit((d) => mut.mutate(d))} className="space-y-3">
      <div>
        <label className="block text-sm font-bold mb-1.5">المبلغ (د.أ) *</label>
        <input className="input" autoFocus type="number" min={0.01} step={0.01}
               {...register('amount', { required: 'المبلغ مطلوب', valueAsNumber: true, min: { value: 0.01, message: 'أكبر من 0' } })} />
        {errors.amount && <p className="text-red-500 text-xs mt-1">{errors.amount.message}</p>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-bold mb-1.5">الفئة</label>
          <select className="input" {...register('categoryId')}>
            <option value="">— بدون فئة —</option>
            {(cats.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-bold mb-1.5">التاريخ</label>
          <input className="input" type="date" {...register('expenseDate')} />
        </div>
      </div>
      <div>
        <label className="block text-sm font-bold mb-1.5">الوصف</label>
        <textarea className="input" rows={2} {...register('description')} placeholder="إيجار شهر يونيو، فاتورة كهرباء..." />
      </div>
      <div className="flex justify-end pt-2">
        <button type="submit" className="btn-primary" disabled={mut.isPending}>
          {mut.isPending ? 'جاري الحفظ...' : 'حفظ المصروف'}
        </button>
      </div>
    </form>
  );
}

function CategoriesManager({ onDone }: { onDone: () => void }) {
  const cats = useQuery<ExpenseCategory[]>({
    queryKey: ['expense-cats'],
    queryFn: async () => (await api.get('/expenses/categories')).data,
  });
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: async (n: string) => (await api.post('/expenses/categories', { name: n })).data,
    onSuccess: () => { setName(''); cats.refetch(); onDone(); },
    onError: (e) => alert(errMsg(e)),
  });
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input className="input flex-1" placeholder="اسم الفئة الجديدة..." value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary whitespace-nowrap" disabled={!name.trim() || create.isPending}
                onClick={() => create.mutate(name.trim())}>إضافة</button>
      </div>
      <div className="border-t border-line pt-3">
        {(cats.data ?? []).length === 0 ? <p className="text-center text-muted text-sm py-4">لا فئات بعد</p>
          : <ul className="space-y-1">{cats.data!.map((c) => <li key={c.id} className="py-2 px-3 bg-bg rounded-lg text-sm">{c.name}</li>)}</ul>}
      </div>
    </div>
  );
}
