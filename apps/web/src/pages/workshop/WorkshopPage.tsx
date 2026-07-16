/**
 * WorkshopPage — Kanban board of job cards.
 *
 * Columns: draft → in_progress → waiting_parts → completed → delivered.
 * (Cancelled cards are hidden from the board; findable via filter.)
 *
 * Click a card → JobCardDetail modal opens.
 * "New card" button → CreateJobCardModal.
 *
 * URL search-params ?vehicleId=… &customerId=… seed the new-card
 * modal so the flow from VehiclesPage / CustomersPage feels seamless.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Plus, Wrench, Car, User as UserIcon, Clock, Printer, FileText, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useBranches } from '@/hooks/useBranches';
import { api } from '@/lib/api';
import { fmtMoney, errMsg } from '@/lib/format';
import PageHeader from '@/components/ui/PageHeader';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';

type Status = 'draft' | 'in_progress' | 'waiting_parts' | 'completed' | 'delivered' | 'cancelled';

const COLUMNS: { key: Status; labelKey: string; fallback: string; hue: string }[] = [
  { key: 'draft',         labelKey: 'workshop.status.draft',        fallback: 'مسودة',        hue: 'bg-slate-100 text-slate-700' },
  { key: 'in_progress',   labelKey: 'workshop.status.in_progress',  fallback: 'قيد العمل',   hue: 'bg-blue-100 text-blue-700'   },
  { key: 'waiting_parts', labelKey: 'workshop.status.waiting_parts',fallback: 'بانتظار قطع', hue: 'bg-amber-100 text-amber-700' },
  { key: 'completed',     labelKey: 'workshop.status.completed',    fallback: 'مكتملة',       hue: 'bg-emerald-100 text-emerald-700' },
  { key: 'delivered',     labelKey: 'workshop.status.delivered',    fallback: 'مُسلَّمة',       hue: 'bg-green-100 text-green-700' },
];

interface CardListRow {
  id: string; cardNo: string | null; branchId: string; status: Status;
  openedAt: string; closedAt: string | null;
  partsTotal: string | number; laborTotal: string | number; total: string | number;
  customer?: { id: string; name: string; phone: string | null };
  vehicle?:  { id: string; plate: string | null; make: string | null; model: string | null; year: number | null };
  mechanic?: { id: string; fullName: string };
  _count?: { parts: number; labors: number };
}

export default function WorkshopPage() {
  const { t } = useTranslation();
  const [search] = useSearchParams();
  const seededVehicleId  = search.get('vehicleId')  || undefined;
  const seededCustomerId = search.get('customerId') || undefined;

  const activeBranch = useAuth((s) => s.branchId);
  const [showCreate, setShowCreate] = useState<boolean>(!!seededVehicleId);
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  const { data: cards, isLoading } = useQuery<CardListRow[]>({
    // Server already scopes by user's accessible branches when branchId omitted.
    // Passing the active branch narrows further when the header has one selected.
    queryKey: ['job-cards', activeBranch],
    queryFn: async () => (await api.get('/workshop/job-cards', {
      params: activeBranch ? { branchId: activeBranch } : {},
    })).data,
  });

  const grouped = useMemo(() => {
    const g: Record<Status, CardListRow[]> = {
      draft: [], in_progress: [], waiting_parts: [], completed: [], delivered: [], cancelled: [],
    };
    for (const c of (cards ?? [])) g[c.status]?.push(c);
    return g;
  }, [cards]);

  return (
    <div>
      <PageHeader
        title={t('workshop.title', { defaultValue: 'الورشة' })}
        subtitle={t('workshop.subtitle', { defaultValue: 'بطاقات العمل حسب الحالة' })}
        actions={
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> {t('workshop.newCard', { defaultValue: 'بطاقة عمل جديدة' })}
          </button>
        }
      />

      {isLoading ? (
        <p className="text-muted text-center py-8">{t('common.loading')}</p>
      ) : (cards?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<Wrench className="text-muted" size={40} />}
          title={t('workshop.emptyTitle',        { defaultValue: 'لا توجد بطاقات عمل' }) as string}
          description={t('workshop.emptyHint',   { defaultValue: 'ابدأ بإنشاء بطاقة عمل لعميل ومركبة' }) as string}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {COLUMNS.map(col => (
            <div key={col.key} className="card p-3 min-h-[300px]">
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs px-2 py-1 rounded-full font-bold ${col.hue}`}>
                  {t(col.labelKey, { defaultValue: col.fallback })}
                </span>
                <span className="text-xs text-muted">{grouped[col.key].length}</span>
              </div>
              <div className="space-y-2">
                {grouped[col.key].map(c => (
                  <button
                    key={c.id}
                    onClick={() => setOpenCardId(c.id)}
                    className="w-full text-start bg-bg hover:bg-white transition rounded-lg p-2.5 border border-line"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-primary">{c.cardNo ?? c.id.slice(0, 6)}</span>
                      <span className="text-xs text-muted">{fmtMoney(Number(c.total))}</span>
                    </div>
                    {c.vehicle && (
                      <div className="flex items-center gap-1 text-xs">
                        <Car size={12} className="text-muted" />
                        <span className="font-semibold">{c.vehicle.plate ?? '—'}</span>
                        <span className="text-muted truncate">
                          {[c.vehicle.make, c.vehicle.model, c.vehicle.year].filter(Boolean).join(' ')}
                        </span>
                      </div>
                    )}
                    {c.customer && (
                      <div className="flex items-center gap-1 text-xs text-muted mt-0.5">
                        <UserIcon size={12} /> {c.customer.name}
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-[10px] text-muted mt-1">
                      <span>{c._count?.parts ?? 0} قطع</span>
                      <span>·</span>
                      <span>{c._count?.labors ?? 0} عمالة</span>
                      {c.mechanic && (<><span>·</span><span>{c.mechanic.fullName}</span></>)}
                    </div>
                  </button>
                ))}
                {grouped[col.key].length === 0 && (
                  <p className="text-[11px] text-muted text-center py-6">—</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateJobCardModal
          seededVehicleId={seededVehicleId}
          seededCustomerId={seededCustomerId}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => { setShowCreate(false); setOpenCardId(id); }}
        />
      )}

      {openCardId && (
        <JobCardDetailModal
          cardId={openCardId}
          onClose={() => setOpenCardId(null)}
        />
      )}
    </div>
  );
}

// ============================================================
//                  CREATE JOB CARD MODAL
// ============================================================
function CreateJobCardModal({
  seededVehicleId, seededCustomerId, onClose, onCreated,
}: {
  seededVehicleId?: string;
  seededCustomerId?: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation();
  const activeBranch = useAuth((s) => s.branchId);
  const { data: branches } = useBranches();
  const [branchId,   setBranchId]   = useState<string>(activeBranch ?? branches?.[0]?.id ?? '');
  const [customerId, setCustomerId] = useState<string>(seededCustomerId ?? '');
  const [vehicleId,  setVehicleId]  = useState<string>(seededVehicleId  ?? '');
  const [complaint,  setComplaint]  = useState('');
  const [mileageIn,  setMileageIn]  = useState<string>('');

  const { data: customers } = useQuery<{ id: string; name: string; phone: string | null }[]>({
    queryKey: ['customers-lite'],
    queryFn: async () => (await api.get('/customers')).data,
    staleTime: 60_000,
  });
  const { data: vehicles } = useQuery<{ id: string; plate: string | null; make: string | null; model: string | null; customerId: string }[]>({
    queryKey: ['vehicles-for-customer', customerId],
    queryFn: async () => {
      if (!customerId) return [];
      return (await api.get(`/customers/${customerId}/vehicles`)).data;
    },
    enabled: !!customerId,
  });

  const save = useMutation({
    mutationFn: async () => (await api.post('/workshop/job-cards', {
      branchId,
      customerId: customerId || undefined,
      vehicleId:  vehicleId  || undefined,
      complaint:  complaint  || undefined,
      mileageIn:  mileageIn ? Number(mileageIn) : undefined,
    })).data,
    onSuccess: (row: any) => onCreated(row.id),
  });

  return (
    <Modal open onClose={onClose} title={t('workshop.newCard', { defaultValue: 'بطاقة عمل جديدة' }) as string}>
      <div className="space-y-3">
        <div>
          <label className="label">{t('workshop.branch', { defaultValue: 'الفرع' })} *</label>
          <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {(branches ?? []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">{t('workshop.customer', { defaultValue: 'العميل' })}</label>
          <select className="input" value={customerId} onChange={(e) => { setCustomerId(e.target.value); setVehicleId(''); }}>
            <option value="">—</option>
            {(customers ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">{t('workshop.vehicle', { defaultValue: 'المركبة' })}</label>
          <select className="input" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} disabled={!customerId}>
            <option value="">—</option>
            {(vehicles ?? []).map(v => (
              <option key={v.id} value={v.id}>
                {v.plate ?? '—'} — {[v.make, v.model].filter(Boolean).join(' ')}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t('workshop.complaint', { defaultValue: 'شكوى العميل' })}</label>
          <textarea className="input min-h-[70px]" value={complaint} onChange={(e) => setComplaint(e.target.value)} />
        </div>
        <div>
          <label className="label">{t('workshop.mileageIn', { defaultValue: 'قراءة العدّاد عند الدخول' })}</label>
          <input className="input" type="number" value={mileageIn} onChange={(e) => setMileageIn(e.target.value)} />
        </div>
        {save.error != null && <p className="text-red-600 text-sm">{errMsg(save.error)}</p>}
        <div className="flex items-center justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary" disabled={!branchId || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================
//                  JOB CARD DETAIL MODAL
// ============================================================
interface CardDetail {
  id: string; cardNo: string | null; branchId: string; status: Status;
  complaint: string | null; diagnosis: string | null; workDone: string | null;
  mileageIn: number | null; mileageOut: number | null;
  discount: string | number; partsTotal: string | number; laborTotal: string | number; total: string | number;
  openedAt: string; closedAt: string | null;
  invoiceId: string | null;
  customer?: { id: string; name: string; phone: string | null };
  vehicle?:  { id: string; plate: string | null; make: string | null; model: string | null; year: number | null };
  branch?:   { id: string; name: string };
  mechanic?: { id: string; fullName: string } | null;
  parts:  { id: string; qty: string | number; unitPrice: string | number; discount: string | number; lineTotal: string | number;
            part: { id: string; sku: string; name: string; unit: string } }[];
  labors: { id: string; description: string; hours: string | number; ratePerHour: string | number; lineTotal: string | number;
            performer?: { id: string; fullName: string } | null }[];
  invoice?: { id: string; invoiceNo: string | null; total: string | number } | null;
}

function JobCardDetailModal({ cardId, onClose }: { cardId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data: card, isLoading } = useQuery<CardDetail>({
    queryKey: ['job-card', cardId],
    queryFn: async () => (await api.get(`/workshop/job-cards/${cardId}`)).data,
  });

  const patch = useMutation({
    mutationFn: (body: any) => api.patch(`/workshop/job-cards/${cardId}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['job-card', cardId] }); qc.invalidateQueries({ queryKey: ['job-cards'] }); },
  });

  const convert = useMutation({
    mutationFn: () => api.post(`/workshop/job-cards/${cardId}/convert-to-invoice`, { paymentType: 'credit' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['job-card', cardId] }); qc.invalidateQueries({ queryKey: ['job-cards'] }); },
  });

  const addPart = useMutation({
    mutationFn: (body: any) => api.post(`/workshop/job-cards/${cardId}/parts`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job-card', cardId] }),
  });
  const removePart = useMutation({
    mutationFn: (rowId: string) => api.delete(`/workshop/job-cards/${cardId}/parts/${rowId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job-card', cardId] }),
  });
  const addLabor = useMutation({
    mutationFn: (body: any) => api.post(`/workshop/job-cards/${cardId}/labors`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job-card', cardId] }),
  });
  const removeLabor = useMutation({
    mutationFn: (rowId: string) => api.delete(`/workshop/job-cards/${cardId}/labors/${rowId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job-card', cardId] }),
  });

  const readOnly = !!card?.invoiceId;

  return (
    <Modal open onClose={onClose} title={`${t('workshop.card', { defaultValue: 'بطاقة عمل' })} ${card?.cardNo ?? ''}`} size="lg">
      {isLoading || !card ? (
        <p className="text-muted text-center py-8">{t('common.loading')}</p>
      ) : (
        <div className="space-y-4">
          {/* Header info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-bg p-3 rounded-lg">
            <InfoRow label={t('workshop.customer')} value={card.customer?.name ?? '—'} />
            <InfoRow label={t('workshop.vehicle')}  value={card.vehicle
              ? `${card.vehicle.plate ?? '—'} · ${[card.vehicle.make, card.vehicle.model, card.vehicle.year].filter(Boolean).join(' ')}`
              : '—'} />
            <InfoRow label={t('workshop.branch')}   value={card.branch?.name ?? '—'} />
            <InfoRow label={t('workshop.status.label', { defaultValue: 'الحالة' })}
                     value={(() => {
                       const col = COLUMNS.find(c => c.key === card.status);
                       return <span className={`text-xs px-2 py-1 rounded-full ${col?.hue ?? 'bg-slate-100'}`}>
                         {t(col?.labelKey ?? 'workshop.status.' + card.status, { defaultValue: col?.fallback ?? card.status })}
                       </span>;
                     })()} />
            <InfoRow label={t('workshop.mileageIn')}  value={card.mileageIn  ?? '—'} />
            <InfoRow label={t('workshop.mileageOut', { defaultValue: 'قراءة العدّاد عند الخروج' })} value={card.mileageOut ?? '—'} />
          </div>

          {!readOnly && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-muted">{t('workshop.changeStatus', { defaultValue: 'تغيير الحالة:' })}</label>
              <select
                className="input py-1 text-sm max-w-[180px]"
                value={card.status}
                onChange={(e) => patch.mutate({ status: e.target.value })}
              >
                {COLUMNS.map(c => (
                  <option key={c.key} value={c.key}>
                    {t(c.labelKey, { defaultValue: c.fallback })}
                  </option>
                ))}
                <option value="cancelled">{t('workshop.status.cancelled', { defaultValue: 'ملغاة' })}</option>
              </select>
            </div>
          )}

          {/* Complaint / Diagnosis */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <EditableTextarea
              label={t('workshop.complaint')}
              value={card.complaint ?? ''}
              onSave={(v) => patch.mutate({ complaint: v })}
              readOnly={readOnly}
            />
            <EditableTextarea
              label={t('workshop.diagnosis', { defaultValue: 'التشخيص' })}
              value={card.diagnosis ?? ''}
              onSave={(v) => patch.mutate({ diagnosis: v })}
              readOnly={readOnly}
            />
          </div>

          {/* Parts */}
          <section>
            <h3 className="font-bold mb-2 flex items-center gap-2"><Wrench size={16}/> {t('workshop.parts', { defaultValue: 'القطع' })}</h3>
            <table className="table-clean text-sm min-w-full">
              <thead><tr>
                <th>{t('parts.name', { defaultValue: 'الصنف' })}</th>
                <th>{t('common.qty', { defaultValue: 'الكمية' })}</th>
                <th>{t('common.price', { defaultValue: 'السعر' })}</th>
                <th>{t('common.discount', { defaultValue: 'خصم' })}</th>
                <th>{t('common.total', { defaultValue: 'الإجمالي' })}</th>
                {!readOnly && <th></th>}
              </tr></thead>
              <tbody>
                {card.parts.map(p => (
                  <tr key={p.id}>
                    <td>{p.part.name} <span className="text-xs text-muted font-mono">({p.part.sku})</span></td>
                    <td>{Number(p.qty)}</td>
                    <td>{fmtMoney(Number(p.unitPrice))}</td>
                    <td>{fmtMoney(Number(p.discount))}</td>
                    <td className="font-bold">{fmtMoney(Number(p.lineTotal))}</td>
                    {!readOnly && <td>
                      <button className="btn-ghost text-xs text-red-600" onClick={() => removePart.mutate(p.id)}><X size={12}/></button>
                    </td>}
                  </tr>
                ))}
                {card.parts.length === 0 && <tr><td colSpan={6} className="text-center text-muted py-3">—</td></tr>}
              </tbody>
            </table>
            {!readOnly && <AddPartRow onAdd={(body) => addPart.mutate(body)} pending={addPart.isPending} />}
          </section>

          {/* Labor */}
          <section>
            <h3 className="font-bold mb-2 flex items-center gap-2"><Clock size={16}/> {t('workshop.labor', { defaultValue: 'العمالة' })}</h3>
            <table className="table-clean text-sm min-w-full">
              <thead><tr>
                <th>{t('workshop.description', { defaultValue: 'الوصف' })}</th>
                <th>{t('workshop.hours',       { defaultValue: 'ساعات' })}</th>
                <th>{t('workshop.rate',        { defaultValue: 'الأجرة/ساعة' })}</th>
                <th>{t('common.total')}</th>
                {!readOnly && <th></th>}
              </tr></thead>
              <tbody>
                {card.labors.map(l => (
                  <tr key={l.id}>
                    <td>{l.description}</td>
                    <td>{Number(l.hours)}</td>
                    <td>{fmtMoney(Number(l.ratePerHour))}</td>
                    <td className="font-bold">{fmtMoney(Number(l.lineTotal))}</td>
                    {!readOnly && <td>
                      <button className="btn-ghost text-xs text-red-600" onClick={() => removeLabor.mutate(l.id)}><X size={12}/></button>
                    </td>}
                  </tr>
                ))}
                {card.labors.length === 0 && <tr><td colSpan={5} className="text-center text-muted py-3">—</td></tr>}
              </tbody>
            </table>
            {!readOnly && <AddLaborRow onAdd={(body) => addLabor.mutate(body)} pending={addLabor.isPending} />}
          </section>

          {/* Totals + convert */}
          <div className="flex items-end justify-between border-t border-line pt-3 flex-wrap gap-3">
            <div className="text-sm">
              <div>{t('workshop.partsTotal', { defaultValue: 'إجمالي القطع' })}: <b>{fmtMoney(Number(card.partsTotal))}</b></div>
              <div>{t('workshop.laborTotal', { defaultValue: 'إجمالي العمالة' })}: <b>{fmtMoney(Number(card.laborTotal))}</b></div>
              <div className="text-lg mt-1">{t('common.total')}: <b className="text-primary">{fmtMoney(Number(card.total))}</b></div>
            </div>
            <div className="flex items-center gap-2">
              {card.invoiceId ? (
                <span className="btn-ghost text-emerald-700 flex items-center gap-1">
                  <FileText size={14}/> {t('workshop.invoiced', { defaultValue: 'تم إصدار الفاتورة' })} #{card.invoice?.invoiceNo}
                </span>
              ) : (
                <button
                  className="btn-primary"
                  disabled={convert.isPending || (card.parts.length === 0 && card.labors.length === 0)}
                  onClick={() => convert.mutate()}
                >
                  {convert.isPending
                    ? t('common.saving')
                    : t('workshop.convertToInvoice', { defaultValue: 'إغلاق البطاقة وإصدار فاتورة' })}
                </button>
              )}
              <button className="btn-ghost" onClick={() => window.print()} title={t('common.print') as string}>
                <Printer size={16}/>
              </button>
            </div>
          </div>
          {convert.error != null && <p className="text-red-600 text-sm">{errMsg(convert.error)}</p>}
        </div>
      )}
    </Modal>
  );
}

