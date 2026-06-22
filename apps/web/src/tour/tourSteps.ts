/**
 * tourSteps.ts — bilingual product-tour definitions
 * ─────────────────────────────────────────────────────────────────
 * Every tour returns its steps from a builder function so that
 * `i18n.t(...)` is resolved at call time, not at module load. This
 * lets the user switch languages mid-session and have the next tour
 * render in the new language automatically.
 *
 * Each tour aims for 6–10 steps so a new user gets a thorough,
 * professional walkthrough rather than a token "this is the menu"
 * popover.
 *
 * Adding a tour:
 *   1. Add the key to `TourKey`.
 *   2. Write a builder function that returns DriveStep[].
 *   3. Register it in `TOURS`.
 *   4. Add corresponding `data-tour="<key>"` attributes in the DOM.
 *
 * Translation strings live under `tour.*` in ar.json/en.json. Any
 * Arabic literal here is also caught by the DOM translator overlay
 * when the user is on English — so untranslated keys still fall back
 * cleanly.
 */

import type { DriveStep } from 'driver.js';
import i18n from 'i18next';

const t = (key: string, opts?: any): string => i18n.t(key, opts) as string;

export type TourKey =
  | 'welcome'
  | 'dashboard'
  | 'parts'
  | 'stock'
  | 'sales'
  | 'pos'
  | 'purchases'
  | 'customers'
  | 'suppliers'
  | 'reports'
  | 'branches'
  | 'transfers'
  | 'expenses'
  | 'settings'
  | 'cheques'
  | 'papers'
  | 'jofotara'
  | 'help'
  | 'training';

const p = (title: string, description: string, side: 'top'|'bottom'|'left'|'right' = 'bottom') => ({
  title, description, side, align: 'start' as const,
});

/* ─── Welcome — gentle intro across the system ────────────────── */
function welcomeSteps(): DriveStep[] {
  return [
    { popover: p('👋 مرحباً بك في قِطَعتي!',
      'نظام إدارة قطع الغيار السحابي العربي الأوّل. في هذه الجولة القصيرة (≈ دقيقتين) سترى أهمّ الميزات.\n\nيمكنك تخطّيها في أي وقت — إعادة التشغيل دائماً متاحة من زرّ "؟" أسفل اليسار.') },
    { element: '[data-tour="sidebar"]',
      popover: p('🏠 القائمة الرئيسية',
        'كل أقسام النظام من هنا: لوحة التحكم، نقطة البيع، الأصناف، المخزون، المشتريات، التقارير، الفروع، الإعدادات… القائمة دائماً ظاهرة.',
        'left') },
    { element: '[data-tour="branch-selector"]',
      popover: p('🏢 اختيار الفرع',
        'إذا كان عندك عدّة فروع، تنقّل بينها من هنا. كل المخزون والفواتير تتبدّل حسب الفرع المختار.') },
    { element: '[data-tour="lang-switcher"]',
      popover: p('🌐 اللغة',
        'بدّل بين العربية والإنجليزية بنقرة واحدة. الاتجاه (RTL/LTR) والتواريخ والعملة تتغيّر تلقائياً.') },
    { element: '[data-tour="global-search"]',
      popover: p('🔎 البحث العالمي ⌘K',
        'ابحث عن أيّ شيء — أصناف، فواتير، عملاء، موردين، شيكات. اضغط Cmd+K (أو Ctrl+K) من أي مكان.') },
    { element: '[data-tour="nav-pos"]',
      popover: p('🛒 نقطة البيع',
        'تصدر الفاتورة هنا في ثواني. JoFotara تُرسَل تلقائياً.', 'left') },
    { element: '[data-tour="nav-parts"]',
      popover: p('📦 الأصناف والقطع',
        'كاتالوج كل قطعك مع الصور والأسعار والمخزون.', 'left') },
    { element: '[data-tour="nav-reports"]',
      popover: p('📊 التقارير الذكية',
        '9 بطاقات قابلة للنقر تكشف كل أرقام محلّك: الإيراد، التكلفة، الأرباح، المصاريف…', 'left') },
    { element: '[data-tour="nav-training"]',
      popover: p('🎓 وضع التدريب',
        '8 تدريبات تفاعلية تجعلك خبيراً بالنظام في أقل من 30 دقيقة. الأنسب للمستخدمين الجدد.', 'left') },
    { element: '[data-tour="nav-help"]',
      popover: p('❓ مركز المساعدة',
        'أسئلة شائعة، دليل المستخدم، فيديوهات تعليمية، ودعم مباشر.', 'left') },
    { popover: p('🎉 ممتاز! انتهت الجولة',
      'الآن أنت جاهز. نصيحتنا:\n\n1️⃣ أضِف فرعك الأول من قسم الفروع.\n2️⃣ استورد أصنافك من Excel.\n3️⃣ جرّب إصدار فاتورة من POS.\n\nأيّ وقت تحتاج مساعدة، اضغط "؟" أسفل الشاشة، أو ادخل "وضع التدريب" لتجربة كاملة موجّهة.') },
  ];
}

