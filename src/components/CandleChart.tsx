import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';

interface Candle {
  time: string; fullTime: string;
  open: number; high: number; low: number; close: number;
  volume: number; timestamp: number;
  sma20?: number; sma50?: number;
}

interface Props {
  data: Candle[];
  showSMA20?: boolean;
  showSMA50?: boolean;
  height?: number;
  onLoadMore?: () => void;   // called when user wants older data
  loadingMore?: boolean;
}

interface Tooltip { x: number; y: number; candle: Candle; }

const PAD = { top: 16, right: 60, bottom: 28, left: 8 };
const VOL_H = 48;
const GAP = 6;

export default function CandleChart({ data, showSMA20, showSMA50, height, onLoadMore, loadingMore }: Props) {
  const svgRef        = useRef<SVGSVGElement>(null);
  const containerRef  = useRef<HTMLDivElement>(null);
  const [width, setWidth]           = useState(800);
  const [containerH, setContainerH] = useState(420);
  const [tooltip, setTooltip]       = useState<Tooltip | null>(null);
  const [visibleRange, setVisibleRange] = useState<[number, number]>([0, data.length - 1]);
  const isPanning  = useRef(false);
  const panStart   = useRef<{ x: number; range: [number, number] } | null>(null);

  // When data grows (load more prepended), keep view anchored to same candles
  const prevLenRef = useRef(data.length);
  useEffect(() => {
    if (data.length === 0) return;
    const maxEnd = data.length - 1;
    const added  = data.length - prevLenRef.current;
    prevLenRef.current = data.length;
    setVisibleRange(prev => {
      if (prev[1] > maxEnd || prev[0] < 0) {
        const show = Math.min(80, data.length);
        return [data.length - show, maxEnd];
      }
      // Shift range right by the number of newly prepended candles
      if (added > 0 && prev[0] > 0) {
        return [prev[0] + added, Math.min(prev[1] + added, maxEnd)];
      }
      return [prev[0], Math.min(prev[1], maxEnd)];
    });
  }, [data.length]);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      const h = entries[0]?.contentRect.height;
      if (w) setWidth(w);
      if (h) setContainerH(h);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const resolvedH = height ?? containerH;
  const priceH = resolvedH - VOL_H - GAP;
  const chartW = width - PAD.left - PAD.right;
  const chartH = priceH - PAD.top - PAD.bottom;

  const visible = useMemo(() => {
    if (!data.length) return [];
    const [s, e] = visibleRange;
    return data.slice(Math.max(0, s), Math.min(data.length - 1, e) + 1);
  }, [data, visibleRange]);

  const { minP, maxP, maxV } = useMemo(() => {
    if (!visible.length) return { minP: 0, maxP: 1, maxV: 1 };
    let minP = Infinity, maxP = -Infinity, maxV = -Infinity;
    for (const c of visible) {
      if (c.low  < minP) minP = c.low;
      if (c.high > maxP) maxP = c.high;
      if (c.volume > maxV) maxV = c.volume;
    }
    const pad = (maxP - minP) * 0.06;
    return { minP: minP - pad, maxP: maxP + pad, maxV };
  }, [visible]);

  const toY    = useCallback((v: number) => maxP === minP ? chartH / 2 : PAD.top + chartH - ((v - minP) / (maxP - minP)) * chartH, [minP, maxP, chartH]);
  const toVolY = useCallback((v: number) => maxV === 0 ? VOL_H : VOL_H - (v / maxV) * (VOL_H - 4), [maxV]);
  const candleW = useMemo(() => { if (!visible.length) return 8; return Math.max(1, Math.min((chartW / visible.length) * 0.7, 20)); }, [visible.length, chartW]);
  const xOf    = useCallback((i: number) => PAD.left + (i + 0.5) * (chartW / (visible.length || 1)), [visible.length, chartW]);

  const yTicks = useMemo(() => Array.from({ length: 5 }, (_, i) => {
    const v = minP + (maxP - minP) * (i / 4);
    return { v, y: toY(v) };
  }), [minP, maxP, toY]);

  const xTicks = useMemo(() => {
    if (!visible.length) return [];
    const step = Math.max(1, Math.floor(visible.length / 6));
    return visible.map((c, i) => ({ i, label: c.time })).filter((_, i) => i % step === 0);
  }, [visible]);

  const smaPath = useCallback((key: 'sma20' | 'sma50') => {
    const pts = visible.map((c, i) => c[key] != null ? `${xOf(i)},${toY(c[key]!)}` : null).filter(Boolean);
    return pts.length < 2 ? '' : 'M ' + pts.join(' L ');
  }, [visible, xOf, toY]);

  // ── Zoom helpers ──
  const applyZoom = useCallback((factor: number, anchorRatio = 0.5) => {
    if (data.length < 2) return;
    const [s, e] = visibleRange;
    const span = e - s;
    const newSpan = Math.round(Math.max(10, Math.min(data.length, span * factor)));
    const anchorIdx = s + Math.round(anchorRatio * span);
    const ns = Math.max(0, Math.min(data.length - newSpan, anchorIdx - Math.round(anchorRatio * newSpan)));
    const ne = Math.min(data.length - 1, ns + newSpan - 1);
    setVisibleRange([ns, ne]);
  }, [data.length, visibleRange]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect();
    let anchorRatio = 0.5;
    if (rect) anchorRatio = Math.max(0, Math.min(1, (e.clientX - rect.left - PAD.left) / chartW));
    applyZoom(e.deltaY < 0 ? 0.85 : 1.15, anchorRatio);
  }, [applyZoom, chartW]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isPanning.current = true;
    panStart.current = { x: e.clientX, range: [...visibleRange] as [number, number] };
  }, [visibleRange]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!svgRef.current) return;
    if (isPanning.current && panStart.current) {
      const dx = e.clientX - panStart.current.x;
      const span = panStart.current.range[1] - panStart.current.range[0];
      const shift = Math.round(-dx / (chartW / (span + 1)));
      const [os] = panStart.current.range;
      const ns = Math.max(0, Math.min(data.length - 1 - span, os + shift));
      setVisibleRange([ns, ns + span]);
      return;
    }
    const rect = svgRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left - PAD.left;
    if (!visible.length || mx < 0 || mx > chartW) { setTooltip(null); return; }
    const idx = Math.round((mx / chartW) * (visible.length - 1));
    const c = visible[Math.max(0, Math.min(visible.length - 1, idx))];
    if (c) setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, candle: c });
    else setTooltip(null);
  }, [visible, chartW, data.length]);

  const onMouseUp    = useCallback(() => { isPanning.current = false; panStart.current = null; }, []);
  const onMouseLeave = useCallback(() => { isPanning.current = false; setTooltip(null); }, []);

  const isAtStart = visibleRange[0] === 0;
  const span = visibleRange[1] - visibleRange[0];

  if (!data.length) return <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">No data</div>;

  return (
    <div ref={containerRef} className="w-full h-full relative select-none">

      {/* ── Zoom controls (top-right) ── */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        <button onClick={() => applyZoom(0.7)}
          className="w-6 h-6 flex items-center justify-center text-[13px] font-black text-zinc-400 hover:text-white bg-black/50 hover:bg-indigo-500/30 border border-white/[0.08] rounded transition-all">
          +
        </button>
        <button onClick={() => applyZoom(1.4)}
          className="w-6 h-6 flex items-center justify-center text-[13px] font-black text-zinc-400 hover:text-white bg-black/50 hover:bg-indigo-500/30 border border-white/[0.08] rounded transition-all">
          -
        </button>
        <span className="text-[8px] font-mono text-zinc-700 bg-black/40 px-1.5 py-0.5 rounded">
          {visible.length}/{data.length}
        </span>
        {span < data.length - 1 && (
          <button onClick={() => setVisibleRange([0, data.length - 1])}
            className="text-[8px] font-bold text-zinc-500 hover:text-zinc-200 bg-black/40 hover:bg-black/60 px-1.5 py-0.5 rounded transition-colors">
            All
          </button>
        )}
      </div>

      {/* ── Load More History (top-left, shown when panned to start) ── */}
      {onLoadMore && isAtStart && (
        <div className="absolute top-2 left-2 z-10">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="flex items-center gap-1 text-[8px] font-black uppercase tracking-wider px-2 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/25 text-indigo-400 hover:text-indigo-300 transition-all disabled:opacity-50">
            {loadingMore ? (
              <span className="inline-block w-2 h-2 border border-indigo-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <span>{'<'}</span>
            )}
            {loadingMore ? 'Loading...' : 'Load older'}
          </button>
        </div>
      )}

      <svg ref={svgRef} width={width} height={resolvedH}
        className="cursor-crosshair"
        onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove}
        onMouseUp={onMouseUp} onMouseLeave={onMouseLeave}
        style={{ userSelect: 'none' }}>

        {yTicks.map((t, i) => (
          <line key={i} x1={PAD.left} x2={width - PAD.right} y1={t.y} y2={t.y} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
        ))}
        {yTicks.map((t, i) => (
          <text key={i} x={width - PAD.right + 6} y={t.y + 3} fill="#52525b" fontSize={9} fontFamily="monospace">{t.v.toFixed(1)}</text>
        ))}
        {xTicks.map(({ i, label }) => (
          <text key={i} x={xOf(i)} y={priceH - 4} fill="#52525b" fontSize={9} textAnchor="middle" fontFamily="monospace">{label}</text>
        ))}

        {showSMA20 && smaPath('sma20') && <path d={smaPath('sma20')} fill="none" stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.8} />}
        {showSMA50 && smaPath('sma50') && <path d={smaPath('sma50')} fill="none" stroke="#f97316" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.8} />}

        {visible.map((c, i) => {
          const x = xOf(i);
          const isBull = c.close >= c.open;
          const color = isBull ? '#10b981' : '#f43f5e';
          const bodyTop = toY(Math.max(c.open, c.close));
          const bodyBot = toY(Math.min(c.open, c.close));
          const bodyH = Math.max(1, bodyBot - bodyTop);
          const hw = Math.max(0.5, candleW / 2);
          return (
            <g key={i}>
              <line x1={x} x2={x} y1={toY(c.high)} y2={toY(c.low)} stroke={color} strokeWidth={Math.max(1, candleW * 0.12)} opacity={0.9} />
              <rect x={x - hw} y={bodyTop} width={candleW} height={bodyH} fill={color} fillOpacity={isBull ? 0.85 : 0.9} stroke={color} strokeWidth={0.5} rx={candleW > 4 ? 1 : 0} />
            </g>
          );
        })}

        {visible.map((c, i) => {
          const x = xOf(i);
          const isBull = c.close >= c.open;
          const barH = toVolY(c.volume);
          const hw = Math.max(0.5, candleW / 2);
          return <rect key={i} x={x - hw} y={priceH + GAP + barH} width={candleW} height={VOL_H - barH} fill={isBull ? 'rgba(16,185,129,0.25)' : 'rgba(244,63,94,0.25)'} rx={1} />;
        })}

        {tooltip && (
          <>
            <line x1={tooltip.x} x2={tooltip.x} y1={PAD.top} y2={priceH - PAD.bottom} stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="3 3" />
            <line x1={PAD.left} x2={width - PAD.right} y1={tooltip.y} y2={tooltip.y} stroke="rgba(255,255,255,0.1)" strokeWidth={1} strokeDasharray="3 3" />
          </>
        )}
      </svg>

      {tooltip && (
        <div className="absolute z-50 pointer-events-none bg-[#1a1a1f] border border-white/10 rounded-xl p-3 text-[10px] font-mono shadow-2xl"
          style={{ left: tooltip.x + 14, top: tooltip.y - 60, transform: tooltip.x > width * 0.65 ? 'translateX(-110%)' : undefined }}>
          <p className="text-zinc-400 mb-1.5 text-[9px]">{tooltip.candle.fullTime}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            <span className="text-zinc-600">O</span><span className="text-right text-zinc-200">{tooltip.candle.open.toFixed(2)}</span>
            <span className="text-zinc-600">H</span><span className="text-right text-emerald-400">{tooltip.candle.high.toFixed(2)}</span>
            <span className="text-zinc-600">L</span><span className="text-right text-rose-400">{tooltip.candle.low.toFixed(2)}</span>
            <span className="text-zinc-600">C</span><span className="text-right text-white font-bold">{tooltip.candle.close.toFixed(2)}</span>
            <span className="text-zinc-600">V</span><span className="text-right text-indigo-400">{tooltip.candle.volume.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}
