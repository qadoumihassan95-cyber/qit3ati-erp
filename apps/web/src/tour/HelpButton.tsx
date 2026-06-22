/**
 * HelpButton — floating "?" button + dropdown menu, always visible.
 *   • Page-specific tour
 *   • Full welcome tour
 *   • Help center (external link)
 *
 * Fully bilingual via react-i18next. The button stays in the bottom-left
 * corner regardless of writing direction (it's a global affordance).
 */
import { useEffect, useRef, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { HelpCircle, RotateCw, MapPin, BookOpen, GraduationCap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTour } from './TourProvider';
import { tourKeyForPath } from './tourSteps';

export default function HelpButton() {
  const { t } = useTranslation();
  const { startTour, openWelcome } = useTour();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // hide on /login
  if (pathname === '/login') return null;

  const pageKey = tourKeyForPath(pathname);

  // page name (translated) — used as subtitle for "explain this page"
  // tour keys mirror nav.* keys where possible (parts, pos, stock, etc.)
  const pageLabelKey = pageKey ? `nav.${pageKey}` : 'common.help';

  return (
    <div ref={ref} className="fixed bottom-4 ltr:left-4 rtl:left-4 z-40 no-print">
      {/* Menu */}
      {open && (
        <div className="mb-2 w-64 bg-white rounded-xl shadow-2xl border border-line overflow-hidden animate-in slide-in-from-bottom-2 fade-in">
          <div className="px-3 py-2 bg-bg/60 text-xs font-bold text-muted border-b border-line">
            🆘 {t('tour.help.title')}
          </div>
          {pageKey && (
            <button
              onClick={() => { setOpen(false); startTour(pageKey); }}
              className="w-full ltr:text-left rtl:text-right px-3 py-2.5 hover:bg-bg flex items-center gap-2 text-sm"
            >
              <MapPin size={16} className="text-primary shrink-0" />
              <div>
                <div className="font-bold">{t('tour.help.pageTour')}</div>
                <div className="text-xs text-muted">
                  {t('tour.help.pageTourSub', { page: t(pageLabelKey) })}
                </div>
              </div>
            </button>
          )}
          <button
            onClick={() => { setOpen(false); openWelcome(); }}
            className="w-full ltr:text-left rtl:text-right px-3 py-2.5 hover:bg-bg flex items-center gap-2 text-sm border-t border-line"
          >
            <RotateCw size={16} className="text-amber-600 shrink-0" />
            <div>
              <div className="font-bold">{t('tour.help.fullTour')}</div>
              <div className="text-xs text-muted">{t('tour.help.fullTourSub')}</div>
            </div>
          </button>
          <Link
            to="/training"
            onClick={() => setOpen(false)}
            className="w-full ltr:text-left rtl:text-right px-3 py-2.5 hover:bg-bg flex items-center gap-2 text-sm border-t border-line"
          >
            <GraduationCap size={16} className="text-green-600 shrink-0" />
            <div>
              <div className="font-bold">وضع التدريب</div>
              <div className="text-xs text-muted">8 تدريبات تفاعلية</div>
            </div>
          </Link>
          <Link
            to="/help"
            onClick={() => setOpen(false)}
            className="w-full ltr:text-left rtl:text-right px-3 py-2.5 hover:bg-bg flex items-center gap-2 text-sm border-t border-line"
          >
            <BookOpen size={16} className="text-blue-600 shrink-0" />
            <div>
              <div className="font-bold">{t('tour.help.helpCenter')}</div>
              <div className="text-xs text-muted">{t('tour.help.helpCenterSub')}</div>
            </div>
          </Link>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={
          'w-12 h-12 rounded-full shadow-xl transition flex items-center justify-center ' +
          (open
            ? 'bg-ink text-white rotate-180'
            : 'bg-primary text-white hover:scale-110 hover:shadow-2xl')
        }
        aria-label={t('common.help')}
        title={t('common.help')}
      >
        <HelpCircle size={22} />
      </button>
    </div>
  );
}
