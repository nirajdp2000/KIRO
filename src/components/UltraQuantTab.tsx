import React, { startTransition, useDeferredValue, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Brain,
  Cpu,
  Gauge,
  Layers,
  Radar,
  Shield,
  Sparkles,
  TrendingUp,
  Waves,
  Zap
} from 'lucide-react';
import { HedgeFundSignalRanking, type HedgeFundSignalDashboard } from './HedgeFundSignalRanking';
import { UltraQuantHeatmap } from './UltraQuantHeatmap';
import { fetchJson } from '../lib/api';

/** Strip NSE_EQ| / BSE_EQ| / NSE_EQ: / BSE_EQ: prefixes for clean display */
function cleanSymbol(raw: string): string {
  return raw.replace(/^(NSE_EQ|BSE_EQ)[|:]/, '');
}

type AnalysisResult = {
  symbol: string;
  sector: string;
  industry: string;
  cagr: number;
  momentum: number;
  trendStrength: number;
  volatility: number;
  maxDrawdown: number;
  growthRatio: number;
  score: number;
  earningsGrowth: number;
  revenueGrowth: number;
  volumeGrowth: number;
  breakoutFrequency: number;
  sentimentScore: number;
  marketCap: number;
  drawdownProbability: number;
  positionSize: number;
  gradientBoostProb: number;
  lstmPredictedPrice: number;
  marketRegime: string;
  marketState: string;
  rlAction: string;
  finalPredictionScore: number;
  orderImbalance: number;
  volumeProfile?: {
    poc?: number;
    vah?: number;
    val?: number;
  };
  alerts: Array<{
    stockSymbol: string;
    signalType: string;
    confidenceScore: number;
    timestamp: string;
  }>;
};

type UltraQuantDashboard = {
  results: AnalysisResult[];
  alerts: Array<{
    stockSymbol: string;
    signalType: string;
    confidenceScore: number;
    timestamp: string;
  }>;
  sectors: Array<{
    sector: string;
    sectorStrength: number;
    averageScore: number;
    leaders: string[];
  }>;
  hedgeFundSignals: HedgeFundSignalDashboard;
  summary: {
    scannedUniverse: number;
    returned: number;
    historicalPeriodYears: number;
    avgScore: number;
    multibaggerCandidates: number;
    buySignals: number;
  };
  architecture: Array<{
    stage: string;
    description: string;
  }>;
};

type Filters = {
  historicalPeriodYears: number;
  minCagr: number;
  sectorFilter: string;
  minMarketCap: number;
  maxMarketCap: number;
  minVolume: number;
  maxDrawdown: number;
  volatilityThreshold: number;
  breakoutFrequency: number;
  trendStrengthThreshold: number;
  riskPercentage: number;
};

const sectors = ['ALL', 'Technology', 'Financials', 'Energy', 'Healthcare', 'Consumer', 'Industrials', 'Telecom', 'Materials'];

const defaultFilters: Filters = {
  historicalPeriodYears: 5,
  minCagr: 18,
  sectorFilter: 'ALL',
  minMarketCap: 0,
  maxMarketCap: 200000,
  minVolume: 100000,
  maxDrawdown: 45,
  volatilityThreshold: 0.5,
  breakoutFrequency: 0.08,
  trendStrengthThreshold: 0.12,
  riskPercentage: 1
};

const metricClass = (value: number, threshold: number) =>
  value >= threshold ? 'text-emerald-400' : 'text-zinc-300';

