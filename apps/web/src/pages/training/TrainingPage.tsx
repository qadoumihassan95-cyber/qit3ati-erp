/**
 * TrainingPage — وضع التدريب التفاعلي
 * ──────────────────────────────────────────────────────────────
 * Eight progressive challenges that teach a new user the system
 * by *doing* — not just reading.
 *
 *   1. Add a customer
 *   2. Add a part
 *   3. Add a supplier
 *   4. Create a sales invoice
 *   5. Create a purchase invoice
 *   6. Add an expense
 *   7. Generate a report
 *   8. Adjust stock
 *
 * Each challenge:
 *   • Has a clear "What to do" instruction
 *   • A "Go to page" button that opens the relevant module
 *   • A "Verify" button that hits the API to check if the user did it
 *   • A score (✓ done / ✗ pending)
 *
 * Progress is persisted in localStorage so the user can leave and
 * come back. A reset button is provided. After all 8 are done, a
 * celebration screen appears with a certificate-style ribbon.
 *
 * NOTE: Training Mode shares the user's real data. The instructions
 * favor creating *sample* records the user can delete afterwards
 * (e.g. "Test Customer 1"). True isolation/sandboxing is a future
 * enhancement — this version teaches by guided real-world actions.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  GraduationCap, Check, ChevronRight, RefreshCw, Trophy,
  UserPlus, Wrench, Building2, ShoppingCart, Truck, Receipt,
  FileBarChart, Boxes,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

interface Challenge {
  key: string;
  num: number;
  title: string;
  what: string;
  hint: string;
  cta: string;
  route: string;
  icon: any;
  verifyEndpoint: string;
  /** How to read the API response to decide "done". */
  isPass: (data: any, baseline: number) => boolean;
  /** Human label for the metric we're tracking. */
  metricLabel: string;
}

const CHALLENGES: Challenge[] = [
  { key: 'customer', num: 1, title: 'التدريب الأول — إضافة عميل',
    what: 'افتح صفحة العملاء وأنشئ عميلاً تجريبياً.',
    hint: 'اضغط "عميل جديد"، أدخل اسماً (مثلاً "عميل تدريب")، وأيّ رقم هاتف ثم احفظ.',
    cta: 'افتح العملاء', route: '/customers', icon: UserPlus,
    verifyEndpoint: '/customers?limit=1', metricLabel: 'عدد العملاء',
    isPass: (d, base) => (d?.total ?? d?.items?.length ?? 0) > base,
  },
  { key: 'part', num: 2, title: 'التدريب الثاني — إضافة صنف',
    what: 'افتح كاتالوج الأصناف وأنشئ صنفاً تجريبياً.',
    hint: 'اضغط "صنف جديد"، أدخل SKU + اسم + سعر بيع + حد أدنى، ثم احفظ.',
    cta: 'افتح الأصناف', route: '/parts', icon: Wrench,
    verifyEndpoint: '/parts?limit=1', metricLabel: 'عدد الأصناف',
    isPass: (d, base) => (d?.total ?? d?.items?.length ?? 0) > base,
  },
  { key: 'supplier', num: 3, title: 'التدريب الثالث — إضافة مورد',
    what: 'افتح صفحة الموردين وأنشئ مورداً تجريبياً.',
    hint: 'اضغط "مورد جديد"، أدخل اسماً (مثلاً "مورد تدريب") ورقم تواصل، ثم احفظ.',
    cta: 'افتح الموردين', route: '/suppliers', icon: Building2,
    verifyEndpoint: '/suppliers?limit=1', metricLabel: 'عدد الموردين',
    isPass: (d, base) => (d?.total ?? d?.items?.length ?? 0) > base,
  },
  { key: 'sale', num: 4, title: 'التدريب الرابع — فاتورة بيع',
    what: 'من POS أنشئ فاتورة بيع تجريبية للعميل الذي أنشأته.',
    hint: 'ابحث عن الصنف، أضِفه للسلّة، اختر العميل، اضغط "إتمام البيع".',
    cta: 'افتح نقطة البيع', route: '/pos', icon: ShoppingCart,
    verifyEndpoint: '/sales?limit=1', metricLabel: 'عدد فواتير البيع',
    isPass: (d, base) => (d?.total ?? d?.items?.length ?? 0) > base,
  },
  { key: 'purchase', num: 5, title: 'التدريب الخامس — فاتورة شراء',
    what: 'من صفحة المشتريات أنشئ فاتورة شراء تجريبية.',
    hint: 'اختر المورد، أضِف صنفاً مع كمية وسعر شراء، احفظ.',
    cta: 'افتح المشتريات', route: '/purchases', icon: Truck,
    verifyEndpoint: '/purchases?limit=1', metricLabel: 'عدد فواتير الشراء',
    isPass: (d, base) => (d?.total ?? d?.items?.length ?? 0) > base,
  },
  { key: 'expense', num: 6, title: 'التدريب السادس — مصروف',
    what: 'من صفحة المصاريف أضِف مصروفاً تجريبياً.',
    hint: 'اختر فئة (مثلاً كهرباء) وأدخل مبلغاً صغيراً.',
    cta: 'افتح المصاريف', route: '/expenses', icon: Receipt,
    verifyEndpoint: '/expenses?limit=1', metricLabel: 'عدد المصاريف',
    isPass: (d, base) => (d?.total ?? d?.items?.length ?? 0) > base,
  },
  { key: 'report', num: 7, title: 'التدريب السابع — استخراج تقرير',
    what: 'افتح التقارير وشاهد بطاقة الأرباح والخسائر.',
    hint: 'انقر على أيّ بطاقة (مثلاً الإيراد) لعرض التفاصيل + Print/Excel.',
    cta: 'افتح التقارير', route: '/reports', icon: FileBarChart,
    verifyEndpoint: '/reports/pnl', metricLabel: 'مشاهدة تقرير',
    isPass: (d) => Boolean(d), // any response = pass
  },
  { key: 'stock', num: 8, title: 'التدريب الثامن — إدارة المخزون',
    what: 'افتح صفحة المخزون وشاهد الكميات اللحظية.',
    hint: 'استكشف الصفحة — جرّب تعديل مخزون صنف يدوياً.',
    cta: 'افتح المخزون', route: '/stock', icon: Boxes,
    verifyEndpoint: '/stock?limit=1', metricLabel: 'مشاهدة المخزون',
    isPass: (d) => Boolean(d),
  },
];

