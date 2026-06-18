import type { ReactNode } from 'react';
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
import CustomersPage from '@/pages/customers/CustomersPage';
import SuppliersPage from '@/pages/suppliers/SuppliersPage';
import ExpensesPage from '@/pages/expenses/ExpensesPage';
import ReturnsPage from '@/pages/returns/ReturnsPage';
import ReportsPage from '@/pages/reports/ReportsPage';
import BranchesPage from '@/pages/branches/BranchesPage';
import AuditPage from '@/pages/audit/AuditPage';
import SettingsPage from '@/pages/settings/SettingsPage';
import PapersPage from '@/pages/papers/PapersPage';
import ChequesPage from '@/pages/cheques/ChequesPage';
import JofotaraPage from '@/pages/jofotara/JofotaraPage';

function Protected({ children }: { children: ReactNode }) {
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
        <Route index               element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"    element={<DashboardPage />} />
        <Route path="pos"          element={<PosPage />} />
        <Route path="parts"        element={<PartsPage />} />
        <Route path="stock"        element={<StockPage />} />
        <Route path="purchases"    element={<PurchasesPage />} />
        <Route path="transfers"    element={<TransfersPage />} />
        <Route path="customers"    element={<CustomersPage />} />
        <Route path="suppliers"    element={<SuppliersPage />} />
        <Route path="expenses"     element={<ExpensesPage />} />
        <Route path="returns"      element={<ReturnsPage />} />
        <Route path="reports"      element={<ReportsPage />} />
        <Route path="branches"     element={<BranchesPage />} />
        <Route path="audit"        element={<AuditPage />} />
        <Route path="papers"       element={<PapersPage />} />
        <Route path="cheques"      element={<ChequesPage />} />
        <Route path="jofotara"     element={<JofotaraPage />} />
        <Route path="settings"     element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