/* ─── Dashboard — KPIs + alerts ───────────────────────────────── */
function dashboardSteps(): DriveStep[] {
  return [
    { element: '[data-tour="dash-today"]',
      popover: p('💰 مبيعات اليوم', 'مجموع مبيعاتك اليوم لحظياً. ينعكس فور إصدار أي فاتورة.') },
    { element: '[data-tour="dash-invoices"]',
      popover: p('🧾 عدد الفواتير', 'كم فاتورة أصدرت اليوم — مؤشّر سرعة الحركة.') },
    { element: '[data-tour="dash-month"]',
      popover: p('📅 مبيعات الشهر', 'إجمالي الشهر الحالي لقياس الأداء التراكمي.') },
    { element: '[data-tour="dash-low-stock"]',
      popover: p('⚠️ قطع تحت الحد الأدنى', 'كل القطع التي وصلت للحد الأدنى — تذكير للشراء قبل النفاد.') },
    { element: '[data-tour="dash-receivables"]',
      popover: p('👥 الذمم المستحقة', 'إجمالي ما لك على العملاء. انقر لرؤية القائمة وإرسال تذكير.') },
    { popover: p('💡 نصيحة',
      'الـdashboard يُحدّث نفسه كل 30 ثانية. لا تحتاج لإعادة التحميل.') },
  ];
}

/* ─── Parts — catalog + import + search ───────────────────────── */
function partsSteps(): DriveStep[] {
  return [
    { element: '[data-tour="parts-search"]',
      popover: p('🔍 البحث', 'ابحث بـSKU، Part Number، OEM، أو الباركود. النتائج تظهر فوراً.') },
    { element: '[data-tour="parts-new"]',
      popover: p('➕ صنف جديد', 'أضِف قطعة جديدة بكل تفاصيلها (SKU، Part Number، OEM، الأسعار، المخزون).') },
    { element: '[data-tour="parts-import"]',
      popover: p('📥 استيراد متطوّر', 'انقل أصنافك من Excel/CSV من أي نظام — معالج 5 خطوات بـmapping ذكي وتقرير أخطاء.') },
    { element: '[data-tour="parts-export"]',
      popover: p('📤 التصدير', 'صدّر أصنافك — Excel/CSV — كاملة أو حسب الفلتر الحالي، أو نموذج فارغ.') },
    { element: '[data-tour="parts-table"]',
      popover: p('💡 انقر على أيّ صنف',
        'يفتح بطاقة 360° — كل شيء عن القطعة: المخزون بكل فرع، آخر بيع، آخر شراء، الأرباح، البدائل.', 'top') },
    { popover: p('🎯 خلاصة',
      'صفحة الأصناف هي قلب النظام. كلما ضبطت بيانات قطعك (الحد الأدنى، السعر، التكلفة) كلما كانت تقاريرك أدقّ.') },
  ];
}

/* ─── Stock — multi-branch warehouse ──────────────────────────── */
function stockSteps(): DriveStep[] {
  return [
    { element: '[data-tour="stock-table"]',
      popover: p('📦 حركة المخزون الحالية', 'كل القطع بكمياتها وفروعها وحالتها (متوفر/منخفض/نفد).') },
    { popover: p('🔄 التحويلات',
      'لنقل بضاعة بين فروع، استخدم قسم "تحويلات الفروع" من القائمة.') },
    { popover: p('💡 تعديل يدوي',
      'انقر على أيّ صنف لرؤية حركاته الكاملة + إمكانية تعديل المخزون يدوياً (يُسجّل في الـaudit).') },
  ];
}

