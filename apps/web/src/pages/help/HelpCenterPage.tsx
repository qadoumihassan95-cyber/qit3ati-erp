/**
 * HelpCenterPage — مركز المساعدة الكامل
 * ──────────────────────────────────────────────────────────────
 * Five sections in one page:
 *   1. Search — instant filter across FAQ + guide topics
 *   2. FAQ — accordion list of frequent questions
 *   3. User Guide — module-by-module explainer (Dashboard, Parts, POS,
 *      Customers, Suppliers, Purchases, Expenses, Reports, Branches,
 *      Settings, Users, Backup)
 *   4. Videos — placeholder cards for tutorial videos
 *   5. Contact Support — email/WhatsApp form (UI-only for now)
 *
 * Every visible string is Arabic; the DOM translator overlays English
 * at runtime when the user switches language.
 */
import { useMemo, useState } from 'react';
import {
  Search, BookOpen, Video, MessageCircle, HelpCircle, ChevronDown,
  LayoutDashboard, Wrench, ShoppingCart, Users, Building2, Truck,
  Receipt, FileBarChart, Building, Settings as SettingsIcon,
  Shield, Database, X, Play,
} from 'lucide-react';

interface FAQ { q: string; a: string; }
interface GuideTopic {
  key: string;
  icon: any;
  title: string;
  blurb: string;
  bullets: string[];
}
interface VideoItem {
  title: string;
  duration: string;
  /** YouTube video ID (the part after `v=` in the URL). Empty = placeholder. */
  youtubeId?: string;
  /** Vimeo ID alternative. */
  vimeoId?: string;
  /** Cover thumbnail URL — falls back to YouTube auto-thumbnail when youtubeId set. */
  cover?: string;
}

const FAQS: FAQ[] = [
  { q: 'كيف أُنشئ فاتورة بيع جديدة؟',  a: 'افتح "نقطة البيع POS" من القائمة الجانبية. ابحث عن القطعة، أضِفها للسلّة، اختر العميل، حدّد طريقة الدفع، ثم اضغط "إتمام البيع". تُحفظ الفاتورة وتُطبع تلقائياً، وتُرسل لـJoFotara إذا كان مفعّلاً.' },
  { q: 'كيف أُضيف صنفاً جديداً؟',       a: 'افتح "الأصناف والقطع"، اضغط "صنف جديد"، أدخل SKU + اسم القطعة + الأسعار + الحد الأدنى للمخزون، ثم احفظ. لرفع صورة استخدم زرّ الكاميرا.' },
  { q: 'كيف أستورد أصنافاً من Excel؟', a: 'افتح "الأصناف"، اضغط "استيراد متطوّر". معالج 5 خطوات: اختر الملف → اربط الأعمدة → عاين البيانات → اختر الخيارات (تخطّي المكرّر؟ إنشاء مورد تلقائي؟) → استورد. أيّ أخطاء يصدر تقرير Excel للمراجعة.' },
  { q: 'كيف أتابع المخزون عبر الفروع؟',  a: 'افتح "المخزون والفروع". اختر الفرع من الـheader. تظهر كل القطع بكمياتها لحظياً. للنقل بين فروع استخدم "تحويلات الفروع".' },
  { q: 'كيف أُسجّل عميلاً جديداً؟',     a: 'افتح "العملاء"، اضغط "عميل جديد"، أدخل الاسم + الهاتف + حدّ الائتمان (اختياري). الرصيد يُحدّث تلقائياً مع كل فاتورة وإيصال.' },
  { q: 'كيف أُسجّل مصروفاً؟',           a: 'افتح "المصاريف"، اضغط "مصروف جديد"، اختر الفئة (إيجار/كهرباء/راتب/...)، أدخل المبلغ والتاريخ، ارفع الإيصال (اختياري). المصروف يُؤثّر على صافي الربح في التقارير.' },
  { q: 'كيف أُصدر تقرير أرباح؟',         a: 'افتح "التقارير" → بطاقة "الأرباح والخسائر". حدّد الفترة. كل بطاقة (الإيراد، التكلفة، الربح، المصاريف) قابلة للنقر لعرض التفاصيل والطباعة/PDF/Excel.' },
  { q: 'كيف أُغيّر اللغة بين العربية والإنجليزية؟', a: 'اضغط زرّ اللغة في الـheader (يُظهر الـlanguage الأخرى). النظام يُعيد تحميل الصفحة ويبدّل بين RTL/LTR تلقائياً.' },
  { q: 'كيف أُعيد تشغيل الجولة التعريفية؟', a: 'اضغط زرّ "؟" العائم في الزاوية السفلى لأيّ صفحة، ثم "إعادة الجولة التعريفية". أو افتح "وضع التدريب" من القائمة لتدريب موجّه 8 خطوات.' },
  { q: 'كيف أُرسل فاتورة إلى JoFotara؟', a: 'من /jofotara → التبويب "الإعدادات" أدخل بيانات الاتصال (Client ID + Secret). كل فاتورة بيع جديدة تُرسل تلقائياً. الفواتير الفاشلة تظهر في تبويب "السجل" لإعادة المحاولة.' },
  { q: 'كيف أُضيف فرعاً جديداً؟',        a: 'افتح "الفروع"، اضغط "فرع جديد"، أدخل الاسم + العنوان + المدير. النظام يُنشئ مستودعاً تلقائياً لكل فرع جديد.' },
  { q: 'هل البيانات آمنة؟',               a: 'نعم — السيرفر على بنية سحابية مع تشفير TLS 1.3، كلمات المرور مشفّرة بـbcrypt، وبيانات JoFotara بـAES-256-GCM. سجل التدقيق يُسجّل كل عملية إنشاء/تعديل/حذف مع المستخدم والـIP.' },
];

