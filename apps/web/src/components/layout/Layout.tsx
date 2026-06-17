import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ShoppingCart, Wrench, Boxes, Settings as SettingsIcon, Bell, Search, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useEffect } from 'react';

const NAV = [
  { to: '/dashboard', label: 'لوحة التحكم',     icon: LayoutDashboard },
  { to: '/pos',       label: 'نقطة البيع POS',  icon: ShoppingCart },
  { to: '/parts',     label: 'الأصناف والقطع',  icon: Wrench },
  { to: '/stock',     label: 'المخزون والفروع', icon: Boxes },
  { to: '/settings',  label: 'الإعدادات والهوية', icon: SettingsIcon },
];

export default function Layout() {
  const { user, branchId, branches, setBranch, logout } = useAuth((s) => ({
    user: s.user, branchId: s.branchId, branches: s.user?.branches ?? [],
    setBranch: s.setBranch, logout: s.logout,
  }));
  const navigate = useNavigate();

  // Apply white-label colors from tenant settings
  useEffect(() => {
    if (user?.settings) {
      document.documentElement.style.setProperty('--color-primary', user.settings.colorPrimary);
      document.documentElement.style.setProperty('--color-accent',  user.settings.colorSecondary);
    }
  }, [user]);

  const currentBranch = branches.find((b) => b.id === branchId) ?? branches[0];

  return (
    <div className="min-h-screen grid grid-cols-[260px_1fr] bg-bg">
      {/* Sidebar */}
      <aside className="bg-gradient-to-b from-primary to-primary-dark text-white p-4 sticky top-0 h-screen overflow-y-auto">
        <div className="flex items-center gap-3 pb-4 border-b border-white/15 mb-4">
          <div className="w-11 h-11 rounded-xl bg-accent grid place-items-center font-extrabold text-xl">ق</div>
          <div>
            <h1 className="font-extrabold text-lg">قِطَعتي</h1>
            <p className="text-white/60 text-[11px] font-semibold">AutoParts Cloud</p>
          </div>
        </div>
        <nav className="space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) =>
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-semibold transition ' +
                (isActive ? 'bg-white text-primary' : 'text-white/85 hover:bg-white/10')
              }>
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main column */}
      <div>
        <header className="bg-white border-b border-line p-4 px-7 flex items-center gap-5 sticky top-0 z-10">
          <div className="flex-1 max-w-xl relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
            <input className="input pr-10" placeholder="ابحث بالاسم أو رقم القطعة أو OEM أو الباركود..." />
          </div>
          {currentBranch && (
            <select className="text-sm text-muted font-semibold bg-bg border border-line rounded-lg px-3 py-2"
                    value={currentBranch.id}
                    onChange={(e) => setBranch(e.target.value)}>
              {branches.map((b) => <option key={b.id} value={b.id}>الفرع: {b.name}</option>)}
            </select>
          )}
          <button className="relative text-xl text-muted hover:text-primary">
            <Bell size={20} />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
          </button>
          <div className="flex items-center gap-2.5 font-bold text-sm">
            <div className="w-9 h-9 rounded-full bg-primary text-white grid place-items-center font-extrabold">
              {user?.fullName?.[0] ?? '؟'}
            </div>
            <span>{user?.fullName}</span>
            <button title="تسجيل خروج" className="text-muted hover:text-red-500" onClick={() => { logout(); navigate('/login'); }}>
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <main className="p-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