/* ─── POS — fast checkout ─────────────────────────────────────── */
function posSteps(): DriveStep[] {
  return [
    { element: '[data-tour="pos-search"]',
      popover: p('🔍 ابحث عن القطعة', 'ابحث بالاسم، SKU، Part Number، أو امسح الباركود مباشرة.') },
    { element: '[data-tour="pos-grid"]',
      popover: p('📦 القطع المتاحة', 'انقر القطعة لإضافتها للسلّة. الصور تساعدك في التعرّف السريع.', 'top') },
    { element: '[data-tour="pos-cart"]',
      popover: p('🛒 السلّة', 'حرّر الكميات، طبّق الخصومات، اختر العميل، اختر الفرع.', 'left') },
    { element: '[data-tour="pos-checkout"]',
      popover: p('✅ إتمام البيع', 'بنقرة واحدة: تُحفظ الفاتورة، تُرسَل JoFotara، وتطبع.', 'top') },
    { popover: p('💡 وضع الباركود',
      'إذا كان عندك قارئ باركود، يكفي مسح الكود ليُضاف للسلّة تلقائياً.') },
  ];
}

/* ─── Sales — invoices list ──────────────────────────────────── */
function salesSteps(): DriveStep[] {
  return [
    { element: '[data-tour="sales-new"]',
      popover: p('➕ فاتورة جديدة', 'اختر العميل، أضِف الأصناف، طبّق خصم وضريبة، احفظ.') },
    { element: '[data-tour="sales-table"]',
      popover: p('📋 كل الفواتير', 'كل فواتيرك مع رقمها، تاريخها، عميلها، حالة JoFotara، والمبلغ. انقر فاتورة لفتحها.') },
    { popover: p('💡 إعادة الإرسال',
      'إذا فشل إرسال فاتورة لـJoFotara، تظهر بـbadge أحمر — انقرها لإعادة المحاولة.') },
  ];
}

/* ─── Purchases — supplier invoices ──────────────────────────── */
function purchasesSteps(): DriveStep[] {
  return [
    { element: '[data-tour="purch-new"]',
      popover: p('➕ فاتورة شراء جديدة', 'سجّل شحنة جديدة من مورد — تختار المورد، الفرع، وتضيف القطع وأسعار الشراء.') },
    { element: '[data-tour="purch-table"]',
      popover: p('📋 فواتير الشراء', 'كل فواتيرك من الموردين. تستلام البضاعة يحدّث المخزون ومتوسط التكلفة.') },
    { popover: p('💡 الدفع الجزئي',
      'يمكنك تسجيل دفعة جزئية الآن — الباقي يصبح "ذمّة" تظهر في كشف حساب المورد.') },
  ];
}

/* ─── Customers ──────────────────────────────────────────────── */
function customersSteps(): DriveStep[] {
  return [
    { element: '[data-tour="cust-new"]',
      popover: p('➕ عميل جديد', 'الاسم والهاتف كفاية. يمكنك إضافة حدّ ائتمان لتنبيهك عند تجاوزه.') },
    { element: '[data-tour="cust-search"]',
      popover: p('🔍 البحث', 'ابحث بالاسم أو الهاتف. النتائج فورية.') },
    { element: '[data-tour="cust-table"]',
      popover: p('💡 انقر على عميل', 'يفتح كشف الحساب: الفواتير، الإيصالات، الرصيد، الأقدمية.', 'top') },
    { popover: p('💰 الذمم',
      'الرصيد يُحدَّث تلقائياً مع كل فاتورة وإيصال — لا حاجة لمسك دفتر.') },
  ];
}

/* ─── Suppliers ──────────────────────────────────────────────── */
function suppliersSteps(): DriveStep[] {
  return [
    { element: '[data-tour="supp-new"]',
      popover: p('➕ مورد جديد', 'أضِف موردك مع تفاصيل التواصل.') },
    { element: '[data-tour="supp-table"]',
      popover: p('💡 انقر على مورد', 'يفتح كشف الحساب: المستحق لك، فواتير الشراء، الدفعات.', 'top') },
    { popover: p('📊 المقارنة',
      'التقارير تُظهر أكثر الموردين توريداً، ومن يعطيك أفضل أسعار.') },
  ];
}

/* ─── Reports — 9 clickable cards ────────────────────────────── */
function reportsSteps(): DriveStep[] {
  return [
    { element: '[data-tour="reports-tabs"]',
      popover: p('📑 5 أنواع تقارير', 'الأرباح والخسائر، الربحية حسب القطعة، دوران المخزون، أعمار ديون العملاء + الموردين.') },
    { element: '[data-tour="reports-period"]',
      popover: p('📅 الفترة الزمنية', 'حدّد من تاريخ → إلى تاريخ. كل الأرقام تتعدّل تلقائياً.') },
    { element: '[data-tour="reports-cards"]',
      popover: p('💎 بطاقات قابلة للنقر',
        'كل بطاقة (الإيراد، التكلفة، الربح، المصاريف…) تفتح drill-down مع طباعة + Excel + PDF.', 'top') },
    { popover: p('💡 الطباعة الذكية',
      'كل تقرير يدعم طباعة A4 احترافية مع شعار محلّك، فترة التقرير، اسم المستخدم، وفرع التقرير.') },
  ];
}

