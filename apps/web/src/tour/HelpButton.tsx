/**
 * HelpButton — floating "?" button + dropdown menu, always visible.
 *   • "شرح هذه الصفحة" — runs the page-specific tour
 *   • "الجولة التعريفية الكاملة" — re-runs the welcome tour
 *   • "مركز المساعدة" — opens the help center (external link)
 */
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { HelpCircle, RotateCw, MapPin, BookOpen } from 'lucide-react';
import { useTour } from './TourProvider';
import { tourKeyForPath, TOUR_LABELS } from './tourSteps';

export default function HelpButton() {
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

  return (
    <div ref={ref} className="fixed bottom-4 left-4 z-40 no-print">
      {/* Menu */}
      {open && (
        <div className="mb-2 w-64 bg-white rounded-xl shadow-2xl border border-line overflow-hidden animate-in slide-in-from-bottom-2 fade-in">
          <div className="px-3 py-2 bg-bg/60 text-xs font-bold text-muted border-b border-line">
            🆘 مركز المساعدة
          </div>
          {pageKey && (
            <button
              onClick={() => { setOpen(false); startTour(pageKey); }}
              className="w-full text-right px-3 py-2.5 hover:bg-bg flex items-center gap-2 text-sm"
            >
              <MapPin size={16} className="text-primary shrink-0" />
              <div>
                <div className="font-bold">شرح هذه الصفحة</div>
                <div className="text-xs text-muted">{TOUR_LABELS[pageKey]}</div>
              </div>
            </button>
          )}
          <button
            onClick={() => { setOpen(false); openWelcome(); }}
            className="w-full text-right px-3 py-2.5 hover:bg-bg flex items-center gap-2 text-sm border-t border-line"
          >
            <RotateCw size={16} className="text-amber-600 shrink-0" />
            <div>
              <div className="font-bold">إعادة الجولة التعريفية</div>
              <div className="text-xs text-muted">جولة سريعة بكل أقسام النظام</div>
            </div>
          </button>
          <a
            href="https://qit3ati-web.onrender.com/"
            target="_blank"
            rel="noreferrer"
            onClick={() => setOpen(false)}
            className="w-full text-right px-3 py-2.5 hover:bg-bg flex items-center gap-2 text-sm border-t border-line"
          >
            <BookOpen size={16} className="text-blue-600 shrink-0" />
            <div>
              <div className="font-bold">مركز المساعدة</div>
              <div className="text-xs text-muted">الأسئلة الشائعة والشروحات</div>
            </div>
          </a>
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
        aria-label="مساعدة"
        title="مساعدة"
      >
        <HelpCircle size={22} />
      </button>
    </div>
  );
}
