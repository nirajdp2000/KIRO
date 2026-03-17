/**
 * useStockSearch
 * Preloads the full NSE+BSE universe once, then searches in-memory.
 * Ranking: exact symbol > starts-with > partial symbol > no match.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

export interface SearchStock {
  symbol:   string;
  name:     string;
  key:      string;
  exchange: 'NSE' | 'BSE';
  sector:   string;
}

let _cache: SearchStock[] | null = null;
let _loadPromise: Promise<SearchStock[]> | null = null;

async function loadUniverse(): Promise<SearchStock[]> {
  if (_cache) return _cache;
  if (_loadPromise) return _loadPromise;
  _loadPromise = fetch('/api/stocks/universe')
    .then(r => r.json())
    .then((data: SearchStock[]) => {
      _cache = data;
      console.log(`[useStockSearch] Loaded ${data.length} searchable stocks`);
      return data;
    });
  return _loadPromise;
}

function rankSearch(universe: SearchStock[], q: string): SearchStock[] {
  if (!q) return [];
  const up = q.toUpperCase();
  const exact: SearchStock[]      = [];
  const startsWith: SearchStock[] = [];
  const partial: SearchStock[]    = [];

  for (const s of universe) {
    const sym = s.symbol.toUpperCase();
    if (sym === up)           { exact.push(s);      continue; }
    if (sym.startsWith(up))   { startsWith.push(s); continue; }
    if (sym.includes(up))     { partial.push(s); }
  }

  const results = [...exact, ...startsWith, ...partial].slice(0, 20);
  console.log(`[useStockSearch] q="${q}" universe=${universe.length} results=${results.length}`);
  return results;
}

export function useStockSearch(debounceMs = 200) {
  const [universe, setUniverse]     = useState<SearchStock[]>(_cache ?? []);
  const [results, setResults]       = useState<SearchStock[]>([]);
  const [loading, setLoading]       = useState(false);
  const [universeReady, setUniverseReady] = useState(!!_cache);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Preload universe on mount
  useEffect(() => {
    if (_cache) { setUniverse(_cache); setUniverseReady(true); return; }
    loadUniverse().then(data => {
      setUniverse(data);
      setUniverseReady(true);
    });
  }, []);

  const search = useCallback((query: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query || query.length < 1) { setResults([]); return; }

    setLoading(true);
    timerRef.current = setTimeout(() => {
      const u = _cache ?? universe;
      setResults(rankSearch(u, query));
      setLoading(false);
    }, debounceMs);
  }, [universe, debounceMs]);

  const clear = useCallback(() => setResults([]), []);

  return { results, search, clear, loading, universeReady, universeSize: universe.length };
}
