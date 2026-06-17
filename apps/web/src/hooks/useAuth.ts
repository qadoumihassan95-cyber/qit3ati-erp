import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  fullName: string;
  email: string | null;
  tenantId: string | null;
  role: string | null;
  permissions: string[];
  branches: { id: string; name: string; isMain: boolean }[];
  settings: {
    logoUrl: string | null;
    colorPrimary: string;
    colorSecondary: string;
    currency: string;
    taxRate: number;
    language: string;
  } | null;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  branchId: string | null;
  setSession: (token: string, user: AuthUser) => void;
  setBranch: (branchId: string) => void;
  logout: () => void;
  hasPermission: (perm: string) => boolean;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      branchId: null,
      setSession: (token, user) => set({
        token, user,
        branchId: get().branchId ?? user.branches[0]?.id ?? null,
      }),
      setBranch: (branchId) => set({ branchId }),
      logout: () => set({ token: null, user: null, branchId: null }),
      hasPermission: (p) => !!get().user?.permissions.includes(p),
    }),
    { name: 'qit3ati-auth' },
  ),
);
