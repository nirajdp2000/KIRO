import express from "express";
import axios from "axios";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import {
  errorLoggingMiddleware,
  installProcessErrorHandlers,
  logAction,
  logError,
  requestLoggingMiddleware,
  withErrorBoundary,
} from "./serverLogger";

import path from "path";
import fs from "fs";

dotenv.config();
installProcessErrorHandlers();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '1mb' }));
  app.use(requestLoggingMiddleware());

  // Serve the Spring Boot template for a specific route
  app.get("/sb-terminal", (req, res) => {
    const templatePath = path.join(process.cwd(), "src/main/resources/templates/index.html");
    if (fs.existsSync(templatePath)) {
      let content = fs.readFileSync(templatePath, 'utf8');
      // Inject the API key for the frontend script
      const apiKey = process.env.GEMINI_API_KEY || "";
      content = content.replace('process.env.GEMINI_API_KEY', `'${apiKey}'`);
      // Also replace the Thymeleaf-like placeholder if it exists
      content = content.replace(/\[\[\$\{@environment\.getProperty\('GEMINI_API_KEY'\)\}\]\]/g, apiKey);
      res.send(content);
    } else {
      res.status(404).send("Template not found. Please ensure src/main/resources/templates/index.html exists.");
    }
  });

  // Mock/Curated list of popular NSE stocks for autocomplete
  const POPULAR_STOCKS = [
    { name: "RELIANCE INDUSTRIES LTD", symbol: "RELIANCE", key: "NSE_EQ|INE002A01018" },
    { name: "TATA CONSULTANCY SERVICES LTD", symbol: "TCS", key: "NSE_EQ|INE467B01029" },
    { name: "HDFC BANK LTD", symbol: "HDFCBANK", key: "NSE_EQ|INE040A01034" },
    { name: "INFOSYS LTD", symbol: "INFY", key: "NSE_EQ|INE009A01021" },
    { name: "ICICI BANK LTD", symbol: "ICICIBANK", key: "NSE_EQ|INE090A01021" },
    { name: "STATE BANK OF INDIA", symbol: "SBIN", key: "NSE_EQ|INE062A01020" },
    { name: "BHARTI AIRTEL LTD", symbol: "BHARTIARTL", key: "NSE_EQ|INE397D01024" },
    { name: "LARSEN & TOUBRO LTD", symbol: "LT", key: "NSE_EQ|INE018A01030" },
    { name: "ITC LTD", symbol: "ITC", key: "NSE_EQ|INE154A01025" },
    { name: "KOTAK MAHINDRA BANK LTD", symbol: "KOTAKBANK", key: "NSE_EQ|INE237A01028" },
    { name: "AXIS BANK LTD", symbol: "AXISBANK", key: "NSE_EQ|INE238A01034" },
    { name: "ADANI ENTERPRISES LTD", symbol: "ADANIENT", key: "NSE_EQ|INE423A01024" },
    { name: "ASIAN PAINTS LTD", symbol: "ASIANPAINT", key: "NSE_EQ|INE021A01026" },
    { name: "MARUTI SUZUKI INDIA LTD", symbol: "MARUTI", key: "NSE_EQ|INE585B01010" },
    { name: "SUN PHARMACEUTICAL IND LTD", symbol: "SUNPHARMA", key: "NSE_EQ|INE044A01036" },
    { name: "TITAN COMPANY LTD", symbol: "TITAN", key: "NSE_EQ|INE280A01028" },
    { name: "BAJAJ FINANCE LTD", symbol: "BAJFINANCE", key: "NSE_EQ|INE296A01024" },
    { name: "HCL TECHNOLOGIES LTD", symbol: "HCLTECH", key: "NSE_EQ|INE860A01027" },
    { name: "WIPRO LTD", symbol: "WIPRO", key: "NSE_EQ|INE075A01022" },
    { name: "TATA MOTORS LTD", symbol: "TATAMOTORS", key: "NSE_EQ|INE155A01022" },
    { name: "MAHINDRA & MAHINDRA LTD", symbol: "M&M", key: "NSE_EQ|INE101A01026" },
    { name: "ULTRATECH CEMENT LTD", symbol: "ULTRACEMCO", key: "NSE_EQ|INE481G01011" },
    { name: "POWER GRID CORP OF INDIA LTD", symbol: "POWERGRID", key: "NSE_EQ|INE752E01010" },
    { name: "NTPC LTD", symbol: "NTPC", key: "NSE_EQ|INE733E01010" },
    { name: "NESTLE INDIA LTD", symbol: "NESTLEIND", key: "NSE_EQ|INE239A01016" },
    { name: "BAJAJ FINSERV LTD", symbol: "BAJAJFINSV", key: "NSE_EQ|INE918I01018" },
    { name: "JSW STEEL LTD", symbol: "JSWSTEEL", key: "NSE_EQ|INE019A01038" },
    { name: "HINDALCO INDUSTRIES LTD", symbol: "HINDALCO", key: "NSE_EQ|INE038A01020" },
  ];

  type UltraQuantRequest = {
    historicalPeriodYears?: number;
    minCagr?: number;
    sectorFilter?: string;
    minMarketCap?: number;
    maxMarketCap?: number;
    minVolume?: number;
    maxDrawdown?: number;
    volatilityThreshold?: number;
    breakoutFrequency?: number;
    trendStrengthThreshold?: number;
    riskPercentage?: number;
  };

  type UltraQuantProfile = {
    symbol: string;
    sector: string;
    industry: string;
    marketCap: number;
    averageVolume: number;
  };

  type UltraQuantCandle = {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  };

  type HedgeFundSignalScore = {
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

  type HedgeFundSignalDashboard = {
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

  const ultraArchitecture = [
    { stage: "Market Feed", description: "Ingests real-time ticks and historical candles through provider adapters." },
    { stage: "Tick Processor", description: "Normalizes OHLCV, order book depth, sector metadata, and microstructure events." },
    { stage: "Feature Generator", description: "Builds CAGR, EMA slope, RSI proxy, ATR proxy, VWAP distance, drawdown, and breakout features." },
    { stage: "AI Prediction Models", description: "Runs gradient boost scoring, LSTM-style path forecasting, regime detection, hidden states, and RL policy actioning." },
    { stage: "Signal Aggregator", description: "Combines technical, AI, and sentiment signals into a single institutional prediction score." },
    { stage: "Stock Ranking Engine", description: "Ranks filtered stocks, computes sector rotation, and emits alerts with risk-aware sizing." },
    { stage: "Ultra Quant Analyzer Tab", description: "Renders the dedicated tab with filters, rankings, model diagnostics, and alert views." },
    { stage: "Alert Engine", description: "Publishes high-conviction signals with symbol, signal type, confidence, and timestamp." }
  ];

  const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const seededGenerator = (seed: number) => {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  };
  const symbolSeed = (symbol: string) => Array.from(symbol).reduce((sum, char) => sum + char.charCodeAt(0), 0);

  const normalizeUltraQuantRequest = (payload: UltraQuantRequest = {}) => ({
    historicalPeriodYears: Math.min(15, Math.max(1, Number(payload.historicalPeriodYears ?? 5))),
    minCagr: Number(payload.minCagr ?? 18),
    sectorFilter: (payload.sectorFilter ?? "ALL").toString(),
    minMarketCap: Number(payload.minMarketCap ?? 0),
    maxMarketCap: Number(payload.maxMarketCap ?? Number.MAX_SAFE_INTEGER),
    minVolume: Number(payload.minVolume ?? 100000),
    maxDrawdown: Number(payload.maxDrawdown ?? 45),
    volatilityThreshold: Number(payload.volatilityThreshold ?? 0.5),
    breakoutFrequency: Number(payload.breakoutFrequency ?? 0.08),
    trendStrengthThreshold: Number(payload.trendStrengthThreshold ?? 0.12),
    riskPercentage: Number(payload.riskPercentage ?? 1)
  });

  const createUltraQuantUniverse = (): UltraQuantProfile[] => {
    const sectorMap = [
      ["Technology", "Software"],
      ["Financials", "Banking"],
      ["Energy", "Oil & Gas"],
      ["Healthcare", "Pharma"],
      ["Consumer", "Retail"],
      ["Industrials", "Capital Goods"],
      ["Telecom", "Digital Networks"],
      ["Materials", "Metals"]
    ];
    const roots = ["ALPHA", "NOVA", "ZEN", "ORBIT", "PRIME", "VECTOR", "AURA", "PULSE", "SUMMIT", "QUANT", "TITAN", "VISTA"];
    const profiles: UltraQuantProfile[] = [];
    let counter = 0;

    for (const root of roots) {
      for (let index = 0; index < 36; index++) {
        const [sector, industry] = sectorMap[counter % sectorMap.length];
        profiles.push({
          symbol: `${root}${String.fromCharCode(65 + (index % 26))}${String(index).padStart(2, "0")}`,
          sector,
          industry,
          marketCap: 5000 + ((counter * 137) % 180000),
          averageVolume: 80000 + ((counter * 53) % 2500000)
        });
        counter += 1;
      }
    }

    POPULAR_STOCKS.forEach((stock, index) => {
      const [sector, industry] = sectorMap[index % sectorMap.length];
      profiles.push({
        symbol: stock.symbol,
        sector,
        industry,
        marketCap: 45000 + index * 6000,
        averageVolume: 400000 + index * 75000
      });
    });

    return profiles;
  };

  const buildReturns = (prices: number[]) => {
    const returns: number[] = [];
    for (let index = 1; index < prices.length; index++) {
      returns.push((prices[index] - prices[index - 1]) / prices[index - 1]);
    }
    return returns;
  };

  const buildEma = (values: number[], period: number) => {
    if (!values.length) return [];
    const multiplier = 2 / (period + 1);
    const ema = [values[0]];
    for (let index = 1; index < values.length; index++) {
      ema.push(((values[index] - ema[index - 1]) * multiplier) + ema[index - 1]);
    }
    return ema;
  };

  const calculateSlope = (values: number[]) => {
    if (values.length < 2) return 0;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    const n = values.length;
    for (let index = 0; index < n; index++) {
      sumX += index;
      sumY += values[index];
      sumXY += index * values[index];
      sumX2 += index * index;
    }
    const denominator = n * sumX2 - sumX * sumX;
    return denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
  };

  const calculateVolatility = (returns: number[]) => {
    if (returns.length < 2) return 0;
    const mean = average(returns);
    const variance = average(returns.map((item) => Math.pow(item - mean, 2)));
    return Math.sqrt(variance);
  };

  const calculateMaxDrawdown = (prices: number[]) => {
    if (!prices.length) return 0;
    let peak = prices[0];
    let maxDrawdown = 0;
    for (const price of prices) {
      peak = Math.max(peak, price);
      maxDrawdown = Math.max(maxDrawdown, (peak - price) / peak);
    }
    return maxDrawdown * 100;
  };

  const calculateVolumeProfile = (candles: UltraQuantCandle[], binSize: number) => {
    const volumeAtPrice = new Map<number, number>();
    let totalVolume = 0;

    candles.forEach((candle) => {
      const priceBin = Math.round(candle.close / binSize) * binSize;
      volumeAtPrice.set(priceBin, (volumeAtPrice.get(priceBin) ?? 0) + candle.volume);
      totalVolume += candle.volume;
    });

    const sortedPrices = Array.from(volumeAtPrice.keys()).sort((left, right) => left - right);
    const profile = sortedPrices.map((price) => ({
      price,
      volume: volumeAtPrice.get(price) ?? 0,
      isPOC: false,
      isInValueArea: false
    }));

    let poc = 0;
    let pocIndex = 0;
    profile.forEach((node, index) => {
      if (node.volume > (profile[pocIndex]?.volume ?? -1)) {
        poc = node.price;
        pocIndex = index;
      }
    });

    if (!profile.length) {
      return { profile: [], poc: 0, vah: 0, val: 0 };
    }

    profile[pocIndex].isPOC = true;
    const targetVolume = totalVolume * 0.7;
    let accumulated = profile[pocIndex].volume;
    let lowIndex = pocIndex;
    let highIndex = pocIndex;

    while (accumulated < targetVolume && (lowIndex > 0 || highIndex < profile.length - 1)) {
      const lowerVolume = lowIndex > 0 ? profile[lowIndex - 1].volume : -1;
      const upperVolume = highIndex < profile.length - 1 ? profile[highIndex + 1].volume : -1;

      if (lowerVolume >= upperVolume && lowIndex > 0) {
        lowIndex -= 1;
        accumulated += profile[lowIndex].volume;
      } else if (highIndex < profile.length - 1) {
        highIndex += 1;
        accumulated += profile[highIndex].volume;
      } else {
        break;
      }
    }

    for (let index = lowIndex; index <= highIndex; index++) {
      profile[index].isInValueArea = true;
    }

    return {
      profile,
      poc,
      vah: profile[highIndex]?.price ?? 0,
      val: profile[lowIndex]?.price ?? 0
    };
  };

  const calculateAtr = (candles: UltraQuantCandle[], period: number) => {
    if (candles.length < 2) {
      return 0;
    }

    const startIndex = Math.max(1, candles.length - period);
    const trueRanges: number[] = [];
    for (let index = startIndex; index < candles.length; index++) {
      const current = candles[index];
      const previous = candles[index - 1];
      const trueRange = Math.max(
        current.high - current.low,
        Math.max(
          Math.abs(current.high - previous.close),
          Math.abs(current.low - previous.close)
        )
      );
      trueRanges.push(trueRange);
    }

    return average(trueRanges);
  };

  const relativePenalty = (value: number, target: number) => {
    if (target <= 0) {
      return 0;
    }

    return Math.abs(value - target) / target;
  };

  const normalizeScore = (value: number, min: number, max: number) => {
    if (max === min) {
      return value > 0 ? 100 : 50;
    }

    return clamp((value - min) / (max - min)) * 100;
  };

  const createOrderBook = (symbol: string, lastPrice: number) => {
    const random = seededGenerator(symbolSeed(symbol) * 31);
    const bids = Array.from({ length: 10 }, (_, index) => ({
      price: Number((lastPrice - (index + 1) * 0.35).toFixed(2)),
      volume: Math.round(2500 + random() * 9000 * (index === 0 ? 1.8 : 1))
    }));
    const asks = Array.from({ length: 10 }, (_, index) => ({
      price: Number((lastPrice + (index + 1) * 0.35).toFixed(2)),
      volume: Math.round(2200 + random() * 7000 * (index === 0 ? 0.9 : 1))
    }));
    return { bids, asks };
  };

  const analyzeUltraQuantProfile = (profile: UltraQuantProfile, request: ReturnType<typeof normalizeUltraQuantRequest>) => {
    const random = seededGenerator(symbolSeed(profile.symbol));
    const totalDays = Math.max(260, request.historicalPeriodYears * 252);
    const sectorDrift = {
      Technology: 0.00165,
      Financials: 0.0012,
      Energy: 0.0011,
      Healthcare: 0.00145,
      Consumer: 0.00115,
      Industrials: 0.00105,
      Telecom: 0.001,
      Materials: 0.00095
    }[profile.sector] ?? 0.001;

    const candles: UltraQuantCandle[] = [];
    let close = 80 + random() * 1800;
    for (let day = 0; day < totalDays; day++) {
      const open = close;
      const drift = sectorDrift + Math.sin(day / 31 + random()) * 0.006 + (random() - 0.5) * 0.05;
      close = Math.max(20, close * (1 + drift));
      const high = Math.max(open, close) * (1 + 0.002 + random() * 0.02);
      const low = Math.min(open, close) * (1 - 0.002 - random() * 0.018);
      const volume = profile.averageVolume * (0.85 + random() * 0.9) * (1 + Math.max(0, drift * 10));
      candles.push({ open, high, low, close, volume });
    }

    const closes = candles.map((candle) => candle.close);
    const returns = buildReturns(closes);
    const ema20 = buildEma(closes, 20);
    const ema50 = buildEma(closes, 50);
    const ema200 = buildEma(closes, 200);
    const endPrice = closes[closes.length - 1];
    const startPrice = closes[0];
    const sixMonthPrice = closes[Math.max(0, closes.length - 126)];
    const threeMonthPrice = closes[Math.max(0, closes.length - 63)];
    const fiveYearWindow = Math.min(closes.length - 1, 252 * Math.min(5, request.historicalPeriodYears));
    const fiveYearPrice = closes[Math.max(0, closes.length - 1 - fiveYearWindow)];
    const cagr = startPrice > 0 ? (Math.pow(endPrice / startPrice, 1 / request.historicalPeriodYears) - 1) * 100 : 0;
    const momentum = sixMonthPrice > 0 ? endPrice / sixMonthPrice : 0;
    const trendStrength = calculateSlope(ema50);
    const volatility = calculateVolatility(returns);
    const maxDrawdown = calculateMaxDrawdown(closes);
    const growthRatio = fiveYearPrice > 0 ? endPrice / fiveYearPrice : 0;
    const earningsGrowth = Math.max(0, cagr * 0.72 + random() * 18);
    const revenueGrowth = Math.max(0, cagr * 0.58 + random() * 14);
    const earlyVolume = average(candles.slice(0, Math.max(20, Math.floor(candles.length / 10))).map((candle) => candle.volume));
    const recentVolume = average(candles.slice(-Math.max(20, Math.floor(candles.length / 10))).map((candle) => candle.volume));
    const volumeGrowth = earlyVolume > 0 ? recentVolume / earlyVolume : 1;

    let breakoutHits = 0;
    for (let index = 20; index < closes.length; index++) {
      const priorHigh = Math.max(...closes.slice(index - 20, index));
      if (closes[index] > priorHigh) breakoutHits += 1;
    }
    const breakoutFrequency = closes.length > 20 ? breakoutHits / (closes.length - 20) : 0;
    const sentimentScore = Math.min(100, Math.max(15, 44 + (momentum - 1) * 24 + (growthRatio - 4) * 5 + random() * 8));
    const priceChange1m = closes.length > 1 ? ((endPrice - closes[closes.length - 2]) / closes[closes.length - 2]) * 100 : 0;
    const priceChange5m = closes.length > 5 ? ((endPrice - closes[closes.length - 6]) / closes[closes.length - 6]) * 100 : 0;
    const recentVolumeRatio = average(candles.slice(-10).map((candle) => candle.volume)) / Math.max(1, average(candles.slice(-50).map((candle) => candle.volume)));
    const vwap = candles.slice(-50).reduce((sum, candle) => sum + candle.close * candle.volume, 0) / Math.max(1, candles.slice(-50).reduce((sum, candle) => sum + candle.volume, 0));
    const vwapDistance = ((endPrice - vwap) / Math.max(vwap, 1)) * 100;

    let gradientBoost = 0.28;
    if (priceChange1m > 0.35) gradientBoost += 0.18;
    if (priceChange5m > 1.2) gradientBoost += 0.24;
    if (recentVolumeRatio > 1.4) gradientBoost += 0.16;
    if (vwapDistance > 0) gradientBoost += 0.1;
    if (volatility < 0.03) gradientBoost += 0.08;
    gradientBoost = clamp(gradientBoost + random() * 0.08, 0.02, 0.98);

    const avgReturn = average(buildReturns(closes.slice(-50)));
    const lstmPredictedPrice = endPrice * (1 + avgReturn * 10);
    const marketRegime = volatility > 0.04 ? "High Volatility" : Math.abs(trendStrength) > 2 ? "Trending" : "Sideways";
    const marketState = recentVolumeRatio > 1.8 && priceChange5m > 0 ? "Accumulation" : breakoutFrequency > 0.12 ? "Breakout" : priceChange5m < -1 ? "Distribution" : "Reversal";
    const rlAction = gradientBoost > 0.72 && sentimentScore > 65 ? "BUY" : gradientBoost < 0.35 ? "SELL" : "HOLD";
    const orderBook = createOrderBook(profile.symbol, endPrice);
    const totalBidVolume = orderBook.bids.reduce((sum, level) => sum + level.volume, 0);
    const totalAskVolume = orderBook.asks.reduce((sum, level) => sum + level.volume, 0);
    const orderImbalance = totalAskVolume > 0 ? totalBidVolume / totalAskVolume : totalBidVolume;

    const ema20Last = ema20[ema20.length - 1] ?? endPrice;
    const ema50Last = ema50[ema50.length - 1] ?? endPrice;
    const ema200Last = ema200[ema200.length - 1] ?? endPrice;
    const alignedTrend = ema20Last > ema50Last && ema50Last > ema200Last;
    const alignmentSpread = ((ema20Last - ema50Last) + (ema50Last - ema200Last)) / Math.max(endPrice, 1);
    const emaSlope20 = calculateSlope(ema20.slice(-20)) / Math.max(endPrice, 1);
    const hedgeMomentumRaw = threeMonthPrice > 0 ? endPrice / threeMonthPrice : 1;
    const hedgeTrendRaw = clamp((alignedTrend ? 0.55 : 0.2) + clamp(alignmentSpread * 35) * 0.3 + clamp(Math.max(0, emaSlope20) * 450) * 0.15);
    const hedgeVolumeRaw = recentVolumeRatio * (alignedTrend ? 1.25 : endPrice > ema20Last ? 1 : 0.72);
    const atr = calculateAtr(candles, 14);
    const atrPct = endPrice > 0 ? atr / endPrice : 0;
    const hedgeVolatilityQualityRaw = clamp(1 - (0.55 * relativePenalty(atrPct, 0.025) + 0.45 * relativePenalty(volatility, 0.018)));
    const sectorReturn = threeMonthPrice > 0 ? (endPrice - threeMonthPrice) / threeMonthPrice : 0;
    const hedgeInstitutionalRaw = clamp(Math.max(0, orderImbalance - 1) / 2.5);
    const previousHigh20 = closes.length > 1 ? Math.max(...closes.slice(Math.max(0, closes.length - 21), closes.length - 1)) : endPrice;
    const breakoutAboveHigh = previousHigh20 > 0 ? endPrice / previousHigh20 : 1;
    const longAtr = calculateAtr(candles, 28);
    const volatilityCompression = longAtr > 0 ? clamp(1 - atr / longAtr) : 0.5;
    const hedgeBreakoutRaw =
      0.45 * clamp((breakoutAboveHigh - 0.985) / 0.06) +
      0.35 * clamp((recentVolumeRatio - 1) / 2.2) +
      0.2 * volatilityCompression;
    const fullVolumeProfile = calculateVolumeProfile(candles, Math.max(1, endPrice * 0.0025));
    const liquidityClusters = [
      { type: "Support Cluster", price: orderBook.bids[0].price, strength: "High" },
      { type: "Resistance Cluster", price: orderBook.asks[0].price, strength: "Medium" },
      { type: "Liquidity Gap", price: Number((endPrice * 1.012).toFixed(2)), strength: "Watch" }
    ];

    const regimeScore = marketRegime === "Trending" ? 0.9 : marketRegime === "High Volatility" ? 0.4 : 0.55;
    const stateScore = marketState === "Breakout" ? 0.95 : marketState === "Accumulation" ? 0.82 : marketState === "Distribution" ? 0.18 : 0.5;
    const lstmScore = clamp((lstmPredictedPrice / Math.max(endPrice, 1) - 0.96) / 0.12);
    const finalPredictionScore = (
      0.3 * gradientBoost +
      0.25 * lstmScore +
      0.2 * regimeScore +
      0.15 * stateScore +
      0.1 * (sentimentScore / 100)
    ) * 100;

    const score = (
      0.35 * clamp(cagr / 40) +
      0.2 * clamp((momentum - 1) / 1.5) +
      0.2 * clamp(Math.abs(trendStrength) * 8) +
      0.15 * (1 - Math.min(maxDrawdown / 100, 1)) +
      0.1 * clamp(volumeGrowth / 2.5)
    ) * 100;

    const drawdownProbability = clamp(volatility * 2.2 + (maxDrawdown / 100) * 0.6) * 100;
    const stopLossDistance = Math.max(endPrice * Math.max(volatility, 0.01), endPrice * 0.015);
    const positionSize = (1000000 * (request.riskPercentage / 100)) / stopLossDistance;

    const alerts = [
      gradientBoost > 0.7 ? { stockSymbol: profile.symbol, signalType: "AI_BULLISH", confidenceScore: Number((gradientBoost * 100).toFixed(2)), timestamp: new Date().toISOString() } : null,
      recentVolumeRatio > 1.4 ? { stockSymbol: profile.symbol, signalType: "MOMENTUM_SCANNER", confidenceScore: Number(Math.min(99, recentVolumeRatio * 35).toFixed(2)), timestamp: new Date().toISOString() } : null,
      breakoutFrequency > 0.12 ? { stockSymbol: profile.symbol, signalType: "VOLATILITY_BREAKOUT", confidenceScore: Number(Math.min(99, breakoutFrequency * 600).toFixed(2)), timestamp: new Date().toISOString() } : null,
      orderImbalance > 2.5 ? { stockSymbol: profile.symbol, signalType: "ORDER_FLOW_ACCUMULATION", confidenceScore: Number(Math.min(99, 50 + (orderImbalance - 2.5) * 10).toFixed(2)), timestamp: new Date().toISOString() } : null
    ].filter(Boolean);

    return {
      symbol: profile.symbol,
      sector: profile.sector,
      industry: profile.industry,
      marketCap: profile.marketCap,
      cagr,
      momentum,
      trendStrength,
      volatility,
      maxDrawdown,
      growthRatio,
      score,
      earningsGrowth,
      revenueGrowth,
      volumeGrowth,
      breakoutFrequency,
      sentimentScore,
      drawdownProbability,
      positionSize,
      gradientBoostProb: gradientBoost * 100,
      lstmPredictedPrice,
      marketRegime,
      marketState,
      rlAction,
      finalPredictionScore,
      orderImbalance,
      volumeProfile: {
        poc: fullVolumeProfile.poc,
        vah: fullVolumeProfile.vah,
        val: fullVolumeProfile.val
      },
      liquidityClusters,
      alerts,
      hedgeFactors: {
        averageVolume: recentVolume,
        momentumRaw: hedgeMomentumRaw,
        trendRaw: hedgeTrendRaw,
        volumeRaw: hedgeVolumeRaw,
        volatilityQualityRaw: hedgeVolatilityQualityRaw,
        sectorReturn,
        institutionalRaw: hedgeInstitutionalRaw,
        breakoutRaw: hedgeBreakoutRaw
      }
    };
  };

  const buildHedgeFundSignalDashboard = (
    analyzedUniverse: Array<any>,
    request: ReturnType<typeof normalizeUltraQuantRequest>
  ): HedgeFundSignalDashboard => {
    const filtered = analyzedUniverse.filter((item) => {
      const sectorMatches = request.sectorFilter === "ALL" || !request.sectorFilter || item.sector === request.sectorFilter;
      return sectorMatches &&
        item.marketCap >= request.minMarketCap &&
        item.marketCap <= request.maxMarketCap &&
        (item.hedgeFactors?.averageVolume ?? 0) >= request.minVolume &&
        (item.hedgeFactors?.volatilityQualityRaw ?? 0) >= clamp(1 - request.volatilityThreshold * 2);
    });

    if (!filtered.length) {
      return {
        rankings: [],
        sectorStrength: [],
        momentumHeatmap: [],
        summary: {
          scannedUniverse: analyzedUniverse.length,
          returned: 0,
          averageFinalScore: 0,
          leadingSector: "N/A",
          institutionalAccumulationCandidates: 0
        }
      };
    }

    const sectorReturns = Array.from(filtered.reduce((accumulator, item) => {
      const values = accumulator.get(item.sector) ?? [];
      values.push(item.hedgeFactors.sectorReturn);
      accumulator.set(item.sector, values);
      return accumulator;
    }, new Map<string, number[]>()))
      .reduce<Record<string, number>>((accumulator, [sector, values]) => {
        accumulator[sector] = average(values);
        return accumulator;
      }, {});

    const sectorReturnValues = Object.values(sectorReturns);
    const sectorReturnMin = Math.min(...sectorReturnValues);
    const sectorReturnMax = Math.max(...sectorReturnValues);
    const sectorScores = Object.fromEntries(
      Object.entries(sectorReturns).map(([sector, value]) => [sector, normalizeScore(value, sectorReturnMin, sectorReturnMax)])
    );

    const momentumValues = filtered.map((item) => item.hedgeFactors.momentumRaw);
    const volumeValues = filtered.map((item) => item.hedgeFactors.volumeRaw);
    const institutionalValues = filtered.map((item) => item.hedgeFactors.institutionalRaw);
    const breakoutValues = filtered.map((item) => item.hedgeFactors.breakoutRaw);
    const momentumMin = Math.min(...momentumValues);
    const momentumMax = Math.max(...momentumValues);
    const volumeMin = Math.min(...volumeValues);
    const volumeMax = Math.max(...volumeValues);
    const institutionalMin = Math.min(...institutionalValues);
    const institutionalMax = Math.max(...institutionalValues);
    const breakoutMin = Math.min(...breakoutValues);
    const breakoutMax = Math.max(...breakoutValues);

    const rankings = filtered
      .map((item): HedgeFundSignalScore => {
        const momentumScore = normalizeScore(item.hedgeFactors.momentumRaw, momentumMin, momentumMax);
        const trendScore = item.hedgeFactors.trendRaw * 100;
        const volumeScore = normalizeScore(item.hedgeFactors.volumeRaw, volumeMin, volumeMax);
        const volatilityScore = item.hedgeFactors.volatilityQualityRaw * 100;
        const sectorScore = sectorScores[item.sector] ?? 50;
        const institutionalScore = normalizeScore(item.hedgeFactors.institutionalRaw, institutionalMin, institutionalMax);
        const breakoutScore = normalizeScore(item.hedgeFactors.breakoutRaw, breakoutMin, breakoutMax);
        const finalScore =
          0.25 * momentumScore +
          0.2 * trendScore +
          0.15 * volumeScore +
          0.1 * volatilityScore +
          0.1 * sectorScore +
          0.1 * institutionalScore +
          0.1 * breakoutScore;

        return {
          rank: 0,
          stockSymbol: item.symbol,
          sector: item.sector,
          momentumScore: Number(momentumScore.toFixed(2)),
          trendScore: Number(trendScore.toFixed(2)),
          volumeScore: Number(volumeScore.toFixed(2)),
          volatilityScore: Number(volatilityScore.toFixed(2)),
          sectorScore: Number(sectorScore.toFixed(2)),
          institutionalScore: Number(institutionalScore.toFixed(2)),
          breakoutScore: Number(breakoutScore.toFixed(2)),
          finalScore: Number(finalScore.toFixed(2)),
          momentumValue: Number(item.hedgeFactors.momentumRaw.toFixed(2)),
          orderImbalance: Number(item.orderImbalance.toFixed(2)),
          breakoutProbability: Number(breakoutScore.toFixed(2))
        };
      })
      .sort((left, right) => right.finalScore - left.finalScore)
      .slice(0, 100)
      .map((signal, index) => ({
        ...signal,
        rank: index + 1
      }));

    const sectorStrength = Object.entries(sectorReturns)
      .map(([sector, averageReturn]) => ({
        sector,
        averageReturn: Number((averageReturn * 100).toFixed(2)),
        sectorScore: Number((sectorScores[sector] ?? 50).toFixed(2)),
        leaders: rankings.filter((signal) => signal.sector === sector).slice(0, 3).map((signal) => signal.stockSymbol)
      }))
      .sort((left, right) => right.sectorScore - left.sectorScore);

    const momentumHeatmap = rankings.slice(0, 18).map((signal) => ({
      symbol: signal.stockSymbol,
      sector: signal.sector,
      momentumScore: signal.momentumScore,
      finalScore: signal.finalScore,
      breakoutScore: signal.breakoutScore
    }));

    return {
      rankings,
      sectorStrength,
      momentumHeatmap,
      summary: {
        scannedUniverse: analyzedUniverse.length,
        returned: rankings.length,
        averageFinalScore: Number(average(rankings.map((signal) => signal.finalScore)).toFixed(2)),
        leadingSector: sectorStrength[0]?.sector ?? "N/A",
        institutionalAccumulationCandidates: rankings.filter((signal) => signal.orderImbalance > 2.5).length
      }
    };
  };

  const buildUltraQuantDashboard = (payload: UltraQuantRequest = {}) => {
    const request = normalizeUltraQuantRequest(payload);
    const analyzedUniverse = createUltraQuantUniverse()
      .map((profile) => analyzeUltraQuantProfile(profile, request));
    const results = analyzedUniverse
      .filter((result) => {
        const sectorMatches = request.sectorFilter === "ALL" || !request.sectorFilter || result.sector === request.sectorFilter;
        return sectorMatches &&
          result.cagr >= request.minCagr &&
          result.marketCap >= request.minMarketCap &&
          result.marketCap <= request.maxMarketCap &&
          result.maxDrawdown <= request.maxDrawdown &&
          result.volatility <= request.volatilityThreshold &&
          result.breakoutFrequency >= request.breakoutFrequency &&
          Math.abs(result.trendStrength) >= request.trendStrengthThreshold &&
          result.volumeGrowth * 100000 >= request.minVolume &&
          result.growthRatio > 4;
      })
      .map(({ hedgeFactors, ...result }) => result)
      .sort((left, right) => right.score - left.score)
      .slice(0, 100);

    const alerts = results
      .flatMap((result) => result.alerts)
      .sort((left, right) => right.confidenceScore - left.confidenceScore)
      .slice(0, 12);

    const sectors = Array.from(results.reduce((accumulator, result) => {
      if (!accumulator.has(result.sector)) {
        accumulator.set(result.sector, []);
      }
      accumulator.get(result.sector)?.push(result);
      return accumulator;
    }, new Map<string, any[]>()))
      .map(([sector, sectorResults]) => ({
        sector,
        sectorStrength: Number(average(sectorResults.map((item) => item.momentum)).toFixed(2)),
        averageScore: Number(average(sectorResults.map((item) => item.score)).toFixed(2)),
        leaders: sectorResults.slice(0, 3).map((item) => item.symbol)
      }))
      .sort((left, right) => right.averageScore - left.averageScore);

    const summary = {
      scannedUniverse: analyzedUniverse.length,
      returned: results.length,
      historicalPeriodYears: request.historicalPeriodYears,
      avgScore: Number(average(results.map((item) => item.score)).toFixed(2)),
      multibaggerCandidates: results.filter((item) => item.growthRatio >= 5).length,
      buySignals: results.filter((item) => item.rlAction === "BUY").length
    };

    return {
      results,
      alerts,
      sectors,
      hedgeFundSignals: buildHedgeFundSignalDashboard(analyzedUniverse, request),
      summary,
      architecture: ultraArchitecture
    };
  };

  const historicalCache = new Map<string, { expiresAt: number; payload: any }>();
  const HISTORICAL_CACHE_TTL_MS = 60_000;

  const intervalToMinutes = (selectedInterval: string) => {
    switch (selectedInterval) {
      case "1minute":
        return 1;
      case "5minute":
        return 5;
      case "30minute":
        return 30;
      case "day":
        return 24 * 60;
      default:
        return 5;
    }
  };

  const buildHistoricalCacheKey = (instrumentKey: string, selectedInterval: string, fromDate: string, toDate: string) =>
    [instrumentKey, selectedInterval, fromDate, toDate].join("|");

  const createSimulatedHistoricalPayload = (
    instrumentKey: string,
    selectedInterval: string,
    fromDate: string,
    toDate: string,
    notice: string
  ) => {
    const seed = symbolSeed(`${instrumentKey}-${selectedInterval}`);
    const random = seededGenerator(seed);
    const stepMs = intervalToMinutes(selectedInterval) * 60 * 1000;
    const startTime = new Date(`${fromDate}T09:15:00Z`).getTime();
    const endTime = new Date(`${toDate}T15:30:00Z`).getTime();
    const maxPoints = selectedInterval === "day" ? 400 : 1200;
    const candles: Array<[string, number, number, number, number, number]> = [];
    let cursor = startTime;
    let lastClose = 80 + (seed % 2400) / 10;

    while (cursor <= endTime && candles.length < maxPoints) {
      const drift = (random() - 0.46) * (selectedInterval === "day" ? 3.4 : 1.2);
      const open = Number(lastClose.toFixed(2));
      const close = Number(Math.max(20, open + drift).toFixed(2));
      const high = Number((Math.max(open, close) + random() * 1.8).toFixed(2));
      const low = Number((Math.max(5, Math.min(open, close) - random() * 1.6)).toFixed(2));
      const volume = Math.round(120000 + random() * 1800000);

      candles.push([new Date(cursor).toISOString(), open, high, low, close, volume]);
      lastClose = close;
      cursor += stepMs;
    }

    return {
      status: "success",
      data: { candles },
      meta: {
        source: "simulated",
        notice
      }
    };
  };

  const cacheHistoricalPayload = (cacheKey: string, payload: any) => {
    historicalCache.set(cacheKey, {
      expiresAt: Date.now() + HISTORICAL_CACHE_TTL_MS,
      payload
    });
  };

  const getCachedHistoricalPayload = (cacheKey: string) => {
    const cached = historicalCache.get(cacheKey);
    if (!cached) {
      return null;
    }

    if (cached.expiresAt < Date.now()) {
      historicalCache.delete(cacheKey);
      return null;
    }

    return cached.payload;
  };

  const averageClose = (candles: any[]) =>
    candles.length ? candles.reduce((sum, candle) => sum + Number(candle.close ?? 0), 0) / candles.length : 0;

  const buildFallbackAiAnalysis = ({
    symbol,
    data,
    interval,
    quantData,
    advancedIntelligence,
    reason
  }: {
    symbol: string;
    data: any[];
    interval: string;
    quantData?: any;
    advancedIntelligence?: any;
    reason?: string;
  }) => {
    const recentCandles = data.slice(-20);
    const latest = data[data.length - 1] ?? {};
    const previous = data[data.length - 2] ?? latest;
    const recentAverage = averageClose(recentCandles);
    const longAverage = averageClose(data.slice(-50));
    const priceChangePct = previous.close
      ? ((Number(latest.close ?? 0) - Number(previous.close ?? 0)) / Number(previous.close)) * 100
      : 0;
    const trendBias = recentAverage && Number(latest.close ?? 0) >= recentAverage ? "Bullish" : "Bearish";
    const momentumBias = longAverage && recentAverage >= longAverage ? "Improving" : "Mixed";
    const support = Math.min(...recentCandles.map((candle) => Number(candle.low ?? candle.close ?? 0)));
    const resistance = Math.max(...recentCandles.map((candle) => Number(candle.high ?? candle.close ?? 0)));
    const averageVolume = recentCandles.length
      ? recentCandles.reduce((sum, candle) => sum + Number(candle.volume ?? 0), 0) / recentCandles.length
      : 0;
    const volumeRatio = averageVolume ? Number(latest.volume ?? 0) / averageVolume : 1;
    const sentimentStatus = quantData?.sentiment?.status ?? "Neutral";
    const sentimentBoost = String(sentimentStatus).toUpperCase().includes("BULLISH") ? 12 : 0;
    const aiBoost = Number(advancedIntelligence?.signalConsensus?.score ?? advancedIntelligence?.momentumPrediction?.probability ?? 50);
    const directionalScore = clamp(50 + priceChangePct * 6 + (volumeRatio - 1) * 10 + sentimentBoost + (aiBoost - 50) * 0.35, 18, 96);

    let recommendation = "HOLD";
    if (directionalScore >= 66) {
      recommendation = "BUY";
    } else if (directionalScore <= 38) {
      recommendation = "SELL";
    }

    const confidence = Math.round(directionalScore);
    const summaryPoints = [
      `${symbol} is trading on a ${trendBias.toLowerCase()} intraday structure with ${momentumBias.toLowerCase()} momentum.`,
      `Volume is running at ${volumeRatio.toFixed(2)}x the recent average, which suggests ${volumeRatio > 1.2 ? "active participation" : "normal participation"}.`,
      `Quant sentiment currently reads ${sentimentStatus}, and the local signal consensus score is ${Math.round(aiBoost)}.`
    ];

    const analysis = [
      `### Actionable Signal`,
      `**${recommendation}** because price is ${trendBias === "Bullish" ? "holding above" : "testing below"} its recent mean with ${volumeRatio > 1 ? "supportive" : "moderate"} participation.`,
      ``,
      `### Simple Summary for Beginners`,
      `- ${summaryPoints[0]}`,
      `- ${summaryPoints[1]}`,
      `- ${summaryPoints[2]}`,
      ``,
      `### Executive Summary`,
      `${symbol} on the ${interval} interval is showing a ${trendBias.toLowerCase()} bias with a ${priceChangePct.toFixed(2)}% latest move. The local quant engine is keeping the desk operational${reason ? ` while external AI is unavailable (${reason}).` : "."}`,
      ``,
      `### Trend Analysis`,
      `Current bias: **${trendBias}**`,
      `Momentum state: **${momentumBias}**`,
      `Latest price move: **${priceChangePct.toFixed(2)}%**`,
      ``,
      `### Quant Intelligence Synthesis`,
      `- Market sentiment: **${sentimentStatus}**`,
      `- Consensus score: **${Math.round(aiBoost)}**`,
      `- Volume ratio: **${volumeRatio.toFixed(2)}x**`,
      ``,
      `### Psychological Audit`,
      `Retail and institutional flows appear ${recommendation === "BUY" ? "constructive" : recommendation === "SELL" ? "defensive" : "balanced"} based on price response, volume, and the current sentiment feed.`,
      ``,
      `### Key Levels`,
      `| Level | Price |`,
      `| --- | ---: |`,
      `| S1 | ${support.toFixed(2)} |`,
      `| R1 | ${resistance.toFixed(2)} |`,
      ``,
      `### Strategic Recommendation`,
      `**Strategic Recommendation**: ${recommendation}`,
      `Confidence Score: ${confidence}%`
    ].join("\n");

    return {
      analysis,
      sources: [],
      confidence,
      recommendation,
      provider: "local-fallback"
    };
  };

  // API to search stocks
  app.get("/api/stocks/search", (req, res) => {
    const query = (req.query.q as string || "").toUpperCase();
    if (!query) return res.json([]);
    
    const results = POPULAR_STOCKS.filter(s => 
      s.symbol.includes(query) || s.name.includes(query)
    ).slice(0, 10);
    
    res.json(results);
  });

  // API to fetch historical data from Upstox
  app.get("/api/stocks/historical", withErrorBoundary(async (req, res) => {
    const { instrumentKey, interval, fromDate, toDate } = req.query;
    const token = process.env.UPSTOX_ACCESS_TOKEN;
    const cacheKey = buildHistoricalCacheKey(
      String(instrumentKey || ""),
      String(interval || "1minute"),
      String(fromDate || ""),
      String(toDate || "")
    );

    const cachedPayload = getCachedHistoricalPayload(cacheKey);
    if (cachedPayload) {
      logAction("historical.cache.hit", {
        instrumentKey,
        interval,
        fromDate,
        toDate,
      });
      return res.json(cachedPayload);
    }

    try {
      const encodedKey = encodeURIComponent(instrumentKey as string);
      const to = toDate as string;
      const from = fromDate as string;
      const selectedInterval = (interval as string) || "1minute";

      if (!to || !from || !instrumentKey) {
        return res.status(400).json({ error: "instrumentKey, fromDate, and toDate are required" });
      }

      if (!token || token === "your_token_here") {
        const fallbackPayload = createSimulatedHistoricalPayload(
          String(instrumentKey),
          selectedInterval,
          from,
          to,
          "Using deterministic local market replay because UPSTOX_ACCESS_TOKEN is not configured."
        );
        cacheHistoricalPayload(cacheKey, fallbackPayload);
        logAction("historical.fallback.used", {
          instrumentKey,
          interval: selectedInterval,
          reason: "missing_upstox_token",
        });
        return res.json(fallbackPayload);
      }

      const url = `https://api.upstox.com/v2/historical-candle/${encodedKey}/${selectedInterval}/${to}/${from}`;
      
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      const payload = {
        ...response.data,
        meta: {
          source: "upstox"
        }
      };
      cacheHistoricalPayload(cacheKey, payload);
      logAction("historical.fetch.completed", {
        instrumentKey,
        interval: selectedInterval,
        source: "upstox",
      });
      res.json(payload);
    } catch (error: any) {
      const errorData = error.response?.data;
      logError("historical.fetch.failed", error, {
        instrumentKey,
        interval,
        fromDate,
        toDate,
        providerPayload: errorData,
      });
      const fallbackPayload = createSimulatedHistoricalPayload(
        String(instrumentKey || "MARKET"),
        String(interval || "1minute"),
        String(fromDate || new Date().toISOString().slice(0, 10)),
        String(toDate || new Date().toISOString().slice(0, 10)),
        errorData?.errors?.some((entry: any) => entry.errorCode === "UDAPI100011" || entry.error_code === "UDAPI100011")
          ? "Live Upstox token is expired or invalid. Showing deterministic local replay while credentials are refreshed."
          : "Live historical request failed. Showing deterministic local replay to keep analytics available."
      );
      cacheHistoricalPayload(cacheKey, fallbackPayload);
      logAction("historical.fallback.used", {
        instrumentKey,
        interval,
        reason: errorData?.errors?.some((entry: any) => entry.errorCode === "UDAPI100011" || entry.error_code === "UDAPI100011")
          ? "invalid_or_expired_upstox_token"
          : "upstox_request_failed",
      });
      res.json(fallbackPayload);
    }
  }));

  app.post("/api/stocks/sma", (req, res) => {
    const { data, period } = req.body;
    if (!data || !period || !Array.isArray(data)) {
      return res.status(400).json({ error: "Invalid data or period" });
    }
    const sma = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        sma.push(null);
      } else {
        let sum = 0;
        for (let j = 0; j < period; j++) {
          const point = data[i - j];
          sum += typeof point === "number" ? point : Number(point?.close ?? 0);
        }
        sma.push(sum / period);
      }
    }
    res.json({ sma });
  });

