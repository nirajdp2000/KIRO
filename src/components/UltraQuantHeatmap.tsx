type HeatmapStock = {
  symbol: string;
  sector: string;
  score: number;
  finalPredictionScore: number;
  momentum: number;
  cagr: number;
};

type UltraQuantHeatmapProps = {
  stocks: HeatmapStock[];
};

const toneForScore = (score: number) => {
  if (score >= 85) return 'from-emerald-500/25 via-emerald-400/15 to-cyan-400/10 border-emerald-400/20';
  if (score >= 70) return 'from-cyan-500/20 via-sky-400/10 to-indigo-400/10 border-cyan-400/20';
  if (score >= 55) return 'from-amber-500/20 via-amber-400/10 to-orange-400/10 border-amber-300/20';
  return 'from-zinc-700/30 via-zinc-800/20 to-zinc-900/10 border-white/10';
};

export function UltraQuantHeatmap({ stocks }: UltraQuantHeatmapProps) {
  return (
    <section className="rounded-[2rem] border border-white/5 bg-zinc-950/70 p-6 shadow-2xl shadow-black/30">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white">Bullish Heatmap</h3>
          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-zinc-500">Top ranked names by quant conviction</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
          {stocks.length} tiles
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {stocks.map((stock) => (
          <div
            key={stock.symbol}
            className={`rounded-2xl border bg-gradient-to-br p-4 transition-transform duration-200 hover:-translate-y-0.5 ${toneForScore(stock.score)}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black tracking-tight text-white">{stock.symbol}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">{stock.sector}</p>
              </div>
              <p className="text-xs font-black text-white">{stock.score.toFixed(0)}</p>
            </div>

            <div className="mt-6 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-zinc-300">
                <span>AI</span>
                <span className="font-bold text-emerald-300">{stock.finalPredictionScore.toFixed(0)}%</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-zinc-300">
                <span>Momentum</span>
                <span className="font-bold text-cyan-300">{stock.momentum.toFixed(2)}x</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-zinc-300">
                <span>CAGR</span>
                <span className="font-bold text-white">{stock.cagr.toFixed(0)}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
