/**
 * WelcomeModal — shown the first time a user logs in.
 * They can start the tour or skip; either way we mark the welcome
 * tour as "seen" so it doesn't re-appear.
 */
import { Sparkles, Play, X } from 'lucide-react';
import { useTour } from './TourProvider';

export default function WelcomeModal() {
  const { isWelcomeOpen, dismissWelcome, startTour } = useTour();

  if (!isWelcomeOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={dismissWelcome}
    >
      <div
        className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header — gradient hero */}
        <div className="relative bg-gradient-to-br from-primary to-blue-700 text-white p-6 text-center">
          <button
            onClick={dismissWelcome}
            className="absolute top-3 left-3 p-1.5 rounded-lg hover:bg-white/10 text-white/80"
            aria-label="إغلاق"
          >
            <X size={18} />
          </button>
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/15 mb-3">
            <Sparkles size={32} />
          </div>
          <h2 className="text-2xl font-extrabold mb-1">مرحباً بك في قِطَعتي 🎉</h2>
          <p className="text-white/85 text-sm">نظام إدارة قطع الغيار السحابي العربي</p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="text-sm leading-7 text-ink">
            هذا النظام يساعدك على إدارة كل شيء في محلّك:
          </div>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="text-primary">✓</span>
              <span>إصدار فواتير سريع مع JoFotara أوتوماتيكي</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">✓</span>
              <span>متابعة مخزون لحظي لكل فرع</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">✓</span>
              <span>تقارير مالية ذكية تكشف أرباحك الحقيقية</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">✓</span>
              <span>عملاء، موردون، مصاريف، شيكات — كلّها في مكان واحد</span>
            </li>
          </ul>

          <div className="bg-bg/60 rounded-lg p-3 text-xs text-muted leading-6">
            💡 سنأخذك في جولة قصيرة (دقيقتان فقط) لتتعرّف على الميزات الأساسية.
            تستطيع تخطّيها وإعادة تشغيلها لاحقاً من زرّ "؟" أسفل الشاشة.
          </div>
        </div>

        {/* Footer — actions */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-line bg-bg/40">
          <button
            onClick={dismissWelcome}
            className="btn-ghost"
          >
            تخطّي الآن
          </button>
          <button
            onClick={() => startTour('welcome')}
            className="btn-primary"
          >
            <Play size={16} /> ابدأ الجولة
          </button>
        </div>
      </div>
    </div>
  );
}
