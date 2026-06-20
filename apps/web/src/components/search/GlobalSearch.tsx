import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, X, User, Building2, Wrench, FileText, Banknote, FileCheck, Receipt, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

type ResultType = 'customer' | 'supplier' | 'part' | 'invoice' | 'cheque' | 'paper' | 'expense';

interface Result {
  type:     ResultType;
  id:       string;
  title:    string;
  subtitle?: string;
  meta?:    string;
  url:      string;
}

const TYPE_META: Record<ResultType, { label: string; Icon: any; color: string }> = {
  customer: { label: 'عميل',         Icon: User,       color: 'text-blue-700 bg-blue-50' },
  supplier: { label: 'مورد',         Icon: Building2,  color: 'text-purple-700 bg-purple-50' },
  part:     { label: 'صنف',          Icon: Wrench,     color: 'text-amber-700 bg-amber-50' },
  invoice:  { label: 'فاتورة',       Icon: FileText,   color: 'text-emerald-700 bg-emerald-50' },
  cheque:   { label: 'شيك',          Icon: Banknote,   color: 'text-indigo-700 bg-indigo-50' },
  paper:    { label: 'ورقة رسمية',    Icon: FileCheck,  color: 'text-slate-700 bg-slate-100' },
  expense:  { label: 'مصروف',        Icon: Receipt,    color: 'text-rose-700 bg-rose-50' },
};

/** Tiny debounce hook — re-renders the consumer with a delayed value. */
function useDebounced<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export default function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const debouncedQ = useDebounced(q.trim(), 200);
  const wrapRef  = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Close when clicking outside
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Cmd/Ctrl + K → focus search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const { data, isFetching } = useQuery<{ query: string; total: number; results: Result[] }>({
    queryKey: ['global-search', debouncedQ],
    queryFn: async () => (await api.get('/search', { params: { q: debouncedQ } })).data,
    // Only fire when there's something to look up — empty queries are useless
    enabled: debouncedQ.length >= 1,
    staleTime: 30_000,
  });
  const results = data?.results ?? [];

  // Reset highlight when results change
  useEffect(() => { setHighlight(0); }, [results.length]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    if (e.key === 'Enter')     { e.preventDefault(); pick(results[highlight]); }
  };

  const pick = (r?: Result) => {
    if (!r) return;
    setOpen(false);
    setQ('');
    // For now, navigate to the section page; later we can deep-link to the item modal.
    // `split[0]` is `string | undefined` under noUncheckedIndexedAccess — fall back to r.url.
    const base = r.url.split('#')[0] ?? r.url;
    navigate(base);
  };

  // Group by type for display
  const grouped: Array<[ResultType, Result[]]> = (Object.keys(TYPE_META) as ResultType[])
    .map((t) => [t, results.filter((r) => r.type === t)] as [ResultType, Result[]])
    .filter(([, list]) => list.length > 0);

  return (
    <div ref={wrapRef} className="flex-1 min-w-0 max-w-xl relative">
      <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" size={18} />
      <input
        ref={inputRef}
        className="input pr-10 pl-12 text-xs sm:text-sm"
        placeholder="ابحث في كل النظام — عملاء، أصناف، فواتير، شيكات..."
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        spellCheck={false}
        dir="auto"
      />
      {q && (
        <button type="button"
                onClick={() => { setQ(''); inputRef.current?.focus(); }}
                aria-label="مسح البحث"
                className="absolute left-9 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-ink">
          <X size={14} />
        </button>
      )}
      {/* Cmd+K hint (desktop only) */}
      <span className="hidden md:block absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted/70 font-mono bg-bg border border-line rounded px-1.5 py-0.5">⌘K</span>

      {open && debouncedQ.length >= 1 && (
        <div className="absolute z-30 mt-1.5 right-0 left-0 bg-white border border-line rounded-xl shadow-lg max-h-[70vh] overflow-y-auto">
          {isFetching && (
            <div className="p-3 text-center text-muted text-sm flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin" /> جاري البحث...
            </div>
          )}

          {!isFetching && results.length === 0 && (
            <div className="p-6 text-center text-muted text-sm">
              لا توجد نتائج لـ "<b>{debouncedQ}</b>"
              <div className="text-xs mt-2 text-muted/70">جرّب اسماً مختلفاً أو رقم فاتورة/قطعة</div>
            </div>
          )}

          {results.length > 0 && grouped.map(([type, list]) => {
            const { label, Icon, color } = TYPE_META[type];
            return (
              <div key={type} className="border-b border-line last:border-0">
                <div className="px-3 py-1.5 text-[10px] font-extrabold text-muted/80 uppercase tracking-wider bg-bg/60 sticky top-0">
                  <Icon size={11} className="inline -mt-0.5 me-1" /> {label} ({list.length})
                </div>
                {list.map((r) => {
                  const idx = results.indexOf(r);
                  const active = idx === highlight;
                  return (
                    <button
                      key={`${r.type}-${r.id}`}
                      onClick={() => pick(r)}
                      onMouseEnter={() => setHighlight(idx)}
                      className={
                        'w-full text-right px-3 py-2.5 flex items-start gap-2 transition ' +
                        (active ? 'bg-primary/5' : 'hover:bg-bg')
                      }>
                      <span className={'shrink-0 w-7 h-7 rounded grid place-items-center ' + color}>
                        <Icon size={14} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm truncate">{r.title}</div>
                        {r.subtitle && <div className="text-xs text-muted truncate">{r.subtitle}</div>}
                      </div>
                      {r.meta && (
                        <span className="text-xs text-muted whitespace-nowrap mt-0.5">{r.meta}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}

          {results.length > 0 && (
            <div className="px-3 py-1.5 text-[10px] text-muted border-t border-line bg-bg/60 flex justify-between">
              <span><kbd className="font-mono">↑↓</kbd> للتنقّل • <kbd className="font-mono">Enter</kbd> للاختيار</span>
              <span>{results.length} نتيجة</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