function InfoRow({ label, value }: { label: any; value: any }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function EditableTextarea({ label, value, onSave, readOnly }: { label: any; value: string; onSave: (v: string) => void; readOnly: boolean }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div>
      <label className="label">{label}</label>
      <textarea
        className="input min-h-[70px]"
        value={v}
        readOnly={readOnly}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (v !== value && !readOnly) onSave(v); }}
      />
    </div>
  );
}

function AddPartRow({ onAdd, pending }: { onAdd: (b: any) => void; pending: boolean }) {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<{ id: string; name: string; sku: string; retailPrice: number } | null>(null);
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState<number | ''>('');

  const { data: parts } = useQuery<any[]>({
    queryKey: ['parts-search', q],
    queryFn: async () => (await api.get('/parts', { params: q ? { q } : {} })).data.items ?? [],
    enabled: q.length >= 2,
  });

  return (
    <div className="mt-2 p-2 bg-bg rounded-lg flex flex-wrap items-end gap-2">
      <div className="flex-1 min-w-[160px]">
        <input
          className="input text-sm"
          placeholder="اكتب اسم أو SKU للقطعة..."
          value={selected ? `${selected.name} (${selected.sku})` : q}
          onChange={(e) => { setSelected(null); setQ(e.target.value); }}
        />
        {!selected && q.length >= 2 && (parts?.length ?? 0) > 0 && (
          <div className="border border-line bg-white rounded-lg mt-1 max-h-40 overflow-y-auto text-sm">
            {parts!.slice(0, 8).map((p: any) => (
              <button
                key={p.id}
                className="block w-full text-start px-2 py-1 hover:bg-bg"
                onClick={() => { setSelected({ id: p.id, name: p.name, sku: p.sku, retailPrice: Number(p.retailPrice) }); setQ(''); setPrice(Number(p.retailPrice)); }}
              >
                {p.name} — <span className="font-mono text-xs">{p.sku}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <input className="input text-sm w-20" type="number" min={0.001} step={0.001} value={qty} onChange={(e) => setQty(Number(e.target.value))} placeholder="الكمية" />
      <input className="input text-sm w-24" type="number" step={0.01} value={price} onChange={(e) => setPrice(e.target.value === '' ? '' : Number(e.target.value))} placeholder="السعر" />
      <button
        className="btn-primary text-xs"
        disabled={!selected || !qty || pending}
        onClick={() => {
          if (!selected) return;
          onAdd({ partId: selected.id, qty, unitPrice: price === '' ? undefined : price });
          setSelected(null); setQty(1); setPrice('');
        }}
      >
        <Plus size={14}/>
      </button>
    </div>
  );
}

function AddLaborRow({ onAdd, pending }: { onAdd: (b: any) => void; pending: boolean }) {
  const [description, setDescription] = useState('');
  const [hours, setHours] = useState(1);
  const [rate, setRate]   = useState<number | ''>('');
  return (
    <div className="mt-2 p-2 bg-bg rounded-lg flex flex-wrap items-end gap-2">
      <input className="input text-sm flex-1 min-w-[180px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="وصف الخدمة (تغيير زيت، فحص كمبيوتر...)" />
      <input className="input text-sm w-20" type="number" step={0.25} value={hours} onChange={(e) => setHours(Number(e.target.value))} placeholder="ساعات" />
      <input className="input text-sm w-24" type="number" step={0.25} value={rate}  onChange={(e) => setRate(e.target.value === '' ? '' : Number(e.target.value))} placeholder="الأجرة/ساعة" />
      <button
        className="btn-primary text-xs"
        disabled={!description || !hours || rate === '' || pending}
        onClick={() => {
          onAdd({ description, hours, ratePerHour: rate });
          setDescription(''); setHours(1); setRate('');
        }}
      >
        <Plus size={14}/>
      </button>
    </div>
  );
}
