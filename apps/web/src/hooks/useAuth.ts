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
  /**
   * The currently-selected branch.
   *   • A branch UUID → the user is scoped to that branch's data.
   *   • null          → "All branches" mode; only shown in the header
   *     dropdown for owners (isSuperAdmin || permissions include
   *     `branches.view_all`). Pages that need to write to a specific
   *     branch (POS, Purchases, Transfers) must force-pick one before
   *     submit.
   */
  branchId: string | null;
  setSession: (token: string, user: AuthUser) => void;
  setBranch: (branchId: string | null) => void;
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
