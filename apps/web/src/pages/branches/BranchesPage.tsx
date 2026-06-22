import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/format';
import PageHeader from '@/components/ui/PageHeader';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import { Plus, Building, Edit3, MapPin, Phone } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Branch {
  id: string; name: string; code: string | null; address: string | null;
  phone: string | null; isMain: boolean; isActive: boolean;
}

export default function BranchesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Branch | null>(null);
  const [show, setShow] = useState(false);
  const { data, isLoading } = useQuery<Branch[]>({
    queryKey: ['branches-admin'],
    queryFn: async () => (await api.get('/branches')).data,
  });

  return (
    <div>
      <PageHeader
        title={t("branches.title")}
        subtitle={t("branches.title")}
        actions={<button className="btn-primary" onClick={() => { setEditing(null); setShow(true); }}><Plus size={16} /> فرع جديد</button>}
      />
      {isLoading ? (
        <p className="text-muted text-center py-10">جاري التحميل...</p>
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState icon={<Building size={28} />} title="لا فروع بعد"
          action={<button className="btn-primary" onClick={() => { setEditing(null); setShow(true); }}><Plus size={16} /> أضف فرعك الأول</button>} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data!.map((b) => (
            <div key={b.id} className="card">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary grid place-items-center"><Building size={20} /></div>
                  <div>
                    <h3 className="font-extrabold">{b.name}</h3>
                    {b.code && <p className="text-xs text-muted">{b.code}</p>}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {b.isMain && <span className="pill pill-amber text-[10px]">رئيسي</span>}
                  <span className={'pill text-[10px] ' + (b.isActive ? 'pill-green' : 'pill-gray')}>{b.isActive ? 'نشط' : 'معطّل'}</span>
                </div>
              </div>
              {b.address && <p className="text-sm text-muted flex items-start gap-2 mb-1"><MapPin size={14} className="mt-0.5 shrink-0" />{b.address}</p>}
              {b.phone   && <p className="text-sm text-muted flex items-center gap-2"><Phone   size={14} />{b.phone}</p>}
              <button onClick={() => { setEditing(b); setShow(true); }} className="btn-ghost w-full mt-3"><Edit3 size={14} /> تعديل</button>
            </div>
          ))}
        </div>
      )}

      <Modal open={show} onClose={() => { setShow(false); setEditing(null); }} title={editing ? 'تعديل فرع' : 'فرع جديد'}>
        <BranchForm editing={editing} onDone={() => { setShow(false); setEditing(null); qc.invalidateQueries({ queryKey: ['branches-admin'] }); qc.invalidateQueries({ queryKey: ['branches'] }); }} />
      </Modal>
    </div>
  );
}

function BranchForm({ editing, onDone }: { editing: Branch | null; onDone: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<{ name: string; code: string; address: string; phone: string; isMain: boolean }>({
    defaultValues: editing ? {
      name: editing.name, code: editing.code ?? '', address: editing.address ?? '',
      phone: editing.phone ?? '', isMain: editing.isMain,
    } : { isMain: false },
  });
  const mut = useMutation({
    mutationFn: async (d: any) => editing
      ? (await api.put('/branches/' + editing.id, d)).data
      : (await api.post('/branches', d)).data,
    onSuccess: onDone,
    onError: (e) => alert(errMsg(e)),
  });
  return (
    <form onSubmit={handleSubmit((d) => mut.mutate(d))} className="space-y-3">
      <div>
        <label className="block text-sm font-bold mb-1.5">اسم الفرع *</label>
        <input className="input" autoFocus {...register('name', { required: 'الاسم مطلوب' })} />
        {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label className="block text-sm font-bold mb-1.5">رمز الفرع</label><input className="input" {...register('code')} placeholder="BR-01" /></div>
        <div><label className="block text-sm font-bold mb-1.5">الهاتف</label><input className="input" {...register('phone')} /></div>
      </div>
      <div><label className="block text-sm font-bold mb-1.5">العنوان</label><textarea className="input" rows={2} {...register('address')} /></div>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" {...register('isMain')} className="w-4 h-4" />
        فرع رئيسي
      </label>
      <div className="flex justify-end pt-2">
        <button type="submit" className="btn-primary" disabled={mut.isPending}>
          {mut.isPending ? 'جاري الحفظ...' : 'حفظ'}
        </button>
      </div>
    </form>
  );
}
