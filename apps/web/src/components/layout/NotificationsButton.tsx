/**
 * NotificationsButton — header bell + dropdown panel
 * ──────────────────────────────────────────────────
 * Aggregates real signals the user cares about, *without* needing a
 * dedicated notifications backend module:
 *   • Low-stock parts (from dashboard data)
 *   • Receivables overdue (from dashboard data)
 *   • Cheques due in the next 7 days (from /cheques)
 *   • Official papers expiring soon (from /papers)
 *
 * Each row links to the relevant page. The badge counts unread items
 * (tracked per-user in localStorage). "Mark all as read" and per-row
 * "Delete" are supported.
 *
 * Mobile: opens as a full-screen sheet from the bottom; desktop: as a
 * dropdown anchored under the bell.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bell, X, Check, CheckCheck, Trash2, AlertTriangle,
  Wallet, FileCheck, Banknote,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

interface Notification {
  id: string;
  kind: 'low-stock' | 'receivable' | 'cheque-due' | 'paper-expiring';
  title: string;
  body: string;
  href: string;
  /** ISO timestamp for relative time. */
  at: string;
}

const STORAGE_PREFIX = 'qit3ati-notif';
const dismissedKey = (uid: string | null) => `${STORAGE_PREFIX}:dismissed:${uid ?? 'guest'}`;
const readKey      = (uid: string | null) => `${STORAGE_PREFIX}:read:${uid ?? 'guest'}`;

function loadSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* ignore */ }
  return new Set();
}
function saveSet(key: string, set: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify(Array.from(set))); }
  catch { /* ignore */ }
}

function relTime(iso: string, lang: 'ar' | 'en'): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diff = (Date.now() - date.getTime()) / 1000;
  const rt = new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar-JO' : 'en-US', { numeric: 'auto' });
  if (Math.abs(diff) < 60)    return rt.format(-Math.round(diff),       'second');
  if (Math.abs(diff) < 3600)  return rt.format(-Math.round(diff/60),    'minute');
  if (Math.abs(diff) < 86400) return rt.format(-Math.round(diff/3600),  'hour');
  return rt.format(-Math.round(diff / 86400), 'day');
}