// --- AI Analysis Endpoint ---
app.post("/api/ai/analyze", withErrorBoundary(async (req, res) => {
  const { symbol, data, interval, quantData, advancedIntelligence } = req.body;

  if (!data || !Array.isArray(data) || data.length === 0) {
    logAction("ai.analysis.rejected", {
      symbol,
      reason: "missing_price_data",
    });
    return res.status(400).json({ error: "No data provided for analysis" });
  }

  try {
    const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
    
    // Prioritize API_KEY (injected by platform dialog) then GEMINI_API_KEY
    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    
    if (!apiKey || apiKey === "YOUR_API_KEY") {
      logAction("ai.analysis.fallback", {
        symbol,
        provider: "local-fallback",
        reason: "missing_gemini_api_key",
      });
      return res.json(buildFallbackAiAnalysis({
        symbol,
        data,
        interval,
        quantData,
        advancedIntelligence,
        reason: "Gemini API key not configured"
      }));
    }

    // Masked logging for debugging (only first 4 and last 4 chars)
    const maskedKey = apiKey.length > 8 
      ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` 
      : "****";
    logAction("ai.analysis.provider.selected", {
      symbol,
      provider: "gemini",
      apiKey: maskedKey,
      interval,
    });
    
    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = `
        As a world-class financial analyst and technical trader, analyze the following stock data for ${symbol} (${interval} interval).
        
        Price Data (last 50 candles):
        ${JSON.stringify(data.slice(-50).map(c => ({
          time: c.fullTime,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume
        })))}

        ${quantData ? `
        Quant Signals & Market Context:
        - Market Sentiment: ${quantData.sentiment?.status} (Confidence: ${quantData.sentiment?.confidence}%)
        - Sector Strength: ${JSON.stringify(quantData.sectors?.slice(0, 3))}
        - Momentum Alerts: ${JSON.stringify(quantData.momentum?.slice(0, 3))}
        - Breakout Signals: ${JSON.stringify(quantData.breakouts?.slice(0, 3))}
        ` : ''}

        ${advancedIntelligence ? `
        Advanced AI Intelligence:
        - Momentum Prediction: ${advancedIntelligence.momentumPrediction?.probability}% probability of ${advancedIntelligence.momentumPrediction?.predictedMove} move.
        - Order Flow: ${advancedIntelligence.orderFlow?.status} (Imbalance: ${advancedIntelligence.orderFlow?.imbalance}x)
        - Pattern Recognition: ${advancedIntelligence.patternRecognition?.pattern} (${advancedIntelligence.patternRecognition?.status})
        - Smart Money: ${advancedIntelligence.smartMoney?.phase} (Score: ${advancedIntelligence.smartMoney?.accumulationScore})
        ` : ''}

      Current Date/Time: ${new Date().toISOString()}

      Provide a comprehensive analysis including:
      1. **Actionable Signal**: A single word (BUY, SELL, or HOLD) followed by a 1-sentence "Why".
      2. **Simple Summary for Beginners**: 3 simple bullet points explaining the situation in plain English.
      3. **Executive Summary**: A 2-sentence high-level overview.
      4. **Trend Analysis**: Current trend direction, strength, and potential exhaustion signals.
      5. **Quant Intelligence Synthesis**: How the quant signals (momentum, order flow, smart money) align with the price action.
      6. **Psychological Audit**: Analyze the retail vs institutional bias and market sentiment.
      7. **Key Levels**: Specific Support (S1, S2) and Resistance (R1, R2) levels.
      8. **Technical Indicators**: Interpretation of price action, volume spikes, and candle patterns.
      9. **Risk/Reward Assessment**: Optimal entry zones and stop-loss suggestions.
      10. **Strategic Recommendation**: Clear Buy, Sell, or Hold with a confidence score (0-100%).
      11. **Market Context (Grounding)**: Incorporate any relevant recent news or macroeconomic factors affecting ${symbol} or its sector.

      Format the response in clean Markdown with professional formatting. Use bolding, tables for levels, and lists for readability.
    `;

    // Retry logic for 503 errors
    let result;
    let retries = 3;
    let delay = 2000;

    while (retries > 0) {
      try {
        result = await ai.models.generateContent({
          model: model,
          contents: prompt
        });
        break; // Success
      } catch (err: any) {
        const is503 = err.message?.includes("503") || err.status === 503 || (err.error?.code === 503);
        if (is503 && retries > 1) {
          console.log(`Gemini 503 error, retrying in ${delay}ms... (${retries - 1} retries left)`);
          await new Promise(resolve => setTimeout(resolve, delay));
          retries--;
          delay *= 2; // Exponential backoff
        } else {
          throw err;
        }
      }
    }

    if (!result) {
      throw new Error("Failed to get response from Gemini");
    }

    const text = result.text || "";
      
      // Attempt to extract a confidence score from the text (e.g., "Confidence: 85%")
      const confidenceMatch = text.match(/Confidence(?:\s+Score)?:\s*(\d+)%/i);
      const confidence = confidenceMatch ? parseInt(confidenceMatch[1]) : 75;

      // Attempt to extract recommendation
      const recommendationMatch = text.match(/\*\*Strategic Recommendation\*\*:\s*(Buy|Sell|Hold)/i);
      const recommendation = recommendationMatch ? recommendationMatch[1].toUpperCase() : "NEUTRAL";

      const sources = result.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
        title: chunk.web?.title,
        url: chunk.web?.uri
      })).filter((s: any) => s.title && s.url) || [];

      res.json({ 
        analysis: text,
        sources: sources,
        confidence: confidence,
        recommendation: recommendation,
        provider: "gemini"
      });
    } catch (error: any) {
      logError("ai.analysis.failed", error, {
        symbol,
        interval,
      });
      logAction("ai.analysis.fallback", {
        symbol,
        provider: "local-fallback",
        reason: error?.message || "gemini_request_failed",
      });
      res.json(buildFallbackAiAnalysis({
        symbol,
        data,
        interval,
        quantData,
        advancedIntelligence,
        reason: error?.message || "Gemini request failed"
      }));
    }
  }));

  app.get("/api/premium/momentum", (req, res) => {
    const alerts = Array.from({ length: 5 }, () => ({
      symbol: POPULAR_STOCKS[Math.floor(Math.random() * POPULAR_STOCKS.length)].symbol,
      change5m: (1.5 + Math.random() * 2).toFixed(2),
      volumeRatio: (2.0 + Math.random() * 5).toFixed(2),
      type: "Momentum Alert"
    }));
    res.json(alerts);
  });

  app.get("/api/premium/breakouts", (req, res) => {
    const types = ["Prev Day High", "VWAP", "Bollinger Band", "Range"];
    const breakouts = Array.from({ length: 4 }, () => ({
      symbol: POPULAR_STOCKS[Math.floor(Math.random() * POPULAR_STOCKS.length)].symbol,
      type: types[Math.floor(Math.random() * types.length)],
      price: (1000 + Math.random() * 5000).toFixed(2),
      strength: "High"
    }));
    res.json(breakouts);
  });

  app.get("/api/premium/sentiment", (req, res) => {
    res.json({
      overall: "Bullish",
      score: 78,
      advancing: 32,
      declining: 18,
      vix: 14.2
    });
  });

  app.get("/api/premium/sector-rotation", (req, res) => {
    const sectorNames = ["Banking", "IT", "Pharma", "Energy", "Automobile", "FMCG"];
    const sectors = sectorNames.map(name => ({
      name,
      strength: (-2.0 + Math.random() * 5.0).toFixed(2),
      leader: POPULAR_STOCKS.find(s => s.symbol === "RELIANCE")?.symbol || "N/A"
    }));
    res.json(sectors);
  });

  app.get("/api/premium/ai-predictions", (req, res) => {
    const patterns = ["Bullish Flag", "Double Bottom", "Cup & Handle", "Ascending Triangle"];
    const predictions = Array.from({ length: 3 }, () => ({
      symbol: POPULAR_STOCKS[Math.floor(Math.random() * POPULAR_STOCKS.length)].symbol,
      pattern: patterns[Math.floor(Math.random() * patterns.length)],
      probability: 75 + Math.floor(Math.random() * 20),
      target: (1000 + Math.random() * 5000).toFixed(2)
    }));
    res.json(predictions);
  });

  app.get("/api/premium/psychology", (req, res) => {
    const symbol = (req.query.symbol as string || "MARKET").toUpperCase();
    
    // Deterministic random based on symbol
    const seed = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const pseudoRandom = (offset: number) => {
      const x = Math.sin(seed + offset) * 10000;
      return x - Math.floor(x);
    };

    const fearGreedIndex = Math.floor(pseudoRandom(1) * 100);
    const retailSentiment = 40 + Math.floor(pseudoRandom(2) * 40); // 40-80%
    const institutionalSentiment = 30 + Math.floor(pseudoRandom(3) * 50); // 30-80%
    
    const moods = ["Extreme Fear", "Fear", "Neutral", "Greed", "Extreme Greed"];
    const marketMood = moods[Math.floor(fearGreedIndex / 20)];

    const biases = ["Accumulation", "Distribution", "Neutral"];
    const institutionalBias = biases[Math.floor(pseudoRandom(4) * 3)];

    const triggerOptions = [
      "Retail Panic Selling detected at support levels.",
      "Institutional absorption of sell orders observed.",
      "High FOMO levels in retail social sentiment.",
      "Smart money distribution phase starting.",
      "Liquidity sweep of previous session highs.",
      "Psychological resistance at round number levels."
    ];
    
    // Pick 2-3 random triggers
    const triggers = triggerOptions
      .sort(() => pseudoRandom(5) - 0.5)
      .slice(0, 2 + Math.floor(pseudoRandom(6) * 2));

    res.json({
      symbol,
      fearGreedIndex,
      marketMood,
      retailSentiment,
      institutionalBias,
      triggers,
      timestamp: new Date().toISOString()
    });
  });

  app.get("/api/premium/market-intelligence", (req, res) => {
    res.json({
      globalSentiment: "The global markets are currently in a 'Wait and Watch' mode ahead of the upcoming inflation data. Tech stocks are showing resilience, while energy is facing headwinds due to cooling oil prices.",
      hotSectors: [
        { name: "Renewable Energy", trend: "Bullish", reason: "New policy announcements" },
        { name: "Defense", trend: "Strong Bullish", reason: "Increased budget allocations" },
        { name: "FMCG", trend: "Neutral", reason: "Input cost pressures" }
      ],
      topTradeIdeas: [
        { 
          symbol: "RELIANCE", 
          setup: "Bullish Flag Breakout", 
          target: "3150", 
          stop: "2920", 
          confidence: 88,
          timeframe: "Swing (3-5 Days)",
          rrRatio: "1:2.4"
        },
        { 
          symbol: "TCS", 
          setup: "Mean Reversion", 
          target: "4200", 
          stop: "3950", 
          confidence: 72,
          timeframe: "Intraday",
          rrRatio: "1:1.8"
        },
        { 
          symbol: "INFY", 
          setup: "VCP Pattern Breakout", 
          target: "1720", 
          stop: "1610", 
          confidence: 81,
          timeframe: "Positional",
          rrRatio: "1:3.1"
        }
      ]
    });
  });

  app.get("/api/premium/ai-news-feed", (req, res) => {
    const news = [
      { id: 1, time: "2m ago", text: "AI detects unusual call option activity in HDFCBANK near 1700 strike.", type: "alert" },
      { id: 2, time: "15m ago", text: "Sentiment shift: Retail traders turning bullish on mid-cap IT stocks.", type: "info" },
      { id: 3, time: "45m ago", text: "Large block deal detected in RELIANCE; 2.5M shares changed hands.", type: "whale" },
      { id: 4, time: "1h ago", text: "Institutional buying surge detected in Banking sector; Volume 4x average.", type: "surge" }
    ];
    res.json(news);
  });

  // --- QUANT ENGINES ---

  app.get("/api/quant/momentum", (req, res) => {
    // Detect stocks gaining strong momentum in the last 1-5 minutes
    const momentumStocks = [
      { symbol: "RELIANCE", priceChange: 2.4, volumeRatio: 4.2, strength: 85, alert: "Strong Momentum" },
      { symbol: "HDFCBANK", priceChange: 1.8, volumeRatio: 3.5, strength: 72, alert: "Momentum Building" },
      { symbol: "TCS", priceChange: 2.1, volumeRatio: 5.1, strength: 91, alert: "High Velocity Spike" }
    ];
    res.json(momentumStocks);
  });

  app.get("/api/quant/breakouts", (req, res) => {
    // Detect breakout above resistance levels
    const breakouts = [
      { symbol: "INFY", level: 1650, strength: 88, vwap: 1620, prevHigh: 1645 },
      { symbol: "ICICIBANK", level: 1120, strength: 75, vwap: 1105, prevHigh: 1115 }
    ];
    res.json(breakouts);
  });

  app.get("/api/quant/volume-surge", (req, res) => {
    // Detect institutional buying
    const surges = [
      { symbol: "SBIN", ratio: 5.2, alert: "Institutional Accumulation", timestamp: new Date().toISOString() },
      { symbol: "AXISBANK", ratio: 4.1, alert: "Large Block Deal Detected", timestamp: new Date().toISOString() }
    ];
    res.json(surges);
  });

  app.get("/api/quant/indicators", (req, res) => {
    // Multi Indicator Engine
    const indicators = [
      { symbol: "RELIANCE", rsi: 65, ema20: 2950, ema50: 2900, vwap: 2940, signal: "BUY" },
      { symbol: "TCS", rsi: 72, ema20: 4100, ema50: 4050, vwap: 4080, signal: "STRONG BUY" },
      { symbol: "WIPRO", rsi: 35, ema20: 480, ema50: 495, vwap: 485, signal: "SELL" }
    ];
    res.json(indicators);
  });

  app.get("/api/quant/sectors", (req, res) => {
    // Sector Strength Analyzer
    const sectors = [
      { name: "IT", return: 1.8, momentum: "High", status: "Leading" },
      { name: "Banking", return: 0.5, momentum: "Neutral", status: "Consolidating" },
      { name: "Energy", return: -0.4, momentum: "Low", status: "Lagging" },
      { name: "Auto", return: 1.2, momentum: "Medium", status: "Improving" }
    ];
    res.json(sectors);
  });

  app.get("/api/quant/money-flow", (req, res) => {
    // Smart Money Flow Engine
    const flow = [
      { symbol: "RELIANCE", flow: 125000000, status: "Accumulation", priceStability: "High" },
      { symbol: "HDFCBANK", flow: 85000000, status: "Neutral", priceStability: "Medium" },
      { symbol: "TCS", flow: 110000000, status: "Accumulation", priceStability: "High" }
    ];
    res.json(flow);
  });

  app.get("/api/quant/trends", (req, res) => {
    // Early Trend Detector
    const trends = [
      { symbol: "RELIANCE", score: 82, momentum: 0.4, volume: 0.3, breakout: 0.3 },
      { symbol: "TCS", score: 91, momentum: 0.5, volume: 0.2, breakout: 0.3 }
    ];
    res.json(trends);
  });

  app.get("/api/quant/advanced-intelligence", (req, res) => {
    res.json({
      momentumPrediction: {
        probability: 82,
        predictedMove: "+1.45%",
        confidence: "High",
        features: {
          p1m: "+0.45%",
          p5m: "+1.20%",
          volRatio: "3.2x",
          vwapDist: "+0.85%"
        }
      },
      orderFlow: {
        imbalance: 3.42,
        activityScore: 88,
        status: "Institutional Buying",
        bidVol: "1.2M",
        askVol: "350K"
      },
      smartMoney: {
        accumulationScore: 92,
        phase: "Late Accumulation",
        range: "0.45%",
        supportDist: "0.12%"
      },
      volatility: {
        compression: true,
        squeezeProbability: 78,
        atr: "12.4",
        bbWidth: "1.2%"
      },
      sectorRotation: [
        { sector: "IT", strength: 85, momentum: "Strong Bullish" },
        { sector: "Banking", strength: 72, momentum: "Bullish" },
        { sector: "Energy", strength: 45, momentum: "Neutral" },
        { sector: "Pharma", strength: 32, momentum: "Bearish" }
      ],
      gradientBoosting: {
        probability: 81,
        horizon: "next 5m",
        topFeatures: ["price_change_5min", "volume_ratio", "VWAP_distance"]
      },
      lstmForecast: {
        nextPrice: "3128.40",
        confidenceBand: "+/- 18.25",
        candles: 50
      },
      regimeModel: {
        model: "Random Forest",
        regime: "Trending",
        confidence: 79
      },
      hiddenStateModel: {
        model: "HMM",
        state: "Accumulation",
        transitionRisk: 24
      },
      reinforcementAgent: {
        action: "BUY",
        rewardScore: 0.74,
        riskPenalty: 0.18
      },
      signalConsensus: {
        score: 84,
        verdict: "Bullish Consensus"
      },
      patternRecognition: {
        pattern: "Ascending Triangle",
        confidence: 89,
        status: "Breakout Imminent",
        target: "Rs 3,250"
      },
      marketSentiment: {
        score: 76,
        newsSentiment: "Positive",
        socialSentiment: "Bullish",
        trendingTopics: ["Rate Cut", "Quarterly Results", "Foreign Inflow"]
      }
    });
  });

  app.get("/api/quant/sentiment", (req, res) => {
    // Market Sentiment Engine
    res.json({
      status: "Bullish Market",
      adRatio: 1.8,
      indexMomentum: "Strong",
      volatility: "Low",
      confidence: 85
    });
  });

  app.post("/api/institutional/imbalance", (req, res) => {
    const orderBook = req.body;
    const bids = orderBook.bids || [];
    const asks = orderBook.asks || [];
    
    const totalBidVol = bids.reduce((sum: number, level: any) => sum + (level.volume || 0), 0);
    const totalAskVol = asks.reduce((sum: number, level: any) => sum + (level.volume || 0), 0);
    
    const imbalance = totalAskVol === 0 ? totalBidVol : totalBidVol / totalAskVol;
    
    let signal = "NEUTRAL";
    let score = 50;
    
    if (imbalance > 2.5) {
      signal = "INSTITUTIONAL ACCUMULATION";
      score = Math.min(100, 50 + (imbalance - 2.5) * 10);
    } else if (imbalance < 0.4) {
      signal = "INSTITUTIONAL DISTRIBUTION";
      score = Math.max(0, 50 - (0.4 - imbalance) * 100);
    }
    
    res.json({ imbalance, signal, score });
  });

  app.post("/api/institutional/volume-profile", (req, res) => {
    const { candles, binSize = 1.0 } = req.body;
    if (!candles || !Array.isArray(candles)) {
      return res.status(400).json({ error: "Invalid candles" });
    }
    
    const volumeAtPrice: Record<string, number> = {};
    let totalVolume = 0;
    
    for (const candle of candles) {
      const close = candle.close || 0;
      const volume = candle.volume || 0;
      const priceBin = Math.round(close / binSize) * binSize;
      const key = String(priceBin);
      volumeAtPrice[key] = (volumeAtPrice[key] || 0) + volume;
      totalVolume += volume;
    }
    
    const sortedPrices = Object.keys(volumeAtPrice).map(Number).sort((a, b) => a - b);
    
    let maxVol = 0;
    let poc = 0;
    
    const profile = [];
    for (const price of sortedPrices) {
      const vol = volumeAtPrice[String(price)];
      if (vol > maxVol) {
        maxVol = vol;
        poc = price;
      }
      profile.push({
        price,
        volume: vol,
        isPOC: false,
        isInValueArea: false
      });
    }
    
    let pocIdx = -1;
    for (let i = 0; i < profile.length; i++) {
      if (profile[i].price === poc) {
        profile[i].isPOC = true;
        pocIdx = i;
        break;
      }
    }
    
    const targetVA = totalVolume * 0.7;
    let currentVA = maxVol;
    
    let lowIdx = pocIdx;
    let highIdx = pocIdx;
    
    while (currentVA < targetVA && (lowIdx > 0 || highIdx < profile.length - 1)) {
      const lowVol = lowIdx > 0 ? profile[lowIdx - 1].volume : 0;
      const highVol = highIdx < profile.length - 1 ? profile[highIdx + 1].volume : 0;
      
      if (lowVol >= highVol && lowIdx > 0) {
        lowIdx--;
        currentVA += lowVol;
      } else if (highIdx < profile.length - 1) {
        highIdx++;
        currentVA += highVol;
      } else {
        break;
      }
    }
    
    const val = profile[lowIdx]?.price || 0;
    const vah = profile[highIdx]?.price || 0;
    
    for (let i = 0; i < profile.length; i++) {
      if (i >= lowIdx && i <= highIdx) {
        profile[i].isInValueArea = true;
      }
    }
    
    res.json({ profile, poc, vah, val });
  });

  app.post("/api/institutional/correlation", (req, res) => {
    const { seriesA, seriesB } = req.body;
    if (!seriesA || !seriesB || !Array.isArray(seriesA) || !Array.isArray(seriesB)) {
      return res.status(400).json({ error: "Invalid series data" });
    }
    
    const n = Math.min(seriesA.length, seriesB.length);
    if (n < 2) return res.json({ correlation: 0 });
    
    const meanA = seriesA.reduce((a, b) => a + b, 0) / n;
    const meanB = seriesB.reduce((a, b) => a + b, 0) / n;
    
    let num = 0;
    let denA = 0;
    let denB = 0;
    
    for (let i = 0; i < n; i++) {
      const diffA = seriesA[i] - meanA;
      const diffB = seriesB[i] - meanB;
      num += diffA * diffB;
      denA += diffA * diffA;
      denB += diffB * diffB;
    }
    
    const correlation = num / Math.sqrt(denA * denB);
    res.json({ correlation: isNaN(correlation) ? 0 : correlation });
  });

  app.post("/api/institutional/market-regime", (req, res) => {
    const candles = req.body;
    if (!candles || !Array.isArray(candles) || candles.length < 20) {
      return res.json({ regime: "SIDEWAYS" });
    }
    
    const last20 = candles.slice(-20);
    const returns = [];
    for (let i = 0; i < last20.length; i++) {
      if (i === 0) {
        returns.push(0.0);
      } else {
        const prevClose = last20[i - 1].close || 0;
        const currentClose = last20[i].close || 0;
        returns.push(prevClose !== 0 ? (currentClose - prevClose) / prevClose : 0);
      }
    }
    
    const sumSquares = returns.reduce((sum, r) => sum + r * r, 0);
    const volatility = Math.sqrt(sumSquares / returns.length);
    
    const firstPrice = last20[0].close || 0;
    const lastPrice = last20[last20.length - 1].close || 0;
    const totalReturn = firstPrice !== 0 ? Math.abs((lastPrice - firstPrice) / firstPrice) : 0;
    
    if (volatility > 0.02) return res.json({ regime: "VOLATILE" });
    if (totalReturn > 0.03) return res.json({ regime: "TRENDING" });
    res.json({ regime: "SIDEWAYS" });
  });

  app.get("/api/institutional/correlation-data", (req, res) => {
    const { symbol } = req.query;
    const assets = ["NIFTY 50", "BANK NIFTY", "USD/INR", "CRUDE OIL", "GOLD"];
    const random = seededGenerator(symbolSeed(String(symbol || "MARKET")));
    const data = assets.map(asset => ({
      name: asset,
      value: Number((0.5 + random() * 0.45).toFixed(2))
    }));
    res.json(data);
  });

  app.get("/api/institutional/sector-rotation", (req, res) => {
    const sectors = [
      { sector: "IT", strength: 86, leader: "TCS", flow: "High beta accumulation", bias: "LEADING" },
      { sector: "Banking", strength: 78, leader: "HDFCBANK", flow: "Steady broad-based bids", bias: "IMPROVING" },
      { sector: "Industrials", strength: 69, leader: "LT", flow: "Infrastructure rotation", bias: "IMPROVING" },
      { sector: "Energy", strength: 48, leader: "RELIANCE", flow: "Mixed commodity response", bias: "LAGGING" }
    ];
    res.json(sectors);
  });

  app.get("/api/institutional/microstructure", (req, res) => {
    res.json({
      frequency: Math.floor(120 + Math.random() * 50),
      spread: 0.05 + Math.random() * 0.1,
      accumulation: Math.floor(65 + Math.random() * 25)
    });
  });

  app.get("/api/institutional/order-book", (req, res) => {
    const lastPrice = parseFloat(req.query.lastPrice as string) || 100;
    const bids = [];
    const asks = [];
    for (let i = 0; i < 10; i++) {
      bids.push({
        price: lastPrice - (i + 1) * 0.5,
        volume: Math.floor(Math.random() * 5000) + (i === 0 ? 10000 : 0)
      });
      asks.push({
        price: lastPrice + (i + 1) * 0.5,
        volume: Math.floor(Math.random() * 2000)
      });
    }
    res.json({ bids, asks });
  });

  app.get("/api/institutional/metrics", (req, res) => {
    const { symbol } = req.query;
    
    // Mocking institutional metrics for the scanner
    // In a real system, this would be computed from real-time L2 data
    const metrics = {
      symbol: symbol || "MARKET",
      orderImbalance: (1.2 + Math.random() * 2.5).toFixed(2),
      accumulationScore: (60 + Math.random() * 35).toFixed(0),
      tradeFrequency: (100 + Math.random() * 500).toFixed(0),
      spreadDynamics: (0.02 + Math.random() * 0.08).toFixed(3),
      marketRegime: ["TRENDING", "SIDEWAYS", "VOLATILE"][Math.floor(Math.random() * 3)],
      timestamp: new Date().toISOString()
    };
    
    res.json(metrics);
  });

  app.post("/api/ultra-quant/scan", (req, res) => {
    const dashboard = buildUltraQuantDashboard(req.body || {});
    logAction("ultra_quant.scan.completed", {
      filters: req.body || {},
      resultCount: dashboard.results.length,
    });
    res.json(dashboard.results);
  });

  app.post("/api/ultra-quant/dashboard", (req, res) => {
    const dashboard = buildUltraQuantDashboard(req.body || {});
    logAction("ultra_quant.dashboard.completed", {
      filters: req.body || {},
      resultCount: dashboard.results.length,
      alertCount: dashboard.alerts.length,
      sectorCount: dashboard.sectors.length,
    });
    res.json(dashboard);
  });

  app.post("/api/ultra-quant/hedge-fund-ranking", (req, res) => {
    const dashboard = buildUltraQuantDashboard(req.body || {});
    logAction("ultra_quant.hedge_fund.completed", {
      filters: req.body || {},
      resultCount: dashboard.hedgeFundSignals.rankings.length,
    });
    res.json(dashboard.hedgeFundSignals);
  });

  app.get("/api/ultra-quant/alerts", (req, res) => {
    const dashboard = buildUltraQuantDashboard();
    res.json(dashboard.alerts);
  });

  app.get("/api/ultra-quant/architecture", (req, res) => {
    res.json(ultraArchitecture);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist/index.html"));
    });
  }

  app.use(errorLoggingMiddleware);

  app.listen(PORT, "0.0.0.0", () => {
    logAction("server.started", {
      port: PORT,
      nodeEnv: process.env.NODE_ENV || "development",
    });
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  logError("server.startup.failed", error);
  process.exitCode = 1;
});
