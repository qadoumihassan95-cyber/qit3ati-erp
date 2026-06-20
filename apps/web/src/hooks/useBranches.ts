import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * Single source of truth for the tenant's branches across the entire app.
 *
 * Replaces the older pattern of reading `useAuth(s => s.user.branches)`,
 * which was a SNAPSHOT taken at JWT login and never refreshed. With that
 * pattern, a branch created via /branches API would be invisible
 * everywhere else (POS, Purchases, Papers, Cheques, header dropdown)
 * until the user logged out and back in — a serious UX bug.
 *
 * Now every dropdown calls `useBranches()`. After a successful POST
 * to /branches, components MUST call `qc.invalidateQueries({ queryKey: ['branches'] })`
 * so the new branch shows up everywhere instantly.
 */

export interface Branch {
  id:        string;
  name:      string;
  code?:     string | null;
  isMain?:   boolean;
  isActive?: boolean;
  phone?:    string | null;
  address?:  string | null;
}

const BRANCHES_KEY = ['branches'] as const;

/**
 * Fetch all branches for the current tenant.
 * Cached for 5 minutes — branches don't change often.
 */
export function useBranches() {
  return useQuery<Branch[]>({
    queryKey: BRANCHES_KEY,
    queryFn: async () => {
      const res = await api.get('/branches');
      // Endpoint may return either a plain array or { items: [...] } — normalise
      return Array.isArray(res.data) ? res.data : (res.data?.items ?? []);
    },
    staleTime: 5 * 60 * 1000,   // 5 minutes
  });
}

/**
 * Call this after creating/editing/deleting a branch so EVERY screen
 * (header dropdown, POS, Purchases, Transfers, Papers, Cheques, …) shows
 * the change immediately.
 */
export function useInvalidateBranches() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: BRANCHES_KEY });
}
