import React, { useEffect, useState } from 'react';
import { BarChart3, Building2, Flame, Radar, TrendingUp } from 'lucide-react';

export type HedgeFundSignalScore = {
  rank: number;
  stockSymbol: string;
  sector: string;
  momentumScore: number;
  trendScore: number;
  volumeScore: number;
  volatilityScore: number;
  sectorScore: number;
  institutionalScore: number;
  breakoutScore: number;
  finalScore: number;
  momentumValue: number;
  orderImbalance: number;
  breakoutProbability: number;
};

export type HedgeFundSignalDashboard = {
  rankings: HedgeFundSignalScore[];
  sectorStrength: Array<{
    sector: string;
    averageReturn: number;
    sectorScore: number;
    leaders: string[];
  }>;
  momentumHeatmap: Array<{
    symbol: string;
    sector: string;
    momentumScore: number;
    finalScore: number;
    breakoutScore: number;
  }>;
  summary: {
    scannedUniverse: number;
    returned: number;
    averageFinalScore: number;
    leadingSector: string;
    institutionalAccumulationCandidates: number;
  };
};

const scoreTone = (score: number) => {
  if (score >= 80) return 'text-emerald-300';
  if (score >= 60) return 'text-cyan-300';
  if (score >= 40) return 'text-amber-300';
  return 'text-rose-300';
};

const heatTone = (score: number) => {
  if (score >= 80) return 'from-emerald-400/30 to-emerald-500/10 border-emerald-400/20';
  if (score >= 60) return 'from-cyan-400/25 to-cyan-500/10 border-cyan-400/20';
  if (score >= 40) return 'from-amber-400/25 to-amber-500/10 border-amber-400/20';
  return 'from-rose-400/20 to-rose-500/10 border-rose-400/20';
};

const factorBarClass = (score: number) => {
  if (score >= 80) return 'bg-emerald-400';
  if (score >= 60) return 'bg-cyan-400';
  if (score >= 40) return 'bg-amber-300';
  return 'bg-rose-400';
};

