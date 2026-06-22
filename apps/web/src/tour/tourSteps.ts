/**
 * tourSteps.ts
 * ─────────────────────────────────────────────────────────────────
 * Centralized tour definitions. Each tour is a Driver.js step list.
 * Steps use `data-tour="..."` attributes on the DOM. If an element
 * is missing on screen (responsive hide, permissions), the step is
 * skipped automatically (see TourProvider).
 *
 * Adding a new tour:
 *   1. Pick a key (e.g. 'customers').
 *   2. Add an entry in TOURS.
 *   3. Each step has `element` (CSS selector) + `popover`.
 *   4. Add a `data-tour="<key>"` attribute to the DOM element.
 */

import type { DriveStep } from 'driver.js';

export type TourKey =
  | 'welcome'         // first-login overview tour (covers sidebar + dashboard highlights)
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
  | 'settings';

// helper to build popovers consistently
const p = (title: string, description: string, side: 'top'|'bottom'|'left'|'right' = 'bottom') => ({
  title, description, side, align: 'start' as const,
});

/* ─────────────────────────────────────────────────────────
 *  WELCOME — covers everything new users need on day one
 * ───────────────────────────────────────────────────────── */
const welcomeSteps: DriveStep[] = [
  {
    popover: p(
      '👋 مرحباً بك في قِطَعتي!',
      'نظام إدارة قطع الغيار السحابي العربي الأول. سأرشدك في جولة قصيرة (دقيقتان) لتتعرّف على أهمّ الميزات.\n\nيمكنك تخطّي الجولة في أي وقت — تستطيع إعادة تشغيلها لاحقاً من زرّ "؟" في أسفل الشاشة.',
    ),
  },
  {
    element: '[data-tour="sidebar"]',
    popover: p(
      '📋 القائمة الرئيسية',
      'كل أقسام النظام من هنا: لوحة التحكم، نقطة البيع، الأصناف، المخزون، المشتريات، التقارير، والمزيد. القائمة دائماً ظاهرة على اليمين.',
      'left',
    ),
  },
  {
    element: '[data-tour="branch-selector"]',
    popover: p(
      '🏢 اختيار الفرع',
      'إذا كان لديك عدّة فروع، تنقّل بينها من هنا. كل ما تراه في النظام يتبدّل حسب الفرع المختار.',
    ),
  },
  {
    element: '[data-tour="global-search"]',
    popover: p(
      '🔎 البحث العالمي (⌘K)',
      'ابحث عن أي شيء في النظام من هنا — أصناف، فواتير، عملاء، موردين، مشتريات. اضغط Cmd+K (أو Ctrl+K) من أيّ مكان.',
    ),
  },
  {
    element: '[data-tour="nav-parts"]',
    popover: p(
      '📦 الأصناف والقطع',
      'كاتالوج كل قطعك مع الصور والأسعار والمخزون والربحية. ابدأ بإضافة أصنافك من هنا أو استورد ملفك القديم.',
      'left',
    ),
  },
  {
    element: '[data-tour="nav-pos"]',
    popover: p(
      '🛒 نقطة البيع (POS)',
      'هنا تصدر الفواتير في ثوانٍ. يعمل على الجوال والكمبيوتر والتابلت. JoFotara تُرسَل تلقائياً.',
      'left',
    ),
  },
  {
    element: '[data-tour="nav-reports"]',
    popover: p(
      '📊 التقارير الذكية',
      '9 بطاقات قابلة للنقر تكشف كل أرقام محلّك: الإيراد، تكلفة البضاعة، الربح، المصاريف، الضريبة، عدد الفواتير… طباعة + Excel متاحة من كل تقرير.',
      'left',
    ),
  },
  {
    popover: p(
      '🎉 رائع! انتهت الجولة',
      'الآن أنت جاهز للبدء. نصيحتنا:\n\n1. أنشئ فرعك الأول من قسم الفروع.\n2. استورد أصنافك من Excel أو أضفها يدوياً.\n3. جرّب إصدار فاتورتك الأولى من POS.\n\nأي وقت تحتاج مساعدة، اضغط على زرّ "؟" في أسفل الشاشة.',
    ),
  },
];

/* ─────────────────────────────────────────────────────────
 *  PAGE-SPECIFIC TOURS — concise (3-6 steps each)
 * ───────────────────────────────────────────────────────── */

