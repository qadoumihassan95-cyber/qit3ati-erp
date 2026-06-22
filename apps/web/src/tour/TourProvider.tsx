/**
 * TourProvider
 * ─────────────────────────────────────────────────────────────────
 * Wraps the app and exposes a `useTour()` hook for triggering tours.
 *
 * Responsibilities:
 *  1. Lazily loads driver.js (only when the user actually starts a tour).
 *  2. Shows a one-time welcome modal on first login (per user).
 *  3. Tracks "seen tours" in localStorage keyed by the user id, so each
 *     user has their own state (handles shared devices).
 *  4. Filters out steps whose `element` is not in the DOM (responsive
 *     hide, permissions hide).
 *  5. RTL-aware (Arabic-first).
 *
 * Public API:
 *   const { startTour, isWelcomeOpen, dismissWelcome, hasSeen } = useTour();
 *   startTour('parts');     // run a specific tour
 *   startTour('welcome');   // run the big intro
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';
import { TOURS, type TourKey } from './tourSteps';
import { useAuth } from '@/hooks/useAuth';

interface TourCtx {
  startTour: (key: TourKey) => Promise<void>;
  hasSeen:   (key: TourKey) => boolean;
  isWelcomeOpen: boolean;
  dismissWelcome: () => void;
  openWelcome:   () => void;
}

const Ctx = createContext<TourCtx | null>(null);

const STORAGE_PREFIX = 'qit3ati-tour-seen';
const storageKey = (userId: string | undefined, key: TourKey) =>
  `${STORAGE_PREFIX}:${userId ?? 'guest'}:${key}`;

export function TourProvider({ children }: { children: ReactNode }) {
  const user = useAuth((s) => s.user);
  const userId: string | null = (user as any)?.id ?? (user as any)?.sub ?? null;
  const [isWelcomeOpen, setWelcomeOpen] = useState(false);

  // On login: if user has never seen the welcome tour, open the modal.
  useEffect(() => {
    if (!userId) return;
    const seen = localStorage.getItem(storageKey(userId, 'welcome'));
    if (!seen) {
      // give the layout time to mount before showing the modal
      const t = setTimeout(() => setWelcomeOpen(true), 800);
      return () => clearTimeout(t);
    }
  }, [userId]);

  const hasSeen = useCallback(
    (key: TourKey) => Boolean(localStorage.getItem(storageKey(userId ?? undefined, key))),
    [userId],
  );

  const markSeen = useCallback(
    (key: TourKey) => localStorage.setItem(storageKey(userId ?? undefined, key), Date.now().toString()),
    [userId],
  );

  const startTour = useCallback(async (key: TourKey) => {
    setWelcomeOpen(false);
    const allSteps = TOURS[key] ?? [];
    if (allSteps.length === 0) return;

    // Filter steps to only those whose element is in the DOM (steps without
    // `element` are always shown — they are modal-style intro popovers).
    const steps = allSteps.filter((s) => {
      if (!s.element) return true;
      try { return Boolean(document.querySelector(s.element as string)); }
      catch { return false; }
    });
    if (steps.length === 0) return;

    // Lazy-load driver.js + its CSS only the first time
    const [{ driver }] = await Promise.all([
      import('driver.js'),
      import('driver.js/dist/driver.css'),
    ]);

    const d = driver({
      showProgress: true,
      progressText: 'الخطوة {{current}} من {{total}}',
      nextBtnText: 'التالي ←',
      prevBtnText: '→ السابق',
      doneBtnText: 'إنهاء ✓',
      smoothScroll: true,
      allowClose: true,
      overlayOpacity: 0.7,
      stagePadding: 6,
      stageRadius: 8,
      popoverClass: 'qit3ati-tour-popover',
      steps,
      onDestroyed: () => markSeen(key),
    });
    d.drive();
  }, [markSeen]);

  const dismissWelcome = useCallback(() => {
    setWelcomeOpen(false);
    markSeen('welcome');
  }, [markSeen]);

  const openWelcome = useCallback(() => setWelcomeOpen(true), []);

  const value = useMemo<TourCtx>(() => ({
    startTour, hasSeen, isWelcomeOpen, dismissWelcome, openWelcome,
  }), [startTour, hasSeen, isWelcomeOpen, dismissWelcome, openWelcome]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTour(): TourCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTour must be inside <TourProvider>');
  return c;
}
