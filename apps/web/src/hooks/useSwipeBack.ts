/**
 * useSwipeBack
 * ────────────
 * iOS-style edge-swipe navigation. Detects a horizontal swipe that
 * starts within `edgeThreshold` pixels of the screen edge and covers
 * more than `minDistance` pixels of horizontal travel with less than
 * `maxVerticalDrift` of vertical travel. Fires history.back().
 *
 * RTL/LTR aware:
 *   • LTR (English) — mirrors iOS: swipe LEFT-EDGE → RIGHT to go back
 *   • RTL (Arabic)  — swipe RIGHT-EDGE → LEFT to go back (mirror image,
 *     matching the natural "back arrow" direction the user sees).
 *
 * Passive-safe:
 *   Uses `{ passive: true }` listeners so the browser can still scroll
 *   smoothly. We never call preventDefault(), so this coexists with
 *   scrollable pages — the swipe only fires when it's clearly a
 *   horizontal gesture, not a vertical scroll.
 *
 * Native browser gesture: on iOS Safari the left-edge swipe already
 * triggers browser back — this hook is a no-op there (see the
 * short-circuit at the top). It's for Android + PWA + non-Safari where
 * that behaviour doesn't exist.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface Options {
  edgeThreshold?:    number;   // px from the screen edge where the touchstart must land
  minDistance?:      number;   // min horizontal travel to count as a swipe-back
  maxVerticalDrift?: number;   // if vertical drift exceeds this, treat as scroll (cancel)
  enabled?:          boolean;
}

export function useSwipeBack(opts: Options = {}) {
  const navigate = useNavigate();
  const {
    edgeThreshold    = 24,
    minDistance      = 80,
    maxVerticalDrift = 60,
    enabled          = true,
  } = opts;

  useEffect(() => {
    if (!enabled) return;

    // On iOS Safari the browser already handles edge-swipe → back at
    // the OS level. Adding our own would double-trigger, so skip.
    const ua = navigator.userAgent;
    const isIOSSafari =
      /iPhone|iPad|iPod/.test(ua) &&
      /Safari/.test(ua) &&
      !/CriOS|FxiOS|EdgiOS/.test(ua) &&
      // Standalone (PWA "add to home screen") mode lacks Safari's
      // gesture, so we DO want to install our listener there.
      !(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    if (isIOSSafari) return;

    const isRTL = document.documentElement.dir === 'rtl';

    let startX = 0, startY = 0, tracking = false;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (!t) return;                                       // TS strict — narrow Touch | undefined
      const w = window.innerWidth;
      // In RTL the "back gesture" swipes from the RIGHT edge leftward.
      // In LTR (English), from the LEFT edge rightward.
      const nearBackEdge = isRTL
        ? t.clientX > w - edgeThreshold
        : t.clientX < edgeThreshold;
      if (!nearBackEdge) return;
      startX   = t.clientX;
      startY   = t.clientY;
      tracking = true;
    };

    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      if (!t) return;                                       // TS strict — narrow Touch | undefined
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      if (dy > maxVerticalDrift) return;                   // it was a scroll
      // Distance sign check: RTL → swipe left = negative dx
      const enoughTravel = isRTL ? dx < -minDistance : dx > minDistance;
      if (enoughTravel) navigate(-1);
    };

    const onCancel = () => { tracking = false; };

    window.addEventListener('touchstart',  onStart,  { passive: true });
    window.addEventListener('touchend',    onEnd,    { passive: true });
    window.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      window.removeEventListener('touchstart',  onStart);
      window.removeEventListener('touchend',    onEnd);
      window.removeEventListener('touchcancel', onCancel);
    };
  }, [navigate, edgeThreshold, minDistance, maxVerticalDrift, enabled]);
}