/* ─── Branches ───────────────────────────────────────────────── */
function branchesSteps(): DriveStep[] {
  return [
    { element: '[data-tour="branches-new"]',
      popover: p('➕ فرع جديد', 'الاسم والعنوان كفاية. النظام يُنشئ مستودعاً تلقائياً لكل فرع جديد.') },
    { element: '[data-tour="branches-table"]',
      popover: p('🏢 الفروع', 'كل فروعك مع عناوينها وحالتها. الفرع "الرئيسي" يُحدَّد بنجمة.') },
    { popover: p('🔄 نقل البضاعة',
      'استخدم "تحويلات الفروع" لنقل قطع — تُحجَز من المصدر وتُضاف عند استلام الوجهة.') },
  ];
}

/* ─── Transfers ──────────────────────────────────────────────── */
function transfersSteps(): DriveStep[] {
  return [
    { element: '[data-tour="transfers-new"]',
      popover: p('➕ تحويل جديد', 'من فرع → إلى فرع → اختر الأصناف والكميات.') },
    { element: '[data-tour="transfers-table"]',
      popover: p('🔄 سجل التحويلات', 'كل التحويلات مع حالتها (قيد النقل / مكتمل).') },
    { popover: p('💡 الاستلام',
      'عند استلام الفرع للبضاعة، يضغط "تأكيد الاستلام" ليُحدَّث مخزون الوجهة.') },
  ];
}

/* ─── Expenses ───────────────────────────────────────────────── */
function expensesSteps(): DriveStep[] {
  return [
    { element: '[data-tour="expenses-new"]',
      popover: p('➕ مصروف جديد', 'اختر الفئة (إيجار/كهرباء/راتب/…)، أدخل المبلغ، ارفع الإيصال.') },
    { element: '[data-tour="expenses-table"]',
      popover: p('💸 سجل المصاريف', 'كل المصاريف بفلاتر حسب الفئة والفترة.') },
    { popover: p('📊 التأثير على الأرباح',
      'كل مصروف يخصم من صافي الربح في التقارير — تابِع التصنيف الصحيح.') },
  ];
}

/* ─── Cheques ────────────────────────────────────────────────── */
function chequesSteps(): DriveStep[] {
  return [
    { popover: p('💵 إدارة الشيكات',
      'سجّل كل شيكاتك الواردة والصادرة في مكان واحد، مع تنبيهات بتواريخ الاستحقاق.') },
    { popover: p('🟢 وارد / 🔴 صادر',
      'التبويبان منفصلان. كل شيك يربط بعميل (وارد) أو مورد (صادر).') },
    { popover: p('📈 لوحة الـDashboard',
      'تعرض الشيكات المستحقّة قريباً، المرتجعة، والمسجّلة.') },
  ];
}

/* ─── Papers ─────────────────────────────────────────────────── */
function papersSteps(): DriveStep[] {
  return [
    { popover: p('📄 الأوراق الرسمية',
      'تتبّع كل أوراق المحل: سجل تجاري، مكتب صحّة، رخصة مهن، تأمين، أوراق المركبات…') },
    { popover: p('⚠️ تنبيهات الانتهاء',
      'النظام يُنبّهك قبل 30 يوماً من انتهاء أي ورقة — لا تتفاجأ بمخالفات.') },
  ];
}

/* ─── JoFotara ───────────────────────────────────────────────── */
function jofotaraSteps(): DriveStep[] {
  return [
    { popover: p('🇯🇴 الفوترة الإلكترونية',
      'JoFotara الرسمية — كل فاتورة بيع تُرسَل لإستد تلقائياً (إذا فعّلتها).') },
    { popover: p('⚙️ الإعدادات',
      'أدخل بيانات الـClient ID والـSecret من بوابة إستد. الـSecret يُخزَّن مشفّراً.') },
    { popover: p('📊 لوحة المعلومات',
      'احصائيات: عدد المرسَل، عدد الفاشل، آخر 20 عملية. إعادة المحاولة بنقرة.') },
  ];
}