interface ProgressState {
  done: Record<string, true>;
  baselines: Record<string, number>;
}

const STORAGE_PREFIX = 'qit3ati-training';

function readProgress(userId: string | null): ProgressState {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}:${userId ?? 'guest'}`);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { done: {}, baselines: {} };
}
function writeProgress(userId: string | null, state: ProgressState) {
  try { localStorage.setItem(`${STORAGE_PREFIX}:${userId ?? 'guest'}`, JSON.stringify(state)); }
  catch { /* ignore */ }
}

export default function TrainingPage() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user) as any;
  const userId: string | null = user?.id ?? user?.sub ?? null;

  const [progress, setProgress] = useState<ProgressState>(() => readProgress(userId));
  const [verifyingKey, setVerifyingKey] = useState<string | null>(null);
  const [verifyMsg, setVerifyMsg] = useState<{ key: string; ok: boolean; msg: string } | null>(null);

  // Capture baselines on first load so "did the user add something new" works
  useEffect(() => {
    let cancelled = false;
    if (Object.keys(progress.baselines).length === CHALLENGES.length) return;
    (async () => {
      const baselines = { ...progress.baselines };
      for (const c of CHALLENGES) {
        if (typeof baselines[c.key] === 'number') continue;
        try {
          const r = await api.get(c.verifyEndpoint);
          baselines[c.key] = r.data?.total ?? r.data?.items?.length ?? 0;
        } catch { baselines[c.key] = 0; }
      }
      if (cancelled) return;
      const next = { ...progress, baselines };
      setProgress(next);
      writeProgress(userId, next);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completedCount = CHALLENGES.filter((c) => progress.done[c.key]).length;
  const allDone = completedCount === CHALLENGES.length;

  const reset = () => {
    if (!confirm('إعادة تعيين تقدّم التدريب؟')) return;
    const next = { done: {}, baselines: {} };
    setProgress(next);
    writeProgress(userId, next);
  };

  const verify = async (c: Challenge) => {
    setVerifyingKey(c.key);
    setVerifyMsg(null);
    try {
      const r = await api.get(c.verifyEndpoint);
      const baseline = progress.baselines[c.key] ?? 0;
      const ok = c.isPass(r.data, baseline);
      if (ok) {
        const next = { ...progress, done: { ...progress.done, [c.key]: true as const } };
        setProgress(next);
        writeProgress(userId, next);
        setVerifyMsg({ key: c.key, ok: true, msg: '✓ ممتاز — تمّ التحقّق بنجاح!' });
      } else {
        setVerifyMsg({ key: c.key, ok: false, msg: '⏳ لم نكتشف تنفيذاً جديداً بعد — جرّب الخطوة مرة أخرى.' });
      }
    } catch (e: any) {
      setVerifyMsg({ key: c.key, ok: false, msg: '⚠️ تعذّر التحقّق — تأكّد من الاتصال بالإنترنت.' });
    } finally {
      setVerifyingKey(null);
    }
  };

  // Celebration screen
  if (allDone) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="bg-gradient-to-br from-amber-400 to-amber-600 text-white rounded-2xl p-10 shadow-xl mb-6">
          <Trophy size={64} className="mx-auto mb-3" />
          <h1 className="text-4xl font-extrabold mb-2">🎉 ممتاز!</h1>
          <p className="text-xl">تم إكمال التدريب بنجاح</p>
          <p className="text-white/85 text-sm mt-3 max-w-lg mx-auto">
            أنت الآن جاهز لتشغيل النظام بثقة كاملة. كل المهارات الأساسية في يدك:
            إدارة العملاء والموردين، إصدار الفواتير، تتبّع المخزون، وقراءة التقارير.
          </p>
        </div>
        <button onClick={reset} className="btn-ghost">
          <RefreshCw size={16} /> إعادة التدريب
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto" data-tour="training">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary to-blue-700 text-white rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-3">
          <GraduationCap size={32} />
          <h1 className="text-2xl font-extrabold">وضع التدريب</h1>
        </div>
        <p className="text-white/85 text-sm mb-4">
          8 تدريبات تفاعلية ستجعلك خبيراً بالنظام في أقل من 30 دقيقة.
          نفّذ كل خطوة على بياناتك الفعلية، ثم اضغط "تحقّق" لإثبات إنجازك.
        </p>
        {/* Progress bar */}
        <div className="bg-white/15 rounded-full h-2.5 overflow-hidden">
          <div
            className="bg-white h-full transition-all duration-500"
            style={{ width: `${(completedCount / CHALLENGES.length) * 100}%` }}
          />
        </div>
        <p className="text-xs text-white/85 mt-2">{completedCount} من {CHALLENGES.length} تدريب مكتمل</p>
      </div>

      {/* Reset */}
      <div className="flex justify-end mb-3">
        <button onClick={reset} className="text-xs text-muted hover:text-red-500 flex items-center gap-1">
          <RefreshCw size={12} /> إعادة التعيين
        </button>
      </div>

      {/* Challenges */}
      <div className="space-y-3">
        {CHALLENGES.map((c) => {
          const Icon = c.icon;
          const done = !!progress.done[c.key];
          const verifying = verifyingKey === c.key;
          const msg = verifyMsg?.key === c.key ? verifyMsg : null;

          return (
            <ChallengeCard key={c.key} done={done}>
              <div className="flex items-start gap-3">
                <div className={
                  'w-12 h-12 rounded-xl grid place-items-center shrink-0 ' +
                  (done ? 'bg-green-100 text-green-700' : 'bg-primary/10 text-primary')
                }>
                  {done ? <Check size={24} /> : <Icon size={22} />}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-extrabold text-base mb-0.5">{c.title}</h3>
                  <p className="text-sm text-muted mb-2">{c.what}</p>
                  <p className="text-xs text-muted leading-6 mb-3 bg-bg/60 rounded-lg p-2">
                    💡 {c.hint}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => navigate(c.route)} className="btn-primary text-xs">
                      {c.cta} <ChevronRight size={14} />
                    </button>
                    {!done && (
                      <button
                        onClick={() => verify(c)}
                        disabled={verifying}
                        className="btn-ghost text-xs"
                      >
                        {verifying ? '...تحقّق' : 'تحقّق من الإنجاز'}
                      </button>
                    )}
                  </div>
                  {msg && (
                    <div className={
                      'text-xs mt-2 px-3 py-2 rounded-lg ' +
                      (msg.ok ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700')
                    }>
                      {msg.msg}
                    </div>
                  )}
                </div>
              </div>
            </ChallengeCard>
          );
        })}
      </div>

      {/* Footer note */}
      <p className="text-center text-xs text-muted mt-6">
        💡 يمكنك مغادرة هذه الصفحة في أيّ وقت — تقدّمك يُحفظ تلقائياً.
      </p>
    </div>
  );
}

function ChallengeCard({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <div className={
      'card transition ' +
      (done ? 'border-green-300 bg-green-50/30' : 'hover:shadow-md')
    }>
      {children}
    </div>
  );
}
