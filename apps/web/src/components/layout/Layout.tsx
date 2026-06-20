import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, ShoppingCart, Wrench, Boxes, Settings as SettingsIcon, Bell, LogOut, Truck, ArrowLeftRight, Menu, X, Users, Building2, Receipt, RotateCcw, FileBarChart, Building, Shield, FileCheck, Banknote, Landmark, FileText } from 'lucide-react';
import GlobalSearch from '@/components/search/GlobalSearch';
import { useAuth } from '@/hooks/useAuth';
import { useBranches } from '@/hooks/useBranches';
import { useEffect, useState } from 'react';

interface NavItem { to: string; label: string; icon: LucideIcon; section?: string }
const NAV: NavItem[] = [
  { to: '/dashboard', label: 'لوحة التحكم',     icon: LayoutDashboard, section: 'الرئيسية' },
  { to: '/pos',       label: 'نقطة البيع POS',  icon: ShoppingCart },
  { to: '/invoices',  label: 'فواتير البيع',    icon: FileText },
  { to: '/parts',     label: 'الأصناف والقطع',  icon: Wrench,          section: 'المخزون' },
  { to: '/stock',     label: 'المخزون والفروع', icon: Boxes },
  { to: '/purchases', label: 'المشتريات',       icon: Truck },
  { to: '/transfers', label: 'تحويلات الفروع',  icon: ArrowLeftRight },
  { to: '/returns',   label: 'المرتجعات',       icon: RotateCcw },
  { to: '/customers', label: 'العملاء',         icon: Users,           section: 'العلاقات' },
  { to: '/suppliers', label: 'الموردون',        icon: Building2 },
  { to: '/expenses',  label: 'المصاريف',        icon: Receipt,         section: 'المال' },
  { to: '/cheques',   label: 'الشيكات',          icon: Banknote },
  { to: '/jofotara',  label: 'الفوترة الإلكترونية', icon: Landmark },
  { to: '/reports',   label: 'التقارير',        icon: FileBarChart },
  { to: '/branches',  label: 'الفروع',          icon: Building,        section: 'الإدارة' },
  { to: '/papers',    label: 'الأوراق الرسمية',  icon: FileCheck },
  { to: '/audit',     label: 'سجل التدقيق',     icon: Shield },
  { to: '/settings',  label: 'الإعدادات والهوية', icon: SettingsIcon },
];

export default function Layout() {
  const { user, branchId, setBranch, logout } = useAuth((s) => ({
    user: s.user, branchId: s.branchId,
    setBranch: s.setBranch, logout: s.logout,
  }));
  // Live branches from API (not the stale snapshot inside the JWT).
  // Fallback to the JWT snapshot until the first fetch completes — avoids
  // an empty dropdown flash on page load.
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

  // Close drawer when route changes
  const closeDrawer = () => setDrawerOpen(false);

  const currentBranch = branches.find((b) => b.id === branchId) ?? branches[0];

  return (
    <div className="min-h-screen md:grid md:grid-cols-[260px_1fr] bg-bg">
      {/* Mobile overlay backdrop */}
      {drawerOpen && (
        <button
          aria-label="إغلاق القائمة"
          onClick={closeDrawer}
          className="md:hidden fixed inset-0 bg-black/40 z-40"
        />
      )}

      {/* Sidebar — fixed-drawer on mobile, sticky-column on desktop */}
      <aside
        className={
          'bg-gradient-to-b from-primary to-primary-dark text-white p-4 ' +
          'fixed inset-y-0 right-0 w-[260px] z-50 transition-transform duration-200 ease-out overflow-y-auto ' +
          (drawerOpen ? 'translate-x-0' : 'translate-x-full') + ' ' +
          'md:translate-x-0 md:static md:sticky md:top-0 md:h-screen md:z-auto'
        }
      >
        <div className="flex items-center gap-3 pb-4 border-b border-white/15 mb-4">
          <div className="w-11 h-11 rounded-xl bg-accent grid place-items-center font-extrabold text-xl">ق</div>
          <div className="flex-1">
            <h1 className="font-extrabold text-lg">قِطَعتي</h1>
            <p className="text-white/60 text-[11px] font-semibold">AutoParts Cloud</p>
          </div>
          <button
            aria-label="إغلاق"
            onClick={closeDrawer}
            className="md:hidden text-white/80 hover:text-white"
          >
            <X size={22} />
          </button>
        </div>
        <nav className="space-y-0.5">
          {NAV.map(({ to, label, icon: Icon, section }) => (
            <div key={to}>
              {section && <div className="text-white/50 text-[10px] font-extrabold uppercase tracking-wider mt-3 mb-1.5 px-2">{section}</div>}
              <NavLink
                to={to}
                onClick={closeDrawer}
                className={({ isActive }) =>
                  'flex items-center gap-3 px-3 py-2 rounded-xl text-[14px] font-semibold transition ' +
                  (isActive ? 'bg-white text-primary shadow-sm' : 'text-white/85 hover:bg-white/10')
                }>
                <Icon size={17} />
                <span>{label}</span>
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
            aria-label="فتح القائمة"
            onClick={() => setDrawerOpen(true)}
            className="md:hidden text-primary hover:bg-bg p-1.5 rounded-lg -mr-1"
          >
            <Menu size={22} />
          </button>

          <GlobalSearch />

          {currentBranch && (
            <select
              className="hidden sm:block text-xs sm:text-sm text-muted font-semibold bg-bg border border-line rounded-lg px-2 sm:px-3 py-2 max-w-[180px]"
              value={currentBranch.id}
              onChange={(e) => setBranch(e.target.value)}
            >
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}

          <button aria-label="التنبيهات" className="relative text-muted hover:text-primary p-1">
            <Bell size={20} />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
          </button>

          <div className="flex items-center gap-2 font-bold text-sm">
            <div className="w-9 h-9 rounded-full bg-primary text-white grid place-items-center font-extrabold">
              {user?.fullName?.[0] ?? '؟'}
            </div>
            <span className="hidden sm:inline">{user?.fullName}</span>
            <button
              aria-label="تسجيل الخروج"
              title="تسجيل خروج"
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
