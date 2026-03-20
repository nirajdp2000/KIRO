import React, { useState, useEffect, useRef } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  BarChart,
  Bar
} from 'recharts';
import { 
  Search, 
  Calendar, 
  Clock, 
  TrendingUp, 
  AlertCircle, 
  Loader2, 
  ChevronDown,
  BarChart3,
  LineChart as LineChartIcon,
  Maximize2,
  Brain,
  Zap,
  ShieldAlert,
  PieChart,
  Target,
  Sparkles,
  Activity,
  ShieldCheck,
  Copy,
  Download,
  Shield,
  MoonStar,
  SunMedium
} from 'lucide-react';
import { format, subDays, parseISO } from 'date-fns';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { InstitutionalAnalytics } from './components/InstitutionalAnalytics';
import UltraQuantTab from './components/UltraQuantTab';
import MultibaggerScanner from './components/MultibaggerScanner';
import AIStockIntelligenceTab from './components/AIStockIntelligenceTab';
import AssetSearch from './components/AssetSearch';
import AnalyticsFilters, { FilterState, DEFAULT_FILTERS } from './components/AnalyticsFilters';
import TerminalLayout from './components/TerminalLayout';
import { fetchJson } from './lib/api';

/** Strip NSE_EQ| / BSE_EQ| / NSE_EQ: / BSE_EQ: prefixes for clean display */
function cleanSymbol(raw: string): string {
  return raw.replace(/^(NSE_EQ|BSE_EQ)[|:]/, '');
}

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const isBullishStatus = (status?: string | null) => (status ?? '').toUpperCase().includes('BULLISH');
const formatCurrency = (value: string | number) => `Rs ${value}`;

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

interface Stock {
  name: string;
  symbol: string;
  key: string;
}

interface CandleData {
  time: string;
  fullTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
  sma20?: number;
  sma50?: number;
}

interface HistoricalResponse {
  status?: string;
  data?: {
    candles?: Array<[string, number, number, number, number, number]>;
  };
  errors?: Array<{ message?: string }>;
  error?: string;
  meta?: {
    source?: string;
    notice?: string;
  };
}

interface AiAnalysisResponse {
  analysis: string;
  sources?: Array<{ title?: string; url?: string }>;
  confidence?: number;
  recommendation?: string;
  provider?: string;
}

const POPULAR_STOCKS = [
  { name: "RELIANCE INDUSTRIES LTD", symbol: "RELIANCE", key: "NSE_EQ|INE002A01018" },
  { name: "TATA CONSULTANCY SERVICES LTD", symbol: "TCS", key: "NSE_EQ|INE467B01029" },
  { name: "HDFC BANK LTD", symbol: "HDFCBANK", key: "NSE_EQ|INE040A01034" },
  { name: "INFOSYS LTD", symbol: "INFY", key: "NSE_EQ|INE009A01021" },
  { name: "ICICI BANK LTD", symbol: "ICICIBANK", key: "NSE_EQ|INE090A01021" },
  { name: "STATE BANK OF INDIA", symbol: "SBIN", key: "NSE_EQ|INE062A01020" },
  { name: "BHARTI AIRTEL LTD", symbol: "BHARTIARTL", key: "NSE_EQ|INE397D01024" },
  { name: "LARSEN & TOUBRO LTD", symbol: "LT", key: "NSE_EQ|INE018A01030" },
  { name: "ITC LTD", symbol: "ITC", key: "NSE_EQ|INE154A01025" },
];

/** Convert interval string to milliseconds for live candle bucketing */
function intervalToBucketMs(iv: string): number {
  if (iv === 'day') return 24 * 60 * 60 * 1000;
  const m = iv.match(/^(\d+)minute$/);
  if (m) return parseInt(m[1], 10) * 60 * 1000;
  return 60 * 1000; // default 1 minute
}

