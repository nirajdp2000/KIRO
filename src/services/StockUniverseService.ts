/**
 * StockUniverseService
 * Loads ALL NSE_EQ + BSE_EQ equity stocks from Upstox's JSON instrument file.
 * Falls back to the embedded list if the network call fails.
 */

import axios from 'axios';

export interface StockProfile {
  symbol:        string;
  exchange:      'NSE' | 'BSE';
  sector:        string;
  industry:      string;
  marketCap:     number;
  averageVolume: number;
  instrumentKey: string;
}

// Upstox instrument JSON URLs (no auth required, refreshed daily ~6AM IST)
const NSE_JSON_URL = 'https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz';
const BSE_JSON_URL = 'https://assets.upstox.com/market-quote/instruments/exchange/BSE.json.gz';

// BSE equity group codes (A=large, B=mid, X/XT=small, T=trade-to-trade, M/MT/Z/ZP/P/MS/R=other equity)
// Excludes: F (bonds), G (govt securities), E (ETFs), IF (InvITs/REITs), INDEX, FUT, CE, PE
const BSE_EQUITY_TYPES = new Set(['A', 'B', 'X', 'XT', 'T', 'M', 'MT', 'Z', 'ZP', 'P', 'MS', 'R']);

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let cachedUniverse: StockProfile[] = [];
let cacheTimestamp = 0;
let loadPromise: Promise<StockProfile[]> | null = null;
let fallbackUniverse: StockProfile[] = [];

export function setFallbackUniverse(profiles: StockProfile[]): void {
  fallbackUniverse = profiles;
}

// Sector heuristics based on symbol prefix
const SECTOR_HINTS: Array<[string, string, string]> = [
  ['HDFCBANK', 'Financials', 'Private Bank'],
  ['ICICIBANK', 'Financials', 'Private Bank'],
  ['KOTAKBANK', 'Financials', 'Private Bank'],
  ['AXISBANK', 'Financials', 'Private Bank'],
  ['SBIN', 'Financials', 'Public Bank'],
  ['BANKBARODA', 'Financials', 'Public Bank'],
  ['PNB', 'Financials', 'Public Bank'],
  ['CANBK', 'Financials', 'Public Bank'],
  ['BAJFINANCE', 'Financials', 'NBFC'],
  ['BAJAJFINSV', 'Financials', 'Insurance'],
  ['SBILIFE', 'Financials', 'Insurance'],
  ['HDFCLIFE', 'Financials', 'Insurance'],
  ['LICI', 'Financials', 'Insurance'],
  ['IRFC', 'Financials', 'NBFC'],
  ['RECLTD', 'Financials', 'NBFC'],
  ['TCS', 'Technology', 'IT Services'],
  ['INFY', 'Technology', 'IT Services'],
  ['WIPRO', 'Technology', 'IT Services'],
  ['HCLTECH', 'Technology', 'IT Services'],
  ['TECHM', 'Technology', 'IT Services'],
  ['LTIM', 'Technology', 'IT Services'],
  ['COFORGE', 'Technology', 'IT Services'],
  ['PERSISTENT', 'Technology', 'IT Services'],
  ['ZOMATO', 'Technology', 'Food Delivery'],
  ['PAYTM', 'Technology', 'Fintech'],
  ['RELIANCE', 'Energy', 'Oil & Gas'],
  ['ONGC', 'Energy', 'Oil & Gas'],
  ['BPCL', 'Energy', 'Oil Refining'],
  ['IOC', 'Energy', 'Oil Refining'],
  ['HINDPETRO', 'Energy', 'Oil Refining'],
  ['COALINDIA', 'Energy', 'Mining'],
  ['GAIL', 'Energy', 'Gas Distribution'],
  ['IGL', 'Energy', 'Gas Distribution'],
  ['SUNPHARMA', 'Healthcare', 'Pharma'],
  ['CIPLA', 'Healthcare', 'Pharma'],
  ['DRREDDY', 'Healthcare', 'Pharma'],
  ['DIVISLAB', 'Healthcare', 'Pharma'],
  ['LUPIN', 'Healthcare', 'Pharma'],
  ['AUROPHARMA', 'Healthcare', 'Pharma'],
  ['APOLLOHOSP', 'Healthcare', 'Hospitals'],
  ['FORTIS', 'Healthcare', 'Hospitals'],
  ['HINDUNILVR', 'Consumer', 'FMCG'],
  ['ITC', 'Consumer', 'FMCG'],
  ['NESTLEIND', 'Consumer', 'FMCG'],
  ['BRITANNIA', 'Consumer', 'FMCG'],
  ['DABUR', 'Consumer', 'FMCG'],
  ['MARICO', 'Consumer', 'FMCG'],
  ['GODREJCP', 'Consumer', 'FMCG'],
  ['TATACONSUM', 'Consumer', 'FMCG'],
  ['TITAN', 'Consumer', 'Jewellery'],
  ['ASIANPAINT', 'Consumer', 'Paints'],
  ['BERGEPAINT', 'Consumer', 'Paints'],
  ['MARUTI', 'Auto', 'Passenger Vehicles'],
  ['TATAMOTORS', 'Auto', 'Commercial Vehicles'],
  ['HEROMOTOCO', 'Auto', 'Two Wheelers'],
  ['BAJAJ-AUTO', 'Auto', 'Two Wheelers'],
  ['EICHERMOT', 'Auto', 'Two Wheelers'],
  ['JSWSTEEL', 'Materials', 'Steel'],
  ['TATASTEEL', 'Materials', 'Steel'],
  ['SAIL', 'Materials', 'Steel'],
  ['HINDALCO', 'Materials', 'Aluminium'],
  ['VEDL', 'Materials', 'Metals & Mining'],
  ['ULTRACEMCO', 'Materials', 'Cement'],
  ['SHREECEM', 'Materials', 'Cement'],
  ['AMBUJACEM', 'Materials', 'Cement'],
  ['NTPC', 'Utilities', 'Power Generation'],
  ['POWERGRID', 'Utilities', 'Power Transmission'],
  ['NHPC', 'Utilities', 'Hydro Power'],
  ['ADANIGREEN', 'Utilities', 'Renewable Energy'],
  ['ADANIENT', 'Industrials', 'Conglomerate'],
  ['ADANIPORTS', 'Industrials', 'Ports & Logistics'],
  ['LT', 'Industrials', 'Engineering'],
  ['BHEL', 'Industrials', 'Engineering'],
  ['BEL', 'Industrials', 'Defence'],
  ['SIEMENS', 'Industrials', 'Engineering'],
  ['HAVELLS', 'Industrials', 'Electricals'],
  ['DLF', 'Real Estate', 'Real Estate'],
  ['GODREJPROP', 'Real Estate', 'Real Estate'],
  ['PRESTIGE', 'Real Estate', 'Real Estate'],
  ['BHARTIARTL', 'Telecom', 'Telecom Services'],
  ['INDUSTOWER', 'Telecom', 'Tower Infrastructure'],
];