const dashboardSteps: DriveStep[] = [
  { element: '[data-tour="dash-today"]',       popover: p('💰 مبيعات اليوم', 'مجموع مبيعاتك اليوم لحظياً.') },
  { element: '[data-tour="dash-month"]',       popover: p('📅 مبيعات الشهر', 'إجمالي مبيعات الشهر الحالي — لمقارنة الأداء.') },
  { element: '[data-tour="dash-invoices"]',    popover: p('🧾 عدد الفواتير', 'كم فاتورة أصدرت اليوم.') },
  { element: '[data-tour="dash-low-stock"]',   popover: p('⚠️ تنبيهات نفاد المخزون', 'القطع التي وصلت للحد الأدنى — تذكير للشراء.') },
  { element: '[data-tour="dash-receivables"]', popover: p('👥 الذمم المستحقة', 'إجمالي ما لك على العملاء — تابعها لتحصيل أسرع.') },
];

const partsSteps: DriveStep[] = [
  { element: '[data-tour="parts-new"]',      popover: p('➕ صنف جديد', 'أضف قطعة جديدة بكل تفاصيلها (SKU، Part Number، OEM، الأسعار…).') },
  { element: '[data-tour="parts-import"]',   popover: p('📥 استيراد متطوّر', 'انقل أصنافك من Excel/CSV من أي نظام — معالج 5 خطوات بـmapping ذكي.') },
  { element: '[data-tour="parts-export"]',   popover: p('📤 التصدير', 'صدّر أصنافك — Excel/CSV — كاملة أو حسب الفلتر الحالي.') },
  { element: '[data-tour="parts-search"]',   popover: p('🔍 البحث', 'ابحث بالاسم، SKU، Part Number، OEM، أو الباركود.') },
  { element: '[data-tour="parts-table"]',    popover: p('💡 انقر على أيّ صنف', 'يفتح بطاقة 360° — كل شيء عن القطعة: المخزون بكل فرع، آخر بيع، آخر شراء، الأرباح، البدائل.', 'top') },
];

const stockSteps: DriveStep[] = [
  { element: '[data-tour="stock-table"]', popover: p('📦 حركة المخزون الحالية', 'كل القطع بكمياتها وفروعها وحالتها.') },
  { popover: p('💡 ميزة', 'انقر على أي صنف لرؤية حركة المخزون الكاملة.') },
];

const salesSteps: DriveStep[] = [
  { element: '[data-tour="sales-new"]',     popover: p('➕ فاتورة جديدة', 'أنشئ فاتورة بيع — تستطيع اختيار العميل، إضافة قطع، وتطبيق خصم وضريبة.') },
  { element: '[data-tour="sales-table"]',   popover: p('📋 كل الفواتير', 'كل فواتيرك مع رقمها، تاريخها، عميلها، حالة JoFotara، والمبلغ. انقر فاتورة لفتحها.') },
];

const posSteps: DriveStep[] = [
  { element: '[data-tour="pos-search"]',   popover: p('🔍 ابحث عن القطعة', 'ابحث بالاسم، SKU، Part Number، أو امسح الباركود.') },
  { element: '[data-tour="pos-grid"]',     popover: p('📦 القطع المتاحة', 'انقر على القطعة لإضافتها للسلّة.', 'top') },
  { element: '[data-tour="pos-cart"]',     popover: p('🛒 السلّة', 'هنا تحرّر الكميات، الخصومات، وتختار العميل.', 'left') },
  { element: '[data-tour="pos-checkout"]', popover: p('✅ إصدار الفاتورة', 'بنقرة واحدة: تُحفظ الفاتورة، تُرسَل JoFotara، وتطبع.', 'top') },
];

const purchasesSteps: DriveStep[] = [
  { element: '[data-tour="purch-new"]',   popover: p('➕ فاتورة شراء جديدة', 'سجّل شحنة جديدة من مورد — تختار المورد، الفرع، تضيف القطع وأسعار الشراء.') },
  { element: '[data-tour="purch-table"]', popover: p('📋 فواتير الشراء', 'كل فواتير الشراء — انقر فاتورة لتعديلها أو طباعتها.') },
];

const customersSteps: DriveStep[] = [
  { element: '[data-tour="cust-new"]',    popover: p('➕ عميل جديد', 'أضف عميلاً جديداً مع اسمه، هاتفه، وحدّ ائتماني اختياري.') },
  { element: '[data-tour="cust-search"]', popover: p('🔍 البحث', 'ابحث بالاسم أو الهاتف.') },
  { element: '[data-tour="cust-table"]',  popover: p('💡 انقر على عميل', 'يفتح كشف حسابه: الرصيد، الفواتير، الإيصالات، الأقدمية.') },
];

const suppliersSteps: DriveStep[] = [
  { element: '[data-tour="supp-new"]',    popover: p('➕ مورد جديد', 'أضف موردك مع تفاصيل التواصل والحدّ الائتماني.') },
  { element: '[data-tour="supp-table"]',  popover: p('💡 انقر على مورد', 'يفتح كشف حساب المورد: المستحق، فواتير الشراء، الدفعات.') },
];

