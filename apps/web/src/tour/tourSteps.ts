/**
 * tourSteps.ts — bilingual product-tour definitions.
 *
 * Each tour returns its steps via a getter so that translations are
 * resolved at *call time* (not at module load). That way switching
 * the language mid-session re-renders the next tour in the new language.
 *
 * Adding a tour:
 *   1. Pick a key, add it to `TourKey`.
 *   2. Add a builder function below that returns DriveStep[].
 *   3. Register it in `TOURS`.
 *   4. Add corresponding `data-tour="<key>"` attributes in the DOM.
 *
 * The full translation strings live under `tour.*` in ar.json/en.json.
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
  | 'settings';

const p = (title: string, description: string, side: 'top'|'bottom'|'left'|'right' = 'bottom') => ({
  title, description, side, align: 'start' as const,
});

// ─── Welcome tour ───────────────────────────────────────────────
function welcomeSteps(): DriveStep[] {
  return [
    { popover: p(t('tour.welcome.step1Title'), t('tour.welcome.step1Desc')) },
    { element: '[data-tour="sidebar"]',         popover: p(t('tour.welcome.sidebarTitle'), t('tour.welcome.sidebarDesc'), 'left') },
    { element: '[data-tour="branch-selector"]', popover: p(t('tour.welcome.branchTitle'),  t('tour.welcome.branchDesc')) },
    { element: '[data-tour="lang-switcher"]',   popover: p(`🌐 ${t('common.language')}`,  t('header.languageSwitchTo', { lang: 'EN/AR' })) },
    { element: '[data-tour="global-search"]',   popover: p('🔎 Search', t('header.searchPlaceholder')) },
    { element: '[data-tour="nav-parts"]',       popover: p(`📦 ${t('nav.parts')}`,    t('parts.subtitle'), 'left') },
    { element: '[data-tour="nav-pos"]',         popover: p(`🛒 ${t('nav.pos')}`,      t('pos.title'),       'left') },
    { element: '[data-tour="nav-reports"]',     popover: p(`📊 ${t('nav.reports')}`,  t('reports.subtitle'),'left') },
  ];
}

// ─── Page-specific tours ────────────────────────────────────────
function dashboardSteps(): DriveStep[] {
  return [
    { element: '[data-tour="dash-today"]',       popover: p(`💰 ${t('dashboard.salesToday')}`,  '') },
    { element: '[data-tour="dash-month"]',       popover: p(`📅 ${t('dashboard.salesMonth')}`,  '') },
    { element: '[data-tour="dash-invoices"]',    popover: p(`🧾 ${t('dashboard.invoicesCount')}`,'') },
    { element: '[data-tour="dash-low-stock"]',   popover: p(`⚠️ ${t('dashboard.lowStock')}`,    '') },
    { element: '[data-tour="dash-receivables"]', popover: p(`👥 ${t('dashboard.outstandingDebts')}`, '') },
  ];
}

function partsSteps(): DriveStep[] {
  return [
    { element: '[data-tour="parts-new"]',      popover: p(`➕ ${t('parts.new')}`,            t('parts.subtitle')) },
    { element: '[data-tour="parts-import"]',   popover: p(`📥 ${t('parts.advancedImport')}`, '') },
    { element: '[data-tour="parts-export"]',   popover: p(`📤 ${t('parts.export')}`,         '') },
    { element: '[data-tour="parts-search"]',   popover: p(`🔍 ${t('common.search')}`,        t('parts.searchPlaceholder')) },
    { element: '[data-tour="parts-table"]',    popover: p('💡', t('parts.tipClickRow'), 'top') },
  ];
}

function stockSteps(): DriveStep[] {
  return [
    { element: '[data-tour="stock-table"]', popover: p(`📦 ${t('stock.title')}`, t('stock.subtitle')) },
  ];
}

function salesSteps(): DriveStep[] {
  return [
    { element: '[data-tour="sales-new"]',   popover: p(`➕ ${t('sales.newInvoice')}`, '') },
    { element: '[data-tour="sales-table"]', popover: p(`📋 ${t('sales.invoices')}`, '') },
  ];
}

function posSteps(): DriveStep[] {
  return [
    { element: '[data-tour="pos-search"]',   popover: p(`🔍 ${t('pos.searchPart')}`, '') },
    { element: '[data-tour="pos-grid"]',     popover: p(`📦 ${t('parts.title')}`, '', 'top') },
    { element: '[data-tour="pos-cart"]',     popover: p(`🛒 ${t('pos.cart')}`, '', 'left') },
    { element: '[data-tour="pos-checkout"]', popover: p(`✅ ${t('pos.checkout')}`, '', 'top') },
  ];
}

function purchasesSteps(): DriveStep[] {
  return [
    { element: '[data-tour="purch-new"]',   popover: p(`➕ ${t('purchases.newPurchase')}`, '') },
    { element: '[data-tour="purch-table"]', popover: p(`📋 ${t('purchases.title')}`,        '') },
  ];
}

function customersSteps(): DriveStep[] {
  return [
    { element: '[data-tour="cust-new"]',    popover: p(`➕ ${t('customers.new')}`,   '') },
    { element: '[data-tour="cust-search"]', popover: p(`🔍 ${t('common.search')}`,   '') },
    { element: '[data-tour="cust-table"]',  popover: p('💡', '', 'top') },
  ];
}

function suppliersSteps(): DriveStep[] {
  return [
    { element: '[data-tour="supp-new"]',   popover: p(`➕ ${t('suppliers.new')}`,    '') },
    { element: '[data-tour="supp-table"]', popover: p('💡', '', 'top') },
  ];
}

function reportsSteps(): DriveStep[] {
  return [
    { element: '[data-tour="reports-tabs"]',   popover: p(`📑 ${t('reports.title')}`,    t('reports.subtitle')) },
    { element: '[data-tour="reports-period"]', popover: p(`📅 ${t('reports.period')}`,   '') },
    { element: '[data-tour="reports-cards"]',  popover: p(`💎 ${t('reports.netProfit')}`,'') },
  ];
}

function branchesSteps(): DriveStep[] {
  return [
    { element: '[data-tour="branches-new"]',   popover: p(`➕ ${t('branches.new')}`,   '') },
    { element: '[data-tour="branches-table"]', popover: p(`🏢 ${t('branches.title')}`, '') },
  ];
}

function transfersSteps(): DriveStep[] {
  return [
    { element: '[data-tour="transfers-new"]',   popover: p(`➕ ${t('transfers.newTransfer')}`, '') },
    { element: '[data-tour="transfers-table"]', popover: p(`🔄 ${t('transfers.title')}`,        '') },
  ];
}

function expensesSteps(): DriveStep[] {
  return [
    { element: '[data-tour="expenses-new"]',   popover: p(`➕ ${t('expenses.new')}`,   '') },
    { element: '[data-tour="expenses-table"]', popover: p(`💸 ${t('expenses.title')}`, '') },
  ];
}

function settingsSteps(): DriveStep[] {
  return [
    { element: '[data-tour="settings-tabs"]', popover: p(`⚙️ ${t('settings.title')}`, '') },
  ];
}

/** Registry of all available tours — each entry is a builder so translations
 *  are resolved when the tour is opened (not at module load). */
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
  settings:  settingsSteps,
};

/** Map a route path to a tour key — used by HelpButton to pick the
 *  "explain this page" tour for the current screen. */
export function tourKeyForPath(path: string): TourKey | null {
  const seg = path.split('/').filter(Boolean)[0] ?? '';
  const key = seg as TourKey;
  return (key in TOURS) ? key : null;
}

/** Human-readable label for a tour key (Arabic fallback when no translation
 *  loaded). Used by HelpButton to show "explain {{page}}". Kept here for
 *  backward compatibility — new code should use `t('nav.<key>')`. */
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
  settings:  'الإعدادات',
};
