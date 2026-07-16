/**
 * BottomNav
 * ─────────
 * iOS/Android-style bottom tab bar. Visible only below `md` (768px)
 * so desktop keeps the sidebar. Five slots:
 *
 *   [POS] [Workshop] [Parts] [Reports] [More→drawer]
 *
 * Design notes:
 *   • `pb-safe` puts extra padding equal to the iPhone home-indicator
 *     inset, so the touch targets never sit under it.
 *   • Fixed to bottom, full width, backdrop-blur so it feels native.
 *   • Uses NavLink so the active tab lights up automatically. RTL is
 *     handled naturally — icons + labels flip with the parent's dir.
 *   • Emits a `mobile-nav:more` window event when the "More" tab is
 *     tapped; Layout listens for it and opens the drawer. This keeps
 *     BottomNav free of any Layout-specific state.
 *
 * Layout must also add `pb-[calc(64px+env(safe-area-inset-bottom))]`
 * to its main scroll container on mobile so the nav never covers the
 * last row of content.
 */
import { NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { ShoppingCart, Wrench, Hammer, FileBarChart, Menu } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Tab {
  to?: string;                 // NavLink target; omitted → button (the "More" tab)
  labelKey: string;
  icon: LucideIcon;
  onClick?: () => void;
}

const openDrawer = () => window.dispatchEvent(new CustomEvent('mobile-nav:more'));

export default function BottomNav() {
  const { t } = useTranslation();

  const TABS: Tab[] = [
    { to: '/pos',       labelKey: 'nav.pos',       icon: ShoppingCart },
    { to: '/workshop',  labelKey: 'nav.workshop',  icon: Hammer       },
    { to: '/parts',     labelKey: 'nav.parts',     icon: Wrench       },
    { to: '/reports',   labelKey: 'nav.reports',   icon: FileBarChart },
    { labelKey: 'header.moreMenu', icon: Menu, onClick: openDrawer   },
  ];

  return (
    <nav
      aria-label={t('nav.section_main') as string}
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur
                 border-t border-line pb-safe"
    >
      <ul className="grid grid-cols-5">
        {TABS.map(({ to, labelKey, icon: Icon, onClick }) => {
          const inner = (
            <>
              <Icon size={20} />
              <span className="text-[10px] font-semibold mt-0.5 leading-none">
                {t(labelKey, { defaultValue: '' })}
              </span>
            </>
          );
          const commonClass =
            'flex flex-col items-center justify-center gap-0.5 py-2.5 w-full ' +
            'text-muted active:bg-bg';
          return (
            <li key={labelKey}>
              {to ? (
                <NavLink
                  to={to}
                  className={({ isActive }) =>
                    commonClass + (isActive ? ' text-primary' : '')
                  }
                >
                  {inner}
                </NavLink>
              ) : (
                <button type="button" className={commonClass} onClick={onClick}>
                  {inner}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