const normalizeFilters = (filters: Filters): Filters => ({
  historicalPeriodYears: Number.isFinite(filters.historicalPeriodYears) ? Math.min(15, Math.max(1, filters.historicalPeriodYears)) : defaultFilters.historicalPeriodYears,
  minCagr: Number.isFinite(filters.minCagr) ? filters.minCagr : defaultFilters.minCagr,
  sectorFilter: filters.sectorFilter || defaultFilters.sectorFilter,
  minMarketCap: Number.isFinite(filters.minMarketCap) ? Math.max(0, filters.minMarketCap) : defaultFilters.minMarketCap,
  maxMarketCap: Number.isFinite(filters.maxMarketCap) ? Math.max(0, filters.maxMarketCap) : defaultFilters.maxMarketCap,
  minVolume: Number.isFinite(filters.minVolume) ? Math.max(0, filters.minVolume) : defaultFilters.minVolume,
  maxDrawdown: Number.isFinite(filters.maxDrawdown) ? Math.max(0, filters.maxDrawdown) : defaultFilters.maxDrawdown,
  volatilityThreshold: Number.isFinite(filters.volatilityThreshold) ? Math.max(0, filters.volatilityThreshold) : defaultFilters.volatilityThreshold,
  breakoutFrequency: Number.isFinite(filters.breakoutFrequency) ? Math.max(0, filters.breakoutFrequency) : defaultFilters.breakoutFrequency,
  trendStrengthThreshold: Number.isFinite(filters.trendStrengthThreshold) ? Math.max(0, filters.trendStrengthThreshold) : defaultFilters.trendStrengthThreshold,
  riskPercentage: Number.isFinite(filters.riskPercentage) ? Math.max(0.1, filters.riskPercentage) : defaultFilters.riskPercentage
});

