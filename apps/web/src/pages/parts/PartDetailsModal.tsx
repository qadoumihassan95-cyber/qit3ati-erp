import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import Modal from '@/components/ui/Modal';
import { fmtMoney, fmtDate } from '@/lib/format';
import {
  Package, Warehouse, ShoppingCart, TrendingUp, AlertTriangle,
  Calendar, User, Building2, History, ArrowUpRight, ArrowDownRight,
  ExternalLink, Tag, Boxes, Wrench,
} from 'lucide-react';
import type { ReactNode } from 'react';

interface FullDetails {
  id: string;
  sku: string;
  name: string;
  nameEn: string | null;
  partNumber: string | null;
  oemNumber: string | null;
  barcode: string | null;
  manufacturer: string | null;
  countryOrigin: string | null;
  unit: string | null;
  category: { id: string; name: string } | null;
  imageUrl: string | null;

  costPrice: number;
  avgCost: number;
  retailPrice: number;
  wholesalePrice: number;
  taxRate: number;

  totalQuantity: number;
  minStock: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  status: 'available' | 'low' | 'out';
  stockByBranch: Array<{
    branchId: string;
    branchName: string;
    warehouse: string | null;
    quantity: number;
    reserved: number;
    available: number;
    location: string | null;
  }>;

  lastPurchase: null | {
    invoiceId: string;
    invoiceNo: string | null;
    invoiceDate: string;
    supplier: { id: string; name: string } | null;
    qty: number;
    unitCost: number;
  };
  lastSale: null | {
    invoiceId: string;
    invoiceNo: string | null;
    invoiceDate: string;
    customer: { id: string; name: string } | null;
    qty: number;
    unitPrice: number;
  };

  totalSoldQty: number;
  totalSalesCount: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  profitMargin: number;

