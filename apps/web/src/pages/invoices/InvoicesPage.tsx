import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { fmtMoney, fmtDate, errMsg } from '@/lib/format';
import { Printer, Send, RefreshCw, FileCode, Eye, AlertCircle } from 'lucide-react';
import Modal from '@/components/ui/Modal';

type JofotaraStatus = 'not_sent' | 'queued' | 'sent' | 'accepted' | 'rejected' | 'failed' | 'needs_resubmit';

const JOFOTARA_LABEL: Record<JofotaraStatus, string> = {
  not_sent: 'لم ترسل', queued: 'بانتظار الإرسال', sent: 'تم الإرسال',
  accepted: 'مقبولة', rejected: 'مرفوضة', failed: 'فشل الاتصال', needs_resubmit: 'تحتاج إعادة',
};
const JOFOTARA_PILL: Record<JofotaraStatus, string> = {
  not_sent: 'pill-gray', queued: 'pill-blue', sent: 'pill-blue',
  accepted: 'pill-green', rejected: 'pill-red', failed: 'pill-red', needs_resubmit: 'pill-amber',
};

interface Invoice {
  id: string;
  invoiceNo: string | null;
  invoiceDate: string;
  total: number | string;
  paid: number | string;
  paymentType: string;
  status: string;
  jofotaraStatus: JofotaraStatus;
  jofotaraUuid: string | null;
  jofotaraQr: string | null;
  jofotaraError: string | null;
  customer?: { id: string; name: string } | null;
  items: Array<{ id: string }>;
}

interface InvoicesPage { items: Invoice[]; total: number; page: number; perPage: number; pages: number }

const PAYMENT_LABEL: Record<string, string> = {
  cash: 'نقدي', credit: 'آجل', card: 'بطاقة', bank: 'حوالة بنكية', cheque: 'شيك',
};

