/**
 * AnalyticsFilters
 * Modular advanced filter panel for the Analytics tab.
 * All filters are optional toggles — they highlight/score, never eliminate stocks.
 * No API or calculation changes — purely UI state.
 */
import React from 'react';
import { TrendingUp, Zap, BarChart3, Target, RotateCcw } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface FilterState {
  // Trend
  showSMA200:    boolean;
  sma20AboveSma50: boolean;
  sma50AboveSma200: boolean;
  // Momentum
  showRSI:       boolean;
  showMACD:      boolean;
  // Volume
  showVolAvg:    boolean;
  showVolSpike:  boolean;
  // Breakout
  near52wHigh:   boolean;
  recentBreakout: boolean;
}

export const DEFAULT_FILTERS: FilterState = {
  showSMA200:      false,
  sma20AboveSma50: false,
  sma50AboveSma200: false,
  showRSI:         false,
  showMACD:        false,
  showVolAvg:      false,
  showVolSpike:    false,
  near52wHigh:     false,
  recentBreakout:  false,
};

interface Props {
  filters: FilterState;
  onChange: (f: FilterState) => void;
}

interface ToggleProps {
  label: string;
  active: boolean;
  color: string; // tailwind color token e.g. 'emerald' | 'indigo' | 'amber' | 'violet'
  onToggle: () => void;
}

function FilterToggle({ label, active, color, onToggle }: ToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        'w-full flex items-center justify-between px-3 py-2 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition-all',
        active
          ? `bg-${color}-500/10 border-${color}-500/30 text-${color}-400`
          : 'bg-black/20 border-white/5 text-zinc-500 hover:border-white/10 hover:text-zinc-300'
      )}
    >
      {label}
      <div className={cn(
        'w-2 h-2 rounded-full transition-all',
        active ? `bg-${color}-500 shadow-[0_0_8px_rgba(0,0,0,0.3)]` : 'bg-zinc-700'
      )} />
    </button>
  );
}

function Section({ icon: Icon, title, color, children }: {
  icon: React.ElementType;
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className={`flex items-center gap-1.5 mb-2`}>
        <Icon className={`w-3 h-3 text-${color}-400`} />
        <span className={`text-[9px] font-black uppercase tracking-[0.2em] text-${color}-400/70`}>{title}</span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

export default function AnalyticsFilters({ filters, onChange }: Props) {
  const toggle = (key: keyof FilterState) =>
    onChange({ ...filters, [key]: !filters[key] });

  const activeCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
          Advanced Filters
          {activeCount > 0 && (
            <span className="ml-2 bg-indigo-500/20 text-indigo-400 text-[9px] px-1.5 py-0.5 rounded-full font-black">
              {activeCount} active
            </span>
          )}
        </label>
        {activeCount > 0 && (
          <button
            onClick={() => onChange({ ...DEFAULT_FILTERS })}
            className="flex items-center gap-1 text-[9px] font-bold text-zinc-600 hover:text-zinc-300 uppercase tracking-wider transition-colors"
          >
            <RotateCcw className="w-2.5 h-2.5" /> Reset
          </button>
        )}
      </div>

      <Section icon={TrendingUp} title="Trend" color="emerald">
        <FilterToggle label="Price > SMA 200"    active={filters.showSMA200}      color="emerald" onToggle={() => toggle('showSMA200')} />
        <FilterToggle label="SMA 20 > SMA 50"    active={filters.sma20AboveSma50} color="emerald" onToggle={() => toggle('sma20AboveSma50')} />
        <FilterToggle label="SMA 50 > SMA 200"   active={filters.sma50AboveSma200} color="emerald" onToggle={() => toggle('sma50AboveSma200')} />
      </Section>

      <Section icon={Zap} title="Momentum" color="indigo">
        <FilterToggle label="RSI (14)"           active={filters.showRSI}  color="indigo" onToggle={() => toggle('showRSI')} />
        <FilterToggle label="MACD Bullish"       active={filters.showMACD} color="indigo" onToggle={() => toggle('showMACD')} />
      </Section>

      <Section icon={BarChart3} title="Volume" color="amber">
        <FilterToggle label="Vol > 20d Avg"      active={filters.showVolAvg}   color="amber" onToggle={() => toggle('showVolAvg')} />
        <FilterToggle label="Volume Spike"       active={filters.showVolSpike} color="amber" onToggle={() => toggle('showVolSpike')} />
      </Section>

      <Section icon={Target} title="Breakout" color="violet">
        <FilterToggle label="Near 52w High"      active={filters.near52wHigh}    color="violet" onToggle={() => toggle('near52wHigh')} />
        <FilterToggle label="20d Breakout"       active={filters.recentBreakout} color="violet" onToggle={() => toggle('recentBreakout')} />
      </Section>
    </div>
  );
}