function guessSector(symbol: string): [string, string] {
  const up = symbol.toUpperCase();
  for (const [prefix, sector, industry] of SECTOR_HINTS) {
    if (up === prefix || up.startsWith(prefix)) return [sector, industry];
  }
  if (up.includes('BANK') || up.includes('FIN')) return ['Financials', 'Banking'];
  if (up.includes('PHARMA') || up.includes('CHEM') || up.includes('LAB')) return ['Healthcare', 'Pharma'];
  if (up.includes('TECH') || up.includes('SOFT') || up.includes('INFO')) return ['Technology', 'IT Services'];
  if (up.includes('POWER') || up.includes('ENERGY') || up.includes('SOLAR')) return ['Utilities', 'Power'];
  if (up.includes('STEEL') || up.includes('METAL') || up.includes('ALLOY')) return ['Materials', 'Metals'];
  if (up.includes('CEMENT') || up.includes('INFRA') || up.includes('CONST')) return ['Industrials', 'Infrastructure'];
  if (up.includes('AUTO') || up.includes('MOTOR') || up.includes('WHEEL')) return ['Auto', 'Auto'];
  return ['Diversified', 'Diversified'];
}

interface UpstoxInstrument {
  segment: string;
  instrument_type: string;
  instrument_key: string;
  trading_symbol: string;
  exchange: string;
}

async function decompressJson(buffer: Buffer): Promise<UpstoxInstrument[]> {
  const zlib = await import('zlib');
  const { promisify } = await import('util');
  const gunzip = promisify(zlib.gunzip);
  let jsonStr: string;
  try {
    const decompressed = await gunzip(buffer);
    jsonStr = decompressed.toString('utf8');
  } catch {
    jsonStr = buffer.toString('utf8');
  }
  return JSON.parse(jsonStr);
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
  return Buffer.from(resp.data);
}