const GUIDE: GuideTopic[] = [
  { key: 'dashboard', icon: LayoutDashboard, title: 'لوحة التحكم',
    blurb: 'الصفحة الرئيسية تعطيك نظرة فورية على أداء محلّك.',
    bullets: ['البطاقات الإحصائية: مبيعات اليوم، عدد الفواتير، مبيعات الشهر، قطع تحت الحد', 'تنبيهات نفاد المخزون مع زرّ شراء سريع', 'الذمم المستحقة على العملاء', 'البحث العالمي ⌘K للوصول لأي شيء فوراً', 'الإشعارات بـbadge أحمر إذا فيه مهام جديدة'] },
  { key: 'parts', icon: Wrench, title: 'الأصناف والقطع',
    blurb: 'كاتالوج كل قطعك مع الصور والأسعار والمخزون.',
    bullets: ['إضافة صنف يدوياً أو استيراد Excel/CSV من أيّ نظام', 'رفع صور (camera أو file) مع compression تلقائي', 'بحث بـSKU/Part Number/OEM/Barcode', 'فلاتر: متوفر/منخفض/نفد', 'انقر أيّ صف لفتح بطاقة 360° (المخزون بكل فرع، آخر بيع، آخر شراء، الأرباح، البدائل)', 'استيراد متطوّر: 5 خطوات بـmapping ذكي وreport للأخطاء', 'تصدير: كل الأصناف / المعروضة / template فارغ'] },
  { key: 'pos', icon: ShoppingCart, title: 'نقطة البيع POS',
    blurb: 'إصدار فواتير سريع — يعمل على كمبيوتر، تابلت، أو موبايل.',
    bullets: ['ابحث عن القطعة بـبارcode/SKU/اسم', 'انقر القطعة لإضافتها للسلة', 'حدّد الكمية والخصم والضريبة', 'اختر العميل (موجود أو زائر)', 'طرق الدفع: نقدي/آجل/بطاقة/مختلط', 'إصدار + طباعة + إرسال لـJoFotara بنقرة واحدة'] },
  { key: 'customers', icon: Users, title: 'العملاء',
    blurb: 'قاعدة بيانات العملاء + كشف الحساب.',
    bullets: ['إضافة عميل: اسم، هاتف، عنوان، حدّ ائتمان', 'كشف حساب كامل: الفواتير، الإيصالات، الرصيد', 'سجل المبيعات', 'الذمم المستحقة + الأقدمية (0-30، 31-60، 61-90، 90+)', 'طباعة بيان حساب PDF'] },
  { key: 'suppliers', icon: Building2, title: 'الموردون',
    blurb: 'إدارة الموردين + كشف ما لهم علينا.',
    bullets: ['إضافة مورد: اسم، هاتف، عنوان', 'سجل المشتريات من كل مورد', 'الرصيد المستحق لك', 'بيانات التواصل + ملاحظات'] },
  { key: 'purchases', icon: Truck, title: 'المشتريات',
    blurb: 'فواتير الشراء من الموردين — تزيد المخزون تلقائياً.',
    bullets: ['إنشاء فاتورة شراء: المورد، الفرع، تاريخ الاستلام', 'إضافة الأصناف مع أسعار الشراء', 'استلام البضاعة → يحدّث المخزون + متوسط التكلفة', 'الدفع: نقدي/آجل/شيك', 'الطباعة + التصدير'] },
  { key: 'expenses', icon: Receipt, title: 'المصاريف',
    blurb: 'تتبّع كل ما يخرج من الصندوق.',
    bullets: ['تصنيفات: إيجار، كهرباء، نقل، رواتب، أخرى', 'رفع الإيصال كصورة', 'دُفع من: صندوق/بنك/شيك', 'يؤثّر على صافي الربح في التقارير', 'تصدير CSV/PDF للمحاسب'] },
  { key: 'stock', icon: Database, title: 'المخزون والفروع',
    blurb: 'متابعة لحظية للمخزون عبر كل الفروع.',
    bullets: ['كل القطع بكمياتها وفروعها', 'حركات المخزون (دخول/خروج/تحويل)', 'تحويل بضاعة بين فروع: حجز من المصدر + إضافة للوجهة عند الاستلام', 'تنبيهات نفاد + تحت الحد الأدنى', 'تعديل المخزون يدوياً مع سبب وتسجيل في الـaudit'] },
  { key: 'reports', icon: FileBarChart, title: 'التقارير',
    blurb: '9 بطاقات تكشف كل أرقام محلّك.',
    bullets: ['الأرباح والخسائر للفترة', 'الأرباح حسب القطعة (الأكثر ربحية)', 'دوران المخزون', 'أعمار ديون العملاء + الموردين', 'كل بطاقة قابلة للنقر تفتح drill-down مع طباعة/PDF/Excel'] },
  { key: 'branches', icon: Building, title: 'الفروع',
    blurb: 'إدارة فروع متعدّدة، كل فرع له مخزونه المستقل.',
    bullets: ['إضافة فرع: اسم، عنوان، هاتف، مدير', 'مستودع يُنشأ تلقائياً مع كل فرع جديد', 'نقل المخزون بين الفروع', 'عرض بيانات كل فرع منفرداً (مبيعات/مخزون/أرباح)'] },
  { key: 'users', icon: Shield, title: 'المستخدمون والصلاحيات',
    blurb: 'تحكّم دقيق بمن يستطيع فعل ماذا.',
    bullets: ['إنشاء مستخدم: اسم، بريد، كلمة مرور، دور', 'الأدوار: مالك / مدير / محاسب / كاشير', 'صلاحيات بـmodule (parts.read / parts.write / sales.delete / ...)', 'سجل التدقيق يسجّل كل عملية مع الـIP والـuser-agent'] },
  { key: 'settings', icon: SettingsIcon, title: 'الإعدادات',
    blurb: 'إعدادات النظام والهوية.',
    bullets: ['بيانات الشركة: اسم، شعار، عنوان، رقم ضريبي', 'الهوية البصرية: لون أساسي + لون مميّز (white-label)', 'إعدادات الطباعة: A4/A5/80mm/58mm', 'اللغة الافتراضية + العملة + الضريبة العامة', 'النسخ الاحتياطي اليومي التلقائي'] },
];

