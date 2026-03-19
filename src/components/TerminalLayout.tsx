import React, { useState, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, BarChart, Bar
} from 'recharts';
import {
  TrendingUp, Loader2, ChevronDown, BarChart3,
  LineChart as LineChartIcon, Brain, Activity,
  Download, AlertCircle, Sparkles, CandlestickChart
} from 'lucide-react';
import CandleChart from './CandleChart';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import AssetSearch from './AssetSearch';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
function cleanSymbol(raw: string) { return raw.replace(/^(NSE_EQ|BSE_EQ)[|:]/, ''); }
const isBullishStatus = (s?: string | null) => (s ?? '').toUpperCase().includes('BULLISH');

interface Stock { name: string; symbol: string; key: string; }
interface CandleData {
  time: string; fullTime: string; open: number; high: number;
  low: number; close: number; volume: number; timestamp: number;
  sma20?: number; sma50?: number;
}

export interface TerminalProps {
  query: string; setQuery: (v: string) => void;
  selectedStock: Stock | null; setSelectedStock: (s: Stock | null) => void;
  suggestions: Stock[]; setSuggestions: (s: Stock[]) => void;
  searchRef: React.RefObject<HTMLDivElement>;
  interval: string; setInterval: (v: string) => void;
  data: CandleData[]; liveChartData: CandleData[];
  loading: boolean; error: string | null;
  chartType: 'line' | 'area' | 'bar' | 'candle'; setChartType: (v: 'line' | 'area' | 'bar' | 'candle') => void;
  showSMA20: boolean; setShowSMA20: (v: boolean) => void;
  showSMA50: boolean; setShowSMA50: (v: boolean) => void;
  livePrice: number | null; livePriceChange: number | null;
  livePriceChangePercent: number | null; livePriceSource: string | null;
  livePriceUpdated: string | null; livePriceFlash: 'up' | 'down' | null;
  lastCandleClose: number | null; historicalSource: string | null;
  mdSectors: any[]; mdSentiment: any; mdMomentum: any[]; mdFlash: boolean;
  mdLastUpdated: string | null;
  quantData: any;
  aiAnalysis: string | null; aiSources: any[]; aiConfidence: number;
  aiRecommendation: string | null; aiLastUpdated: string | null;
  aiLoading: boolean; aiInsights: any; advancedIntelligence: any;
  runAiAnalysis: () => void; downloadCSV: () => void;
  fetchData: (s?: Stock | null, iv?: string, fromDate?: string) => void;
  loadMoreHistory: () => void;
  loadingMore: boolean;
  addToWatchlist: (s: Stock) => void;
  watchlist: Array<{ symbol: string; name: string; key: string }>;
  setWatchlist: (fn: (prev: any[]) => any[]) => void;
  activeTab: string; setActiveTab: (t: any) => void;
  quantShellClass: string; quantSubPanelClass: string; isDeskLight: boolean;
}

const TIMEFRAMES = [
  { val: '5minute',  label: '5m' },
  { val: '30minute', label: '30m' },
  { val: 'day',      label: '1D' },
  { val: 'week',     label: '1W' },
];

const POPULAR = [
  { symbol: 'RELIANCE', name: 'Reliance Industries', key: 'NSE_EQ|INE002A01018' },
  { symbol: 'TCS',      name: 'Tata Consultancy',    key: 'NSE_EQ|INE467B01029' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank',           key: 'NSE_EQ|INE040A01034' },
  { symbol: 'INFY',     name: 'Infosys',             key: 'NSE_EQ|INE009A01021' },
  { symbol: 'ICICIBANK',name: 'ICICI Bank',          key: 'NSE_EQ|INE090A01021' },
  { symbol: 'SBIN',     name: 'State Bank',          key: 'NSE_EQ|INE062A01020' },
  { symbol: 'LT',       name: 'Larsen & Toubro',     key: 'NSE_EQ|INE018A01030' },
  { symbol: 'ITC',      name: 'ITC Ltd',             key: 'NSE_EQ|INE154A01025' },
];

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[#1a1a1f] border border-white/10 rounded-xl p-3 text-[10px] font-mono shadow-2xl">
      <p className="text-zinc-400 mb-1.5">{d.fullTime}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        <span className="text-zinc-600">O</span><span className="text-right text-zinc-200">{d.open?.toFixed(2)}</span>
        <span className="text-zinc-600">H</span><span className="text-right text-emerald-400">{d.high?.toFixed(2)}</span>
        <span className="text-zinc-600">L</span><span className="text-right text-rose-400">{d.low?.toFixed(2)}</span>
        <span className="text-zinc-600">C</span><span className="text-right text-white font-bold">{d.close?.toFixed(2)}</span>
        <span className="text-zinc-600">V</span><span className="text-right text-indigo-400">{d.volume?.toLocaleString()}</span>
      </div>
    </div>
  );
}