/* ─── Help Center ────────────────────────────────────────────── */
function helpSteps(): DriveStep[] {
  return [
    { popover: p('🆘 مركز المساعدة',
      'كل ما تحتاجه لتتعلّم النظام بنفسك في مكان واحد.') },
    { element: '[data-tour="help-faq"]',
      popover: p('❓ الأسئلة الشائعة', '12 سؤال يغطّي معظم ما يحتاجه المستخدمون الجدد.') },
    { element: '[data-tour="help-guide"]',
      popover: p('📖 دليل المستخدم', 'شرح module-by-module: كيف يعمل كل قسم بالتفصيل.') },
    { element: '[data-tour="help-videos"]',
      popover: p('🎥 الفيديوهات', 'دروس فيديو قصيرة لأهم العمليات.') },
    { element: '[data-tour="help-contact"]',
      popover: p('📨 التواصل مع الدعم', 'لم تجد ما تبحث عنه؟ راسلنا مباشرة من هنا.') },
  ];
}

/* ─── Training Mode ──────────────────────────────────────────── */
function trainingSteps(): DriveStep[] {
  return [
    { popover: p('🎓 وضع التدريب',
      '8 تدريبات تفاعلية ستجعلك خبيراً بالنظام في أقل من 30 دقيقة.') },
    { popover: p('✅ التحقّق الذكي',
      'كل تدريب يحوي زرّ "تحقّق". النظام يفحص API ليتأكّد فعلياً أنك أتممت الخطوة.') },
    { popover: p('💾 التقدّم محفوظ',
      'يمكنك المغادرة في أي وقت — تقدّمك يُحفظ تلقائياً.') },
    { popover: p('🏆 شهادة الإنجاز',
      'بعد إكمال الـ8 تدريبات، تظهر شاشة احتفال — أنت رسمياً ready للإنتاج!') },
  ];
}

/* ─── Settings ───────────────────────────────────────────────── */
function settingsSteps(): DriveStep[] {
  return [
    { popover: p('⚙️ الإعدادات والهوية',
      'كل شيء عن محلّك من هنا: الاسم، الشعار، اللون، الضريبة، الطباعة، اللغة.') },
    { popover: p('🎨 White-Label',
      'غيّر اسم الشركة ولونها — الواجهة تتبدّل فوراً.') },
    { popover: p('🖨️ الطباعة',
      'A4 احترافي، أو حراري 80mm/58mm، مع شعارك وبياناتك.') },
  ];
}

/** Registry — each entry is a builder so translations resolve when
 *  the tour is *opened*, not at module load. */
export const TOURS: Record<TourKey, () => DriveStep[]> = {
  welcome:   welcomeSteps,
  dashboard: dashboardSteps,
  parts:     partsSteps,
  stock:     stockSteps,
  sales:     salesSteps,
  pos:       posSteps,
  purchases: purchasesSteps,
  customers: customersSteps,
  suppliers: suppliersSteps,
  reports:   reportsSteps,
  branches:  branchesSteps,
  transfers: transfersSteps,
  expenses:  expensesSteps,
  cheques:   chequesSteps,
  papers:    papersSteps,
  jofotara:  jofotaraSteps,
  help:      helpSteps,
  training:  trainingSteps,
  settings:  settingsSteps,
};

/** Map a route path to the matching tour. */
export function tourKeyForPath(path: string): TourKey | null {
  const seg = path.split('/').filter(Boolean)[0] ?? '';
  const aliases: Record<string, TourKey> = {
    invoices: 'sales',
    audit:    'settings',
  };
  const key = (aliases[seg] ?? seg) as TourKey;
  return (key in TOURS) ? key : null;
}

/** Arabic fallback labels (DOM translator overlays English at runtime). */
export const TOUR_LABELS: Record<TourKey, string> = {
  welcome:   'الجولة الترحيبية',
  dashboard: 'لوحة التحكم',
  parts:     'الأصناف',
  stock:     'المخزون',
  sales:     'المبيعات',
  pos:       'نقطة البيع',
  purchases: 'المشتريات',
  customers: 'العملاء',
  suppliers: 'الموردون',
  reports:   'التقارير',
  branches:  'الفروع',
  transfers: 'التحويلات',
  expenses:  'المصاريف',
  cheques:   'الشيكات',
  papers:    'الأوراق الرسمية',
  jofotara:  'الفوترة الإلكترونية',
  help:      'مركز المساعدة',
  training:  'وضع التدريب',
  settings:  'الإعدادات',
};
