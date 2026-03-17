import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  Flame,
  Layers,
  RefreshCw,
  Rocket,
  Shield,
  TrendingUp,
  Zap,
} from 'lucide-react';

/** Strip NSE_EQ| / BSE_EQ| / NSE_EQ: / BSE_EQ: prefixes for clean display */
function cleanSymbol(raw: string): string {
  return raw.replace(/^(NSE_EQ|BSE_EQ)[|:]/, '');
}

import {
  MultibaggerScannerService,
  type MultibaggerScanResult,
  type MultibaggerStock,
  type ScanCycle,
} from '../services/MultibaggerScannerService';

// ─── Constants ────────────────────────────────────────────────────────────────

const CYCLES: { value: ScanCycle; label: string }[] = [
  { value: 30,  label: '30 Days'  },
  { value: 60,  label: '60 Days'  },
  { value: 90,  label: '90 Days'  },
  { value: 120, label: '120 Days' },
  { value: 180, label: '180 Days' },
  { value: 300, label: '300 Days' },
];

/**
 * Auto-refresh interval per cycle (ms).
 * Shorter cycles refresh more aggressively to capture fast momentum.
 */
const REFRESH_INTERVAL: Record<ScanCycle, number> = {
  30: 30_000, 60: 45_000, 90: 60_000, 120: 90_000, 180: 120_000, 300: 180_000,
};

/**
 * Human-readable weight description per cycle.
 * Mirrors MB_CYCLE_WEIGHTS on the server.
 */
