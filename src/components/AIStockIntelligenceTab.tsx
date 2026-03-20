import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJson } from '../lib/api';
import {
  Activity, AlertTriangle, BarChart2, Brain, ChevronUp, ChevronDown,
  Globe, Newspaper, RefreshCw, Shield, TrendingUp, TrendingDown,
  Zap, ArrowUpRight, ArrowDownRight, Clock, Cpu, Target, Flame,
  BarChart, Eye, Filter
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StockAlert {
  stockSymbol: string;
  reason: string;
  confidenceScore: number;
  timestamp: string;
  alertType: string;
  severity: string;
}

interface StockIntelligenceResult {
  symbol: string;
  sector: string;
  industry: string;
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;
  priceAcceleration: number;
  volumeSpike: number;
  earlyRallySignal: boolean;
  rallyProbabilityScore: number;
  quantFilterScore: number;
  socialSentimentScore: number;
  newsSentimentScore: number;
  newsImpactScore: number;
  macroScore: number;
  sectorImpact: string;
  orderImbalance: number;
  institutionalSignal: boolean;
  institutionalScore: number;
  aiPredictionScore: number;
  marketRegime: string;
  rlAction: string;
  finalScore: number;
  rank: number;
  alerts: StockAlert[];
  signal: string;
  confidence: string;
}

interface NewsItem {
  headline: string;
  sector: string;
  impact: string;
  sentiment: string;
  timestamp: string;
  source: string;
  // per-stock fields (present when type === 'stock')
  type?: 'stock' | 'macro';
  symbol?: string | null;
  rallyTrigger?: string;
  riskFactor?: string;
  aiScore?: number;
  signal?: string;
  priceChange?: number;
  volumeSpike?: number;
  earlyRally?: boolean;
  // base fallback fields
  rallyRelevance?: string;
}

interface SectorStrength {
  sector: string;
  avgScore: number;
  maxScore: number;
  stockCount: number;
  strength: string;
}

interface MacroSnapshot {
  [key: string]: { value: string; trend?: string; impact?: string; momentum?: string; vix?: string };
}

interface Dashboard {
  rankings: StockIntelligenceResult[];
  earlyRallyCandidates: StockIntelligenceResult[];
  liveAlerts: StockAlert[];
  newsFeed: NewsItem[];
  macroSnapshot: MacroSnapshot;
  sectorStrength: SectorStrength[];
  summary: Record<string, string | number>;
  computedAt: string;
  aiPowered?: boolean;
  aiInsights?: string;
  marketSummary?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
const s100 = (v: number) => Math.round(v * 100);
const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
};

// ─── Micro Components ─────────────────────────────────────────────────────────

function ScoreRing({ value, size = 44, stroke = 4, color = '#10b981' }: {
  value: number; size?: number; stroke?: number; color?: string;
}) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.min(1, value);
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 1s ease' }}
      />
    </svg>
  );
}

function ScoreBar({ value, color = 'emerald', thin = false }: { value: number; color?: string; thin?: boolean }) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-500', cyan: 'bg-cyan-400', amber: 'bg-amber-400',
    rose: 'bg-rose-500', violet: 'bg-violet-400', blue: 'bg-blue-400',
    indigo: 'bg-indigo-400',
  };
  return (
    <div className={`w-full rounded-full bg-white/5 overflow-hidden ${thin ? 'h-1' : 'h-1.5'}`}>
      <div
        className={`h-full rounded-full transition-all duration-700 ${colorMap[color] ?? 'bg-emerald-500'}`}
        style={{ width: `${Math.min(100, s100(value))}%` }}
      />
    </div>
  );
}

function SignalBadge({ signal, large = false }: { signal: string; large?: boolean }) {
  const map: Record<string, string> = {
    'STRONG BUY': 'bg-emerald-500/25 text-emerald-300 border-emerald-500/40',
    'BUY':        'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    'HOLD':       'bg-amber-500/15   text-amber-400   border-amber-500/25',
    'SELL':       'bg-rose-500/15    text-rose-400    border-rose-500/25',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-black uppercase tracking-[0.15em] ${large ? 'text-[10px]' : 'text-[8px]'} ${map[signal] ?? map['HOLD']}`}>
      {signal}
    </span>
  );
}

function AlertTypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    RALLY:         'bg-emerald-500/15 text-emerald-300',
    INSTITUTIONAL: 'bg-violet-500/15  text-violet-300',
    NEWS:          'bg-blue-500/15    text-blue-300',
    SENTIMENT:     'bg-cyan-500/15    text-cyan-300',
    VOLUME:        'bg-amber-500/15   text-amber-300',
    AI_PREDICTION: 'bg-rose-500/15    text-rose-300',
  };
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] ${map[type] ?? 'bg-white/10 text-zinc-300'}`}>
      {type.replace('_', ' ')}
    </span>
  );
}

