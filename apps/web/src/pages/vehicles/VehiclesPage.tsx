/**
 * VehiclesPage
 * ────────────
 * Manage every car in the shop's book. Add/edit/soft-delete, filter
 * by plate/VIN/make/model, jump straight to a customer, and open a
 * new job card seeded with the vehicle.
 *
 * The Vehicle model itself has no branchId (a customer's car isn't
 * pinned to a branch — service can happen at any branch), so this
 * page doesn't need to observe the active branch selector.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Car, Edit3, Trash2, Wrench } from 'lucide-react';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/format';
import PageHeader from '@/components/ui/PageHeader';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';

interface Vehicle {
  id: string;
  customerId: string;
  plate: string | null;
  vin:   string | null;
  make:  string | null;
  model: string | null;
  year:  number | null;
  color: string | null;
  engine: string | null;
  mileage: number | null;
  customer?: { id: string; name: string; phone: string | null };
}

interface Customer { id: string; name: string; phone: string | null }

interface VehicleForm {
  customerId: string;
  plate?: string; vin?: string;
  make?: string; model?: string;
  year?: number | ''; color?: string;
  engine?: string; transmission?: string;
  mileage?: number | ''; notes?: string;
}

export default function VehiclesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);

  const { data: vehicles, isLoading } = useQuery<Vehicle[]>({
    queryKey: ['vehicles', q],
    queryFn: async () => (await api.get('/vehicles', { params: q ? { q } : {} })).data,
  });

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ['customers-lite'],
    queryFn: async () => (await api.get('/customers')).data,
    staleTime: 60_000,
  });

  const closeForm = () => { setEditing(null); setShowForm(false); };

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/vehicles/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicles'] }),
  });

  return (
    <div>
      <PageHeader
        title={t('vehicles.title', { defaultValue: 'المركبات' })}
        subtitle={t('vehicles.subtitle', { defaultValue: 'سجل مركبات العملاء' })}
        actions={
          <button className="btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
            <Plus size={16} /> {t('vehicles.new', { defaultValue: 'مركبة جديدة' })}
          </button>
        }
      />

      <div className="card">
        <div className="relative mb-4">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
          <input
            className="input pr-10"
            placeholder={t('vehicles.searchPlaceholder', { defaultValue: 'ابحث برقم اللوحة / VIN / الشركة / الموديل' }) as string}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {isLoading ? (
          <p className="text-muted text-center py-8">{t('common.loading')}</p>
        ) : !vehicles?.length ? (
          <EmptyState
            icon={<Car className="text-muted" size={40} />}
            title={t('vehicles.emptyTitle',       { defaultValue: 'لا توجد مركبات بعد' }) as string}
            description={t('vehicles.emptyHint',  { defaultValue: 'أضف أول مركبة لبدء تتبع بطاقات الصيانة' }) as string}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-clean min-w-full">
              <thead>
                <tr>
                  <th>{t('vehicles.plate',   { defaultValue: 'رقم اللوحة' })}</th>
                  <th>{t('vehicles.makeModel',{ defaultValue: 'السيارة' })}</th>
                  <th>{t('vehicles.year',    { defaultValue: 'الموديل' })}</th>
                  <th>{t('vehicles.customer',{ defaultValue: 'العميل' })}</th>
                  <th>{t('vehicles.mileage', { defaultValue: 'العدّاد' })}</th>
                  <th>VIN</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map(v => (
                  <tr key={v.id}>
                    <td className="font-bold">{v.plate ?? '—'}</td>
                    <td>{[v.make, v.model].filter(Boolean).join(' ') || '—'}</td>
                    <td>{v.year ?? '—'}</td>
                    <td>
                      {v.customer ? (
                        <Link to={`/customers?highlight=${v.customerId}`} className="text-primary hover:underline">
                          {v.customer.name}
                        </Link>
                      ) : '—'}
                    </td>
                    <td>{v.mileage != null ? v.mileage.toLocaleString() : '—'}</td>
                    <td className="text-xs text-muted font-mono">{v.vin ?? '—'}</td>
                    <td className="flex items-center gap-1 justify-end">
                      <Link
                        to={`/workshop?vehicleId=${v.id}&customerId=${v.customerId}`}
                        className="btn-ghost text-xs"
                        title={t('vehicles.openWorkshop', { defaultValue: 'فتح بطاقة عمل' }) as string}
                      >
                        <Wrench size={14} />
                      </Link>
                      <button
                        className="btn-ghost text-xs"
                        onClick={() => { setEditing(v); setShowForm(true); }}
                        title={t('common.edit') as string}
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        className="btn-ghost text-xs text-red-600"
                        onClick={() => {
                          if (confirm(t('common.confirmDelete') as string)) del.mutate(v.id);
                        }}
                        title={t('common.delete') as string}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <VehicleForm
          editing={editing}
          customers={customers ?? []}
          onClose={closeForm}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['vehicles'] }); closeForm(); }}
        />
      )}
    </div>
  );
}

// -------------- Form modal ----------------

function VehicleForm({
  editing, customers, onClose, onSaved,
}: {
  editing: Vehicle | null;
  customers: Customer[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<VehicleForm>({
    defaultValues: editing ? {
      customerId: editing.customerId,
      plate: editing.plate ?? '',
      vin:   editing.vin   ?? '',
      make:  editing.make  ?? '',
      model: editing.model ?? '',
      year:  editing.year  ?? '',
      color: editing.color ?? '',
      engine:  editing.engine  ?? '',
      mileage: editing.mileage ?? '',
    } : { customerId: '' },
  });

  const save = useMutation({
    mutationFn: async (form: VehicleForm) => {
      const body: any = { ...form };
      // Empty year/mileage strings → drop instead of sending "" to the API
      if (body.year === '' || body.year == null)    delete body.year;    else body.year = Number(body.year);
      if (body.mileage === '' || body.mileage == null) delete body.mileage; else body.mileage = Number(body.mileage);
      return editing
        ? (await api.patch(`/vehicles/${editing.id}`, body)).data
        : (await api.post('/vehicles', body)).data;
    },
    onSuccess: onSaved,
  });

  return (
    <Modal open onClose={onClose} title={editing ? t('vehicles.editTitle', { defaultValue: 'تعديل مركبة' }) as string : t('vehicles.newTitle', { defaultValue: 'مركبة جديدة' }) as string}>
      <form onSubmit={handleSubmit((f) => save.mutate(f))} className="space-y-3">
        <div>
          <label className="label">{t('vehicles.customer')} *</label>
          <select className="input" {...register('customerId', { required: true })} disabled={!!editing}>
            <option value="">—</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name} {c.phone ? `— ${c.phone}` : ''}</option>)}
          </select>
          {errors.customerId && <span className="text-xs text-red-600">{t('common.required')}</span>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('vehicles.plate')}</label>
            <input className="input" {...register('plate')} placeholder="12-3456" />
          </div>
          <div>
            <label className="label">VIN</label>
            <input className="input font-mono" {...register('vin')} maxLength={30} />
          </div>
          <div>
            <label className="label">{t('vehicles.make', { defaultValue: 'الشركة' })}</label>
            <input className="input" {...register('make')} placeholder="Toyota" />
          </div>
          <div>
            <label className="label">{t('vehicles.model', { defaultValue: 'الموديل' })}</label>
            <input className="input" {...register('model')} placeholder="Corolla" />
          </div>
          <div>
            <label className="label">{t('vehicles.year')}</label>
            <input className="input" type="number" {...register('year')} placeholder="2020" />
          </div>
          <div>
            <label className="label">{t('vehicles.color', { defaultValue: 'اللون' })}</label>
            <input className="input" {...register('color')} />
          </div>
          <div>
            <label className="label">{t('vehicles.engine', { defaultValue: 'المحرك' })}</label>
            <input className="input" {...register('engine')} placeholder="1.6L" />
          </div>
          <div>
            <label className="label">{t('vehicles.mileage')}</label>
            <input className="input" type="number" {...register('mileage')} />
          </div>
        </div>
        <div>
          <label className="label">{t('common.notes', { defaultValue: 'ملاحظات' })}</label>
          <textarea className="input min-h-[70px]" {...register('notes')} />
        </div>
        {save.error != null && <p className="text-red-600 text-sm">{errMsg(save.error)}</p>}
        <div className="flex items-center justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn-primary" disabled={isSubmitting || save.isPending}>
            {save.isPending ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