/**
 * Tutorial videos. To publish:
 *   1. Record the screencast (see Marketing-Sales/VIDEO_PRODUCTION_GUIDE.md).
 *   2. Upload to YouTube — set visibility to "Unlisted" if you want it
 *      private to your team, or "Public" for marketing reach.
 *   3. Copy the 11-character video ID from the URL (the part after `v=`)
 *      and paste it as `youtubeId` below.
 *   4. The cover image and runtime are pulled automatically from YouTube.
 *
 * Empty youtubeId === placeholder (shows "Coming soon").
 */
const VIDEOS: VideoItem[] = [
  { title: 'البدء السريع — 5 دقائق',      duration: '5:23', youtubeId: '' },
  { title: 'إصدار فاتورتك الأولى',         duration: '3:48', youtubeId: '' },
  { title: 'استيراد الأصناف من Excel',       duration: '7:12', youtubeId: '' },
  { title: 'إعداد JoFotara خطوة بخطوة',    duration: '6:30', youtubeId: '' },
  { title: 'تحويل بين فروع بشكل احترافي',   duration: '4:15', youtubeId: '' },
  { title: 'قراءة التقارير المالية',         duration: '8:50', youtubeId: '' },
];

export default function HelpCenterPage() {
  const [q, setQ] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [activeGuide, setActiveGuide] = useState<string>('dashboard');
  const [playingVideo, setPlayingVideo] = useState<VideoItem | null>(null);

  const filteredFaqs = useMemo(() => {
    if (!q.trim()) return FAQS;
    const s = q.toLowerCase();
    return FAQS.filter((f) => f.q.toLowerCase().includes(s) || f.a.toLowerCase().includes(s));
  }, [q]);

  const filteredGuide = useMemo(() => {
    if (!q.trim()) return GUIDE;
    const s = q.toLowerCase();
    return GUIDE.filter((g) =>
      g.title.toLowerCase().includes(s) ||
      g.blurb.toLowerCase().includes(s) ||
      g.bullets.some((b) => b.toLowerCase().includes(s)),
    );
  }, [q]);

  const activeTopic = GUIDE.find((g) => g.key === activeGuide) ?? GUIDE[0]!;

  return (
    <div className="max-w-6xl mx-auto" data-tour="help-center">
      {/* Hero */}
      <div className="bg-gradient-to-br from-primary to-blue-700 rounded-2xl text-white p-8 mb-6 text-center">
        <HelpCircle size={48} className="mx-auto mb-3 opacity-90" />
        <h1 className="text-3xl font-extrabold mb-2">مركز المساعدة</h1>
        <p className="text-white/85 max-w-xl mx-auto">
          كل ما تحتاجه لتتعلّم النظام بنفسك — أسئلة شائعة، دليل شامل، فيديوهات، ودعم مباشر.
        </p>

        {/* Search */}
        <div className="relative mt-6 max-w-xl mx-auto">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-muted" size={20} />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث في المساعدة..."
            className="w-full pr-12 pl-4 py-3 rounded-xl text-ink text-sm shadow-lg outline-none"
          />
        </div>
      </div>

      {/* FAQ */}
      <div className="card mb-6" data-tour="help-faq">
        <h2 className="text-xl font-extrabold mb-3 flex items-center gap-2">
          <BookOpen size={20} className="text-primary" /> الأسئلة الشائعة
        </h2>
        {filteredFaqs.length === 0 ? (
          <p className="text-muted text-sm py-6 text-center">لا توجد نتائج للبحث</p>
        ) : (
          <div className="space-y-2">
            {filteredFaqs.map((f, i) => (
              <details
                key={i}
                open={openFaq === i}
                onToggle={(e) => setOpenFaq((e.currentTarget as HTMLDetailsElement).open ? i : null)}
                className="border border-line rounded-lg overflow-hidden transition"
              >
                <summary className="cursor-pointer px-4 py-3 font-bold text-sm hover:bg-bg/60 flex items-center justify-between">
                  {f.q}
                  <ChevronDown size={16} className="text-muted transition-transform group-open:rotate-180" />
                </summary>
                <div className="px-4 py-3 border-t border-line text-sm text-muted leading-7 bg-bg/30">
                  {f.a}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>

      {/* User Guide */}
      <div className="card mb-6" data-tour="help-guide">
        <h2 className="text-xl font-extrabold mb-3 flex items-center gap-2">
          <BookOpen size={20} className="text-primary" /> دليل المستخدم
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
          {/* Topics list */}
          <div className="space-y-1">
            {filteredGuide.map((g) => {
              const Icon = g.icon;
              return (
                <button
                  key={g.key}
                  onClick={() => setActiveGuide(g.key)}
                  className={
                    'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-right transition ' +
                    (activeGuide === g.key ? 'bg-primary text-white' : 'hover:bg-bg/60 text-ink')
                  }
                >
                  <Icon size={16} />
                  <span>{g.title}</span>
                </button>
              );
            })}
          </div>
          {/* Topic detail */}
          <div className="border border-line rounded-xl p-5 bg-bg/30">
            <h3 className="font-extrabold text-lg mb-1">{activeTopic.title}</h3>
            <p className="text-muted text-sm mb-4">{activeTopic.blurb}</p>
            <ul className="space-y-2 text-sm leading-7">
              {activeTopic.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Videos */}
      <div className="card mb-6" data-tour="help-videos">
        <h2 className="text-xl font-extrabold mb-3 flex items-center gap-2">
          <Video size={20} className="text-primary" /> الفيديوهات التعليمية
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {VIDEOS.map((v, i) => {
            const isReady = Boolean(v.youtubeId || v.vimeoId);
            const cover = v.cover ?? (v.youtubeId ? `https://img.youtube.com/vi/${v.youtubeId}/maxresdefault.jpg` : null);
            return (
              <button
                key={i}
                disabled={!isReady}
                onClick={() => isReady && setPlayingVideo(v)}
                className={
                  'border border-line rounded-xl overflow-hidden transition text-right ' +
                  (isReady ? 'hover:shadow-md hover:scale-[1.01] cursor-pointer' : 'opacity-60 cursor-not-allowed')
                }
              >
                <div className="aspect-video bg-gradient-to-br from-bg to-line grid place-items-center text-muted relative overflow-hidden">
                  {cover ? (
                    <img src={cover} alt={v.title} className="absolute inset-0 w-full h-full object-cover" />
                  ) : null}
                  <div className={
                    'relative z-10 w-14 h-14 rounded-full grid place-items-center ' +
                    (isReady ? 'bg-white/90 text-primary shadow-lg' : 'bg-white/60 text-muted')
                  }>
                    {isReady ? <Play size={24} fill="currentColor" /> : <Video size={28} />}
                  </div>
                  {!isReady && (
                    <span className="absolute bottom-2 right-2 text-[10px] bg-black/60 text-white px-2 py-0.5 rounded">
                      قريباً
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <h4 className="font-bold text-sm mb-1">{v.title}</h4>
                  <p className="text-xs text-muted">{v.duration}</p>
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted text-center mt-4">
          💡 الفيديوهات قريباً — تجهيز محتوى احترافي. تصفّح Marketing-Sales/VIDEO_PRODUCTION_GUIDE.md للسيناريوهات الجاهزة.
        </p>
      </div>

      {/* Video player modal */}
      {playingVideo && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPlayingVideo(null)}
        >
          <div
            className="bg-black rounded-2xl overflow-hidden w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3 text-white">
              <h3 className="font-bold text-sm">{playingVideo.title}</h3>
              <button onClick={() => setPlayingVideo(null)} className="hover:bg-white/10 p-1.5 rounded-lg">
                <X size={18} />
              </button>
            </div>
            <div className="aspect-video bg-black">
              {playingVideo.youtubeId ? (
                <iframe
                  src={`https://www.youtube.com/embed/${playingVideo.youtubeId}?autoplay=1&rel=0`}
                  title={playingVideo.title}
                  className="w-full h-full"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : playingVideo.vimeoId ? (
                <iframe
                  src={`https://player.vimeo.com/video/${playingVideo.vimeoId}?autoplay=1`}
                  title={playingVideo.title}
                  className="w-full h-full"
                  frameBorder="0"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Contact Support */}
      <div className="card" data-tour="help-contact">
        <h2 className="text-xl font-extrabold mb-3 flex items-center gap-2">
          <MessageCircle size={20} className="text-primary" /> التواصل مع الدعم
        </h2>
        <p className="text-sm text-muted mb-4">
          لم تجد ما تبحث عنه؟ راسل فريق الدعم مباشرة.
        </p>
        <form
          onSubmit={(e) => { e.preventDefault(); alert('سيتم تفعيل الإرسال قريباً.'); }}
          className="grid grid-cols-1 md:grid-cols-2 gap-3"
        >
          <div>
            <label className="block text-sm font-bold mb-1.5">الموضوع</label>
            <input className="input" placeholder="استفسار حول..." />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1.5">الأولوية</label>
            <select className="input">
              <option>عادية</option>
              <option>متوسطة</option>
              <option>عاجلة</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-bold mb-1.5">الرسالة</label>
            <textarea className="input min-h-[120px]" placeholder="اشرح المشكلة بالتفصيل..." />
          </div>
          <div className="md:col-span-2 flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs text-muted">
              📧 support@qit3ati.com — 🟢 واتساب: +962-7XXXXXXXX
            </p>
            <button className="btn-primary">إرسال</button>
          </div>
        </form>
      </div>
    </div>
  );
}
