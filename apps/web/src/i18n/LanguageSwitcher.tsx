/**
 * LanguageSwitcher
 * ──────────────────────────────────────────────────────────────
 * Compact toggle button: AR / EN. Renders the *other* language as
 * the click target, so the label always says "switch to <X>".
 *
 * Place it in the header next to the user menu / notifications.
 */
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { getLanguage, setLanguage, SUPPORTED_LANGS, type Lang } from './index';

interface Props {
  variant?: 'button' | 'compact';
}

export default function LanguageSwitcher({ variant = 'button' }: Props) {
  const { i18n, t } = useTranslation();
  const current: Lang = (i18n.language?.startsWith('en') ? 'en' : 'ar') as Lang;
  const next: Lang = current === 'ar' ? 'en' : 'ar';
  const nextMeta = SUPPORTED_LANGS.find((l) => l.code === next)!;

  const handleClick = () => setLanguage(next);

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={handleClick}
        title={t('header.languageSwitchTo', { lang: nextMeta.native })}
        aria-label={t('header.languageSwitchTo', { lang: nextMeta.native })}
        className="text-muted hover:text-primary p-1.5 rounded-lg hover:bg-bg transition flex items-center gap-1"
      >
        <Languages size={18} />
        <span className="text-[11px] font-extrabold uppercase tracking-wide">{next}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={t('header.languageSwitchTo', { lang: nextMeta.native })}
      data-tour="lang-switcher"
      className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-line bg-bg hover:bg-white text-xs font-bold text-primary transition"
    >
      <Languages size={15} />
      <span>{nextMeta.native}</span>
      <span className="opacity-50">·</span>
      <span className="uppercase">{next}</span>
    </button>
  );
}

/** Mobile-only compact variant. */
export function MobileLanguageSwitcher() {
  return <LanguageSwitcher variant="compact" />;
}
