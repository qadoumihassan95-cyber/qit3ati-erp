/**
 * Layout — main app shell.
 *
 * Fully bilingual (AR/EN) via react-i18next:
 *  - Nav labels read from `nav.*` keys
 *  - Header controls read from `header.*` and `common.*`
 *  - LanguageSwitcher rendered in the header (desktop + mobile)
 *
 * Sidebar position adapts to writing direction (RTL → right, LTR → left).
 */
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, ShoppingCart, Wrench, Boxes,
  Settings as SettingsIcon, Bell, LogOut, Truck,
  ArrowLeftRight, Menu, X, Users, Building2, Receipt,
  RotateCcw, FileBarChart, Building, Shield, FileCheck,
  Banknote, Landmark, FileText,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import GlobalSearch from '@/components/search/GlobalSearch';
import LanguageSwitcher from '@/i18n/LanguageSwitcher';
import { useAuth } from '@/hooks/useAuth';
import { useBranches } from '@/hooks/useBranches';
import { useEffect, useState } from 'react';

interface NavItem {
  to:        string;
  labelKey:  string;
  icon:      LucideIcon;
  sectionKey?: string;
}

const NAV: NavItem[] = [
  { to: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, sectionKey: 'nav.section_main' },
  { to: '/pos',       labelKey: 'nav.pos',       icon: ShoppingCart   },
  { to: '/invoices',  labelKey: 'nav.invoices',  icon: FileText       },
  { to: '/parts',     labelKey: 'nav.parts',     icon: Wrench,         sectionKey: 'nav.section_inventory' },
  { to: '/stock',     labelKey: 'nav.stock',     icon: Boxes          },
  { to: '/purchases', labelKey: 'nav.purchases', icon: Truck          },
  { to: '/transfers', labelKey: 'nav.transfers', icon: ArrowLeftRight },
  { to: '/returns',   labelKey: 'nav.returns',   icon: RotateCcw      },
  { to: '/customers', labelKey: 'nav.customers', icon: Users,          sectionKey: 'nav.section_relations' },
  { to: '/suppliers', labelKey: 'nav.suppliers', icon: Building2      },
  { to: '/expenses',  labelKey: 'nav.expenses',  icon: Receipt,        sectionKey: 'nav.section_finance' },
  { to: '/cheques',   labelKey: 'nav.cheques',   icon: Banknote       },
  { to: '/jofotara',  labelKey: 'nav.jofotara',  icon: Landmark       },
  { to: '/reports',   labelKey: 'nav.reports',   icon: FileBarChart   },
  { to: '/branches',  labelKey: 'nav.branches',  icon: Building,       sectionKey: 'nav.section_admin' },
  { to: '/papers',    labelKey: 'nav.papers',    icon: FileCheck      },
  { to: '/audit',     labelKey: 'nav.audit',     icon: Shield         },
  { to: '/settings',  labelKey: 'nav.settings',  icon: SettingsIcon   },
];

