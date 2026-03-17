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
import AssetSearch from './components/AssetSearch';
import AnalyticsFilters, { FilterState, DEFAULT_FILTERS } from './components/AnalyticsFilters';
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

export default function App() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Stock[]>([]);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [interval, setInterval] = useState('1minute');
  const [fromDate, setFromDate] = useState(format(subDays(new Date(), 2), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [data, setData] = useState<CandleData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartType, setChartType] = useState<'line' | 'area' | 'bar'>('area');
  const [showSMA20, setShowSMA20] = useState(false);
  const [showSMA50, setShowSMA50] = useState(false);
  const [advFilters, setAdvFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [activeTab, setActiveTab] = useState<'analytics' | 'quant' | 'institutional' | 'ultraQuant' | 'multibagger'>('analytics');
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

  useEffect(() => {
    window.localStorage.setItem('stockpulse-desk-theme', deskTheme);
  }, [deskTheme]);

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

  const fetchData = async (stockOverride?: Stock | null) => {
    const stockToLoad = stockOverride ?? selectedStock;

    if (!stockToLoad) {
      setError('Please select a stock first');
      return;
    }

    setLoading(true);
    setError(null);
    setHistoricalNotice(null);
    setHistoricalSource(null);
    setAiAnalysis(null); // Reset AI analysis on new data fetch
    try {
      if (new Date(fromDate).getTime() > new Date(toDate).getTime()) {
        throw new Error('Start date must be earlier than end date.');
      }

      const json = await fetchJson<HistoricalResponse>(
        `/api/stocks/historical?instrumentKey=${encodeURIComponent(stockToLoad.key)}&interval=${interval}&fromDate=${fromDate}&toDate=${toDate}`
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
        time: format(parseISO(c[0]), interval === 'day' ? 'MMM dd' : 'HH:mm'),
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
      
      // Fetch AI Insights (Mocked but enhanced)
      fetchAiInsights(stockToLoad.symbol);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
      setData([]);
    } finally {
      setLoading(false);
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
      <header className="border-b border-white/5 bg-black/40 backdrop-blur-xl sticky top-0 z-50 shadow-2xl shadow-black/50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <TrendingUp className="text-white w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight leading-none">StockPulse</h1>
              <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-widest mt-1">Premium Terminal</p>
            </div>
          </div>
          
          <div className="hidden md:flex items-center gap-8 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            <button 
              onClick={() => setActiveTab('analytics')}
              className={cn("transition-colors pb-5 mt-5 border-b-2", activeTab === 'analytics' ? "text-indigo-400 border-indigo-400" : "hover:text-zinc-300 border-transparent")}
            >
              Analytics
            </button>

            <button 
              onClick={() => setActiveTab('institutional')}
              className={cn("transition-colors pb-5 mt-5 border-b-2 relative", activeTab === 'institutional' ? "text-indigo-400 border-indigo-400" : "hover:text-zinc-300 border-transparent")}
            >
              Institutional
              <span className="absolute -top-1 -right-4 bg-violet-500 text-[8px] text-white px-1 rounded-sm animate-pulse font-bold">PRO</span>
            </button>
            <button 
              onClick={() => setActiveTab('ultraQuant')}
              className={cn("transition-colors pb-5 mt-5 border-b-2 relative", activeTab === 'ultraQuant' ? "text-cyan-300 border-cyan-300" : "hover:text-zinc-300 border-transparent")}
            >
              Ultra Quant
              <span className="absolute -top-1 -right-5 bg-cyan-400 text-[8px] text-slate-950 px-1 rounded-sm animate-pulse font-bold">AI</span>
            </button>
            <button 
              onClick={() => setActiveTab('multibagger')}
              className={cn("transition-colors pb-5 mt-5 border-b-2 relative", activeTab === 'multibagger' ? "text-violet-300 border-violet-300" : "hover:text-zinc-300 border-transparent")}
            >
              Multibagger
              <span className="absolute -top-1 -right-5 bg-violet-400 text-[8px] text-slate-950 px-1 rounded-sm animate-pulse font-bold">NEW</span>
            </button>
            <a href="#" className="hover:text-zinc-300 transition-colors">Watchlist</a>
            <a href="#" className="hover:text-zinc-300 transition-colors">Signals</a>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-xs font-bold">Premium Account</span>
              <div className="text-[10px] text-emerald-500 flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Market
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDeskTheme((current) => current === 'dark' ? 'light' : 'dark')}
              className="hidden sm:flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-300 transition hover:border-cyan-400/40 hover:text-white"
            >
              {deskTheme === 'dark' ? <SunMedium className="w-4 h-4 text-amber-300" /> : <MoonStar className="w-4 h-4 text-cyan-300" />}
              Desk
            </button>
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-zinc-800 to-zinc-700 border border-white/10 flex items-center justify-center">
              <Maximize2 className="w-4 h-4 text-zinc-400" />
            </div>
          </div>
        </div>

        {/* Mobile Navigation Tabs */}
        <div className="md:hidden flex overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] items-center gap-6 px-4 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 border-t border-white/5 bg-black/20">
          <button 
            onClick={() => setActiveTab('analytics')}
            className={cn("transition-colors py-3 whitespace-nowrap border-b-2", activeTab === 'analytics' ? "text-indigo-400 border-indigo-400" : "hover:text-zinc-300 border-transparent")}
          >
            Analytics
          </button>

          <button 
            onClick={() => setActiveTab('institutional')}
            className={cn("transition-colors py-3 whitespace-nowrap border-b-2 relative", activeTab === 'institutional' ? "text-indigo-400 border-indigo-400" : "hover:text-zinc-300 border-transparent")}
          >
            Institutional
            <span className="absolute top-1.5 -right-3 bg-violet-500 text-[7px] text-white px-1 rounded-sm animate-pulse font-bold">PRO</span>
          </button>
          <button 
            onClick={() => setActiveTab('ultraQuant')}
            className={cn("transition-colors py-3 whitespace-nowrap border-b-2 relative", activeTab === 'ultraQuant' ? "text-cyan-300 border-cyan-300" : "hover:text-zinc-300 border-transparent")}
          >
            Ultra Quant
            <span className="absolute top-1.5 -right-3 bg-cyan-400 text-[7px] text-slate-950 px-1 rounded-sm animate-pulse font-bold">AI</span>
          </button>
          <button 
            onClick={() => setActiveTab('multibagger')}
            className={cn("transition-colors py-3 whitespace-nowrap border-b-2 relative", activeTab === 'multibagger' ? "text-violet-300 border-violet-300" : "hover:text-zinc-300 border-transparent")}
          >
            Multibagger
            <span className="absolute top-1.5 -right-3 bg-violet-400 text-[7px] text-slate-950 px-1 rounded-sm animate-pulse font-bold">NEW</span>
          </button>
          <a href="#" className="hover:text-zinc-300 transition-colors py-3 whitespace-nowrap">Watchlist</a>
          <a href="#" className="hover:text-zinc-300 transition-colors py-3 whitespace-nowrap">Signals</a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {isUltraQuantTab ? (
          <UltraQuantTab />
        ) : isMultibaggerTab ? (
          <MultibaggerScanner />
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Controls Panel */}
          <div className="lg:col-span-3 space-y-6">
            <section className="bg-zinc-900/50 backdrop-blur-md rounded-3xl border border-white/5 p-5 shadow-2xl sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-8 flex items-center gap-2">
                <div className="w-1 h-4 bg-indigo-500 rounded-full" /> Terminal Control
              </h2>

              <div className="space-y-6">
                {/* Stock Search */}
                <AssetSearch
                  query={query}
                  onQueryChange={setQuery}
                  onSelect={(s) => {
                    setSelectedStock(s);
                    setSuggestions([]);
                  }}
                  containerRef={searchRef}
                />

                {/* Interval Selection */}
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2 ml-1">Resolution</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['1minute', '5minute', '30minute', 'day'].map((int) => (
                      <button
                        key={int}
                        onClick={() => setInterval(int)}
                        className={cn(
                          "py-2.5 px-3 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-all",
                          interval === int 
                            ? "bg-indigo-500/10 border-indigo-500/50 text-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.1)]" 
                            : "bg-black/20 border-white/5 text-zinc-500 hover:border-white/10 hover:text-zinc-300"
                        )}
                      >
                        {int.replace('minute', 'm').replace('day', '1D')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Indicators */}
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2 ml-1">Chart Overlays</label>
                  <div className="space-y-2">
                    <button 
                      onClick={() => setShowSMA20(!showSMA20)}
                      className={cn(
                        "w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition-all",
                        showSMA20 ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-black/20 border-white/5 text-zinc-500"
                      )}
                    >
                      SMA 20 <div className={cn("w-2 h-2 rounded-full", showSMA20 ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-zinc-700")} />
                    </button>
                    <button 
                      onClick={() => setShowSMA50(!showSMA50)}
                      className={cn(
                        "w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition-all",
                        showSMA50 ? "bg-orange-500/10 border-orange-500/30 text-orange-400" : "bg-black/20 border-white/5 text-zinc-500"
                      )}
                    >
                      SMA 50 <div className={cn("w-2 h-2 rounded-full", showSMA50 ? "bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]" : "bg-zinc-700")} />
                    </button>
                  </div>
                </div>

                {/* Date Range */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2 ml-1">Start Date</label>
                    <input
                      type="date"
                      className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-4 text-xs text-zinc-300 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2 ml-1">End Date</label>
                    <input
                      type="date"
                      className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-4 text-xs text-zinc-300 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                    />
                  </div>
                </div>

                {/* Advanced Filters */}
                <div className="border-t border-white/5 pt-4">
                  <AnalyticsFilters filters={advFilters} onChange={setAdvFilters} />
                </div>

                <button
                  onClick={() => fetchData()}
                  disabled={loading || !selectedStock}
                  className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:from-zinc-800 disabled:to-zinc-800 text-white font-bold py-4 rounded-2xl shadow-2xl shadow-indigo-500/20 transition-all flex items-center justify-center gap-3 mt-4 group"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <TrendingUp className="w-5 h-5 group-hover:scale-110 transition-transform" />}
                  Execute Query
                </button>
              </div>
            </section>
          </div>

          {/* Chart Panel */}
          <div className="lg:col-span-6 space-y-6">
            {/* Market Sentiment Bar */}
            {quantData && (
              <div className="bg-zinc-900/50 backdrop-blur-md rounded-2xl border border-white/5 p-4 flex flex-wrap items-center justify-between gap-3 shadow-xl">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full", isBullishStatus(quantData.sentiment.status) ? "bg-emerald-500" : "bg-rose-500")} />
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Market Mood</span>
                  </div>
                  <span className={cn("text-xs font-bold", isBullishStatus(quantData.sentiment.status) ? "text-emerald-400" : "text-rose-400")}>
                    {quantData.sentiment.status}
                  </span>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Signal Badges */}
                  {isBullishStatus(quantData.sentiment.status) && (
                    <span className="text-[9px] font-black px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 uppercase tracking-widest">Bullish</span>
                  )}
                  {!isBullishStatus(quantData.sentiment.status) && (
                    <span className="text-[9px] font-black px-2 py-1 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/20 uppercase tracking-widest">Bearish</span>
                  )}
                  {quantData.sentiment.confidence > 70 && (
                    <span className="text-[9px] font-black px-2 py-1 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 uppercase tracking-widest">High Momentum</span>
                  )}
                  {quantData.surges && quantData.surges.length > 3 && (
                    <span className="text-[9px] font-black px-2 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 uppercase tracking-widest">Volume Surge</span>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">A/D</span>
                    <span className="text-xs font-mono text-zinc-300">{quantData.sentiment.adRatio}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Conf</span>
                    <span className="text-xs font-mono text-indigo-400">{quantData.sentiment.confidence}%</span>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Signal Card (Simple View) */}
            {selectedStock && aiRecommendation && (
              <div className="bg-gradient-to-br from-zinc-900 to-black rounded-[2.5rem] border border-white/10 p-8 shadow-2xl mb-8 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-12 opacity-5 group-hover:opacity-10 transition-opacity">
                  <Target className="w-48 h-48 text-indigo-500" />
                </div>
                
                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                  <div className="flex items-center gap-6">
                    <div className={cn(
                      "w-24 h-24 rounded-[2rem] flex items-center justify-center shadow-2xl",
                      aiRecommendation === 'BUY' ? "bg-emerald-500 shadow-emerald-500/20" :
                      aiRecommendation === 'SELL' ? "bg-rose-500 shadow-rose-500/20" :
                      "bg-zinc-700 shadow-zinc-500/20"
                    )}>
                      <span className="text-2xl font-black text-white tracking-tighter">{aiRecommendation}</span>
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-white mb-1">
                        {cleanSymbol(selectedStock.symbol)}
                        <span className="text-zinc-500 text-sm font-medium ml-2">/ {selectedStock.name}</span>
                      </h3>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">AI Confidence</span>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <div 
                              key={s} 
                              className={cn(
                                "w-3 h-1 rounded-full",
                                s <= (aiConfidence / 20) ? (aiConfidence > 70 ? "bg-emerald-500" : "bg-indigo-500") : "bg-zinc-800"
                              )} 
                            />
                          ))}
                        </div>
                        <span className="text-xs font-mono font-bold text-zinc-300 ml-1">{aiConfidence}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 max-w-md">
                    <div className="bg-white/5 rounded-2xl p-5 border border-white/5">
                      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <Brain className="w-3 h-3 text-indigo-400" /> Why Buy?
                      </p>
                      <p className="text-sm text-zinc-300 leading-relaxed font-medium italic">
                        {aiAnalysis ? aiAnalysis.split('\n')[0].replace(/#+\s*/, '') : "Analyzing market dynamics..."}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 w-full md:w-auto">
                    <button 
                      onClick={runAiAnalysis}
                      disabled={aiLoading}
                      className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 text-white rounded-2xl font-bold text-sm shadow-xl shadow-indigo-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                      {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                      {aiLoading ? 'Running Audit...' : 'Full Technical Audit'}
                    </button>
                    <p className="text-[9px] text-zinc-600 text-center uppercase font-bold tracking-widest">Updated {aiLastUpdated || 'Just Now'}</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'analytics' ? (
              <>
                <div className="bg-zinc-900/50 backdrop-blur-md rounded-[2.5rem] border border-white/5 shadow-2xl overflow-hidden flex flex-col h-[700px]">
              {/* Chart Header */}
              <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between bg-black/20">
                <div className="flex items-center gap-6">
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      Market Dynamics {selectedStock && (
                        <span className="text-indigo-400 font-mono text-sm ml-2">
                          [{cleanSymbol(selectedStock.symbol)}]
                        </span>
                      )}
                    </h3>
                    <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-widest mt-1">Real-time algorithmic visualization</p>
                  </div>
                  <div className="h-8 w-[1px] bg-white/10 hidden sm:block" />
                  <div className="hidden sm:flex bg-black/40 p-1 rounded-xl border border-white/5">
                    {[
                      { id: 'area', icon: TrendingUp },
                      { id: 'line', icon: LineChartIcon },
                      { id: 'bar', icon: BarChart3 }
                    ].map((t) => (
                      <button 
                        key={t.id}
                        onClick={() => setChartType(t.id as any)}
                        className={cn(
                          "p-2 rounded-lg transition-all", 
                          chartType === t.id ? "bg-indigo-500 text-white shadow-lg" : "text-zinc-500 hover:text-zinc-300"
                        )}
                      >
                        <t.icon className="w-4 h-4" />
                      </button>
                    ))}
                  </div>
                </div>
                
                {data.length > 0 && (
                  <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-tighter">Current Price</p>
                      <p className="text-xl font-mono font-bold text-emerald-400 tracking-tighter">
                        {formatCurrency(data[data.length-1].close.toLocaleString(undefined, { minimumFractionDigits: 2 }))}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {(historicalNotice || historicalSource) && (
                <div className="mx-8 mb-2 flex flex-wrap items-center gap-2">
                  {historicalSource && (
                    <span className={cn(
                      "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]",
                      historicalSource === 'simulated'
                        ? "bg-amber-500/10 text-amber-300"
                        : "bg-emerald-500/10 text-emerald-300"
                    )}>
                      {historicalSource === 'simulated' ? 'Simulated Feed' : 'Upstox Feed'}
                    </span>
                  )}
                  {historicalNotice && (
                    <span className="text-[10px] text-zinc-500">{historicalNotice}</span>
                  )}
                </div>
              )}

              {/* Chart Body */}
              <div className="flex-1 p-8 relative min-h-0">
                {loading && (
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-md z-10 flex flex-col items-center justify-center gap-4">
                    <div className="relative">
                      <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                      <TrendingUp className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-400 w-6 h-6" />
                    </div>
                    <p className="text-xs font-bold text-zinc-400 uppercase tracking-[0.3em]">Synchronizing Data</p>
                  </div>
                )}

                {error && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-12 text-center">
                    <div className="w-20 h-20 bg-rose-500/10 rounded-3xl flex items-center justify-center border border-rose-500/20">
                      <AlertCircle className="w-10 h-10 text-rose-500" />
                    </div>
                    <div className="max-w-md">
                      <h4 className="text-xl font-bold text-white mb-2">System Disruption</h4>
                      <p className="text-sm text-zinc-500 leading-relaxed">{error}</p>
                    </div>
                    <button 
                      onClick={() => fetchData()}
                      className="bg-white/5 hover:bg-white/10 text-white px-8 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border border-white/10"
                    >
                      Re-establish Connection
                    </button>
                  </div>
                )}

                {!loading && !error && data.length === 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-12 text-center">
                    <div className="w-24 h-24 bg-indigo-500/5 rounded-[2rem] flex items-center justify-center border border-indigo-500/10 animate-pulse">
                      <TrendingUp className="w-12 h-12 text-indigo-500/40" />
                    </div>
                    <div className="max-w-xs">
                      <h4 className="text-lg font-bold text-zinc-300 mb-2">Awaiting Input</h4>
                      <p className="text-xs text-zinc-500 leading-relaxed uppercase tracking-wider">Select an instrument and define parameters to initialize visualization</p>
                    </div>
                  </div>
                )}

                {data.length > 0 && (
                  <div className="w-full h-full">
                    <ResponsiveContainer width="100%" height="100%">
                      {chartType === 'area' ? (
                        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                          <XAxis 
                            dataKey="time" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{fontSize: 9, fill: '#52525b', fontWeight: 600}}
                            minTickGap={40}
                            dy={10}
                          />
                          <YAxis 
                            domain={['auto', 'auto']} 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{fontSize: 9, fill: '#52525b', fontWeight: 600}}
                            orientation="right"
                            dx={10}
                          />
                          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }} />
                          <Area 
                            type="monotone" 
                            dataKey="close" 
                            stroke="#6366f1" 
                            strokeWidth={3}
                            fillOpacity={1} 
                            fill="url(#colorPrice)" 
                            animationDuration={2000}
                          />
                          {showSMA20 && <Line type="monotone" dataKey="sma20" stroke="#10b981" strokeWidth={1.5} dot={false} strokeDasharray="5 5" />}
                          {showSMA50 && <Line type="monotone" dataKey="sma50" stroke="#f97316" strokeWidth={1.5} dot={false} strokeDasharray="5 5" />}
                        </AreaChart>
                      ) : chartType === 'line' ? (
                        <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                          <XAxis 
                            dataKey="time" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{fontSize: 9, fill: '#52525b', fontWeight: 600}}
                            minTickGap={40}
                            dy={10}
                          />
                          <YAxis 
                            domain={['auto', 'auto']} 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{fontSize: 9, fill: '#52525b', fontWeight: 600}}
                            orientation="right"
                            dx={10}
                          />
                          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }} />
                          <Line 
                            type="monotone" 
                            dataKey="close" 
                            stroke="#6366f1" 
                            strokeWidth={3} 
                            dot={false}
                            animationDuration={2000}
                          />
                          {showSMA20 && <Line type="monotone" dataKey="sma20" stroke="#10b981" strokeWidth={1.5} dot={false} strokeDasharray="5 5" />}
                          {showSMA50 && <Line type="monotone" dataKey="sma50" stroke="#f97316" strokeWidth={1.5} dot={false} strokeDasharray="5 5" />}
                        </LineChart>
                      ) : (
                        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                          <XAxis 
                            dataKey="time" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{fontSize: 9, fill: '#52525b', fontWeight: 600}}
                            minTickGap={40}
                            dy={10}
                          />
                          <YAxis 
                            domain={['auto', 'auto']} 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{fontSize: 9, fill: '#52525b', fontWeight: 600}}
                            orientation="right"
                            dx={10}
                          />
                          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                          <Bar 
                            dataKey="close" 
                            fill="#6366f1" 
                            radius={[6, 6, 0, 0]}
                            animationDuration={2000}
                          />
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Volume Chart (Mini) */}
              {data.length > 0 && (
                <div className="px-8 pb-8 h-40">
                  <div className="h-full border-t border-white/5 pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Volume Profile</p>
                      <p className="text-[9px] font-mono text-zinc-600">AGGREGATED LIQUIDITY</p>
                    </div>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data}>
                        <Bar dataKey="volume" fill="rgba(99,102,241,0.2)" radius={[2, 2, 0, 0]} />
                        <Tooltip content={<CustomTooltip />} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>

              {/* AI Analysis Section */}
              {data.length > 0 && (
                <div className="mt-8 space-y-6">
                  <div className="bg-zinc-900/50 backdrop-blur-md rounded-3xl border border-white/5 p-8 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-10">
                      <Brain className="w-32 h-32 text-indigo-500" />
                    </div>
                    
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                      <div>
                        <h3 className="text-xl font-bold text-white flex items-center gap-3">
                          <Sparkles className="w-6 h-6 text-indigo-400" />
                          Smart AI Analysis
                        </h3>
                        <p className="text-xs text-zinc-500 font-medium uppercase tracking-widest mt-1">
                          Deep technical synthesis with Gemini plus local quant fallback
                        </p>
                      </div>
                      
                      <button
                        onClick={runAiAnalysis}
                        disabled={aiLoading}
                        className="bg-indigo-500 hover:bg-indigo-400 disabled:bg-zinc-800 text-white px-8 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-3"
                      >
                        {aiLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Processing Data...
                          </>
                        ) : (
                          <>
                            <Brain className="w-4 h-4" />
                            Full Technical Audit
                          </>
                        )}
                      </button>
                    </div>

                    {aiAnalysis ? (
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
                              <Sparkles className="w-4 h-4 text-violet-400" /> AI Strategic Analysis
                              {aiLastUpdated && <span className="text-[9px] text-zinc-600 font-mono ml-2 lowercase tracking-normal">updated {aiLastUpdated}</span>}
                            </h3>
                            {aiRecommendation && (
                              <span className={cn(
                                "text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest",
                                aiRecommendation === 'BUY' ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" :
                                aiRecommendation === 'SELL' ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" :
                                "bg-zinc-500/20 text-zinc-400 border border-zinc-500/30"
                              )}>
                                {aiRecommendation}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4">
                            {aiConfidence > 0 && (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-zinc-500 uppercase">AI Confidence</span>
                                <div className="w-20 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                  <div 
                                    className={cn(
                                      "h-full transition-all duration-1000",
                                      aiConfidence > 70 ? "bg-emerald-500" : aiConfidence > 40 ? "bg-yellow-500" : "bg-rose-500"
                                    )}
                                    style={{ width: `${aiConfidence}%` }}
                                  />
                                </div>
                                <span className="text-[10px] font-mono text-zinc-300">{aiConfidence}%</span>
                              </div>
                            )}
                            <button 
                              onClick={() => {
                                if (aiAnalysis) {
                                  navigator.clipboard.writeText(aiAnalysis);
                                  alert('Analysis copied to clipboard!');
                                }
                              }}
                              className="text-[10px] font-bold text-zinc-500 hover:text-white transition-colors uppercase tracking-widest flex items-center gap-1"
                            >
                              <Copy className="w-3 h-3" /> Copy
                            </button>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                          <div className="lg:col-span-2 prose prose-invert max-w-none bg-black/40 rounded-2xl p-8 border border-white/5 shadow-inner">
                            <Markdown>{aiAnalysis}</Markdown>
                          </div>
                          
                          <div className="space-y-6">
                            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-6">
                              <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                <ShieldCheck className="w-3 h-3" /> Beginner's View
                              </h4>
                              <div className="space-y-4">
                                {aiAnalysis.includes('Simple Summary for Beginners') ? (
                                  <div className="text-xs text-zinc-300 leading-relaxed space-y-3">
                                    {aiAnalysis.split('**Simple Summary for Beginners**')[1]?.split('**')[0]?.split('\n').filter(l => l.trim().startsWith('-')).map((point, i) => (
                                      <div key={i} className="flex gap-3">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                                        <p>{point.replace(/^-\s*/, '')}</p>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-zinc-500 italic">Generating simplified insights...</p>
                                )}
                              </div>
                            </div>

                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6">
                              <h4 className="text-[10px] font-bold text-emerald-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                <Activity className="w-3 h-3" /> Pro Tip
                              </h4>
                              <p className="text-xs text-zinc-300 leading-relaxed italic">
                                "Always wait for a 5-minute candle close above the resistance level before entering. Volume should be at least 1.5x the average."
                              </p>
                            </div>
                          </div>
                        </div>

                        {aiSources.length > 0 && (
                          <div className="pt-6 border-t border-white/5">
                            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                              <Search className="w-3 h-3 text-indigo-400" /> Verified Intelligence Sources
                            </h4>
                            <div className="flex flex-wrap gap-3">
                              {aiSources.map((source, idx) => (
                                <a 
                                  key={idx}
                                  href={source.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/5 hover:bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-[10px] text-indigo-300 transition-all group"
                                >
                                  {source.title}
                                  <Maximize2 className="w-2.5 h-2.5 opacity-50 group-hover:opacity-100 transition-opacity" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="bg-black/20 rounded-2xl p-12 border border-dashed border-white/10 flex flex-col items-center justify-center text-center">
                        <div className="w-16 h-16 bg-indigo-500/5 rounded-full flex items-center justify-center mb-4">
                          <Brain className="w-8 h-8 text-indigo-500/40" />
                        </div>
                        <h4 className="text-sm font-bold text-zinc-400 mb-1">AI Engine Ready</h4>
                        <p className="text-xs text-zinc-600 max-w-xs">
                          Click the button above to perform a comprehensive AI-powered analysis of the current market data.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* AI Insights Grid */}
                  {aiInsights && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-zinc-900/50 backdrop-blur-md rounded-3xl border border-white/5 p-6 shadow-xl">
                          <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                            <Zap className="w-3 h-3 text-orange-400" /> Momentum Signals
                          </h4>
                          <div className="space-y-3">
                            {aiInsights.momentum.slice(0, 3).map((m: any, i: number) => (
                              <div key={i} className="flex items-center justify-between p-3 bg-black/20 rounded-xl border border-white/5">
                                <span className="text-xs font-bold text-zinc-300">{cleanSymbol(m.symbol)}</span>
                                <span className="text-[10px] font-mono text-emerald-400">+{m.change5m}%</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="bg-zinc-900/50 backdrop-blur-md rounded-3xl border border-white/5 p-6 shadow-xl">
                          <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                            <Target className="w-3 h-3 text-indigo-400" /> Breakout Alerts
                          </h4>
                          <div className="space-y-3">
                            {aiInsights.breakouts.slice(0, 3).map((b: any, i: number) => (
                              <div key={i} className="flex items-center justify-between p-3 bg-black/20 rounded-xl border border-white/5">
                                <span className="text-xs font-bold text-zinc-300">{cleanSymbol(b.symbol)}</span>
                                <span className="text-[10px] font-medium text-zinc-500">{b.type}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="bg-zinc-900/50 backdrop-blur-md rounded-3xl border border-white/5 p-6 shadow-xl">
                          <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                            <PieChart className="w-3 h-3 text-emerald-400" /> Market Psychology
                          </h4>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] text-zinc-500 font-bold">Fear/Greed</span>
                              <span className="text-[10px] font-mono text-white">{aiInsights.psychology.fearGreedIndex}</span>
                            </div>
                            <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-gradient-to-r from-rose-500 via-yellow-500 to-emerald-500" 
                                style={{ width: `${aiInsights.psychology.fearGreedIndex}%` }}
                              />
                            </div>
                            <p className="text-[10px] text-zinc-400 mt-2 italic">
                              {aiInsights.psychology.triggers && aiInsights.psychology.triggers.length > 0 
                                ? `"${aiInsights.psychology.triggers[0]}"`
                                : "No psychological triggers detected."}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Advanced AI Intelligence Preview */}
                      {advancedIntelligence && (
                        <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-3xl p-6 backdrop-blur-sm">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-[0.2em] flex items-center gap-2">
                              <Brain className="w-3 h-3" /> Advanced AI Intelligence Preview
                            </h4>
                            <button 
                              onClick={() => setActiveTab('quant')}
                              className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors uppercase tracking-widest"
                            >
                              View Full Lab {'->'}
                            </button>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-black/20 rounded-xl p-3 border border-white/5">
                              <p className="text-[8px] text-zinc-500 uppercase font-bold mb-1">Momentum Prob</p>
                              <p className="text-sm font-bold text-emerald-400">{advancedIntelligence.momentumPrediction.probability}%</p>
                            </div>
                            <div className="bg-black/20 rounded-xl p-3 border border-white/5">
                              <p className="text-[8px] text-zinc-500 uppercase font-bold mb-1">Order Imbalance</p>
                              <p className="text-sm font-bold text-orange-400">{advancedIntelligence.orderFlow.imbalance}x</p>
                            </div>
                            <div className="bg-black/20 rounded-xl p-3 border border-white/5">
                              <p className="text-[8px] text-zinc-500 uppercase font-bold mb-1">Pattern</p>
                              <p className="text-sm font-bold text-indigo-400">{advancedIntelligence.patternRecognition.pattern}</p>
                            </div>
                            <div className="bg-black/20 rounded-xl p-3 border border-white/5">
                              <p className="text-[8px] text-zinc-500 uppercase font-bold mb-1">Sentiment</p>
                              <p className="text-sm font-bold text-white">{advancedIntelligence.marketSentiment.score}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Market Intelligence Panel */}
                  {marketIntelligence && (
                    <div className="bg-zinc-900/50 backdrop-blur-md rounded-3xl border border-white/5 p-8 shadow-2xl">
                      <div className="flex items-center gap-3 mb-8">
                        <Brain className="w-6 h-6 text-emerald-400" />
                        <h3 className="text-xl font-bold text-white">Market Intelligence</h3>
                      </div>
                      
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="space-y-6">
                          <div className="bg-black/20 rounded-2xl p-6 border border-white/5">
                            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-3">Global Sentiment</h4>
                            <p className="text-sm text-zinc-400 leading-relaxed">{marketIntelligence.globalSentiment}</p>
                          </div>
                          
                          <div className="bg-black/20 rounded-2xl p-6 border border-white/5">
                            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4">Hot Sectors</h4>
                            <div className="space-y-4">
                              {marketIntelligence.hotSectors.map((sector: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between">
                                  <div>
                                    <p className="text-xs font-bold text-white">{sector.name}</p>
                                    <p className="text-[10px] text-zinc-500">{sector.reason}</p>
                                  </div>
                                  <span className={cn(
                                    "text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider",
                                    sector.trend.includes('Bullish') ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-500/10 text-zinc-400"
                                  )}>
                                    {sector.trend}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-2xl p-6">
                            <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-[0.2em] mb-3">Trader's View</h4>
                            <ul className="space-y-2">
                              <li className="text-[10px] text-zinc-400 flex gap-2">
                                <div className="w-1 h-1 rounded-full bg-indigo-500 mt-1.5" />
                                Focus on sectors with "Bullish" trend for higher probability.
                              </li>
                              <li className="text-[10px] text-zinc-400 flex gap-2">
                                <div className="w-1 h-1 rounded-full bg-indigo-500 mt-1.5" />
                                Use "Confidence Score" to size your positions.
                              </li>
                            </ul>
                          </div>
                        </div>

                        <div className="bg-black/20 rounded-2xl p-6 border border-white/5">
                          <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-6 flex items-center justify-between">
                            AI Generated Trade Ideas
                            <span className="text-[8px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-500/30">LIVE SIGNALS</span>
                          </h4>
                          <div className="space-y-4">
                            {marketIntelligence.topTradeIdeas.map((idea: any, idx: number) => (
                              <div key={idx} className="p-5 bg-zinc-800/30 rounded-2xl border border-white/5 hover:border-indigo-500/30 transition-all group relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                  <Target className="w-12 h-12 text-indigo-500" />
                                </div>
                                <div className="flex items-center justify-between mb-4">
                                  <div className="flex items-center gap-3">
                                    <span className="text-base font-bold text-white tracking-tight">{cleanSymbol(idea.symbol)}</span>
                                    <span className="text-[9px] font-bold px-2 py-0.5 bg-black/40 text-zinc-400 rounded-md border border-white/5 uppercase tracking-widest">{idea.timeframe}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-bold text-zinc-500 uppercase">Conf</span>
                                    <span className={cn(
                                      "text-[10px] font-mono font-bold",
                                      idea.confidence > 80 ? "text-emerald-400" : "text-indigo-400"
                                    )}>{idea.confidence}%</span>
                                  </div>
                                </div>
                                
                                <div className="mb-4">
                                  <p className="text-[10px] font-mono text-indigo-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
                                    <Sparkles className="w-3 h-3" /> {idea.setup}
                                  </p>
                                </div>

                                <div className="grid grid-cols-3 gap-4 mb-4">
                                  <div className="bg-black/20 p-2 rounded-xl border border-white/5">
                                    <p className="text-[8px] text-zinc-500 uppercase font-bold mb-1">Target</p>
                                    <p className="text-sm font-mono font-bold text-emerald-400">{formatCurrency(idea.target)}</p>
                                  </div>
                                  <div className="bg-black/20 p-2 rounded-xl border border-white/5">
                                    <p className="text-[8px] text-zinc-500 uppercase font-bold mb-1">Stop Loss</p>
                                    <p className="text-sm font-mono font-bold text-rose-400">{formatCurrency(idea.stop)}</p>
                                  </div>
                                  <div className="bg-black/20 p-2 rounded-xl border border-white/5">
                                    <p className="text-[8px] text-zinc-500 uppercase font-bold mb-1">R:R Ratio</p>
                                    <p className="text-sm font-mono font-bold text-zinc-300">{idea.rrRatio}</p>
                                  </div>
                                </div>

                                <button 
                                  onClick={() => {
                                    const signal = `Trade Idea: ${idea.symbol}\nSetup: ${idea.setup}\nTarget: ${formatCurrency(idea.target)}\nStop Loss: ${formatCurrency(idea.stop)}\nTimeframe: ${idea.timeframe}`;
                                    navigator.clipboard.writeText(signal);
                                    alert(`Signal for ${idea.symbol} copied!`);
                                  }}
                                  className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 hover:text-white transition-all flex items-center justify-center gap-2"
                                >
                                  <Copy className="w-3 h-3" /> Copy Signal
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : activeTab === 'institutional' ? (
            <InstitutionalAnalytics 
              symbol={selectedStock?.symbol || 'MARKET'} 
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
            <div className="space-y-8">
                {/* Quant Lab Header */}
                <div className={cn("backdrop-blur-md rounded-[2.5rem] border p-10 shadow-2xl relative overflow-hidden", quantShellClass)}>
                  <div className="absolute top-0 right-0 p-10 opacity-5">
                    <Zap className="w-64 h-64 text-indigo-500" />
                  </div>
                  <div className="relative z-10">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <h2 className={cn("text-3xl font-bold flex items-center gap-4", isDeskLight ? "text-zinc-900" : "text-white")}>
                        <Brain className="w-10 h-10 text-indigo-400" />
                        Quant Strategy Lab
                      </h2>
                      <div className={cn(
                        "rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]",
                        isDeskLight ? "bg-cyan-100 text-cyan-700" : "bg-cyan-500/10 text-cyan-300"
                      )}>
                        {deskTheme === 'light' ? 'Light Desk' : 'Dark Desk'}
                      </div>
                    </div>
                    <p className="text-sm text-zinc-500 font-medium uppercase tracking-[0.3em]">Advanced Algorithmic Execution Environment</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-10">
                      {quantData && (
                        <>
                          <div className={cn("rounded-2xl p-6 border", quantSubPanelClass)}>
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Market Sentiment</p>
                            <p className={cn("text-xl font-bold", isBullishStatus(quantData.sentiment.status) ? "text-emerald-400" : "text-rose-400")}>{quantData.sentiment.status}</p>
                            <p className="text-[10px] text-zinc-600 mt-1">A/D Ratio: {quantData.sentiment.adRatio}</p>
                          </div>
                          <div className={cn("rounded-2xl p-6 border", quantSubPanelClass)}>
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Confidence Score</p>
                            <p className="text-xl font-bold text-indigo-400">{quantData.sentiment.confidence}%</p>
                            <div className="w-full h-1 bg-zinc-800 rounded-full mt-2">
                              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${quantData.sentiment.confidence}%` }} />
                            </div>
                          </div>
                          <div className={cn("rounded-2xl p-6 border", quantSubPanelClass)}>
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Volatility Index</p>
                            <p className={cn("text-xl font-bold", isDeskLight ? "text-zinc-800" : "text-zinc-300")}>{quantData.sentiment.volatility}</p>
                            <p className="text-[10px] text-zinc-600 mt-1">System Risk: Low</p>
                          </div>
                          <div className={cn("rounded-2xl p-6 border", quantSubPanelClass)}>
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Active Scanners</p>
                            <p className={cn("text-xl font-bold", isDeskLight ? "text-zinc-900" : "text-white")}>09</p>
                            <div className="text-[10px] text-emerald-500 mt-1 flex items-center gap-1 font-bold">
                              <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" /> Real-time
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quant Modules Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Module 1: Momentum Scanner */}
                  <div className={cn("backdrop-blur-md rounded-3xl border p-8 shadow-xl", quantShellClass)}>
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-widest">
                        <TrendingUp className="w-4 h-4 text-emerald-400" /> Momentum Scanner
                      </h3>
                      <span className="text-[10px] font-mono text-zinc-500">M1-M5 INTERVAL</span>
                    </div>
                    <div className="space-y-4">
                      {quantData?.momentum.map((m: any, i: number) => (
                        <div key={i} className={cn("p-4 rounded-2xl border hover:border-emerald-500/30 transition-colors", quantSubPanelClass)}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold text-white">{cleanSymbol(m.symbol)}</span>
                            <span className="text-[10px] font-bold text-emerald-400">+{m.priceChange}%</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{m.alert}</span>
                            <span className="text-[10px] font-mono text-zinc-400">VOL RATIO: {m.volumeRatio}x</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Module 2: Breakout Detector */}
                  <div className={cn("backdrop-blur-md rounded-3xl border p-8 shadow-xl", quantShellClass)}>
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-widest">
                        <Target className="w-4 h-4 text-indigo-400" /> Breakout Detector
                      </h3>
                      <span className="text-[10px] font-mono text-zinc-500">RESISTANCE SCAN</span>
                    </div>
                    <div className="space-y-4">
                      {quantData?.breakouts.map((b: any, i: number) => (
                        <div key={i} className={cn("p-4 rounded-2xl border hover:border-indigo-500/30 transition-colors", quantSubPanelClass)}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold text-white">{cleanSymbol(b.symbol)}</span>
                            <span className="text-[10px] font-bold text-indigo-400">SCORE: {b.strength}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-4 mt-3">
                            <div>
                              <p className="text-[9px] text-zinc-600 uppercase font-bold">Level</p>
                              <p className="text-xs font-mono text-white">{formatCurrency(b.level)}</p>
                            </div>
                            <div>
                              <p className="text-[9px] text-zinc-600 uppercase font-bold">VWAP</p>
                              <p className="text-xs font-mono text-zinc-400">{formatCurrency(b.vwap)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Module 3: Volume Surge Engine */}
                  <div className={cn("backdrop-blur-md rounded-3xl border p-8 shadow-xl", quantShellClass)}>
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-widest">
                        <Zap className="w-4 h-4 text-orange-400" /> Volume Surge Engine
                      </h3>
                      <span className="text-[10px] font-mono text-zinc-500">INSTITUTIONAL SCAN</span>
                    </div>
                    <div className="space-y-4">
                      {quantData?.surges.map((s: any, i: number) => (
                        <div key={i} className={cn("p-4 rounded-2xl border border-l-4 border-l-orange-500", quantSubPanelClass)}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-bold text-white">{cleanSymbol(s.symbol)}</span>
                            <span className="text-[10px] font-bold text-orange-400">{s.ratio}x AVG</span>
                          </div>
                          <p className="text-[10px] text-zinc-400 mb-2">{s.alert}</p>
                          <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">DETECTED @ {new Date(s.timestamp).toLocaleTimeString()}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Module 4: Multi Indicator Engine */}
                  <div className={cn("backdrop-blur-md rounded-3xl border p-8 shadow-xl", quantShellClass)}>
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-widest">
                        <Sparkles className="w-4 h-4 text-emerald-400" /> Indicator Engine
                      </h3>
                      <span className="text-[10px] font-mono text-zinc-500">RSI/EMA/VWAP</span>
                    </div>
                    <div className="space-y-3">
                      {quantData?.indicators.map((ind: any, i: number) => (
                        <div key={i} className={cn("flex items-center justify-between p-4 rounded-2xl border", quantSubPanelClass)}>
                          <div>
                            <p className="text-sm font-bold text-white">{cleanSymbol(ind.symbol)}</p>
                            <p className="text-[10px] text-zinc-500">RSI: {ind.rsi}</p>
                          </div>
                          <div className="text-right">
                            <span className={cn(
                              "text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest",
                              ind.signal.includes('BUY') ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                            )}>
                              {ind.signal}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Advanced AI Intelligence Section */}
                {advancedIntelligence && (
                  <div className="space-y-8 mb-12">
                    <div className="flex items-center gap-4">
                      <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-white/10" />
                      <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.4em] whitespace-nowrap">Advanced AI Intelligence</h3>
                      <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-white/10" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* AI Momentum Prediction */}
                      <div className={cn("backdrop-blur-md rounded-3xl border p-6 shadow-xl relative overflow-hidden group", quantShellClass)}>
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                          <TrendingUp className="w-12 h-12 text-emerald-400" />
                        </div>
                        <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <Brain className="w-3 h-3 text-emerald-400" /> Momentum Prediction
                        </h4>
                        <div className="space-y-4">
                          <div className="flex items-end justify-between">
                            <div>
                              <p className="text-2xl font-bold text-white">{advancedIntelligence.momentumPrediction.probability}%</p>
                              <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-tighter">Probability of Move</p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-mono text-emerald-400">{advancedIntelligence.momentumPrediction.predictedMove}</p>
                              <p className="text-[10px] text-zinc-500 uppercase font-bold">Projected</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 pt-2">
                            {Object.entries(advancedIntelligence.momentumPrediction.features).map(([key, val]: [string, any]) => (
                              <div key={key} className={cn("rounded-lg p-2 border", quantSubPanelClass)}>
                                <p className="text-[8px] text-zinc-600 uppercase font-bold">{key}</p>
                                <p className="text-[10px] font-mono text-zinc-300">{val}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Institutional Order Flow */}
                      <div className={cn("backdrop-blur-md rounded-3xl border p-6 shadow-xl relative overflow-hidden group", quantShellClass)}>
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                          <Zap className="w-12 h-12 text-orange-400" />
                        </div>
                        <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <Activity className="w-3 h-3 text-orange-400" /> Order Flow Detector
                        </h4>
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-zinc-500 font-bold uppercase">Imbalance Ratio</span>
                            <span className="text-xl font-mono text-white">{advancedIntelligence.orderFlow.imbalance}x</span>
                          </div>
                          <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-orange-500 to-rose-500" 
                              style={{ width: `${advancedIntelligence.orderFlow.activityScore}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">{advancedIntelligence.orderFlow.status}</span>
                            <div className="flex gap-2">
                              <div className="text-right">
                                <p className="text-[8px] text-zinc-600 uppercase font-bold">Bid</p>
                                <p className="text-[10px] font-mono text-emerald-400">{advancedIntelligence.orderFlow.bidVol}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[8px] text-zinc-600 uppercase font-bold">Ask</p>
                                <p className="text-[10px] font-mono text-rose-400">{advancedIntelligence.orderFlow.askVol}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Smart Money Accumulation */}
                      <div className={cn("backdrop-blur-md rounded-3xl border p-6 shadow-xl relative overflow-hidden group", quantShellClass)}>
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                          <ShieldCheck className="w-12 h-12 text-indigo-400" />
                        </div>
                        <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <Target className="w-3 h-3 text-indigo-400" /> Smart Money Model
                        </h4>
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-2xl font-bold text-white">{advancedIntelligence.smartMoney.accumulationScore}</p>
                              <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-tighter">Accumulation Score</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-bold text-zinc-300 uppercase tracking-widest">{advancedIntelligence.smartMoney.phase}</p>
                              <p className="text-[10px] text-zinc-500 uppercase font-bold">Current Phase</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4 pt-2">
                            <div className={cn("rounded-xl p-3 border", quantSubPanelClass)}>
                              <p className="text-[8px] text-zinc-600 uppercase font-bold mb-1">Range</p>
                              <p className="text-xs font-mono text-zinc-300">{advancedIntelligence.smartMoney.range}</p>
                            </div>
                            <div className={cn("rounded-xl p-3 border", quantSubPanelClass)}>
                              <p className="text-[8px] text-zinc-600 uppercase font-bold mb-1">Support Dist</p>
                              <p className="text-xs font-mono text-zinc-300">{advancedIntelligence.smartMoney.supportDist}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {advancedIntelligence.gradientBoosting && (
                      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                        <div className={cn("backdrop-blur-md rounded-3xl border p-6 shadow-xl", quantShellClass)}>
                          <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Brain className="w-3 h-3 text-cyan-400" /> Gradient Boosting
                          </h4>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-zinc-500 font-bold uppercase">Probability</span>
                              <span className="text-xl font-mono text-cyan-400">{advancedIntelligence.gradientBoosting.probability}%</span>
                            </div>
                            <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
                              Horizon: {advancedIntelligence.gradientBoosting.horizon}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {advancedIntelligence.gradientBoosting.topFeatures.map((feature: string) => (
                                <span key={feature} className="px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-[9px] font-bold text-cyan-300 uppercase tracking-tighter">
                                  {feature}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className={cn("backdrop-blur-md rounded-3xl border p-6 shadow-xl", quantShellClass)}>
                          <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Activity className="w-3 h-3 text-emerald-400" /> LSTM Forecast
                          </h4>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-zinc-500 font-bold uppercase">Next Price</span>
                              <span className="text-xl font-mono text-emerald-400">{formatCurrency(advancedIntelligence.lstmForecast.nextPrice)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-zinc-500 font-bold uppercase">Confidence Band</span>
                              <span className="text-xs font-mono text-zinc-300">{advancedIntelligence.lstmForecast.confidenceBand}</span>
                            </div>
                            <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
                              Window: {advancedIntelligence.lstmForecast.candles} candles
                            </p>
                          </div>
                        </div>

                        <div className={cn("backdrop-blur-md rounded-3xl border p-6 shadow-xl", quantShellClass)}>
                          <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Shield className="w-3 h-3 text-amber-400" /> Regime and Agent
                          </h4>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-zinc-500 font-bold uppercase">{advancedIntelligence.regimeModel.model}</span>
                              <span className="text-xs font-bold text-amber-300 uppercase">{advancedIntelligence.regimeModel.regime}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-zinc-500 font-bold uppercase">{advancedIntelligence.hiddenStateModel.model}</span>
                              <span className="text-xs font-bold text-indigo-300 uppercase">{advancedIntelligence.hiddenStateModel.state}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-zinc-500 font-bold uppercase">RL Agent</span>
                              <span className="text-xs font-bold text-emerald-400 uppercase">{advancedIntelligence.reinforcementAgent.action}</span>
                            </div>
                            <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400" style={{ width: `${advancedIntelligence.signalConsensus.score}%` }} />
                            </div>
                            <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
                              Consensus: {advancedIntelligence.signalConsensus.verdict}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Volatility Breakout & Pattern Recognition */}
                      <div className={cn("backdrop-blur-md rounded-3xl border p-6 shadow-xl flex gap-8", quantShellClass)}>
                        <div className="flex-1">
                          <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <Zap className="w-3 h-3 text-yellow-400" /> Volatility Breakout
                          </h4>
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-zinc-500 font-bold uppercase">Squeeze Probability</span>
                              <span className="text-xl font-mono text-white">{advancedIntelligence.volatility.squeezeProbability}%</span>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className={cn(
                                "px-3 py-1 rounded-full text-[8px] font-bold uppercase tracking-widest",
                                advancedIntelligence.volatility.compression ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-500"
                              )}>
                                {advancedIntelligence.volatility.compression ? "Compression Detected" : "Normal Volatility"}
                              </div>
                              <div className="text-xs font-mono text-zinc-500">ATR: {advancedIntelligence.volatility.atr}</div>
                            </div>
                          </div>
                        </div>
                        <div className="w-[1px] bg-white/5" />
                        <div className="flex-1">
                          <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <Sparkles className="w-3 h-3 text-indigo-400" /> Pattern Recognition
                          </h4>
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-zinc-500 font-bold uppercase">Detected Pattern</span>
                              <span className="text-sm font-bold text-white">{advancedIntelligence.patternRecognition.pattern}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-zinc-500 font-bold uppercase">Confidence</span>
                              <span className="text-sm font-mono text-indigo-400">{advancedIntelligence.patternRecognition.confidence}%</span>
                            </div>
                            <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/5 p-2 rounded-lg border border-emerald-500/10 text-center">
                              {advancedIntelligence.patternRecognition.status} {'->'} Target: {advancedIntelligence.patternRecognition.target}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Market Sentiment Engine */}
                      <div className={cn("backdrop-blur-md rounded-3xl border p-6 shadow-xl relative overflow-hidden group", quantShellClass)}>
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                          <PieChart className="w-12 h-12 text-emerald-400" />
                        </div>
                        <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                          <PieChart className="w-3 h-3 text-emerald-400" /> Market Sentiment Engine
                        </h4>
                        <div className="grid grid-cols-2 gap-8">
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-zinc-500 font-bold uppercase">News Sentiment</span>
                              <span className="text-xs font-bold text-emerald-400">{advancedIntelligence.marketSentiment.newsSentiment}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-zinc-500 font-bold uppercase">Social Sentiment</span>
                              <span className="text-xs font-bold text-indigo-400">{advancedIntelligence.marketSentiment.socialSentiment}</span>
                            </div>
                            <div className="pt-2">
                              <p className="text-[10px] text-zinc-500 font-bold uppercase mb-2">Sentiment Score</p>
                              <div className="flex items-center gap-4">
                                <div className="flex-1 h-2 bg-black/40 rounded-full overflow-hidden">
                                  <div className="h-full bg-emerald-500" style={{ width: `${advancedIntelligence.marketSentiment.score}%` }} />
                                </div>
                                <span className="text-sm font-mono text-white">{advancedIntelligence.marketSentiment.score}</span>
                              </div>
                            </div>
                          </div>
                          <div className="space-y-3">
                            <p className="text-[10px] text-zinc-500 font-bold uppercase">Trending Topics</p>
                            <div className="flex flex-wrap gap-2">
                              {advancedIntelligence.marketSentiment.trendingTopics.map((topic: string) => (
                                <span key={topic} className="px-2 py-1 bg-black/40 rounded-lg border border-white/5 text-[9px] text-zinc-400 font-bold uppercase tracking-tighter">
                                  #{topic.replace(' ', '')}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Sector Analysis & Money Flow */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-12">
                  <div className={cn("lg:col-span-2 backdrop-blur-md rounded-3xl border p-8 shadow-xl", quantShellClass)}>
                    <h3 className="text-sm font-bold text-white mb-8 uppercase tracking-widest flex items-center gap-3">
                      <PieChart className="w-5 h-5 text-indigo-400" /> Sector Strength Analyzer
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {quantData?.sectors.map((sector: any, i: number) => (
                        <div key={i} className={cn("p-5 rounded-2xl border relative overflow-hidden", quantSubPanelClass)}>
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-sm font-bold text-white">{sector.name}</span>
                            <span className={cn(
                              "text-[10px] font-bold",
                              sector.return > 0 ? "text-emerald-400" : "text-rose-400"
                            )}>
                              {sector.return > 0 ? '+' : ''}{sector.return}%
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] uppercase tracking-widest">
                            <span className="text-zinc-500">Momentum: {sector.momentum}</span>
                            <span className="text-indigo-400 font-bold">{sector.status}</span>
                          </div>
                          <div className="absolute bottom-0 left-0 h-1 bg-indigo-500/20 w-full">
                            <div className="h-full bg-indigo-500" style={{ width: `${Math.abs(sector.return) * 20}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className={cn("backdrop-blur-md rounded-3xl border p-8 shadow-xl", quantShellClass)}>
                    <h3 className="text-sm font-bold text-white mb-8 uppercase tracking-widest flex items-center gap-3">
                      <ShieldAlert className="w-5 h-5 text-orange-400" /> Early Trend Detector
                    </h3>
                    <div className="space-y-6">
                      {quantData?.trends.map((t: any, i: number) => (
                        <div key={i} className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-white">{cleanSymbol(t.symbol)}</span>
                            <span className="text-xs font-mono text-indigo-400">{t.score}</span>
                          </div>
                          <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden flex">
                            <div className="h-full bg-emerald-500" style={{ width: `${t.momentum * 100}%` }} />
                            <div className="h-full bg-indigo-500" style={{ width: `${t.volume * 100}%` }} />
                            <div className="h-full bg-orange-500" style={{ width: `${t.breakout * 100}%` }} />
                          </div>
                          <div className="flex justify-between text-[8px] text-zinc-600 font-bold uppercase tracking-tighter">
                            <span>MOMENTUM</span>
                            <span>VOLUME</span>
                            <span>BREAKOUT</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

              {/* Data Table */}
            {data.length > 0 && (
              <div className={cn("backdrop-blur-md rounded-3xl border shadow-2xl overflow-hidden", quantShellClass)}>
                <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between bg-black/20">
                  <h3 className="text-sm font-bold text-white uppercase tracking-widest">Execution Logs</h3>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={downloadCSV}
                      className="text-[10px] font-bold text-zinc-500 hover:text-white transition-colors uppercase tracking-widest flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" /> Export CSV
                    </button>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                      <span className="text-[10px] font-bold text-zinc-500 uppercase">Verified Data</span>
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-black/40 text-zinc-500 font-bold uppercase tracking-wider border-b border-white/5">
                      <tr>
                        <th className="px-8 py-4">Timestamp</th>
                        <th className="px-8 py-4">Open</th>
                        <th className="px-8 py-4">High</th>
                        <th className="px-8 py-4 text-rose-400">Low</th>
                        <th className="px-8 py-4 text-emerald-400">Close</th>
                        <th className="px-8 py-4">Volume</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {data.slice(0, 15).map((row, idx) => (
                        <tr key={idx} className="hover:bg-white/5 transition-colors group">
                          <td className="px-8 py-4 font-mono text-zinc-400 group-hover:text-white transition-colors">{row.fullTime}</td>
                          <td className="px-8 py-4 font-mono">{row.open.toFixed(2)}</td>
                          <td className="px-8 py-4 font-mono text-emerald-500/80">{row.high.toFixed(2)}</td>
                          <td className="px-8 py-4 font-mono text-rose-500/80">{row.low.toFixed(2)}</td>
                          <td className="px-8 py-4 font-mono font-bold text-white">{row.close.toFixed(2)}</td>
                          <td className="px-8 py-4 font-mono text-zinc-500">{row.volume.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.length > 15 && (
                    <div className="px-8 py-4 bg-black/20 text-center border-t border-white/5">
                      <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
                        Displaying top 15 of {data.length} algorithmic data points
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Live Intelligence Sidebar */}
          <div className="lg:col-span-3 space-y-6">
            <div className={cn("backdrop-blur-md rounded-3xl border p-6 shadow-2xl sticky top-24", quantShellClass)}>
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-6 flex items-center gap-2">
                <div className="w-1 h-4 bg-orange-500 rounded-full" /> Live Intelligence
              </h3>

              <div className="space-y-6">
                {/* Momentum Alerts */}
                <div>
                  <h4 className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest mb-4 flex items-center justify-between">
                    Momentum Alerts <span className="text-emerald-500">LIVE</span>
                  </h4>
                  <div className="space-y-3">
                    {quantData?.momentum.slice(0, 4).map((m: any, i: number) => (
                      <div key={i} className={cn("p-3 rounded-xl border hover:border-emerald-500/30 transition-colors group cursor-pointer", quantSubPanelClass)}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors">{cleanSymbol(m.symbol)}</span>
                          <span className="text-[10px] font-mono text-emerald-400">+{m.priceChange}%</span>
                        </div>
                        <p className="text-[9px] text-zinc-500 uppercase tracking-tighter">{m.alert}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Breakout Signals */}
                <div>
                  <h4 className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest mb-4 flex items-center justify-between">
                    Breakout Signals <span className="text-indigo-500">DETECTED</span>
                  </h4>
                  <div className="space-y-3">
                    {quantData?.breakouts.slice(0, 3).map((b: any, i: number) => (
                      <div key={i} className={cn("p-3 rounded-xl border hover:border-indigo-500/30 transition-colors group cursor-pointer", quantSubPanelClass)}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-white group-hover:text-indigo-400 transition-colors">{cleanSymbol(b.symbol)}</span>
                          <span className="text-[10px] font-mono text-zinc-500">{formatCurrency(b.level)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] text-zinc-600 uppercase">Strength</span>
                          <span className="text-[10px] font-bold text-indigo-400">{b.strength}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* AI Sentiment Pulse */}
                <div className="pt-4 border-t border-white/5">
                  <h4 className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest mb-4">AI Sentiment Pulse</h4>
                  {aiInsights && aiInsights.psychology && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-zinc-500 font-bold uppercase">Fear/Greed</span>
                        <span className="text-[10px] font-mono text-white">{aiInsights.psychology.fearGreedIndex}</span>
                      </div>
                      <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-rose-500 via-yellow-500 to-emerald-500" 
                          style={{ width: `${aiInsights.psychology.fearGreedIndex}%` }}
                        />
                      </div>
                      <p className="text-[9px] text-zinc-500 italic leading-relaxed">
                        {aiInsights.psychology.triggers && aiInsights.psychology.triggers.length > 0 
                          ? `"${aiInsights.psychology.triggers[0]}"`
                          : "Neutral market sentiment observed."}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        )}
      </main>
      
      <footer className="max-w-7xl mx-auto px-4 py-12 border-t border-white/10 mt-12">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 opacity-50">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm font-bold">StockPulse</span>
          </div>
          <p className="text-xs text-zinc-400">Powered by Upstox API | Data delayed by 15 mins for free accounts</p>
          <div className="flex gap-4 text-xs font-medium text-zinc-500">
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
