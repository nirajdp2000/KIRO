/**
 * AssetSearch
 * Smart autocomplete search over the full NSE+BSE universe.
 * Drop-in replacement for the existing search input in App.tsx.
 * Props mirror the existing interface so no other code changes.
 */
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { useStockSearch, SearchStock } from '../services/useStockSearch';

interface Props {
  query:            string;
  onQueryChange:    (q: string) => void;
  onSelect:         (stock: { symbol: string; name: string; key: string }) => void;
  containerRef?:    React.RefObject<HTMLDivElement>;
}

/** Highlight the matched portion of a string */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toUpperCase().indexOf(query.toUpperCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-indigo-400 font-black">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function AssetSearch({ query, onQueryChange, onSelect, containerRef }: Props) {
  const { results, search, clear, loading, universeReady, universeSize } = useStockSearch(200);
  const [open, setOpen]         = useState(false);
  const [cursor, setCursor]     = useState(-1);
  const inputRef                = useRef<HTMLInputElement>(null);
  const listRef                 = useRef<HTMLDivElement>(null);
  const wrapRef                 = useRef<HTMLDivElement>(null);

  // Forward the outer containerRef if provided (for click-outside in App.tsx)
  useEffect(() => {
    if (containerRef && wrapRef.current) {
      (containerRef as any).current = wrapRef.current;
    }
  }, [containerRef]);

  // Trigger search whenever query changes
  useEffect(() => {
    if (query.length >= 1) {
      search(query);
      setOpen(true);
      setCursor(-1);
    } else {
      clear();
      setOpen(false);
    }
  }, [query, search, clear]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = useCallback((s: SearchStock) => {
    onSelect({ symbol: s.symbol, name: s.name, key: s.key });
    onQueryChange(s.symbol);
    setOpen(false);
    setCursor(-1);
  }, [onSelect, onQueryChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor(c => Math.min(c + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor(c => Math.max(c - 1, 0));
    } else if (e.key === 'Enter' && cursor >= 0) {
      e.preventDefault();
      handleSelect(results[cursor]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (cursor >= 0 && listRef.current) {
      const item = listRef.current.children[cursor] as HTMLElement;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [cursor]);

  const showDropdown = open && query.length >= 1;

  return (
    <div className="relative" ref={wrapRef}>
      <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2 ml-1">
        Asset Search
        {universeReady && (
          <span className="ml-2 text-indigo-500/60 normal-case font-medium">
            {universeSize.toLocaleString()} stocks
          </span>
        )}
      </label>

      <div className="relative group">
        <input
          ref={inputRef}
          type="text"
          placeholder="Symbol or name…"
          className="w-full bg-black/40 border border-white/10 rounded-2xl py-3 pl-11 pr-4 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50 transition-all outline-none placeholder:text-zinc-700"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (query.length >= 1 && results.length > 0) setOpen(true); }}
          autoComplete="off"
          spellCheck={false}
        />
        {loading
          ? <Loader2 className="absolute left-4 top-3.5 w-4 h-4 text-indigo-400 animate-spin" />
          : <Search className="absolute left-4 top-3.5 w-4 h-4 text-zinc-600 group-focus-within:text-indigo-400 transition-colors" />
        }
      </div>

      {showDropdown && (
        <div
          ref={listRef}
          className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl z-50 overflow-y-auto max-h-72 backdrop-blur-xl"
        >
          {results.length === 0 ? (
            <div className="px-5 py-4 text-xs text-zinc-500 text-center">No results found</div>
          ) : (
            results.map((s, i) => (
              <button
                key={s.key}
                className={`w-full px-4 py-3 text-left text-sm flex items-center justify-between border-b border-white/5 last:border-0 transition-colors ${
                  i === cursor ? 'bg-indigo-500/10' : 'hover:bg-white/5'
                }`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => handleSelect(s)}
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-bold text-zinc-100 text-xs tracking-wide">
                    <Highlight text={s.symbol} query={query} />
                  </span>
                  <span className="text-[10px] text-zinc-500 font-medium truncate">
                    {s.name || s.sector}
                  </span>
                </div>
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ml-2 shrink-0 ${
                  s.exchange === 'NSE'
                    ? 'bg-indigo-500/20 text-indigo-400'
                    : 'bg-amber-500/20 text-amber-400'
                }`}>
                  {s.exchange}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