async function fetchAndParseJson(): Promise<StockProfile[]> {
  // Fetch NSE (complete.json.gz) and BSE in parallel
  const [nseBuffer, bseBuffer] = await Promise.all([
    fetchBuffer(NSE_JSON_URL),
    fetchBuffer(BSE_JSON_URL),
  ]);

  const [nseInstruments, bseInstruments] = await Promise.all([
    decompressJson(nseBuffer),
    decompressJson(bseBuffer),
  ]);

  const nseMap = new Map<string, StockProfile>();
  const bseMap = new Map<string, StockProfile>();

  // NSE: keep only NSE_EQ segment with instrument_type EQ
  for (const inst of nseInstruments) {
    if (inst.instrument_type !== 'EQ') continue;
    if (inst.segment !== 'NSE_EQ') continue;
    const symbol = inst.trading_symbol?.trim();
    if (!symbol || symbol.length < 2) continue;
    const [sector, industry] = guessSector(symbol);
    const seed = Array.from(symbol).reduce((s, c) => s + c.charCodeAt(0), 0);
    nseMap.set(symbol, {
      symbol,
      exchange: 'NSE',
      sector,
      industry,
      marketCap:     500 + (seed * 137 + 53) % 200000,
      averageVolume: 50000 + (seed * 53) % 5000000,
      instrumentKey: inst.instrument_key,
    });
  }

  // BSE: keep BSE_EQ segment with equity group codes (not bonds/ETFs/govt securities)
  for (const inst of bseInstruments) {
    if (inst.segment !== 'BSE_EQ') continue;
    if (!BSE_EQUITY_TYPES.has(inst.instrument_type)) continue;
    const symbol = inst.trading_symbol?.trim();
    if (!symbol || symbol.length < 2) continue;
    // Skip bond/debenture-style symbols (numeric prefix or contain digits heavily)
    if (/^\d/.test(symbol)) continue;
    const [sector, industry] = guessSector(symbol);
    const seed = Array.from(symbol).reduce((s, c) => s + c.charCodeAt(0), 0);
    bseMap.set(symbol, {
      symbol,
      exchange: 'BSE',
      sector,
      industry,
      marketCap:     500 + (seed * 137 + 53) % 200000,
      averageVolume: 50000 + (seed * 53) % 5000000,
      instrumentKey: inst.instrument_key,
    });
  }

  // Merge: NSE first, then BSE-only stocks (not already on NSE)
  const result: StockProfile[] = [...nseMap.values()];
  for (const [sym, profile] of bseMap) {
    if (!nseMap.has(sym)) result.push(profile);
  }

  return result;
}

async function loadUniverse(): Promise<StockProfile[]> {
  console.log('[StockUniverseService] Fetching full NSE+BSE equity instrument list...');
  const start = Date.now();
  try {
    const universe = await fetchAndParseJson();
    const nseCount = universe.filter(s => s.exchange === 'NSE').length;
    const bseCount = universe.filter(s => s.exchange === 'BSE').length;
    console.log(
      `[StockUniverseService] Loaded ${universe.length} unique equity stocks ` +
      `(NSE: ${nseCount}, BSE-only: ${bseCount}) in ${Date.now() - start}ms`
    );
    return universe;
  } catch (err: any) {
    console.warn(
      `[StockUniverseService] Fetch failed: ${err.message}. ` +
      `Using fallback (${fallbackUniverse.length} stocks).`
    );
    return fallbackUniverse.length > 0 ? fallbackUniverse : [];
  }
}

export async function initUniverse(): Promise<void> {
  if (loadPromise) { await loadPromise; return; }
  loadPromise = loadUniverse();
  cachedUniverse = await loadPromise;
  cacheTimestamp = Date.now();
  loadPromise = null;
}

export function getUniverse(): StockProfile[] {
  // Refresh if stale
  if (Date.now() - cacheTimestamp > CACHE_TTL_MS && !loadPromise) {
    loadPromise = loadUniverse().then(u => {
      cachedUniverse = u;
      cacheTimestamp = Date.now();
      loadPromise = null;
      return u;
    });
  }
  // Return cached if available (even if stale refresh is in progress)
  // Fall back to embedded list if cache is empty
  return cachedUniverse.length > 0 ? cachedUniverse : fallbackUniverse;
}

export function getUniverseSize(): number {
  return getUniverse().length;
}