function ImpactDot({ impact }: { impact: string }) {
  const c = impact === 'HIGH' ? 'bg-rose-400' : impact === 'MEDIUM' ? 'bg-amber-400' : 'bg-white/20';
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${c}`} />;
}

// ─── Live Ticker Strip ────────────────────────────────────────────────────────

function LiveTickerStrip({ rankings }: { rankings: StockIntelligenceResult[] }) {
  const top = rankings.slice(0, 12);
  const items = [...top, ...top]; // duplicate for seamless loop
  return (
    <div className="overflow-hidden border-y border-white/5 bg-black/30 py-2">
      <div className="flex animate-marquee gap-8 whitespace-nowrap">
        {items.map((r, i) => (
          <div key={i} className="flex items-center gap-2 text-[10px] font-bold">
            <span className={`w-1.5 h-1.5 rounded-full ${r.priceChangePercent >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            <span className="text-white/80">{r.symbol}</span>
            <span className={r.priceChangePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {pct(r.priceChangePercent)}
            </span>
            <span className="text-white/20">|</span>
            <span className="text-violet-400">AI {s100(r.finalScore)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Summary KPI Bar ─────────────────────────────────────────────────────────

function KPIBar({ summary, computedAt, aiPowered }: {
  summary: Record<string, string | number>;
  computedAt: string;
  aiPowered?: boolean;
}) {
  const bias = summary.marketBias as string;
  const biasColor = bias === 'BULLISH' ? 'text-emerald-400' : bias === 'BEARISH' ? 'text-rose-400' : 'text-amber-400';
  const biasBg   = bias === 'BULLISH' ? 'bg-emerald-500/10 border-emerald-500/20' : bias === 'BEARISH' ? 'bg-rose-500/10 border-rose-500/20' : 'bg-amber-500/10 border-amber-500/20';

  const kpis = [
    { label: 'Universe', value: summary.totalScanned, icon: Eye, color: 'text-white' },
    { label: 'Bullish', value: summary.bullishCount, icon: TrendingUp, color: 'text-emerald-400' },
    { label: 'Rally Signals', value: summary.earlyRallyCount, icon: Zap, color: 'text-amber-400' },
    { label: 'High Conf.', value: summary.highConfidenceCount, icon: Target, color: 'text-cyan-400' },
    { label: 'Avg Score', value: s100(Number(summary.averageFinalScore)), icon: BarChart, color: 'text-violet-400' },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {kpis.map(k => (
        <div key={k.label} className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
          <k.icon size={16} className={`${k.color} shrink-0 opacity-70`} />
          <div>
            <p className={`text-xl font-black leading-none ${k.color}`}>{k.value}</p>
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/30 mt-0.5">{k.label}</p>
          </div>
        </div>
      ))}
      <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${biasBg}`}>
        <Flame size={16} className={`${biasColor} shrink-0`} />
        <div>
          <p className={`text-xl font-black leading-none ${biasColor}`}>{bias}</p>
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/30 mt-0.5">Market Bias</p>
        </div>
      </div>
    </div>
  );
}

// ─── Rankings Table ───────────────────────────────────────────────────────────

type SortKey = keyof StockIntelligenceResult;

function RankingsTable({ data }: { data: StockIntelligenceResult[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('finalScore');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [filter, setFilter] = useState('');
  const [signalFilter, setSignalFilter] = useState('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const filtered = [...data]
    .filter(r => !filter || r.symbol.includes(filter.toUpperCase()) || r.sector.toLowerCase().includes(filter.toLowerCase()))
    .filter(r => signalFilter === 'ALL' || r.signal === signalFilter)
    .sort((a, b) => {
      const av = Number(a[sortKey]), bv = Number(b[sortKey]);
      return sortDir === 'desc' ? bv - av : av - bv;
    });

  const SortIcon = ({ k }: { k: SortKey }) => sortKey === k
    ? (sortDir === 'desc' ? <ChevronDown size={10} className="text-violet-400" /> : <ChevronUp size={10} className="text-violet-400" />)
    : <ChevronDown size={10} className="opacity-20" />;

  const cols: Array<{ key: SortKey; label: string; color: string }> = [
    { key: 'rank',                  label: '#',      color: 'text-white/40' },
    { key: 'finalScore',            label: 'Score',  color: 'text-emerald-400' },
    { key: 'rallyProbabilityScore', label: 'Rally',  color: 'text-amber-400' },
    { key: 'institutionalScore',    label: 'Inst.',  color: 'text-violet-400' },
    { key: 'aiPredictionScore',     label: 'AI',     color: 'text-cyan-400' },
    { key: 'quantFilterScore',      label: 'Quant',  color: 'text-blue-400' },
    { key: 'priceChangePercent',    label: 'Chg%',   color: 'text-white' },
    { key: 'volumeSpike',           label: 'Vol',    color: 'text-amber-300' },
  ];

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5">
          <Filter size={11} className="text-white/30" />
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter symbol / sector..."
            className="bg-transparent text-[11px] text-white placeholder-white/20 outline-none w-36"
          />
        </div>
        {['ALL', 'STRONG BUY', 'BUY', 'HOLD', 'SELL'].map(s => (
          <button
            key={s}
            onClick={() => setSignalFilter(s)}
            className={`rounded-lg px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] transition-all ${
              signalFilter === s
                ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                : 'text-white/30 hover:text-white/60 border border-transparent'
            }`}
          >
            {s}
          </button>
        ))}
        <span className="ml-auto text-[9px] text-white/20 font-mono">{filtered.length} stocks</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-white/5">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-white/5 bg-white/[0.03]">
              <th className="px-3 py-2.5 text-left font-black uppercase tracking-[0.15em] text-white/30 whitespace-nowrap">#</th>
              <th className="px-3 py-2.5 text-left font-black uppercase tracking-[0.15em] text-white/30">Symbol</th>
              {cols.slice(1).map(c => (
                <th
                  key={String(c.key)}
                  onClick={() => handleSort(c.key)}
                  className="cursor-pointer px-3 py-2.5 text-left whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    <span className={`font-black uppercase tracking-[0.15em] ${sortKey === c.key ? c.color : 'text-white/30'} hover:text-white/60 transition-colors`}>{c.label}</span>
                    <SortIcon k={c.key} />
                  </div>
                </th>
              ))}
              <th className="px-3 py-2.5 text-left font-black uppercase tracking-[0.15em] text-white/30">Signal</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <React.Fragment key={row.symbol}>
                <tr
                  onClick={() => setExpanded(expanded === row.symbol ? null : row.symbol)}
                  className={`border-b border-white/5 cursor-pointer transition-colors hover:bg-white/[0.04] ${
                    row.earlyRallySignal ? 'bg-amber-500/[0.04]' : ''
                  } ${expanded === row.symbol ? 'bg-violet-500/[0.06]' : ''}`}
                >
                  <td className="px-3 py-2.5 text-white/30 font-mono text-[10px]">{row.rank}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {row.earlyRallySignal && <Zap size={9} className="text-amber-400 shrink-0" />}
                      {row.institutionalSignal && <Shield size={9} className="text-violet-400 shrink-0" />}
                      <span className="font-black text-white">{row.symbol}</span>
                      <span className="text-white/25 text-[9px] hidden sm:inline">{row.sector}</span>
                    </div>
                  </td>
                  {/* Score with ring */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="relative flex items-center justify-center w-8 h-8">
                        <ScoreRing value={row.finalScore} size={30} stroke={3} color="#10b981" />
                        <span className="absolute text-[8px] font-black text-emerald-400">{s100(row.finalScore)}</span>
                      </div>
                    </div>
                  </td>
                  {/* Rally */}
                  <td className="px-3 py-2.5 min-w-[70px]">
                    <div className="space-y-0.5">
                      <span className="font-bold text-amber-400 text-[10px]">{s100(row.rallyProbabilityScore)}</span>
                      <ScoreBar value={row.rallyProbabilityScore} color="amber" thin />
                    </div>
                  </td>
                  {/* Inst */}
                  <td className="px-3 py-2.5 min-w-[70px]">
                    <div className="space-y-0.5">
                      <span className="font-bold text-violet-400 text-[10px]">{s100(row.institutionalScore)}</span>
                      <ScoreBar value={row.institutionalScore} color="violet" thin />
                    </div>
                  </td>
                  {/* AI */}
                  <td className="px-3 py-2.5 min-w-[70px]">
                    <div className="space-y-0.5">
                      <span className="font-bold text-cyan-400 text-[10px]">{s100(row.aiPredictionScore)}</span>
                      <ScoreBar value={row.aiPredictionScore} color="cyan" thin />
                    </div>
                  </td>
                  {/* Quant */}
                  <td className="px-3 py-2.5 min-w-[70px]">
                    <div className="space-y-0.5">
                      <span className="font-bold text-blue-400 text-[10px]">{s100(row.quantFilterScore)}</span>
                      <ScoreBar value={row.quantFilterScore} color="blue" thin />
                    </div>
                  </td>
                  {/* Chg% */}
                  <td className={`px-3 py-2.5 font-bold text-[11px] ${row.priceChangePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    <div className="flex items-center gap-0.5">
                      {row.priceChangePercent >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                      {Math.abs(row.priceChangePercent).toFixed(2)}%
                    </div>
                  </td>
                  {/* Vol */}
                  <td className="px-3 py-2.5 text-amber-300 font-bold text-[10px]">{row.volumeSpike.toFixed(1)}x</td>
                  {/* Signal */}
                  <td className="px-3 py-2.5"><SignalBadge signal={row.signal} /></td>
                </tr>
                {/* Expanded detail row */}
                {expanded === row.symbol && (
                  <tr className="border-b border-violet-500/10 bg-violet-500/[0.04]">
                    <td colSpan={10} className="px-4 py-3">
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-[10px]">
                        <div>
                          <p className="text-white/30 uppercase tracking-[0.15em] mb-1">Price Acceleration</p>
                          <p className="font-black text-amber-400">{pct(row.priceAcceleration)}</p>
                        </div>
                        <div>
                          <p className="text-white/30 uppercase tracking-[0.15em] mb-1">Order Imbalance</p>
                          <p className="font-black text-violet-400">{row.orderImbalance.toFixed(2)}x</p>
                        </div>
                        <div>
                          <p className="text-white/30 uppercase tracking-[0.15em] mb-1">Market Regime</p>
                          <p className="font-black text-cyan-400">{row.marketRegime}</p>
                        </div>
                        <div>
                          <p className="text-white/30 uppercase tracking-[0.15em] mb-1">RL Action</p>
                          <p className="font-black text-white">{row.rlAction}</p>
                        </div>
                        <div>
                          <p className="text-white/30 uppercase tracking-[0.15em] mb-1">Social Sentiment</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="font-bold text-cyan-400">{s100(row.socialSentimentScore)}</span>
                            <ScoreBar value={row.socialSentimentScore} color="cyan" thin />
                          </div>
                        </div>
                        <div>
                          <p className="text-white/30 uppercase tracking-[0.15em] mb-1">News Sentiment</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="font-bold text-blue-400">{s100(row.newsSentimentScore)}</span>
                            <ScoreBar value={row.newsSentimentScore} color="blue" thin />
                          </div>
                        </div>
                        <div>
                          <p className="text-white/30 uppercase tracking-[0.15em] mb-1">Macro Score</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="font-bold text-indigo-400">{s100(row.macroScore)}</span>
                            <ScoreBar value={row.macroScore} color="indigo" thin />
                          </div>
                        </div>
                        <div>
                          <p className="text-white/30 uppercase tracking-[0.15em] mb-1">Confidence</p>
                          <p className="font-black text-white">{row.confidence}</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Early Rally Panel ────────────────────────────────────────────────────────

function EarlyRallyPanel({ candidates }: { candidates: StockIntelligenceResult[] }) {
  if (!candidates.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-white/30">
        <Zap size={32} className="opacity-20" />
        <p className="text-sm font-bold">No early rally signals detected right now</p>
        <p className="text-[11px]">The engine scans for price acceleration + volume spikes every 60s</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {candidates.map(c => (
        <div key={c.symbol} className="group rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent p-4 space-y-3 hover:border-amber-500/40 transition-all">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Zap size={13} className="text-amber-400" />
                <span className="font-black text-white text-sm">{c.symbol}</span>
                {c.institutionalSignal && <Shield size={11} className="text-violet-400" />}
              </div>
              <p className="text-[9px] text-white/30 mt-0.5 uppercase tracking-[0.15em]">{c.sector} — {c.marketRegime}</p>
            </div>
            <SignalBadge signal={c.signal} large />
          </div>

          {/* Score ring + stats */}
          <div className="flex items-center gap-4">
            <div className="relative flex items-center justify-center w-14 h-14 shrink-0">
              <ScoreRing value={c.rallyProbabilityScore} size={56} stroke={4} color="#f59e0b" />
              <div className="absolute text-center">
                <p className="text-[13px] font-black text-amber-400 leading-none">{s100(c.rallyProbabilityScore)}</p>
                <p className="text-[7px] text-white/30 uppercase">Rally</p>
              </div>
            </div>
            <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-2 text-[10px]">
              <div>
                <p className="text-white/30 uppercase tracking-[0.12em]">Accel</p>
                <p className="font-black text-amber-400">{pct(c.priceAcceleration)}</p>
              </div>
              <div>
                <p className="text-white/30 uppercase tracking-[0.12em]">Vol Spike</p>
                <p className="font-black text-amber-400">{c.volumeSpike.toFixed(1)}x</p>
              </div>
              <div>
                <p className="text-white/30 uppercase tracking-[0.12em]">AI Score</p>
                <p className="font-black text-cyan-400">{s100(c.aiPredictionScore)}</p>
              </div>
              <div>
                <p className="text-white/30 uppercase tracking-[0.12em]">Inst. Score</p>
                <p className="font-black text-violet-400">{s100(c.institutionalScore)}</p>
              </div>
            </div>
          </div>

          {/* Score bars */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-12 text-[9px] text-white/30">Quant</span>
              <ScoreBar value={c.quantFilterScore} color="blue" thin />
              <span className="text-[9px] text-blue-400 w-5 text-right">{s100(c.quantFilterScore)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-12 text-[9px] text-white/30">Macro</span>
              <ScoreBar value={c.macroScore} color="indigo" thin />
              <span className="text-[9px] text-indigo-400 w-5 text-right">{s100(c.macroScore)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Alerts Feed ──────────────────────────────────────────────────────────────

function AlertsFeed({ alerts }: { alerts: StockAlert[] }) {
  const [filter, setFilter] = useState<'ALL' | 'HIGH' | 'MEDIUM'>('ALL');
  const shown = alerts.filter(a => filter === 'ALL' || a.severity === filter);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {(['ALL', 'HIGH', 'MEDIUM'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1 text-[9px] font-black uppercase tracking-[0.12em] transition-all border ${
              filter === f
                ? f === 'HIGH' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                  : f === 'MEDIUM' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : 'bg-violet-500/20 text-violet-300 border-violet-500/30'
                : 'text-white/30 border-transparent hover:text-white/50'
            }`}
          >
            {f}
          </button>
        ))}
        <span className="ml-auto text-[9px] text-white/20 font-mono">{shown.length} alerts</span>
      </div>

      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10">
        {shown.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-white/20">
            <AlertTriangle size={28} className="opacity-30" />
            <p className="text-sm font-bold">No alerts</p>
          </div>
        )}
        {shown.map((a, i) => (
          <div
            key={i}
            className={`rounded-xl border p-3 space-y-2 transition-all hover:border-white/10 ${
              a.severity === 'HIGH'
                ? 'border-rose-500/20 bg-gradient-to-r from-rose-500/5 to-transparent'
                : 'border-white/5 bg-white/[0.03]'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${a.severity === 'HIGH' ? 'bg-rose-400 animate-pulse' : 'bg-amber-400'}`} />
                <span className="font-black text-white text-[12px]">{a.stockSymbol}</span>
                <AlertTypeBadge type={a.alertType} />
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5">
                  <Cpu size={9} className="text-cyan-400" />
                  <span className="text-[9px] font-black text-cyan-400">{Math.round(a.confidenceScore * 100)}%</span>
                </div>
                <span className="text-[9px] text-white/20 font-mono">{timeAgo(a.timestamp)}</span>
              </div>
            </div>
            <p className="text-[10px] text-white/50 leading-relaxed pl-3.5">{a.reason}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── News Feed ────────────────────────────────────────────────────────────────

function NewsFeedPanel({ news }: { news: NewsItem[] }) {
  const [tab, setTab] = useState<'stock' | 'macro' | 'all'>('stock');
  const [signalFilter, setSignalFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const stockNews = news.filter(n => n.type === 'stock' || (n.symbol && n.symbol !== null));
  const macroNews = news.filter(n => n.type === 'macro' || (!n.symbol && n.type !== 'stock'));
  // fallback: if no type field, treat all as stock news
  const hasTypes = news.some(n => n.type);
  const shown = !hasTypes ? news
    : tab === 'stock' ? stockNews
    : tab === 'macro' ? macroNews
    : news;

  const filtered = shown
    .filter(n => !search || (n.symbol || '').includes(search.toUpperCase()) || n.headline.toLowerCase().includes(search.toLowerCase()) || n.sector.toLowerCase().includes(search.toLowerCase()))
    .filter(n => signalFilter === 'ALL' || n.signal === signalFilter);

  const signals = ['ALL', 'STRONG BUY', 'BUY', 'HOLD', 'SELL'];

  return (
    <div className="space-y-3">
      {/* Tab + filters */}
      {hasTypes && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-white/5 bg-white/5 p-0.5">
            {(['stock', 'macro', 'all'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-lg px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] transition-all ${
                  tab === t ? 'bg-violet-500/20 text-violet-300' : 'text-white/30 hover:text-white/60'
                }`}
              >
                {t === 'stock' ? `Stock News (${stockNews.length})` : t === 'macro' ? `Macro (${macroNews.length})` : 'All'}
              </button>
            ))}
          </div>
          {tab !== 'macro' && (
            <div className="flex flex-wrap gap-1">
              {signals.map(s => (
                <button
                  key={s}
                  onClick={() => setSignalFilter(s)}
                  className={`rounded-lg px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] transition-all border ${
                    signalFilter === s
                      ? s === 'STRONG BUY' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : s === 'BUY' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                        : s === 'SELL' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                        : s === 'HOLD' ? 'bg-amber-500/15 text-amber-400 border-amber-500/20'
                        : 'bg-violet-500/20 text-violet-300 border-violet-500/30'
                      : 'text-white/25 border-transparent hover:text-white/50'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/5 px-3 py-1.5">
        <Eye size={11} className="text-white/20" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search symbol, sector, headline..."
          className="bg-transparent text-[11px] text-white placeholder-white/20 outline-none flex-1"
        />
        {search && <button onClick={() => setSearch('')} className="text-white/20 hover:text-white/50 text-[10px]">x</button>}
      </div>

      <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-white/20">
            <Newspaper size={28} className="opacity-30" />
            <p className="text-sm font-bold">No news matching filters</p>
          </div>
        )}

        {filtered.map((item, i) => {
          const isStock = item.type === 'stock' || (item.symbol && item.symbol !== null);
          const isRally = item.earlyRally;
          return (
            <div
              key={i}
              className={`rounded-xl border p-3.5 space-y-2 transition-all hover:border-white/10 ${
                isRally ? 'border-amber-500/20 bg-amber-500/[0.04]'
                : item.impact === 'HIGH' ? 'border-white/10 bg-white/[0.04]'
                : 'border-white/5 bg-white/[0.02]'
              }`}
            >
              {/* Top row */}
              <div className="flex items-start gap-2.5">
                <ImpactDot impact={item.impact} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {item.symbol && (
                      <span className="font-black text-white text-[12px]">{item.symbol}</span>
                    )}
                    {item.signal && item.signal !== 'HOLD' && (
                      <SignalBadge signal={item.signal} />
                    )}
                    {isRally && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/25 px-1.5 py-0.5 text-[8px] font-black text-amber-400">
                        <Zap size={8} />
                        RALLY
                      </span>
                    )}
                    {item.aiScore !== undefined && item.aiScore > 0 && (
                      <span className="text-[8px] font-black text-violet-400 bg-violet-500/10 rounded px-1.5 py-0.5">
                        AI {item.aiScore}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-bold text-white leading-snug">{item.headline}</p>
                </div>
              </div>

              {/* Rally trigger + risk */}
              {(item.rallyTrigger || item.riskFactor) && (
                <div className="grid grid-cols-1 gap-1.5 pl-4 sm:grid-cols-2">
                  {item.rallyTrigger && (
                    <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/10 px-2.5 py-1.5">
                      <p className="text-[8px] font-black uppercase tracking-[0.12em] text-emerald-400/60 mb-0.5">Rally Trigger</p>
                      <p className="text-[10px] text-emerald-300/80 leading-snug">{item.rallyTrigger}</p>
                    </div>
                  )}
                  {item.riskFactor && (
                    <div className="rounded-lg bg-rose-500/5 border border-rose-500/10 px-2.5 py-1.5">
                      <p className="text-[8px] font-black uppercase tracking-[0.12em] text-rose-400/60 mb-0.5">Risk Factor</p>
                      <p className="text-[10px] text-rose-300/80 leading-snug">{item.riskFactor}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Quant stats row */}
              {isStock && (item.priceChange !== undefined || item.volumeSpike !== undefined) && (
                <div className="flex items-center gap-3 pl-4 text-[9px]">
                  {item.priceChange !== undefined && (
                    <span className={`flex items-center gap-0.5 font-bold ${item.priceChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {item.priceChange >= 0 ? <ArrowUpRight size={9} /> : <ArrowDownRight size={9} />}
                      {Math.abs(item.priceChange).toFixed(2)}%
                    </span>
                  )}
                  {item.volumeSpike !== undefined && item.volumeSpike > 1.2 && (
                    <span className="text-amber-400 font-bold">{item.volumeSpike.toFixed(1)}x vol</span>
                  )}
                  <span className="text-white/25 font-bold uppercase tracking-[0.1em]">{item.sector}</span>
                  <span className="text-white/20">{item.source}</span>
                  <span className="ml-auto text-white/20 font-mono flex items-center gap-1">
                    <Clock size={8} />
                    {timeAgo(item.timestamp)}
                  </span>
                </div>
              )}

              {/* Macro news footer */}
              {!isStock && (
                <div className="flex items-center gap-3 pl-4 text-[9px]">
                  <span className={`font-black uppercase tracking-[0.1em] ${
                    item.sentiment === 'POSITIVE' ? 'text-emerald-400'
                    : item.sentiment === 'NEGATIVE' ? 'text-rose-400'
                    : 'text-white/30'
                  }`}>{item.sentiment}</span>
                  <span className="text-white/25 font-bold uppercase tracking-[0.1em]">{item.sector}</span>
                  <span className="text-white/20">{item.source}</span>
                  <span className="ml-auto text-white/20 font-mono flex items-center gap-1">
                    <Clock size={8} />
                    {timeAgo(item.timestamp)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Macro Panel ──────────────────────────────────────────────────────────────

function MacroPanel({ macro, aiInsights }: { macro: MacroSnapshot; aiInsights?: string }) {
  const labelMap: Record<string, { label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = {
    repoRate:        { label: 'Repo Rate',    icon: Target },
    inflation:       { label: 'Inflation',    icon: TrendingUp },
    crudePriceUSD:   { label: 'Crude (USD)',  icon: Flame },
    usdinr:          { label: 'USD / INR',    icon: Globe },
    nifty50Trend:    { label: 'Nifty 50',     icon: BarChart2 },
    fiiFlow:         { label: 'FII Flow',     icon: Activity },
    globalSentiment: { label: 'Global Mood',  icon: Brain },
  };

  return (
    <div className="space-y-4">
      {aiInsights && (
        <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 to-transparent px-5 py-4 flex items-start gap-3">
          <Brain size={16} className="text-emerald-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400/60 mb-1">Gemini AI Market Outlook</p>
            <p className="text-[11px] text-white/70 leading-relaxed">{aiInsights}</p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        {Object.entries(macro).map(([key, val]) => {
          const meta = labelMap[key];
          const Icon = meta?.icon ?? Globe;
          const isPos = val.impact === 'POSITIVE';
          const isNeg = val.impact === 'NEGATIVE';
          return (
            <div
              key={key}
              className={`rounded-2xl border p-4 space-y-2 transition-all hover:border-white/10 ${
                isPos ? 'border-emerald-500/15 bg-emerald-500/[0.04]'
                : isNeg ? 'border-rose-500/15 bg-rose-500/[0.04]'
                : 'border-white/5 bg-white/[0.03]'
              }`}
            >
              <div className="flex items-center justify-between">
                <Icon size={13} className={isPos ? 'text-emerald-400' : isNeg ? 'text-rose-400' : 'text-white/30'} />
                {val.trend && (
                  <span className={`text-[8px] font-black uppercase tracking-[0.12em] ${
                    val.trend === 'RISING' || val.trend === 'INFLOW' ? 'text-emerald-400'
                    : val.trend === 'FALLING' || val.trend === 'OUTFLOW' ? 'text-rose-400'
                    : 'text-white/30'
                  }`}>
                    {val.trend}
                  </span>
                )}
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/30">{meta?.label ?? key}</p>
                <p className="text-lg font-black text-white mt-0.5">{val.value}</p>
              </div>
              {val.impact && (
                <span className={`inline-block text-[8px] font-black uppercase tracking-[0.12em] ${
                  isPos ? 'text-emerald-400' : isNeg ? 'text-rose-400' : 'text-white/25'
                }`}>
                  {val.impact}
                </span>
              )}
              {val.vix && <p className="text-[9px] text-white/30">VIX: {val.vix}</p>}
              {val.momentum && <p className="text-[9px] text-white/30">Momentum: {val.momentum}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Sector Strength ──────────────────────────────────────────────────────────

function SectorStrengthPanel({ sectors }: { sectors: SectorStrength[] }) {
  const sorted = [...sectors].sort((a, b) => b.avgScore - a.avgScore);
  const max = Math.max(...sorted.map(s => s.avgScore), 0.01);

  return (
    <div className="space-y-2">
      {sorted.map((s, i) => (
        <div key={s.sector} className="flex items-center gap-3 group">
          <span className="w-5 text-[9px] text-white/20 font-mono text-right">{i + 1}</span>
          <span className="w-28 text-[10px] font-bold text-white/60 truncate group-hover:text-white/80 transition-colors">{s.sector}</span>
          <div className="flex-1 h-2.5 rounded-full bg-white/5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                s.strength === 'STRONG' ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                : s.strength === 'MODERATE' ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                : 'bg-gradient-to-r from-rose-600 to-rose-500'
              }`}
              style={{ width: `${(s.avgScore / max) * 100}%` }}
            />
          </div>
          <span className="w-7 text-right text-[10px] font-black text-white/50">{s100(s.avgScore)}</span>
          <span className={`w-16 text-[9px] font-black uppercase tracking-[0.12em] ${
            s.strength === 'STRONG' ? 'text-emerald-400'
            : s.strength === 'MODERATE' ? 'text-amber-400'
            : 'text-rose-400'
          }`}>
            {s.strength}
          </span>
          <span className="text-[9px] text-white/20">{s.stockCount} stocks</span>
        </div>
      ))}
    </div>
  );
}

// ─── Next-Day Predictions ─────────────────────────────────────────────────────

interface PredSignals { RSI: number; MACD: number; Volume: number; Trend: number; Sentiment: number; Bollinger: number; }
interface PredStock {
  stock: string; sector: string; prediction: 'Bullish' | 'Bearish';
  confidence: number; signals: PredSignals; explanation: string;
  predicted_price: number; current_price: number;
  indicators: { rsi: number; atr: number; volumeRatio: number; ema20: number; ema50: number };
}
interface PredData {
  bullish: PredStock[]; bearish: PredStock[];
  totalScanned: number; bullishCount: number; bearishCount: number; generatedAt: string;
}
interface HistoryData {
  date: string; bullish: any[]; bearish: any[]; total: number;
}
interface AccuracyData { total: number; correct: number; accuracy: number; avgConfidence: number; }

function SignalBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round(Math.abs(value) * 100);
  const isPos = value >= 0;
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-500', rose: 'bg-rose-500', amber: 'bg-amber-400',
    cyan: 'bg-cyan-400', violet: 'bg-violet-400', blue: 'bg-blue-400',
  };
  return (
    <div className="flex items-center gap-2 text-[9px]">
      <span className="w-14 text-white/40 uppercase tracking-[0.1em] shrink-0">{label}</span>
      <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full rounded-full ${colorMap[color] ?? 'bg-white/30'}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`w-8 text-right font-bold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
        {isPos ? '+' : ''}{value.toFixed(2)}
      </span>
    </div>
  );
}

// Mini SVG sparkline — generates a simple path from 8 pseudo-random price points seeded by stock name
function MiniSparkline({ stock, isBullish }: { stock: string; isBullish: boolean }) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    let h = 0;
    for (let j = 0; j < stock.length; j++) h = (h * 31 + stock.charCodeAt(j) + i * 7) & 0xffff;
    return 20 + (h % 40);
  });
  if (isBullish) { pts[pts.length - 1] = Math.min(pts[pts.length - 1], 25); pts[0] = Math.max(pts[0], 45); }
  else { pts[pts.length - 1] = Math.max(pts[pts.length - 1], 45); pts[0] = Math.min(pts[0], 25); }
  const w = 80; const h = 28;
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * w);
  const ys = pts.map(v => h - ((v - 10) / 50) * h);
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const fill = `${d} L${w},${h} L0,${h} Z`;
  const stroke = isBullish ? '#10b981' : '#f43f5e';
  const fillColor = isBullish ? 'rgba(16,185,129,0.12)' : 'rgba(244,63,94,0.12)';
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <path d={fill} fill={fillColor} />
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function getRiskLevel(atr: number, currentPrice: number, confidence: number): { label: string; color: string; bg: string } {
  const atrPct = currentPrice > 0 ? (atr / currentPrice) * 100 : 0;
  if (atrPct > 3 || confidence < 65) return { label: 'High Risk', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' };
  if (atrPct > 1.5 || confidence < 75) return { label: 'Med Risk', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' };
  return { label: 'Low Risk', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' };
}

function getSignalAgreement(signals: PredSignals): number {
  return Object.values(signals).filter(v => v > 0.05).length;
}

function PredCard({ p, rank, isBullish }: { p: PredStock; rank: number; isBullish: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const color = isBullish ? 'emerald' : 'rose';
  const borderColor = isBullish ? 'border-emerald-500/20 hover:border-emerald-500/40' : 'border-rose-500/20 hover:border-rose-500/40';
  const bgColor = isBullish ? 'from-emerald-500/5' : 'from-rose-500/5';
  const textColor = isBullish ? 'text-emerald-400' : 'text-rose-400';
  const Icon = isBullish ? TrendingUp : TrendingDown;
  const priceDelta = (((p.predicted_price - p.current_price) / p.current_price) * 100);
  const risk = getRiskLevel(p.indicators.atr, p.current_price, p.confidence);
  const agreement = getSignalAgreement(p.signals);
  const isBreakout = p.indicators.volumeRatio > 1.5;
  const emaTrend = p.indicators.ema20 > p.indicators.ema50 ? 'up' : 'down';

  return (
    <div
      onClick={() => setExpanded(e => !e)}
      className={`rounded-2xl border ${borderColor} bg-gradient-to-br ${bgColor} to-transparent p-4 space-y-3 cursor-pointer transition-all`}
    >
      {/* Row 1: rank + symbol + badges */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-black shrink-0 mt-0.5 ${isBullish ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
            {rank}
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Icon size={12} className={textColor} />
              <span className="font-black text-white text-sm">{p.stock}</span>
              <span className="rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase bg-white/5 text-white/40 border border-white/5">NSE</span>
              {isBreakout && (
                <span className="rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase bg-amber-500/15 text-amber-400 border border-amber-500/20">
                  Breakout
                </span>
              )}
            </div>
            <p className="text-[9px] text-white/30 mt-0.5 uppercase tracking-[0.12em]">{p.sector}</p>
          </div>
        </div>
        <div className="text-right shrink-0 space-y-1">
          <div className={`text-lg font-black ${textColor}`}>{p.confidence}%</div>
          <div className="text-[8px] text-white/30 uppercase tracking-[0.1em]">Confidence</div>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${isBullish ? 'bg-emerald-500' : 'bg-rose-500'}`}
          style={{ width: `${p.confidence}%` }}
        />
      </div>

      {/* Row 2: sparkline + price info */}
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3 text-[10px]">
            <span className="text-white/40">Now: <span className="text-white font-bold">{p.current_price.toFixed(2)}</span></span>
            <span className="text-white/20">→</span>
            <span className="text-white/40">Target: <span className={`font-bold ${textColor}`}>{p.predicted_price.toFixed(2)}</span></span>
            <span className={`font-black text-xs ${textColor}`}>{isBullish ? '+' : ''}{priceDelta.toFixed(2)}%</span>
          </div>
          {/* EMA trend + risk badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[8px] font-black border ${risk.bg} ${risk.color}`}>
              {risk.label}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[8px] font-black border ${emaTrend === 'up' ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400' : 'bg-white/5 border-white/10 text-white/30'}`}>
              EMA {emaTrend === 'up' ? 'Bull' : 'Bear'}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[8px] font-black border bg-violet-500/10 border-violet-500/20 text-violet-400">
              {agreement}/6 signals
            </span>
          </div>
        </div>
        <div className="shrink-0">
          <MiniSparkline stock={p.stock} isBullish={isBullish} />
        </div>
      </div>

      {/* Explanation */}
      <p className="text-[10px] text-white/50 leading-relaxed">{p.explanation}</p>

      {/* Expanded signal breakdown */}
      {expanded && (
        <div className="space-y-1.5 pt-2 border-t border-white/5">
          <p className="text-[8px] font-black uppercase tracking-[0.15em] text-white/25 mb-2">Signal Breakdown</p>
          <SignalBar label="RSI" value={p.signals.RSI} color={p.signals.RSI >= 0 ? 'emerald' : 'rose'} />
          <SignalBar label="MACD" value={p.signals.MACD} color={p.signals.MACD >= 0 ? 'emerald' : 'rose'} />
          <SignalBar label="Volume" value={p.signals.Volume} color="amber" />
          <SignalBar label="Trend" value={p.signals.Trend} color={p.signals.Trend >= 0 ? 'cyan' : 'rose'} />
          <SignalBar label="Sentiment" value={p.signals.Sentiment} color={p.signals.Sentiment >= 0 ? 'violet' : 'rose'} />
          <SignalBar label="Bollinger" value={p.signals.Bollinger} color={p.signals.Bollinger >= 0 ? 'blue' : 'rose'} />
          <div className="grid grid-cols-5 gap-2 pt-2 text-[9px]">
            <div><span className="text-white/30">RSI </span><span className="font-bold text-white">{p.indicators.rsi.toFixed(1)}</span></div>
            <div><span className="text-white/30">Vol </span><span className="font-bold text-amber-400">{p.indicators.volumeRatio.toFixed(2)}x</span></div>
            <div><span className="text-white/30">ATR </span><span className="font-bold text-white">{p.indicators.atr.toFixed(2)}</span></div>
            <div><span className="text-white/30">EMA20 </span><span className="font-bold text-cyan-400">{p.indicators.ema20.toFixed(1)}</span></div>
            <div><span className="text-white/30">EMA50 </span><span className="font-bold text-cyan-300">{p.indicators.ema50.toFixed(1)}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

function NextDayPredictions() {
  const [tab, setTab] = useState<'live' | 'history'>('live');
  const [data, setData] = useState<PredData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyDate, setHistoryDate] = useState('');
  const [historyData, setHistoryData] = useState<HistoryData | null>(null);
  const [historyDates, setHistoryDates] = useState<string[]>([]);
  const [accuracy, setAccuracy] = useState<AccuracyData | null>(null);
  const [histLoading, setHistLoading] = useState(false);
  const [filterSector, setFilterSector] = useState('All');
  const [filterType, setFilterType] = useState<'All' | 'Bullish' | 'Bearish'>('All');
  const [minConf, setMinConf] = useState(60);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  const loadPredictions = async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/predictions/run${refresh ? '?refresh=true' : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      // If still computing, auto-poll every 5s
      if (json.computing) {
        setTimeout(() => loadPredictions(false), 5000);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async (date: string) => {
    if (!date) return;
    setHistLoading(true);
    try {
      const res = await fetch(`/api/predictions/history/${date}`);
      setHistoryData(await res.json());
    } catch { /* ignore */ } finally {
      setHistLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'live' && !data) loadPredictions();
    if (tab === 'history') {
      fetch('/api/predictions/dates').then(r => r.json()).then(d => {
        setHistoryDates(d.dates || []);
        if (d.dates?.length && !historyDate) {
          setHistoryDate(d.dates[0]);
          loadHistory(d.dates[0]);
        }
      }).catch(() => {});
      fetch('/api/predictions/accuracy').then(r => r.json()).then(setAccuracy).catch(() => {});
    }
  }, [tab]);

  // Derived filtered lists
  const allStocks: PredStock[] = data ? [...data.bullish, ...data.bearish] : [];
  const sectors = ['All', ...Array.from(new Set(allStocks.map(s => s.sector))).sort()];
  const filteredBullish = (data?.bullish ?? []).filter(s =>
    s.confidence >= minConf &&
    (filterSector === 'All' || s.sector === filterSector) &&
    (filterType === 'All' || filterType === 'Bullish')
  );
  const filteredBearish = (data?.bearish ?? []).filter(s =>
    s.confidence >= minConf &&
    (filterSector === 'All' || s.sector === filterSector) &&
    (filterType === 'All' || filterType === 'Bearish')
  );
  const filteredAll = [...filteredBullish, ...filteredBearish].sort((a, b) => b.confidence - a.confidence);
  const biasRatio = data && data.bullishCount + data.bearishCount > 0
    ? Math.round((data.bullishCount / (data.bullishCount + data.bearishCount)) * 100)
    : 50;
  const sectorMap: Record<string, { bull: number; bear: number }> = {};
  allStocks.forEach(s => {
    if (!sectorMap[s.sector]) sectorMap[s.sector] = { bull: 0, bear: 0 };
    if (s.prediction === 'Bullish') sectorMap[s.sector].bull++;
    else sectorMap[s.sector].bear++;
  });
  const topSectors = Object.entries(sectorMap)
    .sort((a, b) => (b[1].bull + b[1].bear) - (a[1].bull + a[1].bear))
    .slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex rounded-xl border border-white/5 bg-white/5 p-0.5">
          {(['live', 'history'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] transition-all ${tab === t ? 'bg-violet-500/20 text-violet-300' : 'text-white/30 hover:text-white/60'}`}>
              {t === 'live' ? 'Live Predictions' : 'History'}
            </button>
          ))}
        </div>
        {tab === 'live' && (
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl border border-white/5 bg-white/5 p-0.5">
              <button onClick={() => setViewMode('cards')}
                className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] transition-all ${viewMode === 'cards' ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/60'}`}>
                Cards
              </button>
              <button onClick={() => setViewMode('table')}
                className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] transition-all ${viewMode === 'table' ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/60'}`}>
                Table
              </button>
            </div>
            <button onClick={() => loadPredictions(true)} disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-white/50 hover:text-white hover:border-white/20 transition disabled:opacity-40">
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        )}
      </div>

      {/* ── LIVE TAB ── */}
      {tab === 'live' && (
        <>
          {loading && (
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <div className="w-12 h-12 rounded-full border-2 border-violet-500/30 flex items-center justify-center">
                <Brain size={20} className="text-violet-400 animate-pulse" />
              </div>
              <p className="text-[11px] text-white/40 font-bold uppercase tracking-[0.15em]">Running prediction engine...</p>
            </div>
          )}
          {!loading && !error && data && (data as any).computing && (
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <div className="relative">
                <div className="w-14 h-14 rounded-full border-2 border-violet-500/20 animate-ping absolute inset-0" />
                <div className="w-14 h-14 rounded-full border-2 border-violet-500/40 flex items-center justify-center">
                  <Brain size={22} className="text-violet-400 animate-pulse" />
                </div>
              </div>
              <p className="text-sm font-black uppercase tracking-[0.15em] text-white/60">Scanning full universe...</p>
              <p className="text-[11px] text-white/25">{(data as any).message}</p>
              <div className="flex gap-1.5">
                {[0,1,2,3,4].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-violet-500/40 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}
          {error && (
            <div className="flex flex-col items-center gap-3 py-12 text-rose-400">
              <AlertTriangle size={24} className="opacity-60" />
              <p className="text-sm font-bold">{error}</p>
              <button onClick={() => loadPredictions()} className="rounded-xl bg-rose-500/10 border border-rose-500/20 px-4 py-1.5 text-xs font-black uppercase tracking-[0.15em] hover:bg-rose-500/20 transition">Retry</button>
            </div>
          )}
          {!loading && !error && data && !(data as any).computing && (
            <>
              {/* Stats bar */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: 'Scanned', value: data.totalScanned, color: 'text-white' },
                  { label: 'Bullish', value: data.bullishCount, color: 'text-emerald-400' },
                  { label: 'Bearish', value: data.bearishCount, color: 'text-rose-400' },
                  { label: 'Top Picks', value: data.bullish.length + data.bearish.length, color: 'text-violet-400' },
                ].map(k => (
                  <div key={k.label} className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-center">
                    <p className={`text-2xl font-black ${k.color}`}>{k.value}</p>
                    <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/30 mt-0.5">{k.label}</p>
                  </div>
                ))}
              </div>

              {/* Market bias + top sectors */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.15em] text-white/30">Market Bias</p>
                  <div className="flex items-center justify-between text-[11px] font-black">
                    <span className="text-emerald-400">Bull {biasRatio}%</span>
                    <span className="text-rose-400">Bear {100 - biasRatio}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-rose-500/30 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${biasRatio}%` }} />
                  </div>
                  <p className={`text-[10px] font-bold ${biasRatio >= 55 ? 'text-emerald-400' : biasRatio <= 45 ? 'text-rose-400' : 'text-amber-400'}`}>
                    {biasRatio >= 55 ? 'Bullish Market Sentiment' : biasRatio <= 45 ? 'Bearish Market Sentiment' : 'Neutral / Mixed Signals'}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.15em] text-white/30">Top Sectors</p>
                  {topSectors.map(([sec, counts]) => (
                    <div key={sec} className="flex items-center gap-2 text-[10px]">
                      <span className="text-white/60 truncate flex-1">{sec}</span>
                      <span className="text-emerald-400 font-bold">{counts.bull}B</span>
                      <span className="text-rose-400 font-bold">{counts.bear}S</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Filter bar */}
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-white/25 mr-1">Filters:</span>
                <div className="flex rounded-lg border border-white/5 bg-white/5 p-0.5">
                  {(['All', 'Bullish', 'Bearish'] as const).map(t => (
                    <button key={t} onClick={() => setFilterType(t)}
                      className={`rounded-md px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.1em] transition-all ${filterType === t ? (t === 'Bullish' ? 'bg-emerald-500/20 text-emerald-400' : t === 'Bearish' ? 'bg-rose-500/20 text-rose-400' : 'bg-white/10 text-white') : 'text-white/30 hover:text-white/60'}`}>
                      {t}
                    </button>
                  ))}
                </div>
                <select value={filterSector} onChange={e => setFilterSector(e.target.value)}
                  className="rounded-lg border border-white/5 bg-black/40 px-2.5 py-1 text-[9px] font-bold text-white/60 focus:outline-none focus:border-violet-500/30">
                  {sectors.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-white/30 font-bold">Min Conf:</span>
                  <input type="range" min={50} max={90} step={5} value={minConf}
                    onChange={e => setMinConf(Number(e.target.value))}
                    className="w-20 accent-violet-500" />
                  <span className="text-[9px] font-black text-violet-400 w-8">{minConf}%</span>
                </div>
                <span className="text-[9px] text-white/20 font-mono ml-auto">{filteredAll.length} results</span>
              </div>

              {/* Card view */}
              {viewMode === 'cards' && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp size={14} className="text-emerald-400" />
                      <span className="text-[11px] font-black uppercase tracking-[0.15em] text-emerald-400">Top Bullish ({filteredBullish.length})</span>
                    </div>
                    {filteredBullish.length === 0 && (
                      <div className="flex flex-col items-center gap-2 py-10 text-white/20">
                        <TrendingUp size={24} className="opacity-30" />
                        <p className="text-xs font-bold">No bullish signals match filters</p>
                      </div>
                    )}
                    {filteredBullish.map((p, i) => <PredCard key={p.stock} p={p} rank={i + 1} isBullish={true} />)}
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <TrendingDown size={14} className="text-rose-400" />
                      <span className="text-[11px] font-black uppercase tracking-[0.15em] text-rose-400">Top Bearish ({filteredBearish.length})</span>
                    </div>
                    {filteredBearish.length === 0 && (
                      <div className="flex flex-col items-center gap-2 py-10 text-white/20">
                        <TrendingDown size={24} className="opacity-30" />
                        <p className="text-xs font-bold">No bearish signals match filters</p>
                      </div>
                    )}
                    {filteredBearish.map((p, i) => <PredCard key={p.stock} p={p} rank={i + 1} isBullish={false} />)}
                  </div>
                </div>
              )}

              {/* Table view */}
              {viewMode === 'table' && (
                <div className="overflow-x-auto rounded-2xl border border-white/5">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-white/5 bg-white/[0.03]">
                        {['#', 'Symbol', 'Sector', 'Signal', 'Conf', 'Current', 'Target', 'Change', 'Risk', 'Vol', 'RSI', 'Signals'].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left font-black uppercase tracking-[0.1em] text-white/25 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAll.map((p, i) => {
                        const isBull = p.prediction === 'Bullish';
                        const delta = (((p.predicted_price - p.current_price) / p.current_price) * 100);
                        const risk = getRiskLevel(p.indicators.atr, p.current_price, p.confidence);
                        const agreement = getSignalAgreement(p.signals);
                        return (
                          <tr key={p.stock} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                            <td className="px-3 py-2.5 text-white/30 font-bold">{i + 1}</td>
                            <td className="px-3 py-2.5 font-black text-white">{p.stock}</td>
                            <td className="px-3 py-2.5 text-white/40 text-[10px]">{p.sector}</td>
                            <td className={`px-3 py-2.5 font-bold ${isBull ? 'text-emerald-400' : 'text-rose-400'}`}>
                              <div className="flex items-center gap-1">
                                {isBull ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                {p.prediction}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-violet-400 font-black">{p.confidence}%</td>
                            <td className="px-3 py-2.5 text-white/60 font-mono">{p.current_price.toFixed(2)}</td>
                            <td className={`px-3 py-2.5 font-mono font-bold ${isBull ? 'text-emerald-400' : 'text-rose-400'}`}>{p.predicted_price.toFixed(2)}</td>
                            <td className={`px-3 py-2.5 font-bold ${isBull ? 'text-emerald-400' : 'text-rose-400'}`}>{isBull ? '+' : ''}{delta.toFixed(2)}%</td>
                            <td className={`px-3 py-2.5 text-[9px] font-black ${risk.color}`}>{risk.label}</td>
                            <td className={`px-3 py-2.5 font-bold ${p.indicators.volumeRatio > 1.5 ? 'text-amber-400' : 'text-white/40'}`}>{p.indicators.volumeRatio.toFixed(2)}x</td>
                            <td className="px-3 py-2.5 text-white/60 font-mono">{p.indicators.rsi.toFixed(1)}</td>
                            <td className="px-3 py-2.5 text-violet-400 font-bold">{agreement}/6</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="text-[9px] text-white/20 text-center font-mono">
                Generated {new Date(data.generatedAt).toLocaleString()} — click any card to expand signals
              </p>
            </>
          )}
        </>
      )}

      {/* ── HISTORY TAB ── */}
      {tab === 'history' && (
        <div className="space-y-4">
          {/* Accuracy stats */}
          {accuracy && accuracy.total > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: 'Total Tracked', value: accuracy.total, color: 'text-white' },
                { label: 'Correct', value: accuracy.correct, color: 'text-emerald-400' },
                { label: 'Accuracy', value: `${accuracy.accuracy.toFixed(1)}%`, color: accuracy.accuracy >= 60 ? 'text-emerald-400' : 'text-rose-400' },
                { label: 'Avg Confidence', value: `${accuracy.avgConfidence.toFixed(1)}%`, color: 'text-violet-400' },
              ].map(k => (
                <div key={k.label} className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-center">
                  <p className={`text-2xl font-black ${k.color}`}>{k.value}</p>
                  <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/30 mt-0.5">{k.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Date selector */}
          {historyDates.length > 0 ? (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-[9px] text-white/30 uppercase tracking-[0.15em] font-bold">Select Date:</span>
              <div className="flex flex-wrap gap-1.5">
                {historyDates.slice(0, 14).map(d => (
                  <button
                    key={d}
                    onClick={() => { setHistoryDate(d); loadHistory(d); }}
                    className={`rounded-lg px-3 py-1 text-[9px] font-black transition-all border ${
                      historyDate === d
                        ? 'bg-violet-500/20 text-violet-300 border-violet-500/30'
                        : 'text-white/30 border-white/5 hover:text-white/60 hover:border-white/10'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-12 text-white/20">
              <Clock size={28} className="opacity-30" />
              <p className="text-sm font-bold">No prediction history yet</p>
              <p className="text-[11px]">Run predictions from the Live tab to start building history</p>
            </div>
          )}

          {/* History results */}
          {histLoading && (
            <div className="flex items-center justify-center gap-3 py-10 text-white/30">
              <RefreshCw size={16} className="animate-spin" />
              <span className="text-sm font-bold">Loading history...</span>
            </div>
          )}
          {!histLoading && historyData && historyData.total > 0 && (
            <div className="space-y-3">
              <p className="text-[10px] text-white/30 font-mono">{historyData.total} predictions for {historyData.date}</p>
              <div className="overflow-x-auto rounded-2xl border border-white/5">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/[0.03]">
                      {['Symbol', 'Prediction', 'Confidence', 'Predicted', 'Actual', 'Change', 'Result'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left font-black uppercase tracking-[0.12em] text-white/30 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...historyData.bullish, ...historyData.bearish].map((p: any, i: number) => {
                      const isBull = p.prediction === 'Bullish';
                      const hasActual = p.actual_price != null;
                      const correct = p.accuracy === 100;
                      return (
                        <tr key={i} className={`border-b border-white/5 transition-colors hover:bg-white/[0.03] ${hasActual && correct ? 'bg-emerald-500/[0.03]' : hasActual && !correct ? 'bg-rose-500/[0.03]' : ''}`}>
                          <td className="px-3 py-2.5 font-black text-white">{p.stock_symbol}</td>
                          <td className={`px-3 py-2.5 font-bold ${isBull ? 'text-emerald-400' : 'text-rose-400'}`}>
                            <div className="flex items-center gap-1">
                              {isBull ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                              {p.prediction}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-violet-400 font-bold">{p.confidence}%</td>
                          <td className="px-3 py-2.5 text-white/60 font-mono">{p.predicted_price?.toFixed(2) ?? '—'}</td>
                          <td className="px-3 py-2.5 text-white/60 font-mono">{hasActual ? p.actual_price?.toFixed(2) : '—'}</td>
                          <td className={`px-3 py-2.5 font-bold ${hasActual ? (p.actual_change >= 0 ? 'text-emerald-400' : 'text-rose-400') : 'text-white/20'}`}>
                            {hasActual ? `${p.actual_change >= 0 ? '+' : ''}${p.actual_change?.toFixed(2)}%` : '—'}
                          </td>
                          <td className="px-3 py-2.5">
                            {hasActual ? (
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[8px] font-black uppercase ${correct ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                                {correct ? 'Correct' : 'Wrong'}
                              </span>
                            ) : (
                              <span className="text-[8px] text-white/20 font-bold uppercase">Pending</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

type PanelId = 'rankings' | 'rally' | 'alerts' | 'news' | 'macro' | 'sectors' | 'predictions';

export default function AIStockIntelligenceTab() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<PanelId>('rankings');
  const [lastUpdated, setLastUpdated] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (force = false) => {
    try {
      if (force) setRefreshing(true);
      const url = force ? '/api/ai-intelligence/refresh' : '/api/ai-intelligence/dashboard';
      const data = await fetchJson<Dashboard>(url, force ? { method: 'POST' } : undefined);
      setDashboard(data);
      setLastUpdated(new Date().toLocaleTimeString());
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load AI Intelligence data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(() => load(), 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [load]);

  const panels: Array<{ id: PanelId; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = [
    { id: 'rankings', label: 'Rankings',    icon: BarChart2 },
    { id: 'rally',    label: 'Early Rally', icon: Zap },
    { id: 'alerts',   label: 'Alerts',      icon: AlertTriangle },
    { id: 'news',     label: 'News',        icon: Newspaper },
    { id: 'macro',    label: 'Macro',       icon: Globe },
    { id: 'sectors',  label: 'Sectors',     icon: Activity },
    { id: 'predictions', label: 'Next-Day', icon: Target },
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 py-28">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-2 border-violet-500/20 animate-ping absolute inset-0" />
          <div className="w-16 h-16 rounded-full border-2 border-violet-500/40 flex items-center justify-center">
            <Brain size={28} className="text-violet-400 animate-pulse" />
          </div>
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-white/60">Initialising AI Intelligence Engine</p>
          <p className="text-[11px] text-white/25">Running 10-module analysis pipeline across full stock universe</p>
        </div>
        <div className="flex gap-1.5">
          {[0,1,2,3,4].map(i => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-violet-500/40 animate-bounce" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-rose-400">
        <AlertTriangle size={32} className="opacity-60" />
        <p className="text-sm font-bold">{error}</p>
        <button onClick={() => load(true)} className="rounded-xl bg-rose-500/10 border border-rose-500/20 px-5 py-2 text-xs font-black uppercase tracking-[0.15em] hover:bg-rose-500/20 transition">
          Retry
        </button>
      </div>
    );
  }

  if (!dashboard) return null;

  const rallyCount = dashboard.earlyRallyCandidates.length;
  const highAlerts = dashboard.liveAlerts.filter(a => a.severity === 'HIGH').length;

  return (
    <div className="space-y-3">

      {/* ── Header ── */}
      <div className="rounded-2xl border border-white/5 bg-gradient-to-r from-violet-500/10 via-transparent to-cyan-500/5 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-violet-500/15 flex items-center justify-center">
                <Brain size={22} className="text-violet-400" />
              </div>
              {dashboard.aiPowered && (
                <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-black tracking-tight text-white">AI Stock Intelligence</h2>
                {dashboard.aiPowered && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.15em] text-emerald-400">
                    <Zap size={8} />
                    Gemini Live
                  </span>
                )}
              </div>
              <p className="text-[10px] text-white/30 mt-0.5 font-mono">
                {dashboard.marketSummary || '10-Module Real-Time Research Engine — NSE/BSE Universe'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {rallyCount > 0 && (
              <div className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[10px] font-black text-amber-400">
                <Zap size={11} />
                {rallyCount} Rally
              </div>
            )}
            {highAlerts > 0 && (
              <div className="flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-[10px] font-black text-rose-400 animate-pulse">
                <AlertTriangle size={11} />
                {highAlerts} High Alert{highAlerts > 1 ? 's' : ''}
              </div>
            )}
            <div className="flex items-center gap-1 text-[9px] text-white/20 font-mono">
              <Clock size={9} />
              {lastUpdated}
            </div>
            <button
              onClick={() => load(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-white/50 hover:text-white hover:border-white/20 transition disabled:opacity-40"
            >
              <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ── Live Ticker ── */}
      <LiveTickerStrip rankings={dashboard.rankings} />

      {/* ── KPI Bar ── */}
      <KPIBar summary={dashboard.summary} computedAt={dashboard.computedAt} aiPowered={dashboard.aiPowered} />

      {/* ── Panel Tabs ── */}
      <div className="flex flex-wrap gap-1 rounded-2xl border border-white/5 bg-white/[0.03] p-1">
        {panels.map(p => {
          const badge = p.id === 'rally' ? rallyCount : p.id === 'alerts' ? highAlerts : 0;
          return (
            <button
              key={p.id}
              onClick={() => setActivePanel(p.id)}
              className={`relative flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.15em] transition-all ${
                activePanel === p.id
                  ? 'bg-violet-500/20 text-violet-300 shadow-[0_0_16px_rgba(139,92,246,0.2)]'
                  : 'text-white/35 hover:text-white/65 hover:bg-white/5'
              }`}
            >
              <p.icon size={12} />
              {p.label}
              {badge > 0 && (
                <span className={`absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[7px] font-black ${
                  p.id === 'alerts' ? 'bg-rose-500 text-white animate-pulse' : 'bg-amber-500 text-black'
                }`}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Panel Content ── */}
      <div className="rounded-2xl border border-white/5 bg-black/20 p-4 min-h-[400px]">
        {activePanel === 'rankings' && <RankingsTable data={dashboard.rankings} />}
        {activePanel === 'rally'    && <EarlyRallyPanel candidates={dashboard.earlyRallyCandidates} />}
        {activePanel === 'alerts'   && <AlertsFeed alerts={dashboard.liveAlerts} />}
        {activePanel === 'news'     && <NewsFeedPanel news={dashboard.newsFeed} />}
        {activePanel === 'macro'    && <MacroPanel macro={dashboard.macroSnapshot} aiInsights={dashboard.aiInsights} />}
        {activePanel === 'sectors'  && <SectorStrengthPanel sectors={dashboard.sectorStrength} />}
        {activePanel === 'predictions' && <NextDayPredictions />}
      </div>
    </div>
  );
}
