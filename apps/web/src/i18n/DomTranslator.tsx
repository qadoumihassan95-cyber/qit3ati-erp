/**
 * DomTranslator
 * ─────────────────────────────────────────────────────────────────
 * Runtime AR→EN overlay. Reads the active language from
 * `document.documentElement.lang` (set by i18n/index.ts before React
 * boots) so we don't depend on React state timing. Activates exactly
 * once at mount, then keeps the page translated via MutationObserver.
 *
 * Why a runtime overlay?
 *   The codebase has ~800 unique Arabic strings spread across 30+
 *   pages. Rewriting all of them to use `t()` would take days and risk
 *   regressions. A DOM-level overlay covers every string the user
 *   actually sees and is fully reversible (we reload the page when the
 *   user switches back to AR — see i18n/index.ts).
 *
 * Translatable surfaces:
 *   - text nodes (every visible label, button text, badge, etc.)
 *   - placeholder / title / aria-label / alt attributes
 *   - submit/button value attributes
 *
 * Skip rules:
 *   - <script>, <style>, <code>, <pre>
 *   - anything under [data-no-translate]
 *
 * Performance: O(n) initial sweep, rAF-batched mutations. Dictionary
 * lookup is O(1) (plain object). Substring fallback uses a length-
 * sorted keys list to greedily replace the longest matches first.
 */
import { useEffect } from 'react';
import ar2enRaw from './ar2en.json';

const dict: Record<string, string> = ar2enRaw as Record<string, string>;

const AR_RE = /[؀-ۿ]/;          // any Arabic character
const TATWEEL_RE = /ـ/g;             // Arabic tatweel
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA']);

function norm(s: string): string {
  return s.replace(TATWEEL_RE, '').replace(/\s+/g, ' ').trim();
}

// Length-sorted keys cache (longest first) for substring fallback.
let _sortedKeys: string[] | null = null;
function sortedKeys(): string[] {
  if (_sortedKeys) return _sortedKeys;
  _sortedKeys = Object.keys(dict).sort((a, b) => b.length - a.length);
  return _sortedKeys;
}

/** Translate a single string. Returns the original if no match. */
function translate(input: string): string {
  if (!input || !AR_RE.test(input)) return input;
  const trimmed = input.trim();
  if (!trimmed) return input;
  const leadEnd = input.indexOf(trimmed);
  const lead = input.slice(0, leadEnd);
  const tail = input.slice(leadEnd + trimmed.length);

  // direct hit
  if (dict[trimmed]) return lead + dict[trimmed] + tail;
  const n = norm(trimmed);
  if (dict[n]) return lead + dict[n] + tail;

  // substring fallback — replace longest matching keys
  let out = trimmed;
  let changed = false;
  for (const k of sortedKeys()) {
    if (out.includes(k)) {
      out = out.split(k).join(dict[k]!);
      changed = true;
      if (!AR_RE.test(out)) break;
    }
  }
  return changed ? lead + out + tail : input;
}

function shouldSkipParent(node: Node): boolean {
  const parent = (node as Text).parentElement;
  if (!parent) return false;
  if (SKIP_TAGS.has(parent.tagName)) return true;
  if (parent.closest('[data-no-translate]')) return true;
  return false;
}

function translateTextNodes(root: Node): number {
  let count = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const v = (n as Text).nodeValue;
      if (!v || !AR_RE.test(v)) return NodeFilter.FILTER_REJECT;
      if (shouldSkipParent(n)) return NodeFilter.FILTER_REJECT;
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

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];

function translateAttributes(root: ParentNode | Document): number {
  let count = 0;
  const sel = '[placeholder],[title],[aria-label],[alt],input[type="submit"],input[type="button"],button';
  const els = (root as ParentNode).querySelectorAll(sel);
  els.forEach((el) => {
    if (el.closest && el.closest('[data-no-translate]')) return;
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v && AR_RE.test(v)) {
        const t = translate(v);
        if (t !== v) { el.setAttribute(a, t); count++; }
      }
    }
    if (el.tagName === 'INPUT' || el.tagName === 'BUTTON') {
      const v = (el as HTMLInputElement).value;
      if (v && AR_RE.test(v)) {
        const t = translate(v);
        if (t !== v) { (el as HTMLInputElement).value = t; count++; }
      }
    }
  });
  return count;
}

function translateAll(root: ParentNode = document.body) {
  return translateTextNodes(root) + translateAttributes(root);
}

let installed = false;

/** Install the overlay. Idempotent; runs only once per page lifetime. */
function install() {
  if (installed) return;
  // Re-read lang at install time — i18n/index.ts wrote it before React boot
  const lang = document.documentElement.lang || 'ar';
  if (!lang.startsWith('en')) return;

  installed = true;

  let scheduled = false;
  let touched = new Set<Node>();

  const flush = () => {
    scheduled = false;
    if (touched.size === 0) {
      translateAll();
    } else {
      touched.forEach((n) => {
        if (n.nodeType === Node.ELEMENT_NODE) {
          translateAll(n as ParentNode);
        } else if (n.nodeType === Node.TEXT_NODE) {
          const tn = n as Text;
          const v = tn.nodeValue ?? '';
          if (AR_RE.test(v) && !shouldSkipParent(n)) {
            const t = translate(v);
            if (t !== v) tn.nodeValue = t;
          }
        }
      });
      touched.clear();
    }
  };

  const schedule = (nodes?: Node[]) => {
    if (nodes) nodes.forEach((n) => touched.add(n));
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(flush);
    }
  };

  // Initial full sweep — and again after a short delay to catch React commits
  schedule();
  setTimeout(() => translateAll(), 200);
  setTimeout(() => translateAll(), 800);

  const obs = new MutationObserver((records) => {
    const t: Node[] = [];
    for (const r of records) {
      if (r.type === 'characterData') t.push(r.target);
      else if (r.type === 'childList') r.addedNodes.forEach((n) => t.push(n));
      else if (r.type === 'attributes') t.push(r.target);
    }
    if (t.length) schedule(t);
  });
  obs.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS,
  });
}

/**
 * Install as early as possible. We call it twice:
 *  1. Synchronously at module load — runs before React mounts so any
 *     SSR/initial markup is translated.
 *  2. From the React component's useEffect — guarantees it ran after
 *     React's first commit.
 */
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
}

export default function DomTranslator() {
  useEffect(() => {
    install();
  }, []);
  return null;
}
