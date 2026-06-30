/**
 * LanguageSwitcher — header language toggle (AR ⇄ EN).
 *
 * Responsive:
 *   - Desktop (≥sm): full pill with flag + native name + code
 *   - Mobile (<sm):  compact AR/EN code-only button (still tappable)
 *
 * Behavior:
 *   Clicking switches to the *other* language. We rely on
 *   `setLanguage()` from `./index.ts` which:
 *     - persists to localStorage,
 *     - flips <html dir/lang>,
 *     - reloads the page so source strings come back cleanly.
 *
 * Both variants are always rendered; CSS hides the one that
 * doesn't match the viewport. This guarantees that on phones
 * the user always has a working language control.
 */
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { getLanguage, setLanguage, SUPPORTED_LANGS, type Lang } from './index';

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const current: Lang = (i18n.language?.startsWith('en') ? 'en' : 'ar') as Lang;
  const next: Lang = current === 'ar' ? 'en' : 'ar';
  const nextMeta = SUPPORTED_LANGS.find((l) => l.code === next)!;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLanguage(next);
  };

  const title = t('header.languageSwitchTo', { lang: nextMeta.native });

  return (
    <>
      {/* Desktop — full pill */}
      <button
        type="button"
        onClick={handleClick}
        onTouchEnd={handleClick}
        title={title}
        aria-label={title}
        data-tour="lang-switcher"
        className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-line bg-bg hover:bg-white text-xs font-bold text-primary transition active:scale-95"
      >
        <Languages size={15} />
        <span>{nextMeta.native}</span>
        <span className="opacity-50">·</span>
        <span className="uppercase">{next}</span>
      </button>

      {/* Mobile — compact code-only, large tap target */}
      <button
        type="button"
        onClick={handleClick}
        onTouchEnd={handleClick}
        title={title}
        aria-label={title}
        data-tour="lang-switcher-mobile"
        className="sm:hidden flex items-center justify-center gap-1 min-w-[44px] h-9 px-2 rounded-lg border border-line bg-bg active:bg-primary/10 text-xs font-extrabold text-primary transition active:scale-95"
      >
        <Languages size={14} />
        <span className="uppercase">{next}</span>
      </button>
    </>
  );
}

/** Compat shim. */
export function MobileLanguageSwitcher() {
  return <LanguageSwitcher />;
}
