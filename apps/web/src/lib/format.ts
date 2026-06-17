/** Format a number as Jordanian Dinar (or whatever currency is configured). */
export function fmtMoney(n: number | string | null | undefined, currency = 'JOD'): string {
  const v = Number(n ?? 0);
  const sym = currency === 'JOD' ? 'د.أ' : currency;
  return new Intl.NumberFormat('ar-JO', { maximumFractionDigits: 2 }).format(v) + ' ' + sym;
}

/** Short money — no currency symbol. */
export function fmtNum(n: number | string | null | undefined): string {
  return new Intl.NumberFormat('ar-JO', { maximumFractionDigits: 2 }).format(Number(n ?? 0));
}

/** Format an ISO date as Arabic short date. */
export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('ar-JO');
}

/** Long date with day name. */
export function fmtDateLong(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('ar-JO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

/** Extract a friendly error message from axios/fetch errors. */
export function errMsg(e: any): string {
  return e?.response?.data?.message
      ?? (Array.isArray(e?.response?.data?.message) ? e.response.data.message[0] : null)
      ?? e?.message
      ?? 'حدث خطأ غير متوقع';
}
