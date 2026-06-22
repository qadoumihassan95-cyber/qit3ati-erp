import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import Modal from '@/components/ui/Modal';
import {
  CheckCircle2, AlertCircle, Send, RefreshCw, FileCode,
  ShieldCheck, Eye, EyeOff, ExternalLink, Settings as Cog,
  Activity, ListChecks,
} from 'lucide-react';
import { errMsg, fmtDate, fmtMoney } from '@/lib/format';
import { useTranslation } from 'react-i18next';

type Env = 'sandbox' | 'production';
type Status = 'not_sent' | 'queued' | 'sent' | 'accepted' | 'rejected' | 'failed' | 'needs_resubmit';

const STATUS_LABEL: Record<Status, string> = {
  not_sent:       'لم ترسل',
  queued:         'بانتظار الإرسال',
  sent:           'تم الإرسال',
  accepted:       'مقبولة',
  rejected:       'مرفوضة',
  failed:         'فشل الاتصال',
  needs_resubmit: 'تحتاج إعادة إرسال',
};
const STATUS_PILL: Record<Status, string> = {
  not_sent: 'pill-gray', queued: 'pill-blue', sent: 'pill-blue',
  accepted: 'pill-green', rejected: 'pill-red',
  failed:   'pill-red',   needs_resubmit: 'pill-amber',
};

interface Config {
  exists: boolean;
  clientId: string;
  companyName: string;
  activityNumber: string;
  taxpayerNumber: string;
  environment: Env;
  baseUrlOverride: string | null;
  autoSendOnSale: boolean;
  timeoutMs: number;
  secretMaskTail: string | null;
  connectionVerifiedAt: string | null;
}

interface Submission {
  id: string;
  invoiceId: string | null;
  documentType: string;
  status: Status;
  httpStatus: number | null;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
  invoice?: { id: string; invoiceNo: string | null; total: string | number } | null;
  user?: { id: string; fullName: string } | null;
}

interface Dashboard {
  buckets: Record<Status, number>;
  recent: Submission[];
}

export default function JofotaraPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const role = useAuth((s) => s.user?.role);
  const isOwner = role === 'owner';

  const [tab, setTab] = useState<'config' | 'dashboard' | 'log'>('dashboard');

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-1">{t('jofotara.title')}</h1>
      <p className="text-muted text-sm mb-6">
        ربط مع نظام الفوترة الوطني الأردني (ISTD) — إرسال الفواتير، تتبّع الاستجابات، وإدارة المفاتيح بأمان.
      </p>

      <div className="flex items-center gap-1 mb-4 border-b border-line">
        <TabButton active={tab === 'dashboard'} onClick={() => setTab('dashboard')}>
          <Activity size={16} className="inline -mt-0.5" /> لوحة المتابعة
        </TabButton>
        <TabButton active={tab === 'log'} onClick={() => setTab('log')}>
          <ListChecks size={16} className="inline -mt-0.5" /> سجل العمليات
        </TabButton>
        <TabButton active={tab === 'config'} onClick={() => setTab('config')}>
          <Cog size={16} className="inline -mt-0.5" /> الإعدادات
          {!isOwner && <span className="text-xs text-muted mr-1">(مالك فقط)</span>}
        </TabButton>
      </div>

      {tab === 'dashboard' && <DashboardTab />}
      {tab === 'log'       && <LogTab />}
      {tab === 'config'    && <ConfigTab isOwner={isOwner} />}
    </div>
  );
}