export default function Layout() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language?.startsWith('ar') ?? true;

  const { user, branchId, setBranch, logout } = useAuth((s) => ({
    user: s.user, branchId: s.branchId,
    setBranch: s.setBranch, logout: s.logout,
  }));
  const branchesQ = useBranches();
  const branches  = branchesQ.data ?? user?.branches ?? [];
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Apply white-label colors from tenant settings
  useEffect(() => {
    if (user?.settings) {
      document.documentElement.style.setProperty('--color-primary', user.settings.colorPrimary);
      document.documentElement.style.setProperty('--color-accent',  user.settings.colorSecondary);
    }
  }, [user]);

  const closeDrawer = () => setDrawerOpen(false);
  const currentBranch = branches.find((b) => b.id === branchId) ?? branches[0];

  // Drawer slide direction depends on direction:
  // RTL  → drawer pinned to the right, hidden by translate-x-full
  // LTR  → drawer pinned to the left,  hidden by -translate-x-full
  const drawerPositionClasses = isRTL ? 'inset-y-0 right-0' : 'inset-y-0 left-0';
  const drawerHiddenClass = isRTL ? 'translate-x-full' : '-translate-x-full';

  return (
    <div className="min-h-screen md:grid md:grid-cols-[260px_1fr] bg-bg">
      {/* Mobile overlay backdrop */}
      {drawerOpen && (
        <button
          aria-label={t('header.closeMenu')}
          onClick={closeDrawer}
          className="md:hidden fixed inset-0 bg-black/40 z-40"
        />
      )}

      {/* Sidebar */}
      <aside
        data-tour="sidebar"
        className={
          'bg-gradient-to-b from-primary to-primary-dark text-white p-4 ' +
          `fixed ${drawerPositionClasses} w-[260px] z-50 transition-transform duration-200 ease-out overflow-y-auto ` +
          (drawerOpen ? 'translate-x-0' : drawerHiddenClass) + ' ' +
          'md:translate-x-0 md:static md:sticky md:top-0 md:h-screen md:z-auto'
        }
      >
        <div className="flex items-center gap-3 pb-4 border-b border-white/15 mb-4">
          <div className="w-11 h-11 rounded-xl bg-accent grid place-items-center font-extrabold text-xl">ق</div>
          <div className="flex-1">
            <h1 className="font-extrabold text-lg">{t('app.name')}</h1>
            <p className="text-white/60 text-[11px] font-semibold">AutoParts Cloud</p>
          </div>
          <button
            aria-label={t('common.close')}
            onClick={closeDrawer}
            className="md:hidden text-white/80 hover:text-white"
          >
            <X size={22} />
          </button>
        </div>
        <nav className="space-y-0.5">
          {NAV.map(({ to, labelKey, icon: Icon, sectionKey }) => (
            <div key={to}>
              {sectionKey && (
                <div className="text-white/50 text-[10px] font-extrabold uppercase tracking-wider mt-3 mb-1.5 px-2">
                  {t(sectionKey)}
                </div>
              )}
              <NavLink
                to={to}
                onClick={closeDrawer}
                data-tour={`nav-${to.replace(/^\//, '') || 'dashboard'}`}
                className={({ isActive }) =>
                  'flex items-center gap-3 px-3 py-2 rounded-xl text-[14px] font-semibold transition ' +
                  (isActive ? 'bg-white text-primary shadow-sm' : 'text-white/85 hover:bg-white/10')
                }>
                <Icon size={17} />
                <span>{t(labelKey)}</span>
              </NavLink>
            </div>
          ))}
        </nav>
      </aside>

      {/* Main column */}
      <div className="min-w-0">
        <header className="bg-white border-b border-line p-3 sm:p-4 px-4 sm:px-7 flex items-center gap-3 sm:gap-5 sticky top-0 z-10">
          {/* Mobile hamburger */}
          <button
            aria-label={t('header.openMenu')}
            onClick={() => setDrawerOpen(true)}
            className="md:hidden text-primary hover:bg-bg p-1.5 rounded-lg"
          >
            <Menu size={22} />
          </button>

          <div data-tour="global-search" className="flex-1 min-w-0">
            <GlobalSearch />
          </div>

          {currentBranch && (
            <select
              data-tour="branch-selector"
              aria-label={t('header.branchSelector')}
              className="hidden sm:block text-xs sm:text-sm text-muted font-semibold bg-bg border border-line rounded-lg px-2 sm:px-3 py-2 max-w-[180px]"
              value={currentBranch.id}
              onChange={(e) => setBranch(e.target.value)}
            >
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}

          {/* Language switcher — visible on every page */}
          <LanguageSwitcher />

          <button aria-label={t('common.notifications')} className="relative text-muted hover:text-primary p-1">
            <Bell size={20} />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
          </button>

          <div className="flex items-center gap-2 font-bold text-sm">
            <div className="w-9 h-9 rounded-full bg-primary text-white grid place-items-center font-extrabold">
              {user?.fullName?.[0] ?? '?'}
            </div>
            <span className="hidden sm:inline">{user?.fullName}</span>
            <button
              aria-label={t('common.logout')}
              title={t('header.logoutTitle')}
              className="text-muted hover:text-red-500 p-1"
              onClick={() => { logout(); navigate('/login'); }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <main className="p-3 sm:p-5 lg:p-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