export default function InvoicesPage() {
  const qc = useQueryClient();
  const branchId = useAuth((s) => s.branchId);
  const [page, setPage] = useState(1);
  const [filterJof, setFilterJof] = useState<'all' | JofotaraStatus>('all');

  const { data, isLoading } = useQuery<InvoicesPage>({
    queryKey: ['invoices', branchId, page],
    queryFn: async () => (await api.get('/sales', { params: { branchId, page, perPage: 30 } })).data,
  });

  const items = (data?.items ?? []).filter((inv) =>
    filterJof === 'all' ? true : inv.jofotaraStatus === filterJof,
  );

  const submitJof = useMutation({
    mutationFn: async (id: string) => (await api.post(`/jofotara/submit/${id}`, {})).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
    onError: (e: any) => alert(errMsg(e)),
  });
  const resubmitJof = useMutation({
    mutationFn: async (id: string) => (await api.post(`/jofotara/resubmit/${id}`, {})).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
    onError: (e: any) => alert(errMsg(e)),
  });

  const printInvoice = async (id: string) => {
    try {
      const r = await api.get(`/invoices/${id}/print`, { responseType: 'text' });
      const html = r.data as string;
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank');
      if (!w) { URL.revokeObjectURL(url); alert('السماح بفتح علامات تبويب جديدة مطلوب للطباعة'); return; }
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e: any) { alert(errMsg(e)); }
  };

  const downloadXml = async (id: string) => {
    try {
      const r = await api.get(`/jofotara/xml/${id}`);
      const xml = (r.data as any).xml;
      const blob = new Blob([xml], { type: 'application/xml' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `invoice-${id.slice(0, 8)}.xml`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: any) { alert(errMsg(e)); }
  };

  const [detail, setDetail] = useState<Invoice | null>(null);

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-1">فواتير البيع</h1>
      <p className="text-muted text-sm mb-6">
        كل فواتير البيع — مع حالة الفوترة الإلكترونية وأزرار الإرسال إلى JoFotara
      </p>

      <div className="card">
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <select className="input max-w-[200px]" value={filterJof}
                  onChange={(e) => setFilterJof(e.target.value as any)}>
            <option value="all">كل حالات JoFotara</option>
            {Object.entries(JOFOTARA_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <span className="text-xs text-muted">العدد: {items.length} من {data?.total ?? 0}</span>
        </div>

        {isLoading && <p className="text-muted text-center py-10">جاري التحميل...</p>}
        {!isLoading && items.length === 0 && (
          <p className="text-muted text-center py-10">لا توجد فواتير مطابقة</p>
        )}

        {/* جدول على desktop، cards على mobile */}
        {items.length > 0 && (
          <>
            {/* DESKTOP TABLE */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-right text-muted text-xs font-bold border-b-2 border-line">
                    <th className="px-2 py-3">رقم الفاتورة</th>
                    <th className="px-2 py-3">التاريخ</th>
                    <th className="px-2 py-3">العميل</th>
                    <th className="px-2 py-3">الدفع</th>
                    <th className="px-2 py-3">المجموع</th>
                    <th className="px-2 py-3">JoFotara</th>
                    <th className="px-2 py-3">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((inv) => (
                    <tr key={inv.id} className="border-b border-line hover:bg-slate-50">
                      <td className="px-2 py-3 font-mono font-bold">{inv.invoiceNo ?? '—'}</td>
                      <td className="px-2 py-3 whitespace-nowrap">{fmtDate(inv.invoiceDate)}</td>
                      <td className="px-2 py-3">{inv.customer?.name ?? <span className="text-muted">نقدي</span>}</td>
                      <td className="px-2 py-3"><span className="text-xs">{PAYMENT_LABEL[inv.paymentType] ?? inv.paymentType}</span></td>
                      <td className="px-2 py-3 font-bold">{fmtMoney(inv.total)}</td>
                      <td className="px-2 py-3">
                        <span className={'pill ' + JOFOTARA_PILL[inv.jofotaraStatus]}>{JOFOTARA_LABEL[inv.jofotaraStatus]}</span>
                      </td>
                      <td className="px-2 py-3">
                        <InvoiceActions inv={inv}
                          onView={() => setDetail(inv)}
                          onPrint={() => printInvoice(inv.id)}
                          onSubmit={() => submitJof.mutate(inv.id)}
                          onResubmit={() => resubmitJof.mutate(inv.id)}
                          onXml={() => downloadXml(inv.id)}
                          busy={submitJof.isPending || resubmitJof.isPending}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* MOBILE CARDS */}
            <div className="md:hidden space-y-3">
              {items.map((inv) => (
                <div key={inv.id} className="border border-line rounded-xl p-3 bg-white">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono font-bold text-sm">{inv.invoiceNo ?? '—'}</span>
                    <span className={'pill ' + JOFOTARA_PILL[inv.jofotaraStatus]}>{JOFOTARA_LABEL[inv.jofotaraStatus]}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                    <Info k="التاريخ" v={fmtDate(inv.invoiceDate)} />
                    <Info k="العميل" v={inv.customer?.name ?? 'نقدي'} />
                    <Info k="الدفع" v={PAYMENT_LABEL[inv.paymentType] ?? inv.paymentType} />
                    <Info k="الإجمالي" v={<b>{fmtMoney(inv.total)}</b>} />
                  </div>
                  <InvoiceActions inv={inv}
                    onView={() => setDetail(inv)}
                    onPrint={() => printInvoice(inv.id)}
                    onSubmit={() => submitJof.mutate(inv.id)}
                    onResubmit={() => resubmitJof.mutate(inv.id)}
                    onXml={() => downloadXml(inv.id)}
                    busy={submitJof.isPending || resubmitJof.isPending}
                  />
                </div>
              ))}
            </div>

            {/* Pagination */}
            {data && data.pages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)}
                        className="btn-ghost text-xs">السابق</button>
                <span className="text-xs text-muted">صفحة {page} من {data.pages}</span>
                <button disabled={page >= data.pages} onClick={() => setPage(page + 1)}
                        className="btn-ghost text-xs">التالي</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={`فاتورة ${detail?.invoiceNo ?? ''}`} size="lg">
        {detail && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <Info k="التاريخ" v={fmtDate(detail.invoiceDate)} />
              <Info k="العميل" v={detail.customer?.name ?? 'نقدي'} />
              <Info k="الدفع" v={PAYMENT_LABEL[detail.paymentType] ?? detail.paymentType} />
              <Info k="الإجمالي" v={<b>{fmtMoney(detail.total)}</b>} />
              <Info k="حالة JoFotara" v={<span className={'pill ' + JOFOTARA_PILL[detail.jofotaraStatus]}>{JOFOTARA_LABEL[detail.jofotaraStatus]}</span>} />
              {detail.jofotaraUuid && <Info k="UUID" v={<span className="font-mono text-xs">{detail.jofotaraUuid}</span>} />}
            </div>
            {detail.jofotaraError && (
              <div className="p-3 rounded bg-red-50 border border-red-200 text-red-800 flex items-start gap-2">
                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                <div><b>خطأ JoFotara:</b> {detail.jofotaraError}</div>
              </div>
            )}
            {detail.jofotaraQr && (
              <div>
                <div className="text-xs font-bold text-muted mb-2">QR Code من JoFotara</div>
                {detail.jofotaraQr.startsWith('data:image') ? (
                  <img src={detail.jofotaraQr} alt="QR" className="w-40 h-40 border border-line rounded" />
                ) : (
                  <code className="text-xs break-all">{detail.jofotaraQr}</code>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function InvoiceActions({ inv, onView, onPrint, onSubmit, onResubmit, onXml, busy }: {
  inv: Invoice;
  onView: () => void;
  onPrint: () => void;
  onSubmit: () => void;
  onResubmit: () => void;
  onXml: () => void;
  busy: boolean;
}) {
  const canSend  = ['not_sent', 'failed', 'needs_resubmit', 'rejected'].includes(inv.jofotaraStatus);
  const canRetry = ['sent', 'failed', 'rejected'].includes(inv.jofotaraStatus);
  const hasXml   = inv.jofotaraStatus !== 'not_sent';
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <button onClick={onView} className="p-2 sm:p-1.5 rounded hover:bg-slate-100 text-slate-700" title="عرض">
        <Eye size={16} />
      </button>
      <button onClick={onPrint} className="p-2 sm:p-1.5 rounded hover:bg-blue-50 text-blue-700" title="طباعة">
        <Printer size={16} />
      </button>
      {canSend && (
        <button onClick={onSubmit} disabled={busy}
                className="p-2 sm:p-1.5 rounded hover:bg-green-50 text-green-700" title="إرسال إلى JoFotara">
          <Send size={16} />
        </button>
      )}
      {canRetry && !canSend && (
        <button onClick={onResubmit} disabled={busy}
                className="p-2 sm:p-1.5 rounded hover:bg-amber-50 text-amber-700" title="إعادة إرسال">
          <RefreshCw size={16} />
        </button>
      )}
      {hasXml && (
        <button onClick={onXml} className="p-2 sm:p-1.5 rounded hover:bg-slate-100 text-slate-700" title="تحميل XML">
          <FileCode size={16} />
        </button>
      )}
    </div>
  );
}

function Info({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="bg-slate-50 rounded p-2">
      <div className="text-muted">{k}</div>
      <div className="font-bold mt-0.5">{v}</div>
    </div>
  );
}
