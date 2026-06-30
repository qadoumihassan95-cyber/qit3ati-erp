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
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const user = useAuth((s) => s.user) as any;
  const userId: string | null = user?.id ?? user?.sub ?? null;

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
    // TOURS entries are builders — calling resolves translations against
    // the current language at the moment the tour is opened.
    const builder = TOURS[key];
    const allSteps = typeof builder === 'function' ? builder() : (builder as any) ?? [];
    if (!allSteps || allSteps.length === 0) return;

    /**
     * Identify which steps target elements that live *inside* the sidebar.
     * On mobile the sidebar is hidden behind a drawer; before we move to
     * such a step, we need to open the drawer so the highlight actually
     * lands on a visible element.
     */
    const SIDEBAR_SELECTORS = ['[data-tour="sidebar"]', '[data-tour^="nav-"]', '[data-tour="branch-selector"]'];
    const targetsSidebar = (sel: string | undefined) =>
      !!sel && SIDEBAR_SELECTORS.some((s) => sel.startsWith(s.slice(0, -1)) || sel === s);

    /**
     * Wait briefly for an element to be in the DOM (slide-in animation).
     * Returns whether it actually showed up.
     */
    const waitFor = (sel: string, ms = 500) =>
      new Promise<boolean>((resolve) => {
        if (document.querySelector(sel)) return resolve(true);
        const start = Date.now();
        const tick = () => {
          if (document.querySelector(sel)) return resolve(true);
          if (Date.now() - start > ms) return resolve(false);
          requestAnimationFrame(tick);
        };
        tick();
      });

    // Filter out steps whose element is missing AND not in the sidebar (those
    // we open lazily). Keep modal-style steps (no element) always.
    const steps = allSteps.filter((s: any) => {
      if (!s.element) return true;
      if (targetsSidebar(s.element)) return true;   // opened lazily before highlight
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
      progressText: t('tour.stepOf', { current: '{{current}}', total: '{{total}}' }),
      nextBtnText: t('tour.next'),
      prevBtnText: t('tour.prev'),
      doneBtnText: t('tour.done'),
      smoothScroll: true,
      allowClose: true,
      overlayOpacity: 0.7,
      stagePadding: 6,
      stageRadius: 8,
      popoverClass: 'qit3ati-tour-popover',
      steps,
      /**
       * Open the sidebar drawer (on mobile) when the *next* step needs an
       * element inside it; close the drawer when we move away. Use a
       * 300ms wait to let the slide animation finish before driver.js
       * measures the highlight rect.
       */
      onHighlightStarted: async (_el, step) => {
        const sel = (step as any)?.element as string | undefined;
        if (targetsSidebar(sel)) {
          window.dispatchEvent(new CustomEvent('tour:sidebar-open'));
          if (sel) await waitFor(sel, 400);
        } else {
          window.dispatchEvent(new CustomEvent('tour:sidebar-close'));
        }
      },
      onDestroyed: () => {
        markSeen(key);
        // Close the drawer when the tour ends
        window.dispatchEvent(new CustomEvent('tour:sidebar-close'));
      },
    });
    d.drive();
  }, [markSeen, t]);

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