// ============================================================================
// Dashboard Tab
// ============================================================================
function DashboardTab() {
  const { data, isLoading } = useQuery<Dashboard>({
    queryKey: ['jofotara-dashboard'],
    queryFn: async () => (await api.get('/jofotara/dashboard')).data,
    refetchInterval: 30_000,
  });

  if (isLoading) return <p className="text-muted text-center py-10">جاري التحميل...</p>;
  const b = data?.buckets;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        <KpiCard label="لم ترسل"          value={b?.not_sent ?? 0}       color="text-slate-700" />
        <KpiCard label="بانتظار الإرسال"    value={b?.queued ?? 0}         color="text-blue-700" />
        <KpiCard label="تم الإرسال"        value={b?.sent ?? 0}           color="text-blue-700" />
        <KpiCard label="مقبولة"            value={b?.accepted ?? 0}       color="text-green-700" />
        <KpiCard label="مرفوضة"            value={b?.rejected ?? 0}       color="text-red-700" />
        <KpiCard label="فشل الاتصال"       value={b?.failed ?? 0}         color="text-red-700" />
        <KpiCard label="تحتاج إعادة"        value={b?.needs_resubmit ?? 0} color="text-amber-700" />
      </div>

      <div className="card">
        <h3 className="font-extrabold mb-3">آخر 20 عملية إرسال</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-right text-muted text-xs font-bold border-b-2 border-line">
                <th className="px-2 py-2.5">التاريخ</th>
                <th className="px-2 py-2.5">رقم الفاتورة</th>
                <th className="px-2 py-2.5">المبلغ</th>
                <th className="px-2 py-2.5">النوع</th>
                <th className="px-2 py-2.5">الحالة</th>
                <th className="px-2 py-2.5">HTTP</th>
                <th className="px-2 py-2.5">المدة</th>
                <th className="px-2 py-2.5">المستخدم</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recent ?? []).length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-muted">لا توجد عمليات بعد</td></tr>
              )}
              {(data?.recent ?? []).map((s) => (
                <tr key={s.id} className="border-b border-line hover:bg-slate-50">
                  <td className="px-2 py-2.5 whitespace-nowrap">{fmtDate(s.createdAt)}</td>
                  <td className="px-2 py-2.5 font-mono text-xs">{s.invoice?.invoiceNo ?? '—'}</td>
                  <td className="px-2 py-2.5">{s.invoice ? fmtMoney(s.invoice.total) : '—'}</td>
                  <td className="px-2 py-2.5">{s.documentType}</td>
                  <td className="px-2 py-2.5">
                    <span className={'pill ' + STATUS_PILL[s.status]}>{STATUS_LABEL[s.status]}</span>
                  </td>
                  <td className="px-2 py-2.5 font-mono text-xs">{s.httpStatus ?? '—'}</td>
                  <td className="px-2 py-2.5 text-xs text-muted">{s.durationMs ? `${s.durationMs}ms` : '—'}</td>
                  <td className="px-2 py-2.5 text-xs">{s.user?.fullName ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Log Tab (full submissions list with filters)
// ============================================================================
function LogTab() {
  const [statusF, setStatusF] = useState<'' | Status>('');
  const { data, isLoading } = useQuery<Submission[]>({
    queryKey: ['jofotara-submissions', statusF],
    queryFn: async () => (await api.get('/jofotara/submissions', {
      params: { status: statusF || undefined, limit: 200 },
    })).data,
  });

  const [detail, setDetail] = useState<Submission | null>(null);

  return (
    <div className="space-y-3">
      <div className="card">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <select className="input max-w-[200px]" value={statusF} onChange={(e) => setStatusF(e.target.value as any)}>
            <option value="">كل الحالات</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <span className="text-xs text-muted">العدد: {data?.length ?? 0}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="text-right text-muted text-xs font-bold border-b-2 border-line">
                <th className="px-2 py-2.5">التاريخ</th>
                <th className="px-2 py-2.5">رقم الفاتورة</th>
                <th className="px-2 py-2.5">الحالة</th>
                <th className="px-2 py-2.5">HTTP</th>
                <th className="px-2 py-2.5">المدة</th>
                <th className="px-2 py-2.5">المستخدم</th>
                <th className="px-2 py-2.5">رسالة الخطأ</th>
                <th className="px-2 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={8} className="p-6 text-center text-muted">جاري التحميل...</td></tr>}
              {!isLoading && (data ?? []).length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-muted">لا توجد عمليات</td></tr>
              )}
              {(data ?? []).map((s) => (
                <tr key={s.id} className="border-b border-line hover:bg-slate-50">
                  <td className="px-2 py-2.5 whitespace-nowrap">{fmtDate(s.createdAt)}</td>
                  <td className="px-2 py-2.5 font-mono text-xs">{s.invoice?.invoiceNo ?? '—'}</td>
                  <td className="px-2 py-2.5"><span className={'pill ' + STATUS_PILL[s.status]}>{STATUS_LABEL[s.status]}</span></td>
                  <td className="px-2 py-2.5 font-mono text-xs">{s.httpStatus ?? '—'}</td>
                  <td className="px-2 py-2.5 text-xs text-muted">{s.durationMs ? `${s.durationMs}ms` : '—'}</td>
                  <td className="px-2 py-2.5 text-xs">{s.user?.fullName ?? '—'}</td>
                  <td className="px-2 py-2.5 text-xs text-red-700 max-w-[260px] truncate" title={s.errorMessage ?? ''}>
                    {s.errorMessage ?? '—'}
                  </td>
                  <td className="px-2 py-2.5">
                    <button onClick={() => setDetail(s)} className="p-1 rounded hover:bg-slate-100" title="عرض">
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={`عملية #${detail?.id ?? ''}`} size="lg">
        {detail && <SubmissionDetail s={detail} />}
      </Modal>
    </div>
  );
}

function SubmissionDetail({ s }: { s: Submission }) {
  const { data: xmlPayload } = useQuery<{ xml: string; invoiceNo: string | null }>({
    queryKey: ['jofotara-xml', s.invoiceId],
    queryFn: async () => (await api.get(`/jofotara/xml/${s.invoiceId}`)).data,
    enabled: !!s.invoiceId,
  });
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <Info k="الحالة" v={<span className={'pill ' + STATUS_PILL[s.status]}>{STATUS_LABEL[s.status]}</span>} />
        <Info k="HTTP"  v={s.httpStatus ?? '—'} />
        <Info k="المدة" v={s.durationMs ? `${s.durationMs}ms` : '—'} />
        <Info k="التاريخ" v={fmtDate(s.createdAt)} />
        <Info k="الفاتورة" v={s.invoice?.invoiceNo ?? '—'} />
        <Info k="المستخدم" v={s.user?.fullName ?? '—'} />
      </div>
      {s.errorMessage && (
        <div className="p-3 rounded bg-red-50 border border-red-200 text-red-800">
          <b>الخطأ:</b> {s.errorMessage}
        </div>
      )}
      {xmlPayload?.xml && (
        <details>
          <summary className="cursor-pointer font-bold">عرض XML المرسل</summary>
          <pre className="mt-2 p-2 bg-slate-50 border border-line rounded text-xs overflow-auto max-h-[40vh] dir-ltr text-left">{xmlPayload.xml}</pre>
          <button
            className="btn-ghost mt-2"
            onClick={() => {
              const blob = new Blob([xmlPayload.xml], { type: 'application/xml' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `${xmlPayload.invoiceNo ?? 'invoice'}.xml`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            تحميل XML
          </button>
        </details>
      )}
    </div>
  );
}

// ============================================================================
// Config Tab
// ============================================================================
function ConfigTab({ isOwner }: { isOwner: boolean }) {
  const qc = useQueryClient();
  const { data: cfg, isLoading } = useQuery<Config>({
    queryKey: ['jofotara-config'],
    queryFn: async () => (await api.get('/jofotara/config')).data,
  });

  const [clientId,       setClientId]       = useState('');
  const [secret,         setSecret]         = useState('');
  const [showSecret,     setShowSecret]     = useState(false);
  const [activityNumber, setActivityNumber] = useState('');
  const [taxpayerNumber, setTaxpayerNumber] = useState('');
  const [companyName,    setCompanyName]    = useState('');
  const [environment,    setEnvironment]    = useState<Env>('sandbox');
  const [autoSendOnSale, setAutoSendOnSale] = useState(false);
  const [baseUrlOverride, setBaseUrl]       = useState('');
  const [timeoutMs,      setTimeoutMs]      = useState(15_000);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saveOk,  setSaveOk]  = useState(false);

  // Load existing values when config arrives
  if (cfg && !clientId && cfg.clientId)             setClientId(cfg.clientId);
  if (cfg && !activityNumber && cfg.activityNumber) setActivityNumber(cfg.activityNumber);
  if (cfg && !taxpayerNumber && cfg.taxpayerNumber) setTaxpayerNumber(cfg.taxpayerNumber);
  if (cfg && !companyName && cfg.companyName)       setCompanyName(cfg.companyName);
  // Note: deliberately NOT loading secret — it's never returned

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        clientId, activityNumber, taxpayerNumber, companyName,
        environment, autoSendOnSale, baseUrlOverride, timeoutMs,
      };
      // Only send secret if user typed a new one — empty means "leave as-is"
      if (secret.trim()) payload.secret = secret;
      return (await api.put('/jofotara/config', payload)).data;
    },
    onSuccess: () => {
      setSaveOk(true); setSaveErr(null); setSecret('');
      qc.invalidateQueries({ queryKey: ['jofotara-config'] });
      setTimeout(() => setSaveOk(false), 3000);
    },
    onError: (e: any) => setSaveErr(errMsg(e)),
  });

  const test = useMutation({
    mutationFn: async () => (await api.post('/jofotara/test-connection', {})).data,
  });

  if (isLoading) return <p className="text-muted text-center py-10">جاري التحميل...</p>;

  return (
    <div className="space-y-4">
      <div className="card p-4 border-amber-200 bg-amber-50/40">
        <div className="flex items-start gap-2 text-sm">
          <ShieldCheck className="text-amber-700 mt-0.5 shrink-0" size={18} />
          <div>
            <b className="text-amber-900">ملاحظات الأمان:</b>
            <ul className="list-disc list-inside mt-1 text-amber-900/90 text-xs space-y-0.5">
              <li>Secret Key يُخزَّن مشفّراً بـAES-256-GCM ولا يظهر لأيّ مستخدم بعد الحفظ.</li>
              <li>الإعدادات مرئية للمالك فقط (تعديل + اختبار اتصال).</li>
              <li>ابدأ بـ"Sandbox" حتى تتأكّد من أنّ XML سليم قبل التحوّل إلى "Production".</li>
              <li>توثيق ISTD: <a href="https://www.istd.gov.jo/En/List/E-Invoicing" target="_blank" rel="noopener noreferrer" className="text-primary underline">istd.gov.jo</a></li>
            </ul>
          </div>
        </div>
      </div>

      {!isOwner && (
        <div className="card p-3 text-sm text-red-700 border-red-200 bg-red-50">
          الحقول للعرض فقط — التعديل والحفظ مخصّص للمالك (Owner).
        </div>
      )}

      <fieldset disabled={!isOwner} className="contents">
        <div className="card">
          <h3 className="font-extrabold mb-3">بيانات المنشأة</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="اسم الشركة (كما هو لدى ISTD)">
              <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} maxLength={200} />
            </Field>
            <Field label="الرقم الضريبي / Taxpayer Number">
              <input className="input" value={taxpayerNumber} onChange={(e) => setTaxpayerNumber(e.target.value)} maxLength={40} />
            </Field>
            <Field label="Activity Number / Income Source Sequence">
              <input className="input" value={activityNumber} onChange={(e) => setActivityNumber(e.target.value)} maxLength={40} placeholder="مثلاً 1010101" />
            </Field>
          </div>
        </div>

        <div className="card">
          <h3 className="font-extrabold mb-3">مفاتيح API</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Client ID">
              <input className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} maxLength={120} placeholder="UUID من ISTD" />
            </Field>
            <Field label={`Secret Key ${cfg?.secretMaskTail ? `(المحفوظ: ••••${cfg.secretMaskTail})` : '(غير محفوظ بعد)'}`}>
              <div className="relative">
                <input
                  className="input pl-9"
                  type={showSecret ? 'text' : 'password'}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder={cfg?.secretMaskTail ? 'اتركه فارغاً للإبقاء، أو اكتب الجديد' : 'أدخل المفتاح السرّي'}
                  autoComplete="new-password"
                />
                <button type="button" onClick={() => setShowSecret(!showSecret)}
                        className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-ink">
                  {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
          </div>
        </div>

        <div className="card">
          <h3 className="font-extrabold mb-3">البيئة والسلوك</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="البيئة">
              <div className="grid grid-cols-2 gap-2">
                {(['sandbox', 'production'] as Env[]).map((e) => (
                  <button key={e} type="button" onClick={() => setEnvironment(e)}
                          className={'border rounded-lg py-2 text-sm font-bold ' +
                            (environment === e ? 'border-primary bg-primary/5 text-primary' : 'border-line text-muted')}>
                    {e === 'sandbox' ? 'تجريبي (Sandbox)' : 'إنتاج (Production)'}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="مهلة الاتصال (ms)">
              <input className="input" type="number" min={1000} max={60000} step={500}
                     value={timeoutMs} onChange={(e) => setTimeoutMs(Number(e.target.value) || 15000)} />
            </Field>
            <Field label="Base URL مخصّص (اختياري)">
              <input className="input" value={baseUrlOverride} onChange={(e) => setBaseUrl(e.target.value)}
                     placeholder="اتركه فارغاً لاستعمال المسار الافتراضي" />
            </Field>
            <Field label="السلوك التلقائي">
              <label className="flex items-center gap-2 cursor-pointer mt-2">
                <input type="checkbox" checked={autoSendOnSale}
                       onChange={(e) => setAutoSendOnSale(e.target.checked)} className="w-4 h-4 accent-primary" />
                <span className="text-sm">إرسال تلقائي بعد إصدار كل فاتورة بيع</span>
              </label>
            </Field>
          </div>
        </div>

        {/* Status banners */}
        {cfg?.connectionVerifiedAt && (
          <div className="card p-3 text-sm text-green-700 border-green-200 bg-green-50/40 flex items-center gap-2">
            <CheckCircle2 size={18} /> آخر اختبار اتصال ناجح: {fmtDate(cfg.connectionVerifiedAt)}
          </div>
        )}
        {saveErr && (
          <div className="card p-3 text-sm text-red-700 border-red-200 bg-red-50 flex items-center gap-2">
            <AlertCircle size={18} /> {saveErr}
          </div>
        )}
        {saveOk && (
          <div className="card p-3 text-sm text-green-700 border-green-200 bg-green-50 flex items-center gap-2">
            <CheckCircle2 size={18} /> تمّ حفظ الإعدادات بنجاح
          </div>
        )}
        {test.data && (
          <div className={'card p-3 text-sm flex items-center gap-2 ' +
            (test.data.ok ? 'text-green-700 border-green-200 bg-green-50' : 'text-red-700 border-red-200 bg-red-50')}>
            {test.data.ok ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{test.data.message}</span>
            <span className="text-xs text-muted ms-auto">{test.data.durationMs}ms</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button className="btn-ghost border border-line" type="button"
                  disabled={test.isPending || !cfg?.clientId} onClick={() => test.mutate()}>
            <ExternalLink size={16} />
            {test.isPending ? 'جاري الاختبار...' : 'اختبار الاتصال'}
          </button>
          <button className="btn-primary mr-auto" type="button"
                  disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
          </button>
        </div>
      </fieldset>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================
function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick}
            className={'px-4 py-2 text-sm font-bold border-b-2 -mb-px transition ' +
              (active ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink')}>
      {children}
    </button>
  );
}
function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white border border-line rounded-lg p-3 text-center">
      <div className="text-xs text-muted">{label}</div>
      <div className={'text-2xl font-extrabold mt-1 ' + color}>{value}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-muted mb-1">{label}</span>
      {children}
    </label>
  );
}
function Info({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="bg-slate-50 rounded p-2 text-xs">
      <div className="text-muted">{k}</div>
      <div className="font-bold mt-0.5">{v}</div>
    </div>
  );
}

// Exported for use in SalesInvoice detail page (future)
export function InvoiceJofotaraActions({ invoiceId, status, onChange }: {
  invoiceId: string;
  status: Status;
  onChange?: () => void;
}) {
  const qc = useQueryClient();
  const submit = useMutation({
    mutationFn: async () => (await api.post(`/jofotara/submit/${invoiceId}`, {})).data,
    onSuccess: () => { qc.invalidateQueries(); onChange?.(); },
    onError: (e: any) => alert(errMsg(e)),
  });
  const resubmit = useMutation({
    mutationFn: async () => (await api.post(`/jofotara/resubmit/${invoiceId}`, {})).data,
    onSuccess: () => { qc.invalidateQueries(); onChange?.(); },
    onError: (e: any) => alert(errMsg(e)),
  });
  const downloadXml = async () => {
    try {
      const r = await api.get(`/jofotara/xml/${invoiceId}`);
      const xml = (r.data as any).xml;
      const blob = new Blob([xml], { type: 'application/xml' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `invoice-${invoiceId}.xml`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: any) { alert(errMsg(e)); }
  };
  const canSend  = status === 'not_sent' || status === 'failed' || status === 'needs_resubmit' || status === 'rejected';
  const canRetry = status === 'sent' || status === 'failed' || status === 'rejected';
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className={'pill ' + STATUS_PILL[status]}>{STATUS_LABEL[status]}</span>
      {canSend && (
        <button onClick={() => submit.mutate()} className="btn-primary text-xs py-1.5" disabled={submit.isPending}>
          <Send size={14} /> {submit.isPending ? 'جاري...' : 'إرسال JoFotara'}
        </button>
      )}
      {canRetry && !canSend && (
        <button onClick={() => resubmit.mutate()} className="btn-ghost text-xs py-1.5" disabled={resubmit.isPending}>
          <RefreshCw size={14} /> {resubmit.isPending ? '...' : 'إعادة إرسال'}
        </button>
      )}
      <button onClick={downloadXml} className="btn-ghost text-xs py-1.5" title="تحميل XML">
        <FileCode size={14} /> XML
      </button>
    </div>
  );
}