export default function App() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Stock[]>([]);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [interval, setInterval] = useState('5minute');
  const [fromDate, setFromDate] = useState(format(subDays(new Date(), 2), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [data, setData] = useState<CandleData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartType, setChartType] = useState<'line' | 'area' | 'bar' | 'candle'>('candle');
  const [showSMA20, setShowSMA20] = useState(false);
  const [showSMA50, setShowSMA50] = useState(false);
  const [advFilters, setAdvFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [activeTab, setActiveTab] = useState<'analytics' | 'quant' | 'institutional' | 'ultraQuant' | 'multibagger' | 'aiIntelligence'>('analytics');
  const [deskTheme, setDeskTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') {
      return 'dark';
    }
    return window.localStorage.getItem('stockpulse-desk-theme') === 'light' ? 'light' : 'dark';
  });
  
  // AI States
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiSources, setAiSources] = useState<any[]>([]);
  const [aiConfidence, setAiConfidence] = useState<number>(0);
  const [aiRecommendation, setAiRecommendation] = useState<string | null>(null);
  const [aiLastUpdated, setAiLastUpdated] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInsights, setAiInsights] = useState<any>(null);
  const [marketIntelligence, setMarketIntelligence] = useState<any>(null);
  const [aiNewsFeed, setAiNewsFeed] = useState<any[]>([]);
  const [quantData, setQuantData] = useState<any>(null);
  const [advancedIntelligence, setAdvancedIntelligence] = useState<any>(null);
  const [quantLoading, setQuantLoading] = useState(false);
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);
  const [historicalNotice, setHistoricalNotice] = useState<string | null>(null);
  const [historicalSource, setHistoricalSource] = useState<'upstox' | 'simulated' | null>(null);
  const [upstoxConnected, setUpstoxConnected] = useState<boolean | null>(null);
  // livePrice: ONLY set from SSE stream ticks. Never from candle data.
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [livePriceChange, setLivePriceChange] = useState<number | null>(null);
  const [livePriceChangePercent, setLivePriceChangePercent] = useState<number | null>(null);
  const [livePriceSource, setLivePriceSource] = useState<'upstox' | 'no_auth' | 'error' | null>(null);
  const [livePriceUpdated, setLivePriceUpdated] = useState<string | null>(null);
  const [streamErrorMsg, setStreamErrorMsg] = useState<string | null>(null);
  const livePricePrevRef = useRef<number | null>(null);
  const [livePriceFlash, setLivePriceFlash] = useState<'up' | 'down' | null>(null);
  const livePriceSourceRef = useRef<'upstox' | 'no_auth' | 'error' | null>(null);
  // lastCandleClose: fallback display only — clearly labeled as historical, never as live
  const [lastCandleClose, setLastCandleClose] = useState<number | null>(null);
  // Live chart data — mirrors `data` but last candle close is updated in real-time
  const [liveChartData, setLiveChartData] = useState<CandleData[]>([]);
  const liveIntervalRef = useRef<string>('1minute');
  const liveCandleRef = useRef<CandleData | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  // Market Dynamics live state
  const [mdLastUpdated, setMdLastUpdated] = useState<string | null>(null);
  const [mdSectors, setMdSectors] = useState<any[]>([]);
  const [mdSentiment, setMdSentiment] = useState<any>(null);
  const [mdMomentum, setMdMomentum] = useState<any[]>([]);
  const [mdFlash, setMdFlash] = useState(false);

  // Watchlist
  const [watchlist, setWatchlist] = useState<Array<{symbol: string; name: string; key: string}>>([]);
  const addToWatchlist = (s: {symbol: string; name: string; key: string}) => {
    setWatchlist(prev => prev.find(w => w.key === s.key) ? prev : [...prev, s].slice(-8));
  };
  
  const searchRef = useRef<HTMLDivElement>(null);
  const isUltraQuantTab = activeTab === 'ultraQuant';
  const isMultibaggerTab = activeTab === 'multibagger';
  const isDeskLight = deskTheme === 'light';
  const quantShellClass = isDeskLight
    ? 'bg-white/90 border-zinc-200 text-zinc-900 shadow-[0_30px_90px_rgba(15,23,42,0.12)]'
    : 'bg-zinc-900/50 border-white/5 text-white shadow-xl';
  const quantSubPanelClass = isDeskLight
    ? 'bg-zinc-50 border-zinc-200'
    : 'bg-black/20 border-white/5';

  // Check for AI Studio API Key
  useEffect(() => {
    const checkApiKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      }
    };
    checkApiKey();
  }, []);

  // Check Upstox connection status
  useEffect(() => {
    const checkUpstox = async () => {
      try {
        const res = await fetch('/api/upstox/connection-info');
        const json = await res.json();
        setUpstoxConnected(json.connected === true || json.isAuthenticated === true);
      } catch {
        setUpstoxConnected(false);
      }
    };
    checkUpstox();
    const id = window.setInterval(checkUpstox, 60000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    window.localStorage.setItem('stockpulse-desk-theme', deskTheme);
  }, [deskTheme]);

  // Market Dynamics — poll sectors, sentiment, momentum every 5s
  useEffect(() => {
    const fetchMD = async () => {
      try {
        const [sectors, sentiment, momentum] = await Promise.all([
          fetch('/api/quant/sectors').then(r => r.json()),
          fetch('/api/quant/sentiment').then(r => r.json()),
          fetch('/api/quant/momentum').then(r => r.json()),
        ]);
        setMdSectors(Array.isArray(sectors) ? sectors : []);
        setMdSentiment(sentiment);
        setMdMomentum(Array.isArray(momentum) ? momentum.slice(0, 5) : []);
        setMdLastUpdated(new Date().toLocaleTimeString());
        setMdFlash(true);
        setTimeout(() => setMdFlash(false), 400);
      } catch { /* silent — show stale data */ }
    };
    fetchMD();
    const id = window.setInterval(fetchMD, 5000);
    return () => window.clearInterval(id);
  }, []);
  // Keep liveIntervalRef in sync so SSE candle bucketing uses correct interval
  useEffect(() => {
    liveIntervalRef.current = interval;
  }, [interval]);

  // Autocomplete is now handled by AssetSearch component (useStockSearch hook)

  // Initial fetch and periodic refresh for Quant Lab
  useEffect(() => {
    fetchQuantData();
    const intervalId = window.setInterval(() => {
      fetchQuantData();
    }, 30000); // Refresh every 30s
    return () => window.clearInterval(intervalId);
  }, []);

  // Periodic refresh for AI Insights if stock is selected
  useEffect(() => {
    if (!selectedStock) return;
    const intervalId = window.setInterval(() => {
      fetchAiInsights(selectedStock.symbol);
    }, 60000); // Refresh every 60s
    return () => window.clearInterval(intervalId);
  }, [selectedStock]);

  // SSE live stream — connects when a stock is selected, streams ticks every 1s
  useEffect(() => {
    // Close any existing SSE connection
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }

    if (!selectedStock) {
      setLivePrice(null);
      setLivePriceChange(null);
      setLivePriceChangePercent(null);
      setLivePriceSource(null);
      setLivePriceUpdated(null);
      setLastCandleClose(null);
      setStreamErrorMsg(null);
      livePricePrevRef.current = null;
      livePriceSourceRef.current = null;
      liveCandleRef.current = null;
      return;
    }

    liveIntervalRef.current = interval;

    const sse = new EventSource(
      `/api/stocks/stream?instrumentKey=${encodeURIComponent(selectedStock.key)}`
    );
    sseRef.current = sse;

    sse.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const now = new Date();
        const nowStr = now.toLocaleTimeString();

        if (msg.type === 'tick') {
          const ltp: number = msg.ltp;
          const prev = livePricePrevRef.current;

          // Flash animation on price change
          if (prev !== null && ltp !== prev) {
            setLivePriceFlash(ltp > prev ? 'up' : 'down');
            setTimeout(() => setLivePriceFlash(null), 600);
          }
          livePricePrevRef.current = ltp;

          // Update hero panel — ONLY real Upstox LTP sets livePrice
          setLivePrice(ltp);
          setLivePriceChange(msg.change ?? null);
          setLivePriceChangePercent(msg.changePercent ?? null);
          livePriceSourceRef.current = 'upstox';
          setLivePriceSource('upstox');
          setLivePriceUpdated(nowStr);
          setStreamErrorMsg(null); // clear any previous error

          // ── Live candle update ──
          const bucketMs = intervalToBucketMs(liveIntervalRef.current);
          const bucketStart = Math.floor(now.getTime() / bucketMs) * bucketMs;
          const bucketLabel = format(new Date(bucketStart), liveIntervalRef.current === 'day' ? 'MMM dd' : 'HH:mm');
          const bucketFull = format(new Date(bucketStart), 'yyyy-MM-dd HH:mm');

          const existing = liveCandleRef.current;

          if (!existing || existing.timestamp !== bucketStart) {
            if (existing) {
              setLiveChartData(prev => {
                const updated = [...prev];
                if (updated.length > 0 && updated[updated.length - 1].timestamp === existing.timestamp) {
                  updated[updated.length - 1] = { ...existing };
                } else {
                  updated.push({ ...existing });
                }
                return updated;
              });
            }
            liveCandleRef.current = {
              time: bucketLabel,
              fullTime: bucketFull,
              open: ltp, high: ltp, low: ltp, close: ltp,
              volume: 0, timestamp: bucketStart,
            };
          } else {
            liveCandleRef.current = {
              ...existing,
              high: Math.max(existing.high, ltp),
              low: Math.min(existing.low, ltp),
              close: ltp,
            };
          }

          const lc = liveCandleRef.current;
          setLiveChartData(prev => {
            if (prev.length === 0) return prev;
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.timestamp === lc.timestamp) {
              updated[updated.length - 1] = { ...lc, sma20: last.sma20, sma50: last.sma50 };
            } else {
              updated.push({ ...lc });
            }
            return updated;
          });

          console.debug('[SSE] LTP:', ltp, '| bucket:', bucketLabel, '| time:', nowStr);

        } else if (msg.type === 'no_auth') {
          // Upstox not connected — livePrice stays null, show warning state
          setLivePrice(null);
          livePriceSourceRef.current = 'no_auth';
          setLivePriceSource('no_auth');
          setLivePriceUpdated(nowStr);
          setStreamErrorMsg(msg.message ?? 'Upstox not authenticated');
          console.debug('[SSE] no_auth — Upstox not connected');

        } else if (msg.type === 'error') {
          livePriceSourceRef.current = 'error';
          setLivePriceSource('error');
          setLivePriceUpdated(nowStr);
          setStreamErrorMsg(`[${msg.code ?? 'ERR'}] ${msg.message}`);
          console.warn('[SSE] error:', msg.code, msg.message);
        }
      } catch {
        // malformed event — ignore
      }
    };

    sse.onerror = () => {
      // SSE onerror fires on reconnect attempts — this is normal EventSource behavior.
      // The browser will auto-reconnect. Use ref (not state) to avoid stale closure.
      if (livePriceSourceRef.current === null) {
        livePriceSourceRef.current = 'error';
        setLivePriceSource('error');
        setStreamErrorMsg('Stream connecting...');
      }
      console.debug('[SSE] onerror fired — browser will auto-reconnect');
    };

    return () => {
      sse.close();
      sseRef.current = null;
    };
  }, [selectedStock]);

  // Close suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSuggestions([]);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Calculate Simple Moving Average via Java Backend
  const calculateSMA = async (data: any[], period: number) => {
    try {
      const json = await fetchJson<{ sma?: number[] }>('/api/stocks/sma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, period })
      });
      return json.sma || [];
    } catch (e) {
      console.error("Failed to calculate SMA", e);
      return [];
    }
  };

  const fetchData = async (stockOverride?: Stock | null, intervalOverride?: string, fromDateOverride?: string) => {
    const stockToLoad = stockOverride ?? selectedStock;
    const iv = intervalOverride ?? interval;

    if (!stockToLoad) {
      setError('Please select a stock first');
      return;
    }

    // Auto-compute date range based on interval
    const today = new Date();
    let autoFrom: string;
    let autoTo: string = format(today, 'yyyy-MM-dd');
    switch (iv) {
      case '1minute':
        autoFrom = format(today, 'yyyy-MM-dd');
        break;
      case '5minute':
        autoFrom = format(subDays(today, 28), 'yyyy-MM-dd');  // 1 month of 5m data
        break;
      case '30minute':
        autoFrom = format(subDays(today, 85), 'yyyy-MM-dd');  // 1 quarter
        break;
      case 'week':
        autoFrom = format(subDays(today, 365 * 5), 'yyyy-MM-dd'); // 5 years
        break;
      case 'day':
      default:
        autoFrom = format(subDays(today, 365), 'yyyy-MM-dd');  // 1 year
        break;
    }
    // Allow caller to override from-date (e.g. load more history)
    if (fromDateOverride) autoFrom = fromDateOverride;

    setLoading(true);
    setError(null);
    setHistoricalNotice(null);
    setHistoricalSource(null);
    setAiAnalysis(null);
    try {
      const json = await fetchJson<HistoricalResponse>(
        `/api/stocks/historical?instrumentKey=${encodeURIComponent(stockToLoad.key)}&interval=${iv}&fromDate=${autoFrom}&toDate=${autoTo}`
      );

      if (json.status === 'error') {
        throw new Error(json.errors?.[0]?.message || 'Failed to fetch data');
      }

      if (!json.data || !json.data.candles || json.data.candles.length === 0) {
        throw new Error('No data found for the selected criteria. Try a different date range.');
      }

      // Upstox returns [time, open, high, low, close, volume]
      const rawCandles = [...json.data.candles].reverse();
      setHistoricalNotice(json.meta?.notice || null);
      setHistoricalSource((json.meta?.source as 'upstox' | 'simulated' | undefined) ?? null);
      
      const smaData = rawCandles.map(c => ({ close: c[4] }));
      const [sma20Values, sma50Values] = await Promise.all([
        calculateSMA(smaData, 20),
        calculateSMA(smaData, 50)
      ]);

      const formattedData: CandleData[] = rawCandles.map((c: any, idx: number) => ({
        time: format(parseISO(c[0]), (iv === 'day' || iv === 'week') ? 'MMM dd' : 'HH:mm'),
        fullTime: format(parseISO(c[0]), 'yyyy-MM-dd HH:mm'),
        open: c[1],
        high: c[2],
        low: c[3],
        close: c[4],
        volume: c[5],
        timestamp: new Date(c[0]).getTime(),
        sma20: sma20Values[idx] || undefined,
        sma50: sma50Values[idx] || undefined
      }));

      setData(formattedData);
      // Sync live chart data with fresh historical load
      setLiveChartData(formattedData);
      liveCandleRef.current = null; // reset live candle on new data load

      // Store last candle close for fallback display ONLY — never used as live price
      if (formattedData.length > 0) {
        setLastCandleClose(formattedData[formattedData.length - 1].close);
        console.debug('[Historical] Last candle close:', formattedData[formattedData.length - 1].close,
          '| time:', formattedData[formattedData.length - 1].fullTime,
          '| This is NOT the live price');
      }
      
      // Fetch AI Insights (Mocked but enhanced)
      fetchAiInsights(stockToLoad.symbol);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  // Load more historical data — prepends older candles to existing data
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreHistory = async () => {
    if (!selectedStock || loadingMore || data.length === 0) return;
    const iv = interval;
    // Figure out how far back to go: extend from the oldest candle we have
    const oldestTs = data[0].timestamp;
    const oldestDate = new Date(oldestTs);
    const toDate = format(subDays(oldestDate, 1), 'yyyy-MM-dd');
    // Chunk size per interval
    const chunkDays: Record<string, number> = {
      '5minute': 28, '30minute': 85, 'day': 365, 'week': 365 * 5,
    };
    const days = chunkDays[iv] ?? 28;
    const fromDate = format(subDays(new Date(toDate), days), 'yyyy-MM-dd');
    setLoadingMore(true);
    try {
      const json = await fetchJson<HistoricalResponse>(
        `/api/stocks/historical?instrumentKey=${encodeURIComponent(selectedStock.key)}&interval=${iv}&fromDate=${fromDate}&toDate=${toDate}`
      );
      if (json.data?.candles?.length) {
        const rawCandles = [...json.data.candles].reverse();
        const smaData = rawCandles.map((c: any) => ({ close: c[4] }));
        const [sma20Values, sma50Values] = await Promise.all([
          calculateSMA(smaData, 20),
          calculateSMA(smaData, 50),
        ]);
        const older: CandleData[] = rawCandles.map((c: any, idx: number) => ({
          time: format(parseISO(c[0]), (iv === 'day' || iv === 'week') ? 'MMM dd' : 'HH:mm'),
          fullTime: format(parseISO(c[0]), 'yyyy-MM-dd HH:mm'),
          open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5],
          timestamp: new Date(c[0]).getTime(),
          sma20: sma20Values[idx] || undefined,
          sma50: sma50Values[idx] || undefined,
        }));
        // Prepend older candles, deduplicate by timestamp
        setData(prev => {
          const existingTs = new Set(prev.map(c => c.timestamp));
          const newCandles = older.filter(c => !existingTs.has(c.timestamp));
          return [...newCandles, ...prev];
        });
        setLiveChartData(prev => {
          const existingTs = new Set(prev.map(c => c.timestamp));
          const newCandles = older.filter(c => !existingTs.has(c.timestamp));
          return [...newCandles, ...prev];
        });
      }
    } catch (err) {
      console.error('[loadMoreHistory] failed:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const fetchAiInsights = async (symbol: string) => {
    try {
      const [momentum, breakouts, sentiment, psychology, intelligence, news] = await Promise.all([
        fetchJson<any[]>('/api/premium/momentum'),
        fetchJson<any[]>('/api/premium/breakouts'),
        fetchJson<any>('/api/premium/sentiment'),
        fetchJson<any>(`/api/premium/psychology?symbol=${symbol}`),
        fetchJson<any>('/api/premium/market-intelligence'),
        fetchJson<any[]>('/api/premium/ai-news-feed')
      ]);
      
      setAiInsights({ momentum, breakouts, sentiment, psychology });
      setMarketIntelligence(intelligence);
      setAiNewsFeed(news);
      
      // Fetch Quant Data
      fetchQuantData();
    } catch (err) {
      console.error('AI Insights error:', err);
    }
  };

  const fetchQuantData = async () => {
    setQuantLoading(true);
    try {
      const [momentum, breakouts, surges, indicators, sectors, flow, trends, sentiment, advanced] = await Promise.all([
        fetchJson<any[]>('/api/quant/momentum'),
        fetchJson<any[]>('/api/quant/breakouts'),
        fetchJson<any[]>('/api/quant/volume-surge'),
        fetchJson<any[]>('/api/quant/indicators'),
        fetchJson<any[]>('/api/quant/sectors'),
        fetchJson<any[]>('/api/quant/money-flow'),
        fetchJson<any[]>('/api/quant/trends'),
        fetchJson<any>('/api/quant/sentiment'),
        fetchJson<any>('/api/quant/advanced-intelligence')
      ]);
      
      setQuantData({ momentum, breakouts, surges, indicators, sectors, flow, trends, sentiment });
      setAdvancedIntelligence(advanced);
    } catch (err) {
      console.error('Quant Data error:', err);
    } finally {
      setQuantLoading(false);
    }
  };

  const runAiAnalysis = async () => {
    if (!selectedStock || data.length === 0) {
      setAiRecommendation(null);
      setAiConfidence(0);
      setAiSources([]);
      setAiAnalysis('### AI Deep Scan Unavailable\n\nLoad a stock and fetch historical candles first, then run the scan again.');
      setAiLastUpdated(new Date().toLocaleTimeString());
      return;
    }
    
    // If key selection is required but not done
    if (window.aistudio?.hasSelectedApiKey) {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      if (!hasKey) {
        await window.aistudio.openSelectKey();
        setHasApiKey(true);
        // Proceed after selection
      }
    }

    setAiLoading(true);
    try {
      const json = await fetchJson<AiAnalysisResponse>('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selectedStock.symbol,
          data: data,
          interval: interval,
          quantData: quantData,
          advancedIntelligence: advancedIntelligence
        })
      });

      setAiAnalysis(json.analysis);
      setAiSources(json.sources || []);
      setAiConfidence(json.confidence || 0);
      setAiRecommendation(json.recommendation || null);
      setAiLastUpdated(new Date().toLocaleTimeString());
    } catch (err: any) {
      console.error('AI Analysis error:', err);
      setAiAnalysis(`### Analysis Failed\n\n${err.message}\n\n**Troubleshooting:**\n1. Ensure you have selected a valid API key.\n2. Check your internet connection.\n3. Try again in a few moments.`);
    } finally {
      setAiLoading(false);
    }
  };

  const downloadCSV = () => {
    if (data.length === 0) return;
    
    const headers = ['Timestamp', 'Open', 'High', 'Low', 'Close', 'Volume'];
    const csvRows = data.map(row => [
      row.fullTime,
      row.open,
      row.high,
      row.low,
      row.close,
      row.volume
    ].join(','));
    
    const csvContent = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${selectedStock?.symbol || 'stock'}_data.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-white/90 backdrop-blur-md border border-zinc-200 p-3 rounded-xl shadow-xl text-xs font-mono">
          <p className="font-bold text-zinc-900 mb-1">{d.fullTime}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-zinc-500">Open:</span> <span className="text-right font-medium">{d.open.toFixed(2)}</span>
            <span className="text-zinc-500">High:</span> <span className="text-right font-medium text-emerald-600">{d.high.toFixed(2)}</span>
            <span className="text-zinc-500">Low:</span> <span className="text-right font-medium text-rose-600">{d.low.toFixed(2)}</span>
            <span className="text-zinc-500">Close:</span> <span className="text-right font-medium text-indigo-600">{d.close.toFixed(2)}</span>
            <span className="text-zinc-500">Vol:</span> <span className="text-right font-medium">{d.volume.toLocaleString()}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-zinc-100 font-sans selection:bg-indigo-500/30 overflow-x-hidden">
      {/* Market Ticker */}
      <div className="bg-indigo-600/10 border-b border-white/5 py-1.5 overflow-hidden whitespace-nowrap">
        <div className="flex animate-marquee gap-12 items-center">
          {[
            { s: "NIFTY 50", v: "22,453.20", c: "+0.45%" },
            { s: "SENSEX", v: "73,876.12", c: "+0.38%" },
            { s: "RELIANCE", v: "2,987.45", c: "-0.12%" },
            { s: "TCS", v: "4,120.30", c: "+1.20%" },
            { s: "HDFCBANK", v: "1,450.15", c: "+0.85%" },
            { s: "INFY", v: "1,620.45", c: "-0.45%" },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px] font-bold tracking-wider">
              <span className="text-zinc-400">{item.s}</span>
              <span className="text-white">{item.v}</span>
              <span className={item.c.startsWith('+') ? "text-emerald-400" : "text-rose-400"}>{item.c}</span>
            </div>
          ))}
          {/* Duplicate for seamless loop */}
          {[
            { s: "NIFTY 50", v: "22,453.20", c: "+0.45%" },
            { s: "SENSEX", v: "73,876.12", c: "+0.38%" },
            { s: "RELIANCE", v: "2,987.45", c: "-0.12%" },
            { s: "TCS", v: "4,120.30", c: "+1.20%" },
            { s: "HDFCBANK", v: "1,450.15", c: "+0.85%" },
            { s: "INFY", v: "1,620.45", c: "-0.45%" },
          ].map((item, i) => (
            <div key={`dup-${i}`} className="flex items-center gap-2 text-[10px] font-bold tracking-wider">
              <span className="text-zinc-400">{item.s}</span>
              <span className="text-white">{item.v}</span>
              <span className={item.c.startsWith('+') ? "text-emerald-400" : "text-rose-400"}>{item.c}</span>
            </div>
          ))}
        </div>
      </div>

      {/* AI News Ticker */}
      {aiNewsFeed.length > 0 && (
        <div className="bg-indigo-500/10 border-b border-indigo-500/20 py-2 overflow-hidden whitespace-nowrap">
          <div className="animate-marquee inline-block">
            {aiNewsFeed.map((item, idx) => (
              <span key={idx} className="mx-8 text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2 inline-flex">
                <Sparkles className="w-3 h-3" />
                <span className="text-zinc-500 mr-2">[{item.time}]</span>
                {item.text}
              </span>
            ))}
            {/* Duplicate for seamless loop */}
            {aiNewsFeed.map((item, idx) => (
              <span key={`dup-${idx}`} className="mx-8 text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2 inline-flex">
                <Sparkles className="w-3 h-3" />
                <span className="text-zinc-500 mr-2">[{item.time}]</span>
                {item.text}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Top Picks Banner */}
      {marketIntelligence?.topTradeIdeas && (
        <div className="bg-indigo-600 border-b border-indigo-500 py-2.5 px-4 overflow-hidden relative group">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4 animate-pulse-slow">
              <div className="bg-white/20 p-1 rounded-md">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <p className="text-[11px] font-bold text-white uppercase tracking-widest flex items-center gap-2">
                Top AI Pick: <span className="text-indigo-100">{cleanSymbol(marketIntelligence.topTradeIdeas[0].symbol)}</span>
                <span className="bg-emerald-400 text-indigo-900 px-1.5 py-0.5 rounded text-[9px] font-black">BUY</span>
              </p>
              <p className="hidden md:block text-[10px] text-indigo-200 font-medium italic">
                "{marketIntelligence.topTradeIdeas[0].setup}" - Target: {formatCurrency(marketIntelligence.topTradeIdeas[0].target)}
              </p>
            </div>
            <button 
              onClick={() => {
                const stock = POPULAR_STOCKS.find(s => s.symbol === marketIntelligence.topTradeIdeas[0].symbol) || null;
                setSelectedStock(stock);
                setQuery(marketIntelligence.topTradeIdeas[0].symbol);
                if (stock) {
                  fetchData(stock);
                }
              }}
              className="text-[10px] font-black text-white uppercase tracking-tighter hover:underline flex items-center gap-1"
            >
              Analyze Now <ChevronDown className="w-3 h-3 -rotate-90" />
            </button>
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
        </div>
      )}

      {/* Header */}
      <header className="border-b border-white/[0.06] bg-black/60 backdrop-blur-2xl sticky top-0 z-50 shadow-[0_1px_0_rgba(255,255,255,0.04),0_4px_32px_rgba(0,0,0,0.6)]">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30 ring-1 ring-white/10">
              <TrendingUp className="text-white w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight leading-none bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">StockPulse</h1>
              <p className="text-[9px] text-indigo-400/60 font-bold uppercase tracking-[0.2em] mt-0.5">Premium Terminal</p>
            </div>
          </div>
          
          <div className="hidden md:flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            {[
              { id: 'analytics',     label: 'Analytics',      badge: null,  badgeStyle: '' },
              { id: 'institutional', label: 'Institutional',  badge: 'PRO', badgeStyle: 'bg-violet-500 text-white' },
              { id: 'ultraQuant',    label: 'Ultra Quant',    badge: 'AI',  badgeStyle: 'bg-cyan-400 text-slate-950' },
              { id: 'multibagger',   label: 'Multibagger',    badge: 'NEW', badgeStyle: 'bg-violet-400 text-slate-950' },
              { id: 'aiIntelligence',label: 'AI Intelligence',badge: 'AI',  badgeStyle: 'bg-gradient-to-r from-violet-500 to-cyan-500 text-white' },
            ].map(({ id, label, badge, badgeStyle }) => (
              <button key={id}
                onClick={() => setActiveTab(id as any)}
                className={cn(
                  "relative flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all duration-200",
                  activeTab === id
                    ? "bg-white/[0.08] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    : "text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]"
                )}
              >
                {label}
                {badge && (
                  <span className={cn("text-[7px] font-black px-1 py-0.5 rounded leading-none", badgeStyle)}>
                    {badge}
                  </span>
                )}
                {activeTab === id && (
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" />
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-xs font-bold text-white/80">Premium Account</span>
              <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]" /> Live Market
              </div>
            </div>
            {/* Upstox Connection Button */}
            <a
              href="/upstox/connect"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "hidden sm:flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[9px] font-black uppercase tracking-[0.18em] transition-all",
                upstoxConnected === true
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                  : upstoxConnected === false
                  ? "border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 animate-pulse"
                  : "border-white/10 bg-white/5 text-zinc-400"
              )}
            >
              <div className={cn(
                "w-1.5 h-1.5 rounded-full",
                upstoxConnected === true ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" :
                upstoxConnected === false ? "bg-rose-500" : "bg-zinc-600"
              )} />
              {upstoxConnected === true ? "Upstox Live" : upstoxConnected === false ? "Connect Upstox" : "Upstox..."}
            </a>
            <button
              type="button"
              onClick={() => setDeskTheme((current) => current === 'dark' ? 'light' : 'dark')}
              className="hidden sm:flex h-9 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
            >
              {deskTheme === 'dark' ? <SunMedium className="w-4 h-4 text-amber-300" /> : <MoonStar className="w-4 h-4 text-cyan-300" />}
              Desk
            </button>
            <div className="h-9 w-9 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center hover:bg-white/[0.08] transition cursor-pointer">
              <Maximize2 className="w-4 h-4 text-zinc-400" />
            </div>
          </div>
        </div>

        {/* Mobile Navigation Tabs */}
        <div className="md:hidden flex overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] items-center gap-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 border-t border-white/[0.04] bg-black/30">
          {[
            { id: 'analytics',     label: 'Analytics',       badge: null,  badgeStyle: '' },
            { id: 'institutional', label: 'Institutional',   badge: 'PRO', badgeStyle: 'bg-violet-500 text-white' },
            { id: 'ultraQuant',    label: 'Ultra Quant',     badge: 'AI',  badgeStyle: 'bg-cyan-400 text-slate-950' },
            { id: 'multibagger',   label: 'Multibagger',     badge: 'NEW', badgeStyle: 'bg-violet-400 text-slate-950' },
            { id: 'aiIntelligence',label: 'AI Intelligence', badge: 'AI',  badgeStyle: 'bg-gradient-to-r from-violet-500 to-cyan-500 text-white' },
          ].map(({ id, label, badge, badgeStyle }) => (
            <button key={id}
              onClick={() => setActiveTab(id as any)}
              className={cn(
                "relative flex items-center gap-1 py-3 px-3 whitespace-nowrap text-[10px] font-bold uppercase tracking-wider transition-all border-b-2 flex-shrink-0",
                activeTab === id ? "text-white border-indigo-400" : "text-zinc-500 border-transparent hover:text-zinc-300"
              )}
            >
              {label}
              {badge && (
                <span className={cn("text-[7px] font-black px-1 py-0.5 rounded leading-none", badgeStyle)}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-3 py-4">
        {isUltraQuantTab ? (
          <UltraQuantTab />
        ) : isMultibaggerTab ? (
          <MultibaggerScanner />
        ) : activeTab === 'aiIntelligence' ? (
          <AIStockIntelligenceTab />
        ) : activeTab === 'institutional' ? (
          <InstitutionalAnalytics
            symbol={selectedStock?.symbol || 'MARKET'}
            instrumentKey={selectedStock?.key}
            candles={data}
            onAnalyze={runAiAnalysis}
            theme={deskTheme}
            aiAnalysis={aiAnalysis}
            aiLoading={aiLoading}
            aiConfidence={aiConfidence}
            aiRecommendation={aiRecommendation}
            aiLastUpdated={aiLastUpdated}
            aiSources={aiSources}
          />
        ) : (
        <TerminalLayout
          query={query} setQuery={setQuery}
          selectedStock={selectedStock} setSelectedStock={setSelectedStock}
          suggestions={suggestions} setSuggestions={setSuggestions}
          searchRef={searchRef}
          interval={interval} setInterval={setInterval}
          data={data} liveChartData={liveChartData}
          loading={loading} error={error}
          chartType={chartType} setChartType={setChartType}
          showSMA20={showSMA20} setShowSMA20={setShowSMA20}
          showSMA50={showSMA50} setShowSMA50={setShowSMA50}
          livePrice={livePrice} livePriceChange={livePriceChange}
          livePriceChangePercent={livePriceChangePercent} livePriceSource={livePriceSource}
          livePriceUpdated={livePriceUpdated} livePriceFlash={livePriceFlash}
          lastCandleClose={lastCandleClose} historicalSource={historicalSource}
          mdSectors={mdSectors} mdSentiment={mdSentiment} mdMomentum={mdMomentum} mdFlash={mdFlash}
          quantData={quantData}
          aiAnalysis={aiAnalysis} aiSources={aiSources} aiConfidence={aiConfidence}
          aiRecommendation={aiRecommendation} aiLastUpdated={aiLastUpdated}
          aiLoading={aiLoading} aiInsights={aiInsights} advancedIntelligence={advancedIntelligence}
          runAiAnalysis={runAiAnalysis} downloadCSV={downloadCSV}
          fetchData={fetchData}
          loadMoreHistory={loadMoreHistory} loadingMore={loadingMore}
          addToWatchlist={addToWatchlist}
          watchlist={watchlist} setWatchlist={setWatchlist}
          activeTab={activeTab} setActiveTab={setActiveTab}
          quantShellClass={quantShellClass} quantSubPanelClass={quantSubPanelClass} isDeskLight={isDeskLight}
          mdLastUpdated={mdLastUpdated}
        />
        )}
      </main>

      <footer className="max-w-[1600px] mx-auto px-4 py-8 border-t border-white/[0.05] mt-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 opacity-40">
            <TrendingUp className="w-3.5 h-3.5" />
            <span className="text-xs font-bold tracking-wide">StockPulse</span>
          </div>
          <p className="text-[10px] text-zinc-600">Powered by Upstox API &mdash; Data delayed 15 mins on free accounts</p>
          <div className="flex gap-4 text-[10px] font-medium text-zinc-600">
            <a href="#" className="hover:text-zinc-300 transition-colors">Terms</a>
            <a href="#" className="hover:text-zinc-300 transition-colors">Privacy</a>
            <a href="#" className="hover:text-zinc-300 transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
