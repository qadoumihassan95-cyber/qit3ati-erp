/**
 * i18n
 * ──────────────────────────────────────────────────────────────
 * Initializes i18next + react-i18next with the AR/EN dictionaries.
 *
 * Responsibilities:
 *  1. Loads the saved language from localStorage (key: qit3ati-lang).
 *  2. Sets <html lang="…"> and <html dir="…"> accordingly.
 *  3. Exposes `setLanguage()` which:
 *      - changes i18next language,
 *      - persists to localStorage,
 *      - flips dir/lang on <html>,
 *      - emits a `i18n:change` CustomEvent so non-React layers can react.
 *
 * Adding a new language:
 *  - drop a `<code>.json` next to this file,
 *  - import it below and add to `resources`,
 *  - add the code+label to `SUPPORTED_LANGS`.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './ar.json';
import en from './en.json';

export type Lang = 'ar' | 'en';

export const SUPPORTED_LANGS: { code: Lang; label: string; native: string; flag: string }[] = [
  { code: 'ar', label: 'Arabic',  native: 'العربية', flag: '🇯🇴' },
  { code: 'en', label: 'English', native: 'English', flag: '🇺🇸' },
];

const STORAGE_KEY = 'qit3ati-lang';
const DEFAULT_LANG: Lang = 'ar';

function readSaved(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'ar' || v === 'en') return v;
  } catch { /* SSR / private mode */ }
  return DEFAULT_LANG;
}

const initial = readSaved();

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      ar: { translation: ar },
      en: { translation: en },
    },
    lng: initial,
    fallbackLng: 'ar',
    interpolation: { escapeValue: false },
    returnNull: false,
    returnEmptyString: false,
  });

function applyDocAttrs(lang: Lang) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  document.documentElement.dir  = lang === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.setAttribute('data-lang', lang);
}

applyDocAttrs(initial);

export function getLanguage(): Lang {
  const cur = (i18n.language as Lang) || DEFAULT_LANG;
  return cur === 'en' ? 'en' : 'ar';
}

export function setLanguage(lang: Lang): void {
  const prev = getLanguage();
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
  applyDocAttrs(lang);
  // When switching between AR and EN we hard-reload the page. The
  // DomTranslator overlay rewrites Arabic text in place for EN, so to
  // get the original Arabic strings back we need a fresh render from
  // source. Reload is the simplest, most reliable path.
  if (prev !== lang) {
    // best-effort: also change i18next before reload so any code that
    // reads from it before unload sees the new value.
    void i18n.changeLanguage(lang);
    window.dispatchEvent(new CustomEvent('i18n:change', { detail: lang }));
    // give the browser a tick to persist localStorage
    setTimeout(() => window.location.reload(), 30);
    return;
  }
  void i18n.changeLanguage(lang);
  window.dispatchEvent(new CustomEvent('i18n:change', { detail: lang }));
}

export function isRTL(): boolean {
  return getLanguage() === 'ar';
}

/**
 * Locale-aware number formatter.
 * AR uses Western digits (0-9) too in Jordan, so we keep `en-US` digits
 * but swap thousands separator and currency style per language.
 */
export function formatNumber(n: number | bigint, opts: Intl.NumberFormatOptions = {}): string {
  const lang = getLanguage();
  const locale = lang === 'ar' ? 'ar-JO' : 'en-US';
  return new Intl.NumberFormat(locale, opts).format(n as number);
}

export function formatCurrency(n: number | bigint, currency = 'JOD'): string {
  const lang = getLanguage();
  const locale = lang === 'ar' ? 'ar-JO' : 'en-US';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n as number);
  } catch {
    return `${formatNumber(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  }
}

export function formatDate(d: Date | string | number, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  const lang = getLanguage();
  const locale = lang === 'ar' ? 'ar-JO' : 'en-US';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, opts).format(date);
}

export default i18n;
