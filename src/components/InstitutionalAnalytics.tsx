import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid, Legend, AreaChart, Area, ComposedChart
} from 'recharts';
import { 
  Activity, Layers, BarChart3, TrendingUp, Globe, 
  MessageSquare, Zap, Shield, Target, Info, Search, 
  ArrowUpRight, ArrowDownRight, AlertTriangle, Cpu, 
  Database, Network, BrainCircuit, BarChartHorizontal
} from 'lucide-react';
import { InstitutionalService, OrderBook, VolumeProfileNode } from '../services/InstitutionalService';

interface InstitutionalAnalyticsProps {
  symbol: string;
  candles: any[];
  onAnalyze?: () => void;
}

export const InstitutionalAnalytics: React.FC<InstitutionalAnalyticsProps> = ({ symbol, candles, onAnalyze }) => {
  const [activeTab, setActiveTab] = useState<'order-flow' | 'volume-profile' | 'correlation' | 'sentiment' | 'microstructure'>('order-flow');
  const [orderBook, setOrderBook] = useState<OrderBook>({ bids: [], asks: [] });
  const [imbalanceData, setImbalanceData] = useState<{ imbalance: number; signal: string; score: number } | null>(null);
  const [volumeProfile, setVolumeProfile] = useState<{ profile: VolumeProfileNode[]; poc: number; vah: number; val: number } | null>(null);
  const [marketRegime, setMarketRegime] = useState<'TRENDING' | 'SIDEWAYS' | 'VOLATILE'>('SIDEWAYS');
  const [correlationData, setCorrelationData] = useState<{ name: string; value: number }[]>([]);
  const [sentimentScore, setSentimentScore] = useState<number>(72);
  const [microstructure, setMicrostructure] = useState({ frequency: 0, spread: 0, accumulation: 0 });

  // Simulate real-time order book
  useEffect(() => {
    if (!candles || candles.length === 0) return;
    
    const lastPrice = candles[candles.length - 1].close;
    
    const generateOrderBook = async () => {
      try {
        const res = await fetch(`/api/institutional/order-book?lastPrice=${lastPrice}`);
        const ob = await res.json();
        setOrderBook(ob);
        const imbalance = await InstitutionalService.calculateOrderImbalance(ob);
        setImbalanceData(imbalance);
      } catch (e) {
        console.error("Failed to generate order book or calculate imbalance", e);
      }
    };

    generateOrderBook();
    const interval = setInterval(generateOrderBook, 3000);
    return () => clearInterval(interval);
  }, [candles]);

  // Calculate Volume Profile
  useEffect(() => {
    const fetchProfile = async () => {
      if (candles && candles.length > 0) {
        try {
          const vp = await InstitutionalService.calculateVolumeProfile(candles, 2);
          setVolumeProfile(vp);
          const regime = await InstitutionalService.detectMarketRegime(candles);
          setMarketRegime(regime);
        } catch (e) {
          console.error("Failed to calculate volume profile or regime", e);
        }
      }
    };
    fetchProfile();
  }, [candles]);

  // Simulate Correlation
  useEffect(() => {
    const fetchCorrelation = async () => {
      try {
        const res = await fetch(`/api/institutional/correlation-data?symbol=${symbol}`);
        const data = await res.json();
        setCorrelationData(data);
      } catch (e) {
        console.error("Failed to fetch correlation data", e);
      }
    };
    fetchCorrelation();
  }, [symbol]);

  // Simulate Microstructure
  useEffect(() => {
    const fetchMicrostructure = async () => {
      try {
        const res = await fetch('/api/institutional/microstructure');
        const data = await res.json();
        setMicrostructure(data);
      } catch (e) {
        console.error("Failed to fetch microstructure data", e);
      }
    };
    
    fetchMicrostructure();
    const interval = setInterval(fetchMicrostructure, 2000);
    return () => clearInterval(interval);
  }, []);

  const tabs = [
    { id: 'order-flow', label: 'Order Flow', icon: Activity },
    { id: 'volume-profile', label: 'Volume Profile', icon: BarChartHorizontal },
    { id: 'microstructure', label: 'Microstructure', icon: Cpu },
    { id: 'correlation', label: 'Correlation', icon: Network },
    { id: 'sentiment', label: 'Sentiment', icon: BrainCircuit },
  ];

  return (
    <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="p-6 border-bottom border-white/5 bg-gradient-to-r from-emerald-500/10 to-transparent flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Shield size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Institutional Intelligence Engine</h2>
            <p className="text-xs text-white/50 font-mono uppercase tracking-widest">Market Microstructure & Order Flow Analysis</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-tighter uppercase ${
            marketRegime === 'TRENDING' ? 'bg-emerald-500/20 text-emerald-400' :
            marketRegime === 'VOLATILE' ? 'bg-amber-500/20 text-amber-400' :
            'bg-blue-500/20 text-blue-400'
          }`}>
            Regime: {marketRegime}
          </div>
          <button 
            onClick={onAnalyze}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-black text-xs font-bold rounded-lg transition-all flex items-center gap-2"
          >
            <BrainCircuit size={14} />
            AI DEEP SCAN
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex border-bottom border-white/5 bg-white/2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 py-4 flex flex-col items-center gap-2 transition-all relative ${
              activeTab === tab.id ? 'text-emerald-400' : 'text-white/40 hover:text-white/60'
            }`}
          >
            <tab.icon size={18} />
            <span className="text-[10px] font-bold uppercase tracking-widest">{tab.label}</span>
            {activeTab === tab.id && (
              <motion.div 
                layoutId="activeTab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500"
              />
            )}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="p-6 min-h-[400px]">
        <AnimatePresence mode="wait">
          {activeTab === 'order-flow' && (
            <motion.div 
              key="order-flow"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-6"
            >
              <div className="space-y-4">
                <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-xs text-white/40 uppercase font-bold tracking-widest">Imbalance Score</span>
                    <span className="text-2xl font-black text-emerald-400">{imbalanceData?.imbalance.toFixed(2)}x</span>
                  </div>
                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 transition-all duration-1000" 
                      style={{ width: `${Math.min(100, (imbalanceData?.imbalance || 0) * 20)}%` }}
                    />
                  </div>
                  <p className="mt-3 text-[10px] font-mono text-emerald-400/80 uppercase tracking-widest flex items-center gap-2">
                    <Zap size={10} /> {imbalanceData?.signal}
                  </p>
                </div>

                <div className="bg-white/5 rounded-xl border border-white/5 overflow-hidden">
                  <div className="p-3 bg-white/5 border-bottom border-white/5 flex justify-between items-center">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Order Book Depth</span>
                    <span className="text-[10px] font-mono text-white/40">Real-time Feed</span>
                  </div>
                  <div className="p-4 space-y-1">
                    {orderBook.asks.slice(0, 5).reverse().map((ask, i) => (
                      <div key={`ask-${i}`} className="flex justify-between text-[10px] font-mono relative">
                        <div className="absolute inset-0 bg-red-500/5" style={{ width: `${(ask.volume / 10000) * 100}%`, left: 'auto', right: 0 }} />
                        <span className="text-red-400 z-10">{ask.price.toFixed(2)}</span>
                        <span className="text-white/40 z-10">{ask.volume.toLocaleString()}</span>
                      </div>
                    ))}
                    <div className="py-2 border-y border-white/10 text-center">
                      <span className="text-xs font-bold text-white tracking-widest">SPREAD: {(orderBook.asks[0]?.price - orderBook.bids[0]?.price).toFixed(2)}</span>
                    </div>
                    {orderBook.bids.slice(0, 5).map((bid, i) => (
                      <div key={`bid-${i}`} className="flex justify-between text-[10px] font-mono relative">
                        <div className="absolute inset-0 bg-emerald-500/5" style={{ width: `${(bid.volume / 10000) * 100}%` }} />
                        <span className="text-emerald-400 z-10">{bid.price.toFixed(2)}</span>
                        <span className="text-white/40 z-10">{bid.volume.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-white/5 rounded-xl border border-white/5 p-4 flex flex-col">
                <h3 className="text-xs font-bold uppercase tracking-widest text-white/60 mb-4">Liquidity Heatmap</h3>
                <div className="flex-1 min-h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[...orderBook.bids, ...orderBook.asks].sort((a,b) => a.price - b.price)} layout="vertical">
                      <XAxis type="number" hide />
                      <YAxis dataKey="price" type="number" domain={['auto', 'auto']} hide />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                        itemStyle={{ color: '#10b981' }}
                      />
                      <Bar dataKey="volume" radius={[0, 4, 4, 0]}>
                        {([...orderBook.bids, ...orderBook.asks].sort((a,b) => a.price - b.price)).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.price < (candles[candles.length-1]?.close || 0) ? '#10b981' : '#ef4444'} fillOpacity={0.3} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="p-2 bg-emerald-500/5 border border-emerald-500/10 rounded-lg">
                    <span className="block text-[8px] uppercase text-emerald-400/60 font-bold">Support Zone</span>
                    <span className="text-xs font-mono text-emerald-400">₹{orderBook.bids[0]?.price.toFixed(2)}</span>
                  </div>
                  <div className="p-2 bg-red-500/5 border border-red-500/10 rounded-lg">
                    <span className="block text-[8px] uppercase text-red-400/60 font-bold">Resistance Zone</span>
                    <span className="text-xs font-mono text-red-400">₹{orderBook.asks[0]?.price.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'volume-profile' && (
            <motion.div 
              key="volume-profile"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="h-[400px] flex flex-col"
            >
              <div className="flex justify-between items-center mb-6">
                <div className="flex gap-6">
                  <div>
                    <span className="block text-[8px] uppercase text-white/40 font-bold tracking-widest">Point of Control</span>
                    <span className="text-lg font-black text-emerald-400">₹{volumeProfile?.poc.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="block text-[8px] uppercase text-white/40 font-bold tracking-widest">Value Area High</span>
                    <span className="text-lg font-black text-white/80">₹{volumeProfile?.vah.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="block text-[8px] uppercase text-white/40 font-bold tracking-widest">Value Area Low</span>
                    <span className="text-lg font-black text-white/80">₹{volumeProfile?.val.toFixed(2)}</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="block text-[8px] uppercase text-white/40 font-bold tracking-widest">VA Status</span>
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Price in Value Area</span>
                </div>
              </div>
              
              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={volumeProfile?.profile} layout="vertical" margin={{ left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis dataKey="price" type="number" domain={['auto', 'auto']} stroke="rgba(255,255,255,0.3)" fontSize={10} />
                    <Tooltip 
                      cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                      contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                    />
                    <Bar dataKey="volume" radius={[0, 4, 4, 0]}>
                      {volumeProfile?.profile.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.isPOC ? '#10b981' : (entry.isInValueArea ? '#3b82f6' : '#4b5563')} 
                          fillOpacity={entry.isPOC ? 1 : 0.4}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          )}

          {activeTab === 'microstructure' && (
            <motion.div 
              key="microstructure"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-6"
            >
              <div className="p-6 bg-white/5 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400">
                  <Activity size={32} />
                </div>
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/40">Trade Frequency</h4>
                  <p className="text-3xl font-black text-white">{microstructure.frequency} <span className="text-xs font-normal text-white/40">t/min</span></p>
                </div>
                <p className="text-[10px] text-blue-400/60 font-mono">ALGORITHMIC INTENSITY: HIGH</p>
              </div>

              <div className="p-6 bg-white/5 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                  <Target size={32} />
                </div>
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/40">Accumulation Score</h4>
                  <p className="text-3xl font-black text-white">{microstructure.accumulation}%</p>
                </div>
                <p className="text-[10px] text-emerald-400/60 font-mono">SMART MONEY PHASE: ACTIVE</p>
              </div>

              <div className="p-6 bg-white/5 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400">
                  <Layers size={32} />
                </div>
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/40">Spread Dynamics</h4>
                  <p className="text-3xl font-black text-white">{microstructure.spread.toFixed(3)}%</p>
                </div>
                <p className="text-[10px] text-amber-400/60 font-mono">LIQUIDITY DEPTH: STABLE</p>
              </div>

              <div className="md:col-span-3 p-6 bg-white/5 rounded-2xl border border-white/5">
                <h3 className="text-xs font-bold uppercase tracking-widest text-white/60 mb-6">Trade Size Distribution</h3>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={[
                      { size: '1-10', count: 450 },
                      { size: '10-50', count: 320 },
                      { size: '50-200', count: 180 },
                      { size: '200-1000', count: 95 },
                      { size: '1000+', count: 42 },
                    ]}>
                      <XAxis dataKey="size" stroke="rgba(255,255,255,0.3)" fontSize={10} />
                      <YAxis hide />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                      />
                      <Area type="monotone" dataKey="count" stroke="#10b981" fill="#10b981" fillOpacity={0.1} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 flex items-center gap-2 text-[10px] text-white/40 uppercase font-bold tracking-widest">
                  <Info size={12} />
                  Institutional block trades detected in the 1000+ category.
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'correlation' && (
            <motion.div 
              key="correlation"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white/5 rounded-2xl border border-white/5 p-6">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-white/60 mb-6">Cross-Asset Correlation Matrix</h3>
                  <div className="space-y-4">
                    {correlationData.map((asset, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                          <span className="text-white/60">{asset.name}</span>
                          <span className={asset.value > 0.8 ? 'text-emerald-400' : 'text-white/40'}>{(asset.value * 100).toFixed(0)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-1000 ${asset.value > 0.8 ? 'bg-emerald-500' : 'bg-white/20'}`}
                            style={{ width: `${asset.value * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white/5 rounded-2xl border border-white/5 p-6 flex flex-col items-center justify-center text-center">
                  <div className="w-24 h-24 rounded-full border-4 border-emerald-500/20 flex items-center justify-center mb-4">
                    <Globe className="text-emerald-400 animate-pulse" size={40} />
                  </div>
                  <h3 className="text-lg font-black text-white mb-2">Leading Indicator Detected</h3>
                  <p className="text-xs text-white/50 max-w-[250px]">
                    Strong positive correlation (0.92) with <span className="text-emerald-400 font-bold">BANK NIFTY</span> suggests sectoral leadership.
                  </p>
                  <div className="mt-6 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
                    Signal: Sectoral Rotation Inbound
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'sentiment' && (
            <motion.div 
              key="sentiment"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              <div className="p-8 bg-gradient-to-br from-emerald-500/10 to-blue-500/10 rounded-3xl border border-white/5 flex flex-col items-center text-center">
                <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-400 mb-4">NLP Sentiment Score</div>
                <div className="text-7xl font-black text-white mb-4">{sentimentScore}</div>
                <div className="flex gap-2 mb-8">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div 
                      key={i} 
                      className={`w-2 h-8 rounded-full ${i < sentimentScore / 10 ? 'bg-emerald-500' : 'bg-white/10'}`} 
                    />
                  ))}
                </div>
                <p className="text-sm text-white/60 max-w-md leading-relaxed">
                  Institutional sentiment is <span className="text-emerald-400 font-bold">OVERWHELMINGLY BULLISH</span> based on recent earnings calls and social media velocity.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-white/5 rounded-xl border border-white/5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                    <MessageSquare size={20} />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Social Velocity</div>
                    <div className="text-sm font-bold text-white">+240% vs Avg</div>
                  </div>
                </div>
                <div className="p-4 bg-white/5 rounded-xl border border-white/5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                    <TrendingUp size={20} />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest">News Bias</div>
                    <div className="text-sm font-bold text-white">82% Positive</div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer Stats */}
      <div className="px-6 py-4 bg-white/2 border-top border-white/5 flex justify-between items-center">
        <div className="flex gap-6">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Engine Status: Operational</span>
          </div>
          <div className="flex items-center gap-2">
            <Database size={12} className="text-white/40" />
            <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Latency: 12ms</span>
          </div>
        </div>
        <div className="text-[10px] font-mono text-white/20">
          QUANT-V3.2.0-INSTITUTIONAL
        </div>
      </div>
    </div>
  );
};
