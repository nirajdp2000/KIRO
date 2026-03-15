import { Type } from "@google/genai";

export interface OrderBookLevel {
  price: number;
  volume: number;
}

export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface VolumeProfileNode {
  price: number;
  volume: number;
  isPOC: boolean;
  isInValueArea: boolean;
}

export interface InstitutionalMetrics {
  orderImbalance: number;
  accumulationScore: number;
  tradeFrequency: number;
  spreadDynamics: number;
  marketRegime: 'TRENDING' | 'SIDEWAYS' | 'VOLATILE';
}

export class InstitutionalService {
  /**
   * ORDER FLOW IMBALANCE ENGINE
   * order_imbalance = bid_volume / ask_volume
   */
  static async calculateOrderImbalance(orderBook: OrderBook): Promise<{ imbalance: number; signal: string; score: number }> {
    const res = await fetch('/api/institutional/imbalance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderBook)
    });
    return res.json();
  }

  /**
   * VOLUME PROFILE ANALYZER
   * Computes POC, VAH, VAL
   */
  static async calculateVolumeProfile(candles: any[], binSize: number = 1): Promise<{ 
    profile: VolumeProfileNode[]; 
    poc: number; 
    vah: number; 
    val: number;
  }> {
    const res = await fetch('/api/institutional/volume-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candles, binSize })
    });
    return res.json();
  }

  /**
   * CROSS-ASSET CORRELATION ENGINE
   */
  static async calculateCorrelation(seriesA: number[], seriesB: number[]): Promise<number> {
    const res = await fetch('/api/institutional/correlation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seriesA, seriesB })
    });
    const data = await res.json();
    return data.correlation;
  }

  /**
   * ADAPTIVE STRATEGY ENGINE
   * Detects market regime
   */
  static async detectMarketRegime(candles: any[]): Promise<'TRENDING' | 'SIDEWAYS' | 'VOLATILE'> {
    const res = await fetch('/api/institutional/market-regime', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(candles)
    });
    const data = await res.json();
    return data.regime as 'TRENDING' | 'SIDEWAYS' | 'VOLATILE';
  }
}