const UltraQuantTab = () => {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<UltraQuantDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runScan = async (nextFilters?: Filters) => {
    setLoading(true);
    setError(null);
    try {
      const sanitizedFilters = normalizeFilters(nextFilters ?? filters);
      const payload = await fetchJson<UltraQuantDashboard>('/api/ultra-quant/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitizedFilters)
      });
      startTransition(() => {
        setFilters(sanitizedFilters);
        setDashboard(payload);
      });
    } catch (scanError: any) {
      setError(scanError.message || 'Unable to run ultra quant scan');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runScan();
  }, []);

  const results = useDeferredValue(dashboard?.results ?? []);
  const alerts = dashboard?.alerts ?? [];
  const sectorRows = dashboard?.sectors ?? [];
  const architectureSteps = dashboard?.architecture ?? [];
  const topPick = results[0];

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-cyan-500/10 bg-[radial-gradient(circle_at_top_right,_rgba(34,211,238,0.18),_transparent_30%),linear-gradient(180deg,rgba(4,10,18,0.95),rgba(8,12,18,0.95))] p-8 shadow-2xl shadow-black/40">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] text-cyan-300">
              <Cpu className="h-3.5 w-3.5" />
              Ultra Quant Analyzer
            </p>
            <h2 className="text-3xl font-black tracking-tight text-white md:text-4xl">
              Institutional multibagger detection with concurrent AI ranking
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
              Scans a broad synthetic universe through independent Java services for CAGR, momentum, regime detection,
              hidden state logic, order flow, sector rotation, and risk-aware signal aggregation.
            </p>
          </div>

          <div className="grid w-full max-w-[34rem] grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-2xl border border-white/5 bg-black/25 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Universe</p>
              <p className="mt-2 text-2xl font-bold text-white">{dashboard?.summary?.scannedUniverse ?? '--'}</p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-black/25 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Top 100</p>
              <p className="mt-2 text-2xl font-bold text-cyan-300">{dashboard?.summary?.returned ?? '--'}</p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-black/25 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Multibaggers</p>
              <p className="mt-2 text-2xl font-bold text-emerald-400">{dashboard?.summary?.multibaggerCandidates ?? '--'}</p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-black/25 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Avg Score</p>
              <p className="mt-2 text-2xl font-bold text-amber-300">{dashboard?.summary?.avgScore?.toFixed?.(1) ?? '--'}</p>
            </div>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <label className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">History (Years)</span>
            <input type="number" min={1} max={15} value={filters.historicalPeriodYears} onChange={(e) => setFilters({ ...filters, historicalPeriodYears: Number(e.target.value) })} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40" />
          </label>
          <label className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Min CAGR</span>
            <input type="number" value={filters.minCagr} onChange={(e) => setFilters({ ...filters, minCagr: Number(e.target.value) })} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40" />
          </label>
          <label className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Sector</span>
            <select value={filters.sectorFilter} onChange={(e) => setFilters({ ...filters, sectorFilter: e.target.value })} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40">
              {sectors.map((sector) => <option key={sector} value={sector}>{sector}</option>)}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Market Cap Range</span>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" value={filters.minMarketCap} onChange={(e) => setFilters({ ...filters, minMarketCap: Number(e.target.value) })} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40" />
              <input type="number" value={filters.maxMarketCap} onChange={(e) => setFilters({ ...filters, maxMarketCap: Number(e.target.value) })} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40" />
            </div>
          </label>
          <label className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Volume / Drawdown</span>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" value={filters.minVolume} onChange={(e) => setFilters({ ...filters, minVolume: Number(e.target.value) })} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40" />
              <input type="number" value={filters.maxDrawdown} onChange={(e) => setFilters({ ...filters, maxDrawdown: Number(e.target.value) })} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40" />
            </div>
          </label>
          <label className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Vol / Breakout / Trend</span>
            <div className="grid grid-cols-3 gap-2">
              <input type="number" step="0.01" value={filters.volatilityThreshold} onChange={(e) => setFilters({ ...filters, volatilityThreshold: Number(e.target.value) })} className="w-full rounded-xl border border-white/10 bg-black/30 px-2 py-2 text-sm text-white outline-none focus:border-cyan-400/40" />
              <input type="number" step="0.01" value={filters.breakoutFrequency} onChange={(e) => setFilters({ ...filters, breakoutFrequency: Number(e.target.value) })} className="w-full rounded-xl border border-white/10 bg-black/30 px-2 py-2 text-sm text-white outline-none focus:border-cyan-400/40" />
              <input type="number" step="0.01" value={filters.trendStrengthThreshold} onChange={(e) => setFilters({ ...filters, trendStrengthThreshold: Number(e.target.value) })} className="w-full rounded-xl border border-white/10 bg-black/30 px-2 py-2 text-sm text-white outline-none focus:border-cyan-400/40" />
            </div>
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button onClick={() => runScan()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-black uppercase tracking-[0.2em] text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? <Activity className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {loading ? 'Scanning' : 'Run Ultra Scan'}
          </button>
          <button
            onClick={() => {
              startTransition(() => {
                setFilters(defaultFilters);
              });
              runScan(defaultFilters);
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-5 py-3 text-sm font-black uppercase tracking-[0.2em] text-zinc-300 transition hover:border-cyan-400/40 hover:text-white"
          >
            Reset Filters
          </button>
          <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
            Risk per trade: {filters.riskPercentage.toFixed(1)}%
          </div>
          {error && <div className="text-sm text-rose-400">{error}</div>}
        </div>
      </section>

      {loading && (
        <section className="rounded-[2rem] border border-cyan-500/10 bg-zinc-950/70 p-6 shadow-2xl shadow-black/20">
          <div className="flex items-center gap-3 text-sm text-zinc-300">
            <Activity className="h-4 w-4 animate-spin text-cyan-300" />
            Running the ultra quant scan across the current universe and model stack.
          </div>
        </section>
      )}

      {dashboard && !loading && results.length === 0 && (
        <section className="rounded-[2rem] border border-amber-500/10 bg-amber-500/5 p-6 text-sm leading-6 text-zinc-300 shadow-2xl shadow-black/20">
          No stocks matched the current filter set. Try lowering `Min CAGR`, increasing `Max Drawdown`, or setting `Sector` back to `ALL`.
        </section>
      )}

      {topPick && (
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-[2rem] border border-emerald-500/10 bg-zinc-950/70 p-7 shadow-2xl shadow-black/30">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">Top Opportunity</p>
                <h3 className="mt-2 text-3xl font-black text-white">{cleanSymbol(topPick.symbol)}</h3>
                <p className="mt-1 text-sm text-zinc-400">{topPick.sector} / {topPick.industry}</p>
              </div>
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-right">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300">Final Prediction</p>
                <p className="text-3xl font-black text-white">{topPick.finalPredictionScore.toFixed(1)}%</p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-white/5 bg-black/20 p-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">CAGR</p>
                <p className={`mt-2 text-xl font-bold ${metricClass(topPick.cagr, 20)}`}>{topPick.cagr.toFixed(1)}%</p>
              </div>
              <div className="rounded-2xl border border-white/5 bg-black/20 p-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Growth Ratio</p>
                <p className={`mt-2 text-xl font-bold ${metricClass(topPick.growthRatio, 5)}`}>{topPick.growthRatio.toFixed(2)}x</p>
              </div>
              <div className="rounded-2xl border border-white/5 bg-black/20 p-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Order Imbalance</p>
                <p className={`mt-2 text-xl font-bold ${metricClass(topPick.orderImbalance, 2.5)}`}>{topPick.orderImbalance.toFixed(2)}x</p>
              </div>
              <div className="rounded-2xl border border-white/5 bg-black/20 p-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">RL Action</p>
                <p className="mt-2 text-xl font-bold text-cyan-300">{topPick.rlAction}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/5 bg-zinc-950/70 p-7 shadow-2xl shadow-black/30">
            <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.2em] text-white">
              <Shield className="h-4 w-4 text-amber-300" />
              Risk Engine
            </h3>
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500">Drawdown Probability</span>
                <span className="font-bold text-white">{topPick.drawdownProbability.toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500">Suggested Position Size</span>
                <span className="font-bold text-emerald-400">{topPick.positionSize.toFixed(0)} shares</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500">POC / VAH / VAL</span>
                <span className="font-bold text-zinc-200">
                  {topPick.volumeProfile?.poc?.toFixed?.(0) ?? '--'} / {topPick.volumeProfile?.vah?.toFixed?.(0) ?? '--'} / {topPick.volumeProfile?.val?.toFixed?.(0) ?? '--'}
                </span>
              </div>
              <div className="rounded-2xl border border-amber-500/10 bg-amber-500/5 p-4 text-sm leading-6 text-zinc-300">
                The ranking model weights CAGR, momentum, EMA slope, low drawdown, and volume growth while the signal
                stack blends gradient boosting, LSTM proxy forecasting, regime detection, hidden state logic, and sentiment.
              </div>
            </div>
          </div>
        </section>
      )}

      <HedgeFundSignalRanking dashboard={dashboard?.hedgeFundSignals ?? null} />

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.5fr_0.9fr_0.9fr]">
        <div className="rounded-[2rem] border border-white/5 bg-zinc-950/70 shadow-2xl shadow-black/30">
          <div className="flex items-center justify-between border-b border-white/5 px-6 py-5">
            <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.2em] text-white">
              <TrendingUp className="h-4 w-4 text-cyan-300" />
              Top 100 Bullish Stocks
            </h3>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">{results.length} returned</span>
          </div>

          <div className="max-h-[42rem] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-zinc-950/95 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                <tr>
                  <th className="px-6 py-4">Stock</th>
                  <th className="px-4 py-4">Score</th>
                  <th className="px-4 py-4">CAGR</th>
                  <th className="px-4 py-4">Momentum</th>
                  <th className="px-4 py-4">AI</th>
                  <th className="px-4 py-4">Regime</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {results.map((stock) => (
                  <tr key={stock.symbol} className="hover:bg-white/[0.03]">
                    <td className="px-6 py-4">
                      <div className="font-bold text-white">{cleanSymbol(stock.symbol)}</div>
                      <div className="text-[11px] text-zinc-500">{stock.sector}</div>
                    </td>
                    <td className="px-4 py-4 font-bold text-cyan-300">{stock.score.toFixed(1)}</td>
                    <td className={`px-4 py-4 font-bold ${metricClass(stock.cagr, 20)}`}>{stock.cagr.toFixed(1)}%</td>
                    <td className="px-4 py-4 text-zinc-300">{stock.momentum.toFixed(2)}x</td>
                    <td className="px-4 py-4 font-bold text-emerald-400">{stock.finalPredictionScore.toFixed(1)}%</td>
                    <td className="px-4 py-4 text-zinc-400">{stock.marketRegime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[2rem] border border-white/5 bg-zinc-950/70 p-6 shadow-2xl shadow-black/30">
            <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.2em] text-white">
              <Brain className="h-4 w-4 text-violet-300" />
              Model Stack
            </h3>
            <div className="mt-5 space-y-4">
              {topPick && [
                { label: 'Gradient Boost', value: topPick.gradientBoostProb, tone: 'bg-cyan-400' },
                { label: 'Final Signal', value: topPick.finalPredictionScore, tone: 'bg-emerald-400' },
                { label: 'Sentiment', value: topPick.sentimentScore, tone: 'bg-amber-300' }
              ].map((item) => (
                <div key={item.label} className="space-y-2">
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-zinc-500">
                    <span>{item.label}</span>
                    <span className="font-bold text-white">{item.value.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/5">
                    <div className={`${item.tone} h-full`} style={{ width: `${Math.min(item.value, 100)}%` }} />
                  </div>
                </div>
              ))}
              {topPick && (
                <div className="rounded-2xl border border-white/5 bg-black/20 p-4 text-sm text-zinc-300">
                  <div className="flex items-center justify-between">
                    <span>LSTM next 10m</span>
                    <span className="font-bold text-white">{topPick.lstmPredictedPrice.toFixed(2)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span>HMM state</span>
                    <span className="font-bold text-cyan-300">{topPick.marketState}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/5 bg-zinc-950/70 p-6 shadow-2xl shadow-black/30">
            <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.2em] text-white">
              <Waves className="h-4 w-4 text-emerald-300" />
              Sector Rotation
            </h3>
            <div className="mt-5 space-y-3">
              {sectorRows.slice(0, 6).map((sector) => (
                <div key={sector.sector} className="rounded-2xl border border-white/5 bg-black/20 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">{sector.sector}</span>
                    <span className="text-sm font-bold text-emerald-400">{sector.averageScore.toFixed(1)}</span>
                  </div>
                  <p className="mt-1 text-xs uppercase tracking-[0.2em] text-zinc-500">
                    Strength {sector.sectorStrength.toFixed(2)} | {sector.leaders.join(', ')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[2rem] border border-white/5 bg-zinc-950/70 p-6 shadow-2xl shadow-black/30">
            <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.2em] text-white">
              <AlertTriangle className="h-4 w-4 text-rose-300" />
              Real-Time Alerts
            </h3>
            <div className="mt-5 space-y-3">
              {alerts.slice(0, 8).map((alert, index) => (
                <div key={`${alert.stockSymbol}-${index}`} className="rounded-2xl border border-rose-500/10 bg-rose-500/5 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">{cleanSymbol(alert.stockSymbol)}</span>
                    <span className="text-xs font-bold text-rose-300">{alert.confidenceScore.toFixed(1)}%</span>
                  </div>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-zinc-500">{alert.signalType}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/5 bg-zinc-950/70 p-6 shadow-2xl shadow-black/30">
            <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.2em] text-white">
              <Layers className="h-4 w-4 text-cyan-300" />
              System Architecture
            </h3>
            <div className="mt-5 space-y-3">
              {architectureSteps.map((step) => (
                <div key={step.stage} className="rounded-2xl border border-white/5 bg-black/20 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">{step.stage}</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <UltraQuantHeatmap stocks={results.slice(0, 18)} />

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-[2rem] border border-white/5 bg-zinc-950/70 p-6 shadow-2xl shadow-black/30">
          <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.2em] text-white">
            <Gauge className="h-4 w-4 text-amber-300" />
            Multibagger Engine
          </h3>
          <p className="mt-4 text-sm leading-6 text-zinc-400">
            Uses 5-year growth ratio, earnings expansion, revenue expansion, momentum persistence, and controlled drawdown
            to isolate 5x to 10x style long-duration growth candidates.
          </p>
        </div>
        <div className="rounded-[2rem] border border-white/5 bg-zinc-950/70 p-6 shadow-2xl shadow-black/30">
          <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.2em] text-white">
            <Radar className="h-4 w-4 text-emerald-300" />
            Market State Models
          </h3>
          <p className="mt-4 text-sm leading-6 text-zinc-400">
            Regime detection tags trending, sideways, and high-volatility states while hidden state logic flags
            accumulation, distribution, breakout, and reversal behavior.
          </p>
        </div>
        <div className="rounded-[2rem] border border-white/5 bg-zinc-950/70 p-6 shadow-2xl shadow-black/30">
          <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.2em] text-white">
            <Sparkles className="h-4 w-4 text-cyan-300" />
            Signal Fusion
          </h3>
          <p className="mt-4 text-sm leading-6 text-zinc-400">
            The final score fuses gradient boost probability, LSTM trajectory, random-forest regime scoring,
            HMM state conviction, and sentiment into a single trading confidence output.
          </p>
        </div>
      </section>
    </div>
  );
};

export default UltraQuantTab;
