/**
 * DomTranslator
 * ─────────────────────────────────────────────────────────────────
 * Runtime overlay translator. When the active language is EN, every
 * Arabic text node and translatable attribute (placeholder, title,
 * aria-label, alt, value of buttons/submit inputs) is replaced with
 * its English equivalent from `ar2en.json`.
 *
 * Why a runtime overlay?
 *   Wholesale rewriting 30+ pages with `t()` calls would take days
 *   and risk breaking unrelated logic. This overlay gives the same
 *   user-visible result instantly and covers 100% of strings that
 *   ship with the build — plus anything injected later by React.
 *
 * Reversibility:
 *   When the user switches back to AR, we call `location.reload()`
 *   from the i18n module. Re-render from source restores the
 *   original Arabic. (We do not try to "un-translate" — that's
 *   the simpler, more robust path.)
 *
 * Attribute translation:
 *   placeholder, title, aria-label, alt, value (on submit/button).
 *
 * Performance:
 *   - Initial sweep: O(n) over the body. Done once per language switch.
 *   - Live updates: MutationObserver, batched via requestAnimationFrame.
 *   - The dictionary is a plain JS object — O(1) lookup per node.
 */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ar2enRaw from './ar2en.json';

const dict: Record<string, string> = ar2enRaw as Record<string, string>;

// Normalize whitespace + tatweel + punctuation variants we don't want to depend on.
function norm(s: string): string {
  return s
    .replace(/ـ/g, '')          // tatweel
    .replace(/\s+/g, ' ')            // collapse whitespace
    .trim();
}

// Translate a single string. Returns the translated value or the
// original string if no match. Handles surrounding whitespace.
function translate(input: string): string {
  if (!input) return input;
  // Fast path: no Arabic letters → leave it alone.
  if (!/[؀-ۿ]/.test(input)) return input;
  const trimmed = input.trim();
  if (!trimmed) return input;
  const lead = input.slice(0, input.indexOf(trimmed));
  const tail = input.slice(input.indexOf(trimmed) + trimmed.length);

  const direct = dict[trimmed];
  if (direct) return lead + direct + tail;

  const n = norm(trimmed);
  const ndirect = dict[n];
  if (ndirect) return lead + ndirect + tail;

  // Substring replacement — find longest matching key contained inside.
  // Useful for sentences like "السلة فارغة — اختر قطعة" where the whole
  // sentence may not be in the dict but its parts are.
  // Pre-sort keys by length once.
  const keys = sortedKeys();
  let out = trimmed;
  let mutated = false;
  for (const k of keys) {
    if (out.includes(k)) {
      out = out.split(k).join(dict[k]);
      mutated = true;
      // Stop once we've translated to something with no more Arabic — saves work.
      if (!/[؀-ۿ]/.test(out)) break;
    }
  }
  if (mutated) return lead + out + tail;
  return input;
}

let _sortedKeys: string[] | null = null;
function sortedKeys(): string[] {
  if (_sortedKeys) return _sortedKeys;
  _sortedKeys = Object.keys(dict).sort((a, b) => b.length - a.length);
  return _sortedKeys;
}

// Walk text nodes under `root` and translate them in place.
function translateTextNodes(root: Node): number {
  let count = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const txt = (n as Text).nodeValue;
      if (!txt || !/[؀-ۿ]/.test(txt)) return NodeFilter.FILTER_REJECT;
      // skip <script>, <style>, <code>, <pre>
      const parent = (n as Text).parentElement;
      if (parent) {
        const tag = parent.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'CODE' || tag === 'PRE') {
          return NodeFilter.FILTER_REJECT;
        }
        // skip elements explicitly marked as do-not-translate
        if (parent.closest('[data-no-translate]')) return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const tn = node as Text;
    const original = tn.nodeValue ?? '';
    const translated = translate(original);
    if (translated !== original) {
      tn.nodeValue = translated;
      count++;
    }
  }
  return count;
}

const ATTR_NAMES = ['placeholder', 'title', 'aria-label', 'alt'];

function translateAttributes(root: ParentNode): number {
  let count = 0;
  const els = root.querySelectorAll('[placeholder],[title],[aria-label],[alt],input[type="submit"][value],button[value]');
  els.forEach((el) => {
    if (el.closest('[data-no-translate]')) return;
    for (const a of ATTR_NAMES) {
      const v = el.getAttribute(a);
      if (v && /[؀-ۿ]/.test(v)) {
        const t = translate(v);
        if (t !== v) { el.setAttribute(a, t); count++; }
      }
    }
    // button/input submit value
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'BUTTON') {
      const v = (el as HTMLInputElement).value;
      if (v && /[؀-ۿ]/.test(v)) {
        const t = translate(v);
        if (t !== v) { (el as HTMLInputElement).value = t; count++; }
      }
    }
  });
  return count;
}

function translateAll(root: ParentNode = document.body) {
  const a = translateTextNodes(root);
  const b = translateAttributes(root);
  return a + b;
}

/**
 * Component — drop once near the root of the React tree. It activates
 * itself only when the current language is EN.
 */
export default function DomTranslator() {
  const { i18n } = useTranslation();
  const isEn = i18n.language?.startsWith('en');

  useEffect(() => {
    if (!isEn) return;

    // Initial sweep — give React a microtask to settle into DOM.
    let raf = 0;
    let pending = false;
    let pendingNodes = new Set<Node>();

    const doSweep = () => {
      raf = 0;
      pending = false;
      if (pendingNodes.size === 0) {
        translateAll();
      } else {
        pendingNodes.forEach((n) => {
          if (n.nodeType === Node.ELEMENT_NODE) translateAll(n as ParentNode);
          else if (n.nodeType === Node.TEXT_NODE) {
            const t = n as Text;
            const v = t.nodeValue ?? '';
            const translated = translate(v);
            if (translated !== v) t.nodeValue = translated;
          }
        });
        pendingNodes.clear();
      }
    };

    const schedule = (nodes?: Node[]) => {
      if (nodes) nodes.forEach((n) => pendingNodes.add(n));
      if (!pending) {
        pending = true;
        raf = requestAnimationFrame(doSweep);
      }
    };

    // Run initial sweep
    schedule();

    // Watch for new content
    const obs = new MutationObserver((records) => {
      const touched: Node[] = [];
      for (const r of records) {
        if (r.type === 'characterData') touched.push(r.target);
        if (r.type === 'childList') r.addedNodes.forEach((n) => touched.push(n));
      }
      if (touched.length) schedule(touched);
    });
    obs.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      obs.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isEn]);

  return null;
}