export default function TerminalLayout(p: TerminalProps) {
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [trendFilter, setTrendFilter] = useState<string | null>(null);
  const [volFilter, setVolFilter] = useState<string | null>(null);

  const isLive = p.livePriceSource === 'upstox' && p.livePrice != null;
  const displayPrice = isLive ? p.livePrice : p.lastCandleClose;

  function applyPreset(label: string) {
    const next = activePreset === label ? null : label;
    setActivePreset(next);
    if (!next) return;
    const presetIntervals: Record<string, string> = {
      Swing: 'day',
      Breakout: '30minute',
      Smart: 'day',
    };
    const iv = presetIntervals[label] ?? p.interval;
    p.setInterval(iv);
    if (p.selectedStock) p.fetchData(p.selectedStock, iv);
  }

  const filteredData = React.useMemo(() => {
    let d = p.liveChartData;
    if (!d.length) return d;
    if (trendFilter === 'Bullish') d = d.filter(c => c.close >= c.open);
    else if (trendFilter === 'Bearish') d = d.filter(c => c.close < c.open);
    if (volFilter) {
      const vols = d.map(c => c.volume).filter(v => v > 0);
      if (vols.length > 0) {
        const avgVol = vols.reduce((a, b) => a + b, 0) / vols.length;
        if (volFilter === 'High') d = d.filter(c => c.volume >= avgVol * 1.5);
        else if (volFilter === 'Low') d = d.filter(c => c.volume < avgVol * 0.5);
        else if (volFilter === 'Surge') d = d.filter(c => c.volume >= avgVol * 2.5);
      }
    }
    return d;
  }, [p.liveChartData, trendFilter, volFilter]);

  const hasActiveFilter = trendFilter !== null || volFilter !== null;
  const chartData = hasActiveFilter ? filteredData : p.liveChartData;

  function handleSelect(s: Stock) {
    p.setSelectedStock(s);
    p.setQuery(s.symbol);
    p.addToWatchlist(s);
    p.setSuggestions([]);
    p.fetchData(s);
  }

  const allWatchlistItems = [
    ...p.watchlist,
    ...POPULAR.filter(pop => !p.watchlist.some(w => w.key === pop.key)),
  ];

  return (
    <div className="flex flex-col gap-2">

      {/* ── TOP CONTROL BAR ── */}
      <div className="flex items-center gap-2 flex-wrap bg-[#111114] border border-white/[0.06] rounded-xl px-3 py-2">
        <div className="w-48 flex-shrink-0" ref={p.searchRef}>
          <AssetSearch
            query={p.query}
            onQueryChange={p.setQuery}
            onSelect={handleSelect}
            containerRef={p.searchRef}
          />
        </div>
        <div className="w-px h-5 bg-white/[0.07] flex-shrink-0" />

        {/* Timeframe */}
        <div className="flex items-center gap-0.5 bg-black/40 border border-white/[0.06] rounded-lg p-0.5">
          {TIMEFRAMES.map(tf => (
            <button key={tf.val}
              onClick={() => { p.setInterval(tf.val); if (p.selectedStock) p.fetchData(p.selectedStock, tf.val); }}
              className={cn('px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-all',
                p.interval === tf.val ? 'bg-indigo-500 text-white shadow-md' : 'text-zinc-600 hover:text-zinc-300')}>
              {tf.label}
            </button>
          ))}
        </div>
        <div className="w-px h-5 bg-white/[0.07] flex-shrink-0" />

        {/* Dropdown filters */}
        {[
          { key: 'trend', label: 'Trend',  opts: ['Bullish','Bearish','Neutral'], val: trendFilter, set: setTrendFilter },
          { key: 'vol',   label: 'Volume', opts: ['High','Low','Surge'],          val: volFilter,   set: setVolFilter   },
        ].map(dd => (
          <div key={dd.key} className="relative">
            <button onClick={() => setOpenDropdown(openDropdown === dd.key ? null : dd.key)}
              className={cn('flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all',
                dd.val ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
                       : 'bg-black/30 border-white/[0.07] text-zinc-500 hover:text-zinc-300')}>
              {dd.val ?? dd.label} <ChevronDown className="w-3 h-3" />
            </button>
            {openDropdown === dd.key && (
              <div className="absolute top-full mt-1 left-0 z-50 bg-[#18181c] border border-white/10 rounded-xl shadow-2xl min-w-[100px] overflow-hidden">
                <button onClick={() => { dd.set(null); setOpenDropdown(null); }}
                  className="w-full text-left px-3 py-2 text-[10px] text-zinc-500 hover:bg-white/5 transition-colors">All</button>
                {dd.opts.map(o => (
                  <button key={o} onClick={() => { dd.set(o); setOpenDropdown(null); }}
                    className={cn('w-full text-left px-3 py-2 text-[10px] hover:bg-white/5 transition-colors',
                      dd.val === o ? 'text-indigo-300 font-bold' : 'text-zinc-400')}>
                    {o}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="w-px h-5 bg-white/[0.07] flex-shrink-0" />

        {/* Presets */}
        {[
          { label: 'Swing',    icon: 'S', cls: 'text-violet-400 border-violet-500/30 bg-violet-500/10' },
          { label: 'Breakout', icon: 'B', cls: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
          { label: 'Smart',    icon: 'M', cls: 'text-amber-400 border-amber-500/30 bg-amber-500/10' },
        ].map(pr => (
          <button key={pr.label} onClick={() => applyPreset(pr.label)}
            className={cn('px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all',
              activePreset === pr.label ? pr.cls : 'bg-black/30 border-white/[0.07] text-zinc-600 hover:text-zinc-300')}>
            {pr.icon} {pr.label}
          </button>
        ))}
        <div className="flex-1" />

        {/* SMA overlays */}
        {[
          { label: 'SMA20', active: p.showSMA20, toggle: () => p.setShowSMA20(!p.showSMA20), on: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' },
          { label: 'SMA50', active: p.showSMA50, toggle: () => p.setShowSMA50(!p.showSMA50), on: 'bg-orange-500/10 border-orange-500/30 text-orange-400' },
        ].map(ov => (
          <button key={ov.label} onClick={ov.toggle}
            className={cn('px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all',
              ov.active ? ov.on : 'bg-black/30 border-white/[0.07] text-zinc-600 hover:text-zinc-300')}>
            {ov.label}
          </button>
        ))}

        {/* Chart type */}
        <div className="flex bg-black/40 border border-white/[0.06] rounded-lg p-0.5">
          {([{ id: 'candle', Icon: CandlestickChart }, { id: 'area', Icon: TrendingUp }, { id: 'line', Icon: LineChartIcon }, { id: 'bar', Icon: BarChart3 }] as const).map(({ id, Icon }) => (
            <button key={id} onClick={() => p.setChartType(id)}
              className={cn('p-1.5 rounded-md transition-all', p.chartType === id ? 'bg-indigo-500 text-white' : 'text-zinc-600 hover:text-zinc-300')}>
              <Icon className="w-3 h-3" />
            </button>
          ))}
        </div>

        {p.data.length > 0 && (
          <button onClick={p.downloadCSV}
            className="p-1.5 rounded-lg bg-black/30 border border-white/[0.07] text-zinc-600 hover:text-zinc-300 transition-all">
            <Download className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* ── WATCHLIST HORIZONTAL STRIP ── */}
      <div className="bg-[#111114] border border-white/[0.06] rounded-xl px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <span className="text-[7px] font-black uppercase tracking-[0.2em] text-zinc-600 flex items-center gap-1 flex-shrink-0 mr-1">
          <Activity className="w-2.5 h-2.5 text-emerald-500" /> Watch
        </span>
        <div className="w-px h-4 bg-white/[0.07] flex-shrink-0" />
        {allWatchlistItems.map(w => {
          const sel = p.selectedStock?.key === w.key;
          const inWatchlist = p.watchlist.some(x => x.key === w.key);
          return (
            <button key={w.key} onClick={() => handleSelect(w)}
              className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black whitespace-nowrap transition-all flex-shrink-0',
                sel
                  ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
                  : 'bg-black/30 border-white/[0.06] text-zinc-500 hover:text-zinc-200 hover:border-white/[0.12]')}>
              {sel && isLive && p.livePrice != null ? (
                <span className={cn('font-mono', p.livePriceFlash === 'up' ? 'text-emerald-300' : p.livePriceFlash === 'down' ? 'text-rose-300' : '')}>
                  {w.symbol} {p.livePrice.toFixed(0)}
                </span>
              ) : w.symbol}
              {inWatchlist && !sel && (
                <span onClick={e => { e.stopPropagation(); p.setWatchlist(prev => prev.filter(x => x.key !== w.key)); }}
                  className="text-zinc-700 hover:text-rose-400 transition-colors text-[9px] leading-none">x</span>
              )}
            </button>
          );
        })}
        {p.selectedStock && !p.watchlist.some(w => w.key === p.selectedStock!.key) && (
          <button onClick={() => p.addToWatchlist(p.selectedStock!)}
            className="flex-shrink-0 px-2 py-1 rounded-full border border-dashed border-indigo-500/30 text-[9px] font-black text-indigo-500 hover:bg-indigo-500/10 transition-all">
            + Add
          </button>
        )}
      </div>

      {/* ── STOCK HEADER (full width) ── */}
      <div className={cn('rounded-xl border px-4 py-2.5 flex items-center justify-between flex-shrink-0 transition-all duration-300',
        isLive ? 'bg-[#0a0f0a] border-emerald-500/15' : 'bg-[#111114] border-white/[0.06]')}>
        {p.selectedStock ? (
          <>
            <div className="flex items-center gap-4">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-base font-black text-white tracking-tight">{cleanSymbol(p.selectedStock.symbol)}</span>
                  <span className="text-[9px] text-zinc-600 hidden sm:inline truncate max-w-[140px]">{p.selectedStock.name}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {isLive ? (
                    <span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">
                      <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse inline-block" /> LIVE
                    </span>
                  ) : p.livePriceSource === 'no_auth' ? (
                    <a href="/upstox/connect" target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded-full">
                      <span className="w-1 h-1 rounded-full bg-rose-500 animate-pulse inline-block" /> Connect Upstox
                    </a>
                  ) : (
                    <span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-zinc-600 bg-zinc-800/50 border border-white/[0.05] px-1.5 py-0.5 rounded-full">
                      <span className="w-1 h-1 rounded-full bg-zinc-600 animate-pulse inline-block" /> Connecting
                    </span>
                  )}
                  {p.historicalSource && (
                    <span className={cn('text-[7px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border',
                      p.historicalSource === 'simulated' ? 'bg-amber-500/8 border-amber-500/15 text-amber-500' : 'bg-emerald-500/8 border-emerald-500/15 text-emerald-500')}>
                      {p.historicalSource === 'simulated' ? 'Simulated' : 'Upstox Feed'}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className={cn('text-2xl font-black font-mono tracking-tighter leading-none transition-all duration-150',
                  p.livePriceFlash === 'up' ? 'text-emerald-300 drop-shadow-[0_0_12px_rgba(52,211,153,0.5)]' :
                  p.livePriceFlash === 'down' ? 'text-rose-300 drop-shadow-[0_0_12px_rgba(248,113,113,0.5)]' :
                  isLive ? 'text-white' : 'text-zinc-500')}>
                  {displayPrice != null ? `\u20B9${displayPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '\u2014'}
                </span>
                {isLive && p.livePriceChangePercent != null && (
                  <span className={cn('text-sm font-black font-mono', p.livePriceChangePercent >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                    {p.livePriceChangePercent >= 0 ? '+' : ''}{p.livePriceChangePercent.toFixed(2)}%
                  </span>
                )}
                {!isLive && p.lastCandleClose != null && (
                  <span className="text-[8px] font-bold text-zinc-700 uppercase tracking-wider">last close</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {[
                { label: 'SMA20', value: p.data.length > 0 && p.data[p.data.length-1].sma20 ? `\u20B9${p.data[p.data.length-1].sma20!.toFixed(1)}` : '\u2014', color: 'text-emerald-400' },
                { label: 'SMA50', value: p.data.length > 0 && p.data[p.data.length-1].sma50 ? `\u20B9${p.data[p.data.length-1].sma50!.toFixed(1)}` : '\u2014', color: 'text-orange-400' },
                { label: 'Vol',   value: p.data.length > 0 ? (p.data[p.data.length-1].volume > 1e6 ? `${(p.data[p.data.length-1].volume/1e6).toFixed(1)}M` : p.data[p.data.length-1].volume.toLocaleString()) : '\u2014', color: 'text-indigo-400' },
                { label: 'Trend', value: p.mdSentiment ? (isBullishStatus(p.mdSentiment.status) ? 'Bull' : 'Bear') : '\u2014', color: p.mdSentiment ? (isBullishStatus(p.mdSentiment.status) ? 'text-emerald-400' : 'text-rose-400') : 'text-zinc-600' },
              ].map(m => (
                <div key={m.label} className="bg-black/30 rounded-lg px-2 py-1 border border-white/[0.05] text-center">
                  <p className="text-[7px] font-bold text-zinc-600 uppercase">{m.label}</p>
                  <p className={cn('text-[10px] font-black font-mono', m.color)}>{m.value}</p>
                </div>
              ))}
              {p.aiRecommendation && (
                <div className={cn('px-2 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest',
                  p.aiRecommendation === 'BUY' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' :
                  p.aiRecommendation === 'SELL' ? 'bg-rose-500/10 text-rose-400 border-rose-500/25' :
                  'bg-zinc-700/40 text-zinc-400 border-zinc-600/25')}>
                  {p.aiRecommendation}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5 text-indigo-500/50" />
            </div>
            <div>
              <p className="text-sm font-bold text-zinc-400">Select an instrument</p>
              <p className="text-[10px] text-zinc-600">Search or click a stock from the watchlist</p>
            </div>
          </div>
        )}
      </div>

      {/* ── MARKET DYNAMICS STRIP (full width) ── */}
      <div className={cn('rounded-lg border bg-[#0d0d10] flex-shrink-0 transition-all duration-300',
        p.mdFlash ? 'border-indigo-500/15' : 'border-white/[0.05]')}>
        <div className="flex items-stretch divide-x divide-white/[0.05]">
          {[
            { label: 'Mood', value: p.mdSentiment ? (isBullishStatus(p.mdSentiment.status) ? 'Bull' : 'Bear') : '\u2014', color: p.mdSentiment ? (isBullishStatus(p.mdSentiment.status) ? 'text-emerald-400' : 'text-rose-400') : 'text-zinc-700' },
            { label: 'A/D',  value: p.mdSentiment?.adRatio ?? '\u2014', color: 'text-white' },
            { label: 'Conf', value: p.mdSentiment ? `${p.mdSentiment.confidence}%` : '\u2014', color: 'text-indigo-400' },
            { label: 'Vol',  value: p.mdSentiment?.volatility ?? '\u2014', color: p.mdSentiment?.volatility === 'Low' ? 'text-emerald-400' : p.mdSentiment?.volatility === 'High' ? 'text-rose-400' : 'text-amber-400' },
          ].map(item => (
            <div key={item.label} className="flex-1 px-3 py-1.5 min-w-0">
              <p className="text-[7px] font-bold text-zinc-700 uppercase tracking-widest">{item.label}</p>
              <p className={cn('text-[10px] font-black', item.color)}>{item.value}</p>
            </div>
          ))}
          {p.mdSectors.length > 0 && (
            <div className="flex-1 px-3 py-1.5 min-w-0 hidden sm:block">
              <p className="text-[7px] font-bold text-zinc-700 uppercase tracking-widest">Top Sector</p>
              <p className={cn('text-[10px] font-black truncate', Number(p.mdSectors[0]?.return) >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                {p.mdSectors[0]?.name}
              </p>
            </div>
          )}
          <div className="px-3 py-1.5 flex items-center">
            <span className={cn('w-1.5 h-1.5 rounded-full', p.mdFlash ? 'bg-indigo-400' : p.mdLastUpdated ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-700')} />
          </div>
        </div>
        {p.mdSectors.length > 0 && (
          <div className="border-t border-white/[0.04] px-2 py-1 flex gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden">
            {p.mdSectors.slice(0, 12).map((s: any) => {
              const ret = Number(s.return ?? 0);
              return (
                <div key={s.name} className={cn('flex-shrink-0 px-1.5 py-0.5 rounded border text-center min-w-[44px]',
                  ret >= 0 ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-rose-500/5 border-rose-500/10')}>
                  <p className="text-[6px] font-bold text-zinc-700 uppercase whitespace-nowrap">{s.name}</p>
                  <p className={cn('text-[8px] font-black font-mono', ret >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                    {ret >= 0 ? '+' : ''}{ret.toFixed(1)}%
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── FULL-WIDTH CHART ── */}
      <div className="bg-[#111114] rounded-xl border border-white/[0.06] overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 26rem)', minHeight: '420px' }}>
        {p.loading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
              <TrendingUp className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-400 w-3.5 h-3.5" />
            </div>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.3em]">Loading</p>
          </div>
        )}
        {!p.loading && p.error && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <AlertCircle className="w-8 h-8 text-rose-500/60" />
            <p className="text-xs font-bold text-zinc-400">Data Error</p>
            <p className="text-[10px] text-zinc-600 max-w-xs">{p.error}</p>
            <button onClick={() => p.fetchData()}
              className="px-4 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-white transition-all">
              Retry
            </button>
          </div>
        )}
        {!p.loading && !p.error && chartData.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
            <div className="w-14 h-14 bg-indigo-500/5 rounded-2xl flex items-center justify-center border border-indigo-500/10 animate-pulse">
              <TrendingUp className="w-7 h-7 text-indigo-500/30" />
            </div>
            <p className="text-sm font-bold text-zinc-500">
              {hasActiveFilter ? 'No candles match the active filter' : 'Select a stock to load chart'}
            </p>
            {hasActiveFilter && (
              <button onClick={() => { setTrendFilter(null); setVolFilter(null); }}
                className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 underline">
                Clear filters
              </button>
            )}
          </div>
        )}
        {!p.loading && !p.error && chartData.length > 0 && (
          <div className="flex-1 p-3 min-h-0 relative">
            <div className="absolute top-2 left-3 z-10 flex items-center gap-2 pointer-events-none">
              <span className="text-[8px] text-zinc-700">Scroll to zoom | Drag to pan</span>
              {hasActiveFilter && (
                <span className="text-[8px] font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded pointer-events-auto cursor-pointer"
                  onClick={() => { setTrendFilter(null); setVolFilter(null); }}>
                  {chartData.length}/{p.liveChartData.length} filtered · clear
                </span>
              )}
            </div>
            {p.chartType === 'candle' ? (
              <div className="w-full h-full relative">
                <CandleChart data={chartData} showSMA20={p.showSMA20} showSMA50={p.showSMA50} height={undefined}
                  onLoadMore={p.loadMoreHistory} loadingMore={p.loadingMore} />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                {p.chartType === 'area' ? (
                  <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="tGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#52525b', fontWeight: 600 }} minTickGap={40} dy={8} />
                    <YAxis domain={['auto','auto']} axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#52525b', fontWeight: 600 }} orientation="right" dx={8} />
                    <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }} />
                    <Area type="monotone" dataKey="close" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#tGrad)" isAnimationActive={false} />
                    {p.showSMA20 && <Line type="monotone" dataKey="sma20" stroke="#10b981" strokeWidth={1.5} dot={false} strokeDasharray="4 4" isAnimationActive={false} />}
                    {p.showSMA50 && <Line type="monotone" dataKey="sma50" stroke="#f97316" strokeWidth={1.5} dot={false} strokeDasharray="4 4" isAnimationActive={false} />}
                  </AreaChart>
                ) : p.chartType === 'line' ? (
                  <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#52525b', fontWeight: 600 }} minTickGap={40} dy={8} />
                    <YAxis domain={['auto','auto']} axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#52525b', fontWeight: 600 }} orientation="right" dx={8} />
                    <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }} />
                    <Line type="monotone" dataKey="close" stroke="#6366f1" strokeWidth={2} dot={false} isAnimationActive={false} />
                    {p.showSMA20 && <Line type="monotone" dataKey="sma20" stroke="#10b981" strokeWidth={1.5} dot={false} strokeDasharray="4 4" isAnimationActive={false} />}
                    {p.showSMA50 && <Line type="monotone" dataKey="sma50" stroke="#f97316" strokeWidth={1.5} dot={false} strokeDasharray="4 4" isAnimationActive={false} />}
                  </LineChart>
                ) : (
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#52525b', fontWeight: 600 }} minTickGap={40} dy={8} />
                    <YAxis domain={['auto','auto']} axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#52525b', fontWeight: 600 }} orientation="right" dx={8} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                    <Bar dataKey="close" fill="#6366f1" radius={[4,4,0,0]} isAnimationActive={false} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            )}
          </div>
        )}
      </div>

      {/* Volume mini — only for non-candle types */}
      {chartData.length > 0 && !p.loading && p.chartType !== 'candle' && (
        <div className="h-14 bg-[#111114] rounded-xl border border-white/[0.06] px-3 pt-1.5 pb-1 flex-shrink-0">
          <p className="text-[7px] font-bold text-zinc-700 uppercase tracking-widest mb-0.5">Volume</p>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <Bar dataKey="volume" fill="rgba(99,102,241,0.2)" radius={[2,2,0,0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── INTELLIGENCE PANEL — horizontal row of cards below chart ── */}
      <div className="grid grid-cols-6 gap-2">

        {/* AI Signal */}
        <div className={cn('bg-[#111114] rounded-xl border p-3 flex flex-col gap-2 transition-all duration-500',
          p.aiRecommendation === 'BUY' ? 'border-emerald-500/20' :
          p.aiRecommendation === 'SELL' ? 'border-rose-500/20' : 'border-white/[0.06]')}>
          <div className="flex items-center justify-between">
            <span className="text-[7px] font-black uppercase tracking-widest text-zinc-600 flex items-center gap-1">
              <Brain className="w-2.5 h-2.5 text-indigo-400" /> AI Signal
            </span>
            {p.aiRecommendation ? (
              <span className={cn('text-[8px] font-black px-1.5 py-0.5 rounded border uppercase tracking-widest',
                p.aiRecommendation === 'BUY' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' :
                p.aiRecommendation === 'SELL' ? 'bg-rose-500/15 text-rose-400 border-rose-500/25' :
                'bg-zinc-700/40 text-zinc-400 border-zinc-600/25')}>
                {p.aiRecommendation}
              </span>
            ) : <span className="text-[7px] text-zinc-700 italic">No signal</span>}
          </div>
          {p.aiConfidence > 0 && (
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[7px] font-bold text-zinc-700 uppercase">Conf</span>
                <span className="text-[8px] font-mono text-zinc-400">{p.aiConfidence}%</span>
              </div>
              <div className="w-full h-0.5 bg-black/50 rounded-full overflow-hidden">
                <div className={cn('h-full rounded-full transition-all duration-700',
                  p.aiConfidence > 70 ? 'bg-emerald-500' : p.aiConfidence > 40 ? 'bg-yellow-500' : 'bg-rose-500')}
                  style={{ width: `${p.aiConfidence}%` }} />
              </div>
            </div>
          )}
          {p.selectedStock && (
            <button onClick={p.runAiAnalysis} disabled={p.aiLoading}
              className="mt-auto w-full py-1 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-lg text-[7px] font-black uppercase tracking-widest text-indigo-400 transition-all flex items-center justify-center gap-1">
              {p.aiLoading ? <Loader2 className="w-2 h-2 animate-spin" /> : <Brain className="w-2 h-2" />}
              {p.aiLoading ? 'Analyzing...' : 'Run Audit'}
            </button>
          )}
        </div>

        {/* Fear/Greed */}
        <div className="bg-[#111114] rounded-xl border border-white/[0.06] p-3 flex flex-col gap-2">
          <span className="text-[7px] font-black uppercase tracking-widest text-zinc-600">Fear / Greed</span>
          <div className="bg-black/30 rounded-lg p-2 border border-white/[0.05] flex-1 flex flex-col justify-center">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[7px] font-bold text-rose-400 uppercase">Fear</span>
              <span className="text-[11px] font-black font-mono text-white">{p.aiInsights?.psychology?.fearGreedIndex ?? 50}</span>
              <span className="text-[7px] font-bold text-emerald-400 uppercase">Greed</span>
            </div>
            <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-r from-rose-500 via-yellow-400 to-emerald-500 opacity-40 rounded-full" />
              <div className="absolute top-0 bottom-0 w-1.5 bg-white rounded-full shadow-[0_0_6px_rgba(255,255,255,0.7)] transition-all duration-700"
                style={{ left: `calc(${p.aiInsights?.psychology?.fearGreedIndex ?? 50}% - 3px)` }} />
            </div>
          </div>
        </div>

        {/* Momentum */}
        <div className="bg-[#111114] rounded-xl border border-white/[0.06] p-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[7px] font-black uppercase tracking-widest text-zinc-600">Momentum</span>
            <span className="flex items-center gap-1 text-[6px] font-black text-emerald-500">
              <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse inline-block" /> LIVE
            </span>
          </div>
          <div className="space-y-0.5 flex-1 overflow-hidden">
            {p.quantData?.momentum?.slice(0, 3).map((m: any, i: number) => (
              <div key={i} className="flex items-center justify-between px-1.5 py-1 rounded-lg bg-black/20 border border-white/[0.04]">
                <span className="text-[9px] font-black text-white truncate">{cleanSymbol(m.symbol)}</span>
                <span className="text-[8px] font-mono font-black text-emerald-400 flex-shrink-0 ml-1">+{m.priceChange}%</span>
              </div>
            ))}
            {(!p.quantData?.momentum || p.quantData.momentum.length === 0) && (
              <p className="text-[7px] text-zinc-700 text-center py-2">No signals</p>
            )}
          </div>
        </div>

        {/* Breakouts */}
        <div className="bg-[#111114] rounded-xl border border-white/[0.06] p-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[7px] font-black uppercase tracking-widest text-zinc-600">Breakouts</span>
            <span className="text-[6px] font-black text-indigo-500">DETECTED</span>
          </div>
          <div className="space-y-0.5 flex-1 overflow-hidden">
            {p.quantData?.breakouts?.slice(0, 3).map((b: any, i: number) => (
              <div key={i} className="flex items-center justify-between px-1.5 py-1 rounded-lg bg-black/20 border border-white/[0.04]">
                <span className="text-[9px] font-black text-white truncate">{cleanSymbol(b.symbol)}</span>
                <span className="text-[8px] font-black text-indigo-400 flex-shrink-0 ml-1">{b.strength}</span>
              </div>
            ))}
            {(!p.quantData?.breakouts || p.quantData.breakouts.length === 0) && (
              <p className="text-[7px] text-zinc-700 text-center py-2">No breakouts</p>
            )}
          </div>
        </div>

        {/* Sectors */}
        <div className="bg-[#111114] rounded-xl border border-white/[0.06] p-3 flex flex-col gap-1.5">
          <span className="text-[7px] font-black uppercase tracking-widest text-zinc-600">Sectors</span>
          <div className="space-y-0.5 flex-1 overflow-hidden">
            {p.mdSectors.length > 0 ? (
              <>
                {[...p.mdSectors].sort((a,b) => Number(b.return)-Number(a.return)).slice(0,2).map((s:any) => (
                  <div key={s.name} className="flex items-center justify-between px-1.5 py-1 rounded-lg bg-emerald-500/[0.04] border border-emerald-500/[0.08]">
                    <span className="text-[8px] font-bold text-zinc-500 truncate">{s.name}</span>
                    <span className="text-[8px] font-black font-mono text-emerald-400 ml-1 flex-shrink-0">+{Number(s.return).toFixed(1)}%</span>
                  </div>
                ))}
                {[...p.mdSectors].sort((a,b) => Number(a.return)-Number(b.return)).slice(0,1).map((s:any) => (
                  <div key={s.name+'-l'} className="flex items-center justify-between px-1.5 py-1 rounded-lg bg-rose-500/[0.04] border border-rose-500/[0.08]">
                    <span className="text-[8px] font-bold text-zinc-500 truncate">{s.name}</span>
                    <span className="text-[8px] font-black font-mono text-rose-400 ml-1 flex-shrink-0">{Number(s.return).toFixed(1)}%</span>
                  </div>
                ))}
              </>
            ) : (
              <p className="text-[7px] text-zinc-700 text-center py-2">No data</p>
            )}
          </div>
        </div>

        {/* Vol Surge */}
        <div className="bg-[#111114] rounded-xl border border-white/[0.06] p-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[7px] font-black uppercase tracking-widest text-zinc-600">Vol Surge</span>
            <span className="text-[6px] font-black text-orange-500">ALERT</span>
          </div>
          <div className="space-y-0.5 flex-1 overflow-hidden">
            {p.quantData?.surges?.slice(0,3).map((s:any, i:number) => (
              <div key={i} className="flex items-center justify-between px-1.5 py-1 rounded-lg bg-black/20 border border-white/[0.04]">
                <span className="text-[9px] font-black text-white truncate">{cleanSymbol(s.symbol)}</span>
                <span className="text-[8px] font-black font-mono text-orange-400 flex-shrink-0 ml-1">{s.ratio}x</span>
              </div>
            ))}
            {(!p.quantData?.surges || p.quantData.surges.length === 0) && (
              <p className="text-[7px] text-zinc-700 text-center py-2">No surges</p>
            )}
          </div>
        </div>

      </div>{/* end intelligence grid */}

      {/* ── AI ANALYSIS (full width below) ── */}
      {chartData.length > 0 && (
        <div className="bg-[#111114] rounded-xl border border-white/[0.06] p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-bold text-white">Smart AI Analysis</h3>
              {p.aiLastUpdated && <span className="text-[8px] font-mono text-zinc-600">updated {p.aiLastUpdated}</span>}
            </div>
            <button onClick={p.runAiAnalysis} disabled={p.aiLoading}
              className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 disabled:bg-zinc-800 text-white px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all">
              {p.aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
              {p.aiLoading ? 'Analyzing...' : 'Full Audit'}
            </button>
          </div>
          {p.aiAnalysis ? (
            <div className="prose prose-invert max-w-none bg-black/30 rounded-xl p-5 border border-white/[0.05] text-sm">
              <Markdown>{p.aiAnalysis}</Markdown>
            </div>
          ) : (
            <div className="bg-black/20 rounded-xl p-8 border border-dashed border-white/[0.06] flex flex-col items-center justify-center text-center gap-3">
              <Brain className="w-8 h-8 text-indigo-500/30" />
              <p className="text-xs font-bold text-zinc-500">AI Engine Ready — click Full Audit to analyze</p>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