export function HedgeFundSignalRanking({ dashboard }: { dashboard?: HedgeFundSignalDashboard | null }) {
  const rankings = dashboard?.rankings ?? [];
  const sectorStrength = dashboard?.sectorStrength ?? [];
  const momentumHeatmap = dashboard?.momentumHeatmap ?? [];
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(rankings[0]?.stockSymbol ?? null);

  useEffect(() => {
    setSelectedSymbol(rankings[0]?.stockSymbol ?? null);
  }, [rankings[0]?.stockSymbol]);

  if (!dashboard) {
    return null;
  }

  if (!rankings.length) {
    return (
      <section className="rounded-[2rem] border border-white/5 bg-zinc-950/70 p-6 text-sm leading-6 text-zinc-300 shadow-2xl shadow-black/30">
        Hedge fund signal ranking is waiting for a usable universe. Broaden the filters to generate the factor model.
      </section>
    );
  }

  const selectedSignal = rankings.find((signal) => signal.stockSymbol === selectedSymbol) ?? rankings[0];

  return (
    <section className="rounded-[2rem] border border-emerald-500/10 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.15),_transparent_28%),linear-gradient(180deg,rgba(5,11,17,0.96),rgba(8,12,18,0.96))] p-7 shadow-2xl shadow-black/30">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] text-emerald-300">
            <BarChart3 className="h-3.5 w-3.5" />
            Hedge Fund Signal Ranking
          </p>
          <h3 className="mt-4 text-3xl font-black tracking-tight text-white md:text-4xl">
            Multi-factor institutional ranking across momentum, trend, flow, and breakout quality
          </h3>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
            The scoring engine blends 3-month momentum, EMA stack strength, accumulation volume, volatility quality,
            sector leadership, institutional flow, and breakout probability into a hedge-fund-style ranking model.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-white/5 bg-black/25 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Scanned</p>
            <p className="mt-2 text-2xl font-black text-white">{dashboard.summary.scannedUniverse}</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-black/25 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Returned</p>
            <p className="mt-2 text-2xl font-black text-cyan-300">{dashboard.summary.returned}</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-black/25 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Avg Final</p>
            <p className="mt-2 text-2xl font-black text-emerald-300">{dashboard.summary.averageFinalScore.toFixed(1)}</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-black/25 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Leading Sector</p>
            <p className="mt-2 text-base font-black text-amber-300">{dashboard.summary.leadingSector}</p>
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <div className="rounded-[1.75rem] border border-white/5 bg-zinc-950/75 shadow-2xl shadow-black/20">
          <div className="flex items-center justify-between border-b border-white/5 px-6 py-5">
            <h4 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.2em] text-white">
              <TrendingUp className="h-4 w-4 text-emerald-300" />
              Top 100 Stocks
            </h4>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">Click a row for factor detail</span>
          </div>

          <div className="max-h-[34rem] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-zinc-950/95 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                <tr>
                  <th className="px-4 py-4">Rank</th>
                  <th className="px-4 py-4">Stock</th>
                  <th className="px-4 py-4">Momentum</th>
                  <th className="px-4 py-4">Trend</th>
                  <th className="px-4 py-4">Volume</th>
                  <th className="px-4 py-4">Sector</th>
                  <th className="px-4 py-4">Breakout</th>
                  <th className="px-4 py-4">Final</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rankings.map((signal) => {
                  const isSelected = signal.stockSymbol === selectedSignal.stockSymbol;
                  return (
                    <tr
                      key={signal.stockSymbol}
                      onClick={() => setSelectedSymbol(signal.stockSymbol)}
                      className={isSelected ? 'bg-emerald-400/[0.08]' : 'hover:bg-white/[0.03]'}
                    >
                      <td className="px-4 py-4 font-black text-zinc-400">#{signal.rank}</td>
                      <td className="px-4 py-4">
                        <div className="font-bold text-white">{signal.stockSymbol}</div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{signal.sector}</div>
                      </td>
                      <td className={`px-4 py-4 font-bold ${scoreTone(signal.momentumScore)}`}>{signal.momentumScore.toFixed(1)}</td>
                      <td className={`px-4 py-4 font-bold ${scoreTone(signal.trendScore)}`}>{signal.trendScore.toFixed(1)}</td>
                      <td className={`px-4 py-4 font-bold ${scoreTone(signal.volumeScore)}`}>{signal.volumeScore.toFixed(1)}</td>
                      <td className={`px-4 py-4 font-bold ${scoreTone(signal.sectorScore)}`}>{signal.sectorScore.toFixed(1)}</td>
                      <td className={`px-4 py-4 font-bold ${scoreTone(signal.breakoutScore)}`}>{signal.breakoutScore.toFixed(1)}</td>
                      <td className="px-4 py-4 text-base font-black text-emerald-300">{signal.finalScore.toFixed(1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[1.75rem] border border-white/5 bg-zinc-950/75 p-6 shadow-2xl shadow-black/20">
            <h4 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.2em] text-white">
              <Radar className="h-4 w-4 text-cyan-300" />
              Factor Breakdown
            </h4>
            <div className="mt-5 rounded-2xl border border-white/5 bg-black/20 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Selected Signal</p>
                  <h5 className="mt-2 text-2xl font-black text-white">{selectedSignal.stockSymbol}</h5>
                  <p className="mt-1 text-sm text-zinc-400">{selectedSignal.sector}</p>
                </div>
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-right">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300">Final Score</p>
                  <p className="text-3xl font-black text-white">{selectedSignal.finalScore.toFixed(1)}</p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {[
                  ['Momentum', selectedSignal.momentumScore],
                  ['Trend', selectedSignal.trendScore],
                  ['Volume', selectedSignal.volumeScore],
                  ['Volatility', selectedSignal.volatilityScore],
                  ['Sector', selectedSignal.sectorScore],
                  ['Institutional', selectedSignal.institutionalScore],
                  ['Breakout', selectedSignal.breakoutScore]
                ].map(([label, score]) => (
                  <div key={label} className="space-y-2">
                    <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-zinc-500">
                      <span>{label}</span>
                      <span className="font-bold text-white">{Number(score).toFixed(1)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/5">
                      <div className={`${factorBarClass(Number(score))} h-full`} style={{ width: `${Math.min(Number(score), 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl border border-white/5 bg-black/25 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">3M Momentum</p>
                  <p className="mt-2 font-black text-cyan-300">{selectedSignal.momentumValue.toFixed(2)}x</p>
                </div>
                <div className="rounded-2xl border border-white/5 bg-black/25 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Order Imbalance</p>
                  <p className="mt-2 font-black text-emerald-300">{selectedSignal.orderImbalance.toFixed(2)}x</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/5 bg-zinc-950/75 p-6 shadow-2xl shadow-black/20">
            <h4 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.2em] text-white">
              <Building2 className="h-4 w-4 text-amber-300" />
              Sector Strength
            </h4>
            <div className="mt-5 space-y-3">
              {sectorStrength.slice(0, 6).map((sector) => (
                <div key={sector.sector} className="rounded-2xl border border-white/5 bg-black/20 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">{sector.sector}</span>
                    <span className={`text-sm font-black ${scoreTone(sector.sectorScore)}`}>{sector.sectorScore.toFixed(1)}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5">
                    <div className={`${factorBarClass(sector.sectorScore)} h-full`} style={{ width: `${Math.min(sector.sectorScore, 100)}%` }} />
                  </div>
                  <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    Avg return {sector.averageReturn.toFixed(2)}% | {sector.leaders.join(', ')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-[1.75rem] border border-white/5 bg-zinc-950/75 p-6 shadow-2xl shadow-black/20">
        <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.2em] text-white">
          <Flame className="h-4 w-4 text-rose-300" />
          Momentum Heatmap
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {momentumHeatmap.map((tile) => (
            <button
              key={tile.symbol}
              onClick={() => setSelectedSymbol(tile.symbol)}
              className={`rounded-2xl border bg-gradient-to-br p-4 text-left transition hover:-translate-y-0.5 ${heatTone(tile.finalScore)}`}
            >
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">{tile.sector}</p>
              <h5 className="mt-2 text-lg font-black text-white">{tile.symbol}</h5>
              <div className="mt-3 flex items-end justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Momentum</p>
                  <p className="font-black text-cyan-300">{tile.momentumScore.toFixed(0)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Final</p>
                  <p className="font-black text-white">{tile.finalScore.toFixed(0)}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
