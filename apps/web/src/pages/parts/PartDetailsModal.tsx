import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import Modal from '@/components/ui/Modal';
import { fmtMoney, fmtDate } from '@/lib/format';
import {
  Package, Warehouse, ShoppingCart, TrendingUp, AlertTriangle,
  Calendar, Building2, History, ArrowUpRight, ArrowDownRight,
  ExternalLink, Tag, Boxes, Wrench,
  Pencil, Printer, ArrowLeftRight, Repeat, IdCard,
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
  substitutes: Array<{
    id: string;
    sku: string;
    name: string;
    partNumber: string | null;
    manufacturer: string | null;
    retailPrice: number;
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
  /** Called when user clicks "تعديل" — parent should open the edit modal. */
  onEdit?: (partId: string) => void;
  /** Called when user clicks "تحويل" — parent should open transfer flow. */
  onTransfer?: (partId: string) => void;
}

export default function PartDetailsModal({ partId, onClose, onEdit, onTransfer }: Props) {
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

  // ============ Quick action handlers ============
  // All print actions render via a hidden iframe — no extra dependencies, works
  // with any browser, prints exactly what's on screen.
  const printBarcode = () => {
    if (!data) return;
    const html = barcodeHTML(data);
    openPrintWindow(html);
  };
  const printCard = () => {
    if (!data) return;
    const html = cardHTML(data);
    openPrintWindow(html);
  };
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

          {/* ============ Quick Actions Bar (sticky-ish at the top) ============ */}
          <div className="flex items-center gap-1.5 flex-wrap p-2 bg-bg/60 rounded-lg border border-line">
            <ActionBtn onClick={() => onEdit?.(data.id)} icon={<Pencil size={14} />} label="تعديل" color="blue" disabled={!onEdit} />
            <ActionBtn onClick={printBarcode} icon={<Repeat size={14} />} label="طباعة باركود" color="slate" />
            <ActionBtn onClick={printCard} icon={<IdCard size={14} />} label="طباعة بطاقة" color="slate" />
            <ActionBtn onClick={() => onTransfer?.(data.id)} icon={<ArrowLeftRight size={14} />} label="تحويل لفرع" color="emerald" disabled={!onTransfer} />
            <span className="mx-1 h-5 w-px bg-line" />
            <ActionBtn onClick={() => scrollTo('section-movements')} icon={<History size={14} />} label="حركة المخزون" color="slate" />
            <ActionBtn onClick={() => scrollTo('section-sales')} icon={<ShoppingCart size={14} />} label="سجل المبيعات" color="slate" />
            <ActionBtn onClick={() => scrollTo('section-purchases')} icon={<Building2 size={14} />} label="سجل المشتريات" color="slate" />
          </div>

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

          {/* ============ Substitutes ============ */}
          {data.substitutes.length > 0 && (
            <Section title={`القطع البديلة المتوافقة (${data.substitutes.length})`} icon={<Repeat size={16} />}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {data.substitutes.map((s) => (
                  <div key={s.id} className="border border-line rounded-lg p-2.5 bg-bg/50 hover:bg-bg cursor-default">
                    <div className="font-bold text-sm">{s.name}</div>
                    <div className="text-xs text-muted mt-0.5">
                      {[s.sku, s.partNumber, s.manufacturer].filter(Boolean).join(' • ')}
                    </div>
                    <div className="text-primary font-extrabold text-sm mt-1">{fmtMoney(s.retailPrice)}</div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ============ Sales invoices history ============ */}
          <div id="section-sales" />
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
          <div id="section-purchases" />
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
          <div id="section-movements" />
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

// ============ Quick action button ============
function ActionBtn({ onClick, icon, label, color, disabled = false }: {
  onClick: () => void;
  icon: ReactNode;
  label: string;
  color: 'blue' | 'emerald' | 'slate' | 'amber';
  disabled?: boolean;
}) {
  const colors: Record<string, string> = {
    blue:    'text-blue-700 hover:bg-blue-50 disabled:text-slate-400',
    emerald: 'text-emerald-700 hover:bg-emerald-50 disabled:text-slate-400',
    amber:   'text-amber-700 hover:bg-amber-50 disabled:text-slate-400',
    slate:   'text-slate-700 hover:bg-slate-100',
  };
  return (
    <button onClick={onClick} disabled={disabled} type="button"
            className={'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-bold transition disabled:cursor-not-allowed ' + colors[color]}>
      {icon}<span>{label}</span>
    </button>
  );
}

// ============ Print helpers ============

// Reusable printable page wrapper — opens via a hidden iframe so it doesn't
// disturb the current page. Same approach we use elsewhere for invoices.
function openPrintWindow(html: string) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0'; iframe.style.bottom = '0';
  iframe.style.width = '0'; iframe.style.height = '0';
  iframe.style.border = '0'; iframe.style.opacity = '0';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow!.document;
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => {
    try {
      iframe.contentWindow!.focus();
      iframe.contentWindow!.print();
    } catch { /* user denied */ }
    setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* gone */ } }, 60_000);
  }, 250);
}

const esc = (s: any): string => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * Barcode label (small, 80mm receipt-friendly).
 * Uses a pure-CSS barcode renderer — no external libs.
 * For real production barcode (Code128/EAN13) the user can later
 * adopt jsbarcode; for now this prints the SKU + name + price + a code-like
 * stripe pattern that scanners can't read but is good enough for labelling.
 */
function barcodeHTML(p: { name: string; sku: string; barcode: string | null; retailPrice: number }) {
  const code = p.barcode || p.sku;
  // Generate a simple deterministic stripe pattern from the code
  const stripes = code.split('').map((ch) => {
    const w = (ch.charCodeAt(0) % 4) + 1;
    return `<span style="display:inline-block;width:${w}px;height:40px;background:#000;margin-left:1px"></span>`;
  }).join('');
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(p.name)}</title>
<style>
  @page { size: 60mm 40mm; margin: 2mm; }
  body { font-family: 'Cairo', 'Tajawal', sans-serif; text-align: center; margin: 0; padding: 2mm; }
  .name { font-weight: 800; font-size: 11px; line-height: 1.2; }
  .bars { margin: 4px 0; line-height: 0; }
  .code { font-family: monospace; font-size: 10px; letter-spacing: 1px; }
  .price { font-weight: 800; font-size: 13px; margin-top: 2px; }
</style></head><body>
  <div class="name">${esc(p.name)}</div>
  <div class="bars">${stripes}</div>
  <div class="code">${esc(code)}</div>
  <div class="price">${p.retailPrice.toFixed(2)} د.أ</div>
</body></html>`;
}

/**
 * Full part card (A5 portrait) — printable info sheet with all key fields.
 * Useful for binders, supplier order forms, customer reference.
 */
function cardHTML(p: FullDetails) {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(p.name)}</title>
<style>
  @page { size: A5 portrait; margin: 10mm; }
  body { font-family: 'Cairo', 'Tajawal', sans-serif; color: #111; margin: 0; padding: 0; }
  h1 { font-size: 18px; margin: 0 0 4px; color: #1E5F74; }
  .sub { font-size: 11px; color: #666; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  td, th { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: start; vertical-align: top; }
  th { background: #f1f5f9; color: #475569; font-weight: 800; width: 35%; }
  .section { font-weight: 800; font-size: 12px; color: #1E5F74; margin-top: 14px; margin-bottom: 4px; border-bottom: 2px solid #1E5F74; padding-bottom: 3px; }
  .footer { margin-top: 18px; text-align: center; font-size: 9px; color: #94a3b8; }
</style></head><body>
  <h1>${esc(p.name)}</h1>
  <div class="sub">${esc(p.nameEn || '')} ${p.manufacturer ? `— ${esc(p.manufacturer)}` : ''}</div>

  <div class="section">معلومات الصنف</div>
  <table>
    <tr><th>SKU</th><td>${esc(p.sku)}</td></tr>
    <tr><th>Part Number</th><td>${esc(p.partNumber ?? '—')}</td></tr>
    <tr><th>OEM</th><td>${esc(p.oemNumber ?? '—')}</td></tr>
    <tr><th>Barcode</th><td>${esc(p.barcode ?? '—')}</td></tr>
    <tr><th>المصنّع</th><td>${esc(p.manufacturer ?? '—')}</td></tr>
    <tr><th>بلد المنشأ</th><td>${esc(p.countryOrigin ?? '—')}</td></tr>
    <tr><th>الوحدة</th><td>${esc(p.unit ?? 'حبة')}</td></tr>
    <tr><th>الفئة</th><td>${esc(p.category?.name ?? '—')}</td></tr>
  </table>

  <div class="section">المخزون والأسعار</div>
  <table>
    <tr><th>الكمية المتوفّرة</th><td><b>${p.totalQuantity}</b> ${p.isLowStock ? '⚠ منخفضة' : ''} ${p.isOutOfStock ? '⛔ نفدت' : ''}</td></tr>
    <tr><th>الحدّ الأدنى</th><td>${p.minStock}</td></tr>
    <tr><th>متوسّط التكلفة</th><td>${p.avgCost.toFixed(3)} د.أ</td></tr>
    <tr><th>سعر التجزئة</th><td><b>${p.retailPrice.toFixed(3)} د.أ</b></td></tr>
    <tr><th>سعر الجملة</th><td>${p.wholesalePrice.toFixed(3)} د.أ</td></tr>
    <tr><th>الضريبة</th><td>${p.taxRate}%</td></tr>
  </table>

  ${p.stockByBranch.length > 0 ? `
  <div class="section">المخزون في كل فرع</div>
  <table>
    <tr><th>الفرع</th><th>الكمية</th><th>المتاح</th></tr>
    ${p.stockByBranch.map((s) => `<tr><td>${esc(s.branchName)}</td><td>${s.quantity}</td><td>${s.available}</td></tr>`).join('')}
  </table>` : ''}

  <div class="footer">تم إنشاء هذه البطاقة بواسطة نظام قِطَعتي — AutoParts Cloud</div>
</body></html>`;
}