const CYCLE_CONTEXT: Record<ScanCycle, string> = {
  30:  'Short cycle — momentum (25%) + breakout (15%) heavy. Captures fast movers and volume spikes.',
  60:  'Short-medium — momentum (23%) + trend (18%). Balances speed with early trend confirmation.',
  90:  'Medium cycle — balanced: trend (25%), momentum (20%), RS (15%), volume (15%).',
  120: 'Medium-long — trend (27%) leads. Filters for sustained directional moves.',
  180: 'Long cycle — trend (30%) + stability (10%). Identifies durable compounders.',
  300: 'Long-term — trend (32%) + stability (14%). Focuses on low-volatility, high-conviction trends.',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const scoreTone = (score: number) => {
  if (score >= 80) return 'text-emerald-300';
  if (score >= 60) return 'text-cyan-300';
  if (score >= 40) return 'text-amber-300';
  return 'text-rose-300';
};

const scoreBarClass = (score: number) => {
  if (score >= 80) return 'bg-emerald-400';
  if (score >= 60) return 'bg-cyan-400';
  if (score >= 40) return 'bg-amber-300';
  return 'bg-rose-400';
};

const volumeBadge = (signal: MultibaggerStock['volumeSignal']) => {
  switch (signal) {
    case 'STRONG':   return 'bg-emerald-400/15 text-emerald-300 border-emerald-400/20';
    case 'MODERATE': return 'bg-amber-400/15 text-amber-300 border-amber-400/20';
    default:         return 'bg-zinc-700/40 text-zinc-400 border-zinc-600/30';
  }
};

const fmtPct = (v: number) => (v >= 0 ? `+${v.toFixed(1)}%` : `${v.toFixed(1)}%`);

// ─── Sub-components ───────────────────────────────────────────────────────────

const StatCard = ({
  label, value, tone = 'text-white',
}: { label: string; value: string | number; tone?: string }) => (
  <div className="rounded-2xl border border-white/5 bg-black/25 p-4">
    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">{label}</p>
    <p className={`mt-2 text-2xl font-black ${tone}`}>{value}</p>
  </div>
);

const ScoreBar = ({ score }: { score: number }) => (
  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
    <div
      className={`${scoreBarClass(score)} h-full transition-all duration-500`}
      style={{ width: `${Math.min(Math.max(score, 0), 100)}%` }}
    />
  </div>
);

/** Factor row: label + value + progress bar */
const FactorRow = ({ label, score }: { label: string; score: number }) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-zinc-500">
      <span>{label}</span>
      <span className={`font-bold ${scoreTone(score)}`}>{score.toFixed(1)}</span>
    </div>
    <ScoreBar score={score} />
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const MultibaggerScanner: React.FC = () => {
  const [cycle, setCycle] = useState<ScanCycle>(90);
  const [result, setResult] = useState<MultibaggerScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  const cache = useRef<Partial<Record<ScanCycle, MultibaggerScanResult>>>({});
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const runScan = useCallback(async (targetCycle: ScanCycle, forceRefresh = false) => {
    if (!forceRefresh && cache.current[targetCycle]) {
      setResult(cache.current[targetCycle]!);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await MultibaggerScannerService.scan(targetCycle);
      cache.current[targetCycle] = data;
      setResult(data);
      setSelectedSymbol(data.stocks[0]?.symbol ?? null);
    } catch (err: any) {
      setError(err.message || 'Scan failed. Retrying shortly.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    runScan(cycle);
    if (refreshTimer.current) clearInterval(refreshTimer.current);
    refreshTimer.current = setInterval(() => runScan(cycle, true), REFRESH_INTERVAL[cycle]);
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
  }, [cycle, runScan]);

  const stocks = result?.stocks ?? [];
  const selectedStock = stocks.find((s) => s.symbol === selectedSymbol) ?? stocks[0] ?? null;

  return (
    <div className="space-y-8">

      {/* ── Header ── */}
      <section className="rounded-[2rem] border border-violet-500/10 bg-[radial-gradient(circle_at_top_right,_rgba(139,92,246,0.18),_transparent_30%),linear-gradient(180deg,rgba(4,10,18,0.95),rgba(8,12,18,0.95))] p-8 shadow-2xl shadow-black/40">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] text-violet-300">
              <Rocket className="h-3.5 w-3.5" />
              Multibagger Scanner · Hedge-Fund Grade
            </p>
            <h2 className="text-3xl font-black tracking-tight text-white md:text-4xl">
              7-factor bullish scoring model across all timeframes
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
              Trend alignment · Momentum blend · Relative strength · Volume accumulation ·
              Breakout proximity · Sector rotation · Stability — weights shift per cycle.
            </p>
          </div>

          <div className="grid w-full max-w-[32rem] grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Universe"    value={result?.scannedUniverse ?? '--'} />
            <StatCard label="Top 100"     value={result?.returned ?? '--'}        tone="text-violet-300" />
            <StatCard label="Avg Score"   value={result ? result.avgBullishScore.toFixed(1) : '--'} tone="text-amber-300" />
            <StatCard label="Lead Sector" value={result?.leadingSector ?? '--'}   tone="text-emerald-300" />
          </div>
        </div>

        {/* ── Cycle selector ── */}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mr-1">Cycle:</span>
          {CYCLES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setCycle(value)}
              className={[
                'rounded-xl px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.18em] transition-all border',
                cycle === value
                  ? 'bg-violet-500/20 border-violet-400/40 text-violet-200 shadow-[0_0_16px_rgba(139,92,246,0.15)]'
                  : 'bg-black/25 border-white/10 text-zinc-400 hover:border-violet-400/30 hover:text-zinc-200',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => runScan(cycle, true)}
            disabled={loading}
            className="ml-auto inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-400 transition hover:border-violet-400/30 hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {error && <p className="text-sm text-rose-400">{error}</p>}
        </div>
      </section>

      {/* ── Loading ── */}
      {loading && (
        <section className="rounded-[2rem] border border-violet-500/10 bg-zinc-950/70 p-6 shadow-2xl shadow-black/20">
          <div className="flex items-center gap-3 text-sm text-zinc-300">
            <Activity className="h-4 w-4 animate-spin text-violet-300" />
            Running 7-factor hedge-fund scoring across {result?.scannedUniverse ?? 'full'} universe · {cycle}-day cycle…
          </div>
        </section>
      )}

      {/* ── Main content ── */}
      {!loading && stocks.length > 0 && (
        <>
          {/* ── Detail panel + context ── */}
          {selectedStock && (
            <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.5fr_1fr]">

              {/* Selected stock — factor breakdown */}
              <div className="rounded-[2rem] border border-violet-500/10 bg-zinc-950/70 p-7 shadow-2xl shadow-black/30">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-violet-400">
                      {selectedSymbol === stocks[0]?.symbol ? 'Top Opportunity' : 'Selected Stock'}
                    </p>
                    <h3 className="mt-2 text-3xl font-black text-white">{cleanSymbol(selectedStock.symbol)}</h3>
                    <p className="mt-1 text-sm text-zinc-400">{selectedStock.companyName}</p>
                    <p className="text-xs text-zinc-500">{selectedStock.sector}</p>
                  </div>
                  <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 px-5 py-4 text-right">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">Bullish Score</p>
                    <p className={`text-4xl font-black ${scoreTone(selectedStock.bullishScore)}`}>
                      {selectedStock.bullishScore.toFixed(1)}
                    </p>
                    <p className="mt-1 text-[10px] text-zinc-500">Rank #{selectedStock.rank}</p>
                  </div>
                </div>

                {/* 7-factor bars */}
                <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FactorRow label="Trend (MA Alignment)"    score={selectedStock.trendScore} />
                  <FactorRow label="Momentum (Blended)"      score={selectedStock.momentumScore} />
                  <FactorRow label="Relative Strength"       score={selectedStock.relativeStrength} />
                  <FactorRow label="Volume Accumulation"     score={selectedStock.volumeScore} />
                  <FactorRow label="Breakout Proximity"      score={selectedStock.breakoutScore} />
                  <FactorRow label="Sector Strength"         score={selectedStock.sectorScore} />
                  <FactorRow label="Stability (Low Vol)"     score={selectedStock.stabilityScore} />
                </div>

                {/* Return windows */}
                <div className="mt-5 grid grid-cols-3 gap-3">
                  {[
                    { label: '30d Return', value: selectedStock.ret30 },
                    { label: '90d Return', value: selectedStock.ret90 },
                    { label: '180d Return', value: selectedStock.ret180 },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-2xl border border-white/5 bg-black/20 p-3 text-center">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{label}</p>
                      <p className={`mt-1 font-black ${value >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {fmtPct(value)}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Badges */}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] ${volumeBadge(selectedStock.volumeSignal)}`}>
                    <BarChart3 className="h-3 w-3" />
                    Volume: {selectedStock.volumeSignal}
                  </span>
                  {selectedStock.sentimentTag && (
                    <span className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-400/20 bg-indigo-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-indigo-300">
                      <Zap className="h-3 w-3" />
                      {selectedStock.sentimentTag}
                    </span>
                  )}
                  <span className="ml-auto text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600">
                    Vol Ratio {selectedStock.volRatio.toFixed(2)}x
                  </span>
                </div>
              </div>

              {/* Scoring context + weight breakdown */}
              <div className="space-y-5">
                <div className="rounded-[2rem] border border-white/5 bg-zinc-950/70 p-6 shadow-2xl shadow-black/30">
                  <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.2em] text-white">
                    <Layers className="h-4 w-4 text-violet-300" />
                    Scoring Context
                  </h3>
                  <p className="mt-4 text-sm leading-6 text-zinc-300 rounded-2xl border border-white/5 bg-black/20 p-4">
                    {CYCLE_CONTEXT[cycle]}
                  </p>
                  <div className="mt-4 space-y-2 text-sm">
                    {[
                      { label: 'Cycle',     value: `${cycle} Days`,                    tone: 'text-violet-300' },
                      { label: 'Scanned',   value: `${result?.scannedUniverse ?? '--'} stocks`, tone: 'text-white' },
                      { label: 'Returned',  value: `${result?.returned ?? '--'} stocks`,        tone: 'text-cyan-300' },
                      { label: 'Cached at', value: result?.cachedAt ?? '--',            tone: 'text-zinc-400' },
                    ].map(({ label, value, tone }) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-zinc-500">{label}</span>
                        <span className={`font-bold text-xs ${tone}`}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[2rem] border border-white/5 bg-zinc-950/70 p-6 shadow-2xl shadow-black/30">
                  <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.2em] text-white">
                    <Shield className="h-4 w-4 text-amber-300" />
                    Formula
                  </h3>
                  <div className="mt-4 rounded-2xl border border-violet-500/10 bg-violet-500/5 p-4 text-xs leading-6 text-zinc-400 font-mono">
                    Score = Trend×w₁ + Momentum×w₂<br />
                    + RS×w₃ + Volume×w₄<br />
                    + Breakout×w₅ + Sector×w₆<br />
                    + Stability×w₇
                  </div>
                  <p className="mt-3 text-xs leading-5 text-zinc-500">
                    Showing top ranked stocks based on current criteria. Scores are adaptive — all stocks are ranked, none are rejected.
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* ── Rankings table ── */}
          <section className="rounded-[2rem] border border-white/5 bg-zinc-950/70 shadow-2xl shadow-black/30">
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-5">
              <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.2em] text-white">
                <TrendingUp className="h-4 w-4 text-violet-300" />
                Top 100 Multibagger Candidates
              </h3>
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                {stocks.length} returned · {cycle}-day cycle
              </span>
            </div>

            <div className="max-h-[52rem] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-zinc-950/95 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                  <tr>
                    <th className="px-4 py-4">Rank</th>
                    <th className="px-4 py-4">Symbol</th>
                    <th className="px-4 py-4">Company</th>
                    <th className="px-4 py-4">Sector</th>
                    <th className="px-4 py-4">Bullish Score</th>
                    <th className="px-4 py-4">Trend</th>
                    <th className="px-4 py-4">Momentum</th>
                    <th className="px-4 py-4">Rel Strength</th>
                    <th className="px-4 py-4">Volume</th>
                    <th className="px-4 py-4">Sector Rank</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {stocks.map((stock) => {
                    const isSelected = stock.symbol === selectedSymbol;
                    return (
                      <tr
                        key={stock.symbol}
                        onClick={() => setSelectedSymbol(stock.symbol)}
                        className={[
                          'cursor-pointer transition-colors',
                          isSelected ? 'bg-violet-400/[0.07]' : 'hover:bg-white/[0.03]',
                        ].join(' ')}
                      >
                        <td className="px-4 py-3 font-black text-zinc-500">#{stock.rank}</td>
                        <td className="px-4 py-3 font-bold text-white">{cleanSymbol(stock.symbol)}</td>
                        <td className="px-4 py-3 text-zinc-300 max-w-[10rem] truncate text-xs">{stock.companyName}</td>
                        <td className="px-4 py-3 text-zinc-400 text-xs uppercase tracking-[0.12em]">{stock.sector}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`font-black text-base ${scoreTone(stock.bullishScore)}`}>
                              {stock.bullishScore.toFixed(1)}
                            </span>
                            <div className="w-14">
                              <ScoreBar score={stock.bullishScore} />
                            </div>
                          </div>
                        </td>
                        <td className={`px-4 py-3 font-bold text-xs ${scoreTone(stock.trendScore)}`}>
                          {stock.trendScore.toFixed(1)}
                        </td>
                        <td className={`px-4 py-3 font-bold text-xs ${scoreTone(stock.momentumScore)}`}>
                          {stock.momentumScore.toFixed(1)}
                        </td>
                        <td className={`px-4 py-3 font-bold text-xs ${scoreTone(stock.relativeStrength)}`}>
                          {stock.relativeStrength.toFixed(1)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${volumeBadge(stock.volumeSignal)}`}>
                            {stock.volumeSignal}
                          </span>
                        </td>
                        <td className={`px-4 py-3 font-bold text-xs ${scoreTone(stock.sectorRank)}`}>
                          {stock.sectorRank.toFixed(1)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Momentum heatmap ── */}
          <section className="rounded-[2rem] border border-white/5 bg-zinc-950/70 p-6 shadow-2xl shadow-black/30">
            <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.2em] text-white mb-5">
              <Flame className="h-4 w-4 text-rose-300" />
              Momentum Heatmap — Top 18
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {stocks.slice(0, 18).map((stock) => {
                const tone =
                  stock.bullishScore >= 80 ? 'from-emerald-400/25 to-emerald-500/10 border-emerald-400/20' :
                  stock.bullishScore >= 60 ? 'from-violet-400/25 to-violet-500/10 border-violet-400/20' :
                  stock.bullishScore >= 40 ? 'from-amber-400/20 to-amber-500/10 border-amber-400/20' :
                                             'from-rose-400/15 to-rose-500/10 border-rose-400/15';
                return (
                  <button
                    key={stock.symbol}
                    onClick={() => setSelectedSymbol(stock.symbol)}
                    className={`rounded-2xl border bg-gradient-to-br p-4 text-left transition hover:-translate-y-0.5 ${tone}`}
                  >
                    <p className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-400">{stock.sector}</p>
                    <h5 className="mt-2 text-lg font-black text-white">{cleanSymbol(stock.symbol)}</h5>
                    <div className="mt-3 grid grid-cols-2 gap-1">
                      <div>
                        <p className="text-[9px] uppercase tracking-[0.12em] text-zinc-500">Score</p>
                        <p className={`font-black text-sm ${scoreTone(stock.bullishScore)}`}>{stock.bullishScore.toFixed(0)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] uppercase tracking-[0.12em] text-zinc-500">Trend</p>
                        <p className="font-black text-sm text-white">{stock.trendScore.toFixed(0)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-[0.12em] text-zinc-500">Mom</p>
                        <p className={`font-black text-sm ${scoreTone(stock.momentumScore)}`}>{stock.momentumScore.toFixed(0)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] uppercase tracking-[0.12em] text-zinc-500">RS</p>
                        <p className={`font-black text-sm ${scoreTone(stock.relativeStrength)}`}>{stock.relativeStrength.toFixed(0)}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </>
      )}

      {/* ── Fallback ── */}
      {!loading && stocks.length === 0 && !error && (
        <section className="rounded-[2rem] border border-violet-500/10 bg-violet-500/5 p-6 text-sm leading-6 text-zinc-300 shadow-2xl shadow-black/20">
          Showing top ranked stocks based on current criteria. Scanner is warming up — results will appear shortly.
        </section>
      )}
    </div>
  );
};

export default MultibaggerScanner;
