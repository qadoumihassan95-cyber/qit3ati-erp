import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { api } from '@/lib/api';
import { useTranslation } from 'react-i18next';

interface Settings {
  legalName?: string; taxNumber?: string;
  colorPrimary: string; colorSecondary: string;
  currency: string; taxRate: number; language: string;
  phone?: string; address?: string; jofotaraEnabled?: boolean;
}

const PALETTE = ['#1E5F74', '#7c3aed', '#16a34a', '#dc2626', '#0EA5E9'];

export default function SettingsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/settings')).data,
  });
  const { register, handleSubmit, reset, watch, setValue } = useForm<Settings>({ values: data });

  const mut = useMutation({
    mutationFn: async (d: Settings) => (await api.put('/settings', d)).data,
    onSuccess: (d) => {
      reset(d);
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['auth-me'] });
      alert('✅ تم الحفظ');
    },
  });

  if (isLoading) return <p className="text-muted">جاري التحميل…</p>;
  const primary = watch('colorPrimary');

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-1">{t('settings.title')}</h1>
      <p className="text-muted text-sm mb-6">{t('settings.branding')}</p>

      <div className="rounded-card p-5 mb-6 text-white" style={{ background: `linear-gradient(90deg, ${primary}, ${primary}E6)` }}>
        <h2 className="font-extrabold text-lg">كل شركة بهويتها الخاصة</h2>
        <p className="opacity-90 text-sm">غيّر الشعار، الاسم، اللون، الرقم الضريبي، الفروع — والبيانات معزولة تماماً عن بقية الشركات.</p>
      </div>

      <form className="grid grid-cols-1 lg:grid-cols-2 gap-4" onSubmit={handleSubmit((d) => mut.mutate(d))}>
        <div className="card">
          <h3 className="font-extrabold mb-3">هوية الشركة</h3>
          <Field label="الاسم القانوني" {...register('legalName')} />
          <Field label="الرقم الضريبي" {...register('taxNumber')} />
          <Field label="الهاتف" {...register('phone')} />
          <Field label="العنوان" {...register('address')} />

          <label className="block text-sm font-bold mb-1.5 text-muted mt-3">اللون الأساسي</label>
          <div className="flex gap-2 flex-wrap">
            {PALETTE.map((c) => (
              <button type="button" key={c} onClick={() => setValue('colorPrimary', c, { shouldDirty: true })}
                className={'w-9 h-9 rounded-lg border-2 ' + (primary === c ? 'border-ink' : 'border-line')}
                style={{ background: c }} />
            ))}
          </div>
        </div>

        <div className="card">
          <h3 className="font-extrabold mb-3">الفوترة والضريبة</h3>
          <Field label="العملة" {...register('currency')} />
          <Field label="نسبة الضريبة %" type="number" step="0.01" {...register('taxRate', { valueAsNumber: true })} />
          <label className="flex items-center gap-2 mt-2 text-sm font-semibold">
            <input type="checkbox" {...register('jofotaraEnabled')} />
            <span>تفعيل التكامل مع منظومة الفوترة الإلكترونية (JoFotara)</span>
          </label>
        </div>

        <div className="lg:col-span-2 flex justify-end">
          <button type="submit" className="btn-primary" disabled={mut.isPending}>
            {mut.isPending ? 'جاري الحفظ…' : 'حفظ التعديلات'}
          </button>
        </div>
      </form>
    </div>
  );
}

const Field = ({ label, ...rest }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <div className="mb-3">
    <label className="block text-sm font-bold mb-1.5 text-muted">{label}</label>
    <input className="input" {...rest} />
  </div>
);