export default function NotificationsButton() {
  const { t, i18n } = useTranslation();
  const lang: 'ar' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'ar';
  const user = useAuth((s) => s.user) as any;
  const userId: string | null = user?.id ?? user?.sub ?? null;

  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadSet(dismissedKey(userId)));
  const [read,      setRead]      = useState<Set<string>>(() => loadSet(readKey(userId)));
  const ref = useRef<HTMLDivElement | null>(null);

  // Dashboard data (low-stock + receivables)
  const dash = useQuery<any>({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get('/tenants/dashboard')).data,
    refetchInterval: 60_000,
  });
  // Cheques due in 7 days
  const cheques = useQuery<any>({
    queryKey: ['notif-cheques'],
    queryFn: async () => (await api.get('/cheques?status=pending&limit=20').catch(() => ({ data: { items: [] } }))).data,
    refetchInterval: 5 * 60_000,
  });
  // Papers expiring
  const papers = useQuery<any>({
    queryKey: ['notif-papers'],
    queryFn: async () => (await api.get('/papers?expiring=1&limit=20').catch(() => ({ data: { items: [] } }))).data,
    refetchInterval: 10 * 60_000,
  });

  const items = useMemo<Notification[]>(() => {
    const out: Notification[] = [];
    const now = Date.now();
    const today = new Date(now).toISOString();
    const within = (iso: string, days: number) => {
      const d = new Date(iso);
      return !Number.isNaN(d.getTime()) && d.getTime() - now < days * 86400_000;
    };

    // Low-stock parts
    const lows = dash.data?.lowStockAlerts ?? [];
    for (const s of lows.slice(0, 10)) {
      const name = s.part?.name ?? '—';
      const id = `low:${s.id ?? name}`;
      out.push({
        id, kind: 'low-stock',
        title: 'تنبيه مخزون: ' + name,
        body: 'المتوفّر ' + Number(s.quantity) + ' — الحد الأدنى ' + Number(s.part?.minStock ?? 0),
        href: '/stock', at: today,
      });
    }

    // Receivables
    const debt = Number(dash.data?.receivables ?? 0);
    if (debt > 0) {
      out.push({
        id: 'recv:total', kind: 'receivable',
        title: 'الذمم المستحقّة',
        body: 'إجمالي ' + debt.toLocaleString() + ' د.أ مستحقّة على العملاء',
        href: '/customers', at: today,
      });
    }

    // Cheques due in next 7 days
    const cs = cheques.data?.items ?? cheques.data ?? [];
    for (const c of (Array.isArray(cs) ? cs : []).slice(0, 5)) {
      if (!c?.dueDate) continue;
      if (!within(c.dueDate, 7)) continue;
      out.push({
        id: 'cheque:' + (c.id ?? c.chequeNo),
        kind: 'cheque-due',
        title: 'شيك قارب على الاستحقاق',
        body: 'رقم ' + (c.chequeNo ?? '—') + ' — مبلغ ' + (Number(c.amount ?? 0)).toLocaleString() + ' د.أ',
        href: '/cheques', at: c.dueDate,
      });
    }

    // Papers expiring
    const ps = papers.data?.items ?? papers.data ?? [];
    for (const p of (Array.isArray(ps) ? ps : []).slice(0, 5)) {
      if (!p?.expiryDate) continue;
      if (!within(p.expiryDate, 30)) continue;
      out.push({
        id: 'paper:' + (p.id ?? p.docType),
        kind: 'paper-expiring',
        title: 'ورقة قاربت على الانتهاء',
        body: (p.docType ?? '—') + ' — تنتهي بتاريخ ' + new Date(p.expiryDate).toLocaleDateString(),
        href: '/papers', at: p.expiryDate,
      });
    }

    return out.filter((n) => !dismissed.has(n.id));
  }, [dash.data, cheques.data, papers.data, dismissed]);

  const unreadCount = items.filter((n) => !read.has(n.id)).length;

  // close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markRead = (id: string) => {
    const next = new Set(read); next.add(id);
    setRead(next); saveSet(readKey(userId), next);
  };
  const markAllRead = () => {
    const next = new Set(read); items.forEach((n) => next.add(n.id));
    setRead(next); saveSet(readKey(userId), next);
  };
  const dismiss = (id: string) => {
    const next = new Set(dismissed); next.add(id);
    setDismissed(next); saveSet(dismissedKey(userId), next);
  };

  const iconFor = (k: Notification['kind']) => {
    switch (k) {
      case 'low-stock':      return <AlertTriangle size={16} className="text-amber-600" />;
      case 'receivable':     return <Wallet         size={16} className="text-blue-600" />;
      case 'cheque-due':     return <Banknote       size={16} className="text-purple-600" />;
      case 'paper-expiring': return <FileCheck      size={16} className="text-red-600" />;
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('common.notifications')}
        title={t('common.notifications')}
        className="relative text-muted hover:text-primary p-1.5 rounded-lg hover:bg-bg transition"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-extrabold rounded-full border-2 border-white grid place-items-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Mobile backdrop */}
          <button
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="md:hidden fixed inset-0 bg-black/40 z-40"
          />
          {/* Panel */}
          <div className={
            'z-50 bg-white shadow-2xl border border-line ' +
            // Mobile: full-width sheet from the bottom
            'fixed md:absolute bottom-0 md:bottom-auto left-0 right-0 md:left-auto md:right-0 md:top-full md:mt-2 ' +
            'md:w-96 max-w-full rounded-t-2xl md:rounded-xl ' +
            'animate-in slide-in-from-bottom-4 md:slide-in-from-top-2 fade-in'
          }>
            <div className="flex items-center justify-between p-3 border-b border-line">
              <h3 className="font-extrabold text-sm">{t('common.notifications')}</h3>
              <div className="flex items-center gap-1">
                {items.length > 0 && unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    title="تعليم الكل كمقروء"
                    className="text-xs text-primary hover:underline px-2 py-1 flex items-center gap-1"
                  >
                    <CheckCheck size={14} /> تعليم الكل
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  aria-label={t('common.close')}
                  className="p-1.5 rounded-lg hover:bg-bg text-muted md:hidden"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {items.length === 0 ? (
                <p className="text-center text-sm text-muted py-12 px-4">
                  ✔ لا توجد إشعارات حالياً
                </p>
              ) : items.map((n) => {
                const isRead = read.has(n.id);
                return (
                  <div
                    key={n.id}
                    className={
                      'flex items-start gap-3 px-3 py-3 border-b border-line last:border-0 hover:bg-bg/40 transition ' +
                      (isRead ? 'opacity-70' : '')
                    }
                  >
                    <Link
                      to={n.href}
                      onClick={() => { markRead(n.id); setOpen(false); }}
                      className="flex items-start gap-2 flex-1 min-w-0"
                    >
                      <div className="w-8 h-8 rounded-lg bg-bg grid place-items-center shrink-0">
                        {iconFor(n.kind)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm truncate">{n.title}</div>
                        <div className="text-xs text-muted leading-5 line-clamp-2">{n.body}</div>
                        <div className="text-[10px] text-muted mt-1">{relTime(n.at, lang)}</div>
                      </div>
                    </Link>
                    <div className="flex flex-col gap-1">
                      {!isRead && (
                        <button
                          onClick={() => markRead(n.id)}
                          title="تعليم كمقروء"
                          className="p-1 rounded text-muted hover:text-primary"
                        >
                          <Check size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => dismiss(n.id)}
                        title="حذف"
                        className="p-1 rounded text-muted hover:text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {items.length > 0 && (
              <div className="border-t border-line p-2 text-center">
                <Link
                  to="/dashboard"
                  onClick={() => setOpen(false)}
                  className="text-xs text-primary hover:underline"
                >
                  لوحة التحكم
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
