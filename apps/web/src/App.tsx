import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import Layout from '@/components/layout/Layout';
import LoginPage from '@/pages/auth/LoginPage';
import DashboardPage from '@/pages/dashboard/DashboardPage';
import PartsPage from '@/pages/parts/PartsPage';
import PosPage from '@/pages/pos/PosPage';
import StockPage from '@/pages/stock/StockPage';
import PurchasesPage from '@/pages/purchases/PurchasesPage';
import TransfersPage from '@/pages/transfers/TransfersPage';
import SettingsPage from '@/pages/settings/SettingsPage';

function Protected({ children }: { children: React.ReactNode }) {
  const token = useAuth((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="parts"     element={<PartsPage />} />
        <Route path="pos"       element={<PosPage />} />
        <Route path="stock"     element={<StockPage />} />
        <Route path="purchases" element={<PurchasesPage />} />
        <Route path="transfers" element={<TransfersPage />} />
        <Route path="settings"  element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
