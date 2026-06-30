/**
 * Number / currency / date formatters — locale-aware.
 *
 * Reads the active language from <html lang="…"> so the format picks
 * Western digits (en-US) on English and Arabic-Indic digits (ar-JO)
 * on Arabic. This avoids "٤,٣٢٩.٦ JOD" showing up in the EN UI.
 */

function currentLocale(): string {
  if (typeof document === 'undefined') return 'en-US';
  return document.documentElement.lang?.startsWith('en') ? 'en-US' : 'ar-JO';
}

function currencySymbol(currency: string): string {
  if (currency !== 'JOD') return currency;
  // On EN, use ISO code "JOD"; on AR, use native abbreviation "د.أ"
  return currentLocale() === 'en-US' ? 'JOD' : 'د.أ';
}

/** Format a number as Jordanian Dinar (or whatever currency is configured). */
export function fmtMoney(n: number | string | null | undefined, currency = 'JOD'): string {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat(currentLocale(), { maximumFractionDigits: 2 }).format(v)
       + ' ' + currencySymbol(currency);
}

/** Short money — no currency symbol. */
export function fmtNum(n: number | string | null | undefined): string {
  return new Intl.NumberFormat(currentLocale(), { maximumFractionDigits: 2 }).format(Number(n ?? 0));
}

/** Format an ISO date as locale-aware short date. */
export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(currentLocale());
}

/** Long date with day name. */
export function fmtDateLong(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(currentLocale(), {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

/** Extract a friendly error message from axios/fetch errors. */
export function errMsg(e: any): string {
  const en = currentLocale() === 'en-US';
  return e?.response?.data?.message
      ?? (Array.isArray(e?.response?.data?.message) ? e.response.data.message[0] : null)
      ?? e?.message
      ?? (en ? 'An unexpected error occurred' : 'حدث خطأ غير متوقع');
}