const reportsSteps: DriveStep[] = [
  { element: '[data-tour="reports-tabs"]',      popover: p('📑 أنواع التقارير', 'الأرباح والخسائر، الربحية حسب القطعة، دوران المخزون، أعمار ديون العملاء والموردين.') },
  { element: '[data-tour="reports-period"]',    popover: p('📅 الفترة الزمنية', 'حدّد من تاريخ → إلى تاريخ. كل الأرقام تتعدّل تلقائياً.') },
  { element: '[data-tour="reports-cards"]',     popover: p('💎 بطاقات قابلة للنقر', 'كل بطاقة (الإيراد، التكلفة، الربح، المصاريف…) تفتح تفاصيل كاملة عند النقر مع طباعة + Excel + PDF.') },
];

const branchesSteps: DriveStep[] = [
  { element: '[data-tour="branches-new"]', popover: p('➕ فرع جديد', 'أضف فرعاً — يُنشأ مستودع رئيسي تلقائياً.') },
  { element: '[data-tour="branches-grid"]', popover: p('🏢 كل فروعك', 'كل بطاقة فرع تستطيع تعديلها أو تفعيلها/تعطيلها.') },
];

const transfersSteps: DriveStep[] = [
  { element: '[data-tour="transfers-new"]', popover: p('🔄 تحويل جديد', 'انقل بضاعة بين فرعين — اختر من/إلى، حدّد القطع وكمياتها.') },
  { element: '[data-tour="transfers-table"]', popover: p('📋 حركة التحويلات', 'كل التحويلات — قيد النقل / تم الاستلام / ملغى. اضغط "استلم" حين تصل البضاعة للوجهة.') },
];

const expensesSteps: DriveStep[] = [
  { element: '[data-tour="exp-new"]',    popover: p('➕ مصروف جديد', 'سجّل أيّ مصروف — كهرباء، إيجار، رواتب — مع التصنيف والفرع.') },
  { element: '[data-tour="exp-table"]',  popover: p('💸 سجلّ المصاريف', 'كل المصاريف مع تواريخها — تظهر تلقائياً في تقرير الأرباح والخسائر.') },
];

const settingsSteps: DriveStep[] = [
  { popover: p('⚙️ إعدادات النظام', 'من هنا تضبط:\n• إعدادات الشركة (الشعار، الرقم الضريبي، العنوان)\n• الفروع\n• المستخدمون والصلاحيات\n• إعدادات JoFotara\n• إعدادات الطباعة') },
];

/* ─────────────────────────────────────────────────────────
 *  Registry
 * ───────────────────────────────────────────────────────── */
export const TOURS: Record<TourKey, DriveStep[]> = {
  welcome:    welcomeSteps,
  dashboard:  dashboardSteps,
  parts:      partsSteps,
  stock:      stockSteps,
  sales:      salesSteps,
  pos:        posSteps,
  purchases:  purchasesSteps,
  customers:  customersSteps,
  suppliers:  suppliersSteps,
  reports:    reportsSteps,
  branches:   branchesSteps,
  transfers:  transfersSteps,
  expenses:   expensesSteps,
  settings:   settingsSteps,
};

/* Map URL pathnames → tour key (for page-specific guide button) */
export function tourKeyForPath(pathname: string): TourKey | null {
  if (pathname === '/' || pathname.startsWith('/dashboard')) return 'dashboard';
  if (pathname.startsWith('/parts'))      return 'parts';
  if (pathname.startsWith('/stock'))      return 'stock';
  if (pathname.startsWith('/pos'))        return 'pos';
  if (pathname.startsWith('/sales')
   || pathname.startsWith('/invoices'))   return 'sales';
  if (pathname.startsWith('/purchases'))  return 'purchases';
  if (pathname.startsWith('/customers'))  return 'customers';
  if (pathname.startsWith('/suppliers'))  return 'suppliers';
  if (pathname.startsWith('/reports'))    return 'reports';
  if (pathname.startsWith('/branches'))   return 'branches';
  if (pathname.startsWith('/transfers'))  return 'transfers';
  if (pathname.startsWith('/expenses'))   return 'expenses';
  if (pathname.startsWith('/settings'))   return 'settings';
  return null;
}

/* Human-readable Arabic label for the help menu */
export const TOUR_LABELS: Record<TourKey, string> = {
  welcome:    'الجولة التعريفية الكاملة',
  dashboard:  'شرح لوحة التحكم',
  parts:      'شرح الأصناف',
  stock:      'شرح المخزون',
  sales:      'شرح المبيعات',
  pos:        'شرح نقطة البيع',
  purchases:  'شرح المشتريات',
  customers:  'شرح العملاء',
  suppliers:  'شرح الموردين',
  reports:    'شرح التقارير',
  branches:   'شرح الفروع',
  transfers:  'شرح تحويلات الفروع',
  expenses:   'شرح المصاريف',
  settings:   'شرح الإعدادات',
};