  salesInvoices: Array<{
    invoiceId: string;
    invoiceNo: string | null;
    invoiceDate: string;
    customer: { id: string; name: string } | null;
    paymentType: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  purchaseInvoices: Array<{
    invoiceId: string;
    invoiceNo: string | null;
    invoiceDate: string;
    supplier: { id: string; name: string } | null;
    qty: number;
    unitCost: number;
  }>;
  movements: Array<{
    id: number;
    type: string;
    qtyChange: number;
    unitCost: number;
    refTable: string | null;
    refId: string | null;
    branchName: string | null;
    userName: string | null;
    createdAt: string;
  }>;
}

const MOVEMENT_LABEL: Record<string, string> = {
  purchase:        'شراء',
  sale:            'بيع',
  return_in:       'مرتجع بيع',
  return_out:      'مرتجع شراء',
  transfer:        'تحويل',
  adjust:          'تسوية',
  damage:          'تالف',
  initial:         'رصيد افتتاحي',
};

const PAYMENT_LABEL: Record<string, string> = {
  cash: 'نقدي', credit: 'آجل', card: 'بطاقة', bank: 'حوالة', cheque: 'شيك',
};

interface Props {
  partId: string | null;
  onClose: () => void;
}

export default function PartDetailsModal({ partId, onClose }: Props) {
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery<FullDetails>({
    queryKey: ['part-details', partId],
    queryFn: async () => (await api.get(`/parts/${partId}/full-details`)).data,
    enabled: !!partId,
  });

  const goInvoice = (id: string) => {
    onClose();
    setTimeout(() => navigate(`/invoices`), 100);
    // future: deep link to /invoices?open=${id}
  };

  return (
    <Modal
      open={!!partId}
      onClose={onClose}
      title={data ? data.name : 'تفاصيل القطعة'}
      size="lg"
    >
      {!partId ? null : isLoading ? (
        <p className="text-muted text-center py-10">جاري التحميل...</p>
      ) : error ? (
        <p className="text-red-600 text-center py-6">فشل تحميل التفاصيل — حاول مجدّداً</p>
      ) : data ? (
        <div className="space-y-4">
          {/* ============ Low-stock alert ============ */}
          {(data.isLowStock || data.isOutOfStock) && (
            <div className={
              'flex items-start gap-2 p-3 rounded-lg border ' +
              (data.isOutOfStock
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-amber-50 border-amber-200 text-amber-800')
            }>
              <AlertTriangle size={20} className="shrink-0 mt-0.5" />
              <div className="text-sm">
                <b>{data.isOutOfStock ? '⚠ القطعة نفدت من المخزون' : '⚠ الكمية منخفضة'}</b>
                <div className="text-xs mt-0.5">
                  المتوفّر: <b>{data.totalQuantity}</b> — الحدّ الأدنى المطلوب: <b>{data.minStock}</b>
                </div>
              </div>
            </div>
          )}

          {/* ============ HERO — أهمّ 4 معلومات بحجم كبير ============ */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <HeroCard
              icon={<Boxes size={22} />}
              label="الكمية المتوفّرة"
              value={data.totalQuantity}
              suffix={data.unit ?? 'حبة'}
              color={data.isOutOfStock ? 'rose' : data.isLowStock ? 'amber' : 'emerald'}
            />
            <HeroCard
              icon={<Tag size={22} />}
              label="سعر البيع"
              value={fmtMoney(data.retailPrice)}
              color="primary"
            />
            <HeroCard
              icon={<Calendar size={22} />}
              label="آخر عملية بيع"
              value={data.lastSale ? fmtDate(data.lastSale.invoiceDate) : 'لا توجد بعد'}
              subtitle={data.lastSale ? `${data.lastSale.qty} × ${fmtMoney(data.lastSale.unitPrice)}` : undefined}
              color="blue"
            />
            <HeroCard
              icon={<TrendingUp size={22} />}
              label="إجمالي المبيعات"
              value={`${data.totalSoldQty} ${data.unit ?? 'حبة'}`}
              subtitle={`${data.totalSalesCount} عملية`}
              color="indigo"
            />
          </div>

          {/* ============ Identity & Image ============ */}
          <div className="card p-4">
            <div className="flex items-start gap-4 flex-wrap">
              {data.imageUrl ? (
                <img src={data.imageUrl} alt={data.name}
                     className="w-24 h-24 object-cover rounded-lg border border-line" />
              ) : (
                <div className="w-24 h-24 rounded-lg bg-bg grid place-items-center text-muted">
                  <Package size={36} />
                </div>
              )}
              <div className="flex-1 min-w-[200px] space-y-1.5 text-sm">
                <Row label="الاسم" value={data.name} bold />
                {data.nameEn && <Row label="الاسم بالإنجليزي" value={data.nameEn} />}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <Row label="SKU"          value={<code className="font-mono text-xs">{data.sku}</code>} />
                  <Row label="Part Number"  value={data.partNumber ?? '—'} />
                  <Row label="OEM"          value={data.oemNumber ?? '—'} />
                  <Row label="Barcode"      value={data.barcode ?? '—'} />
                  <Row label="المصنّع"       value={data.manufacturer ?? '—'} />
                  <Row label="بلد المنشأ"   value={data.countryOrigin ?? '—'} />
                  {data.category && <Row label="الفئة" value={data.category.name} />}
                </div>
              </div>
            </div>
          </div>

          {/* ============ Pricing ============ */}
          <Section title="الأسعار" icon={<Tag size={16} />}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <PriceCard label="سعر التكلفة الحالي"      value={fmtMoney(data.costPrice)} />
              <PriceCard label="آخر سعر شراء"            value={data.lastPurchase ? fmtMoney(data.lastPurchase.unitCost) : '—'}
                                                          subtitle={data.lastPurchase ? fmtDate(data.lastPurchase.invoiceDate) : undefined} />
              <PriceCard label="متوسّط التكلفة"          value={fmtMoney(data.avgCost)} highlight />
              <PriceCard label="سعر البيع (تجزئة)"       value={fmtMoney(data.retailPrice)} highlight />
              <PriceCard label="سعر الجملة"              value={fmtMoney(data.wholesalePrice)} />
              <PriceCard label="نسبة الضريبة"            value={`${data.taxRate}%`} />
            </div>
          </Section>

          {/* ============ Stock per branch ============ */}
          <Section title="الكمية في كل فرع" icon={<Warehouse size={16} />}>
            {data.stockByBranch.length === 0 ? (
              <p className="text-muted text-sm">لا يوجد مخزون لهذه القطعة في أيّ فرع</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-right text-muted text-xs font-bold border-b border-line">
                      <th className="py-2">الفرع</th>
                      <th className="py-2">المستودع</th>
                      <th className="py-2">الكمية</th>
                      <th className="py-2">محجوز</th>
                      <th className="py-2">متاح</th>
                      <th className="py-2">الموقع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.stockByBranch.map((s) => (
                      <tr key={s.branchId} className="border-b border-line/50">
                        <td className="py-2 font-bold">{s.branchName}</td>
                        <td className="py-2 text-muted">{s.warehouse ?? '—'}</td>
                        <td className={'py-2 font-extrabold ' + (s.quantity <= 0 ? 'text-red-600' : '')}>{s.quantity}</td>
                        <td className="py-2 text-muted">{s.reserved}</td>
                        <td className="py-2 font-bold text-emerald-700">{s.available}</td>
                        <td className="py-2 text-muted">{s.location ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* ============ Profitability ============ */}
          <Section title="الربحية" icon={<TrendingUp size={16} />}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <PriceCard label="إجمالي الإيرادات"  value={fmtMoney(data.totalRevenue)} />
              <PriceCard label="إجمالي التكلفة"    value={fmtMoney(data.totalCost)} />
              <PriceCard label="إجمالي الربح"      value={fmtMoney(data.totalProfit)}
                         highlight={data.totalProfit > 0} />
              <PriceCard label="هامش الربح"        value={`${data.profitMargin.toFixed(1)}%`}
                         highlight={data.profitMargin > 0} />
            </div>
          </Section>

          {/* ============ Last sale / last purchase summary ============ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="card p-3">
              <div className="flex items-center gap-2 text-xs font-bold text-muted mb-2">
                <ShoppingCart size={14} /> آخر عملية بيع
              </div>
              {data.lastSale ? (
                <div className="text-sm space-y-1">
                  <Row label="الفاتورة"
                    value={
                      <button onClick={() => goInvoice(data.lastSale!.invoiceId)}
                              className="text-primary hover:underline font-mono inline-flex items-center gap-1">
                        {data.lastSale.invoiceNo ?? '—'} <ExternalLink size={12} />
                      </button>
                    } />
                  <Row label="التاريخ" value={fmtDate(data.lastSale.invoiceDate)} />
                  <Row label="العميل" value={data.lastSale.customer?.name ?? 'بيع نقدي'} />
                  <Row label="الكمية × السعر" value={`${data.lastSale.qty} × ${fmtMoney(data.lastSale.unitPrice)}`} bold />
                </div>
              ) : (
                <p className="text-muted text-sm">لا توجد عمليات بيع لهذه القطعة بعد</p>
              )}
            </div>

            <div className="card p-3">
              <div className="flex items-center gap-2 text-xs font-bold text-muted mb-2">
                <Building2 size={14} /> آخر عملية شراء
              </div>
              {data.lastPurchase ? (
                <div className="text-sm space-y-1">
                  <Row label="الفاتورة" value={<code className="font-mono">{data.lastPurchase.invoiceNo ?? '—'}</code>} />
                  <Row label="التاريخ" value={fmtDate(data.lastPurchase.invoiceDate)} />
                  <Row label="المورد" value={data.lastPurchase.supplier?.name ?? '—'} />
                  <Row label="الكمية × التكلفة" value={`${data.lastPurchase.qty} × ${fmtMoney(data.lastPurchase.unitCost)}`} bold />
                </div>
              ) : (
                <p className="text-muted text-sm">لا توجد عمليات شراء لهذه القطعة بعد</p>
              )}
            </div>
          </div>

          {/* ============ Sales invoices history ============ */}
          <Section title={`فواتير البيع (${data.salesInvoices.length})`} icon={<ShoppingCart size={16} />}>
            {data.salesInvoices.length === 0 ? (
              <p className="text-muted text-sm">لم تُبَع هذه القطعة بعد</p>
            ) : (
              <div className="overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-right text-muted text-xs font-bold border-b-2 border-line">
                      <th className="py-2">رقم الفاتورة</th>
                      <th className="py-2">التاريخ</th>
                      <th className="py-2">العميل</th>
                      <th className="py-2">الدفع</th>
                      <th className="py-2">الكمية</th>
                      <th className="py-2">السعر</th>
                      <th className="py-2">المجموع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.salesInvoices.map((s) => (
                      <tr key={s.invoiceId} className="border-b border-line/50 hover:bg-slate-50">
                        <td className="py-2">
                          <button onClick={() => goInvoice(s.invoiceId)}
                                  className="text-primary hover:underline font-mono inline-flex items-center gap-1">
                            {s.invoiceNo ?? '—'} <ExternalLink size={11} />
                          </button>
                        </td>
                        <td className="py-2 whitespace-nowrap">{fmtDate(s.invoiceDate)}</td>
                        <td className="py-2">{s.customer?.name ?? <span className="text-muted">نقدي</span>}</td>
                        <td className="py-2 text-xs">{PAYMENT_LABEL[s.paymentType] ?? s.paymentType}</td>
                        <td className="py-2">{s.qty}</td>
                        <td className="py-2">{fmtMoney(s.unitPrice)}</td>
                        <td className="py-2 font-bold">{fmtMoney(s.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* ============ Purchase invoices history ============ */}
          <Section title={`فواتير الشراء (${data.purchaseInvoices.length})`} icon={<Building2 size={16} />}>
            {data.purchaseInvoices.length === 0 ? (
              <p className="text-muted text-sm">لم تُشترَ هذه القطعة بعد</p>
            ) : (
              <div className="overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-right text-muted text-xs font-bold border-b-2 border-line">
                      <th className="py-2">رقم الفاتورة</th>
                      <th className="py-2">التاريخ</th>
                      <th className="py-2">المورد</th>
                      <th className="py-2">الكمية</th>
                      <th className="py-2">التكلفة/وحدة</th>
                      <th className="py-2">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.purchaseInvoices.map((p, idx) => (
                      <tr key={p.invoiceId + idx} className="border-b border-line/50 hover:bg-slate-50">
                        <td className="py-2 font-mono">{p.invoiceNo ?? '—'}</td>
                        <td className="py-2 whitespace-nowrap">{fmtDate(p.invoiceDate)}</td>
                        <td className="py-2">{p.supplier?.name ?? '—'}</td>
                        <td className="py-2">{p.qty}</td>
                        <td className="py-2">{fmtMoney(p.unitCost)}</td>
                        <td className="py-2 font-bold">{fmtMoney(p.qty * p.unitCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* ============ Stock movements ============ */}
          <Section title={`حركة المخزون (آخر ${data.movements.length})`} icon={<History size={16} />}>
            {data.movements.length === 0 ? (
              <p className="text-muted text-sm">لا توجد حركات مخزون مسجَّلة</p>
            ) : (
              <div className="overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-right text-muted text-xs font-bold border-b-2 border-line">
                      <th className="py-2">التاريخ</th>
                      <th className="py-2">النوع</th>
                      <th className="py-2">التغيير</th>
                      <th className="py-2">الفرع</th>
                      <th className="py-2">المستخدم</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.movements.map((m) => (
                      <tr key={String(m.id)} className="border-b border-line/50">
                        <td className="py-2 whitespace-nowrap text-xs">{fmtDate(m.createdAt)}</td>
                        <td className="py-2">{MOVEMENT_LABEL[m.type] ?? m.type}</td>
                        <td className={'py-2 font-bold whitespace-nowrap inline-flex items-center gap-1 ' +
                          (m.qtyChange > 0 ? 'text-emerald-700' : 'text-rose-700')}>
                          {m.qtyChange > 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                          {m.qtyChange > 0 ? '+' : ''}{m.qtyChange}
                        </td>
                        <td className="py-2">{m.branchName ?? '—'}</td>
                        <td className="py-2 text-xs">{m.userName ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>
      ) : null}
    </Modal>
  );
}

// ============ Small presentational helpers ============

function HeroCard({ icon, label, value, subtitle, suffix, color }: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  subtitle?: string;
  suffix?: string;
  color: 'primary' | 'emerald' | 'amber' | 'rose' | 'blue' | 'indigo';
}) {
  const colors: Record<string, string> = {
    primary: 'border-primary/30 bg-primary/5 text-primary',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber:   'border-amber-200 bg-amber-50 text-amber-700',
    rose:    'border-rose-200 bg-rose-50 text-rose-700',
    blue:    'border-blue-200 bg-blue-50 text-blue-700',
    indigo:  'border-indigo-200 bg-indigo-50 text-indigo-700',
  };
  return (
    <div className={'rounded-xl border-2 p-3 ' + colors[color]}>
      <div className="flex items-center gap-1.5 text-xs font-bold opacity-80">{icon} {label}</div>
      <div className="text-2xl sm:text-3xl font-extrabold mt-1.5 leading-tight">{value}{suffix && <span className="text-base font-bold opacity-70 me-1">{suffix}</span>}</div>
      {subtitle && <div className="text-xs opacity-70 mt-0.5">{subtitle}</div>}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="card p-4">
      <h3 className="font-extrabold text-sm flex items-center gap-2 mb-3 pb-2 border-b border-line">
        {icon} {title}
      </h3>
      {children}
    </div>
  );
}

function Row({ label, value, bold = false }: { label: string; value: ReactNode; bold?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted shrink-0">{label}:</span>
      <span className={'flex-1 ' + (bold ? 'font-extrabold' : 'font-semibold')}>{value}</span>
    </div>
  );
}

function PriceCard({ label, value, subtitle, highlight = false }: {
  label: string; value: ReactNode; subtitle?: string; highlight?: boolean;
}) {
  return (
    <div className={'rounded-lg p-2.5 border ' +
      (highlight ? 'bg-primary/5 border-primary/30' : 'bg-bg border-line')}>
      <div className="text-[11px] text-muted">{label}</div>
      <div className={'font-extrabold mt-0.5 ' + (highlight ? 'text-primary text-base' : 'text-sm')}>{value}</div>
      {subtitle && <div className="text-[10px] text-muted mt-0.5">{subtitle}</div>}
    </div>
  );
}
