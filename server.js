// server.ts
import express from "express";

// src/services/StockUniverseService.ts
import axios from "axios";
var NSE_JSON_URL = "https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz";
var BSE_JSON_URL = "https://assets.upstox.com/market-quote/instruments/exchange/BSE.json.gz";
var BSE_EQUITY_TYPES = /* @__PURE__ */ new Set(["A", "B", "X", "XT", "T", "M", "MT", "Z", "ZP", "P", "MS", "R"]);
var CACHE_TTL_MS = 24 * 60 * 60 * 1e3;
var cachedUniverse = [];
var cacheTimestamp = 0;
var loadPromise = null;
var fallbackUniverse = [];
function setFallbackUniverse(profiles) {
  fallbackUniverse = profiles;
}
var SECTOR_HINTS = [
  ["HDFCBANK", "Financials", "Private Bank"],
  ["ICICIBANK", "Financials", "Private Bank"],
  ["KOTAKBANK", "Financials", "Private Bank"],
  ["AXISBANK", "Financials", "Private Bank"],
  ["SBIN", "Financials", "Public Bank"],
  ["BANKBARODA", "Financials", "Public Bank"],
  ["PNB", "Financials", "Public Bank"],
  ["CANBK", "Financials", "Public Bank"],
  ["BAJFINANCE", "Financials", "NBFC"],
  ["BAJAJFINSV", "Financials", "Insurance"],
  ["SBILIFE", "Financials", "Insurance"],
  ["HDFCLIFE", "Financials", "Insurance"],
  ["LICI", "Financials", "Insurance"],
  ["IRFC", "Financials", "NBFC"],
  ["RECLTD", "Financials", "NBFC"],
  ["TCS", "Technology", "IT Services"],
  ["INFY", "Technology", "IT Services"],
  ["WIPRO", "Technology", "IT Services"],
  ["HCLTECH", "Technology", "IT Services"],
  ["TECHM", "Technology", "IT Services"],
  ["LTIM", "Technology", "IT Services"],
  ["COFORGE", "Technology", "IT Services"],
  ["PERSISTENT", "Technology", "IT Services"],
  ["ZOMATO", "Technology", "Food Delivery"],
  ["PAYTM", "Technology", "Fintech"],
  ["RELIANCE", "Energy", "Oil & Gas"],
  ["ONGC", "Energy", "Oil & Gas"],
  ["BPCL", "Energy", "Oil Refining"],
  ["IOC", "Energy", "Oil Refining"],
  ["HINDPETRO", "Energy", "Oil Refining"],
  ["COALINDIA", "Energy", "Mining"],
  ["GAIL", "Energy", "Gas Distribution"],
  ["IGL", "Energy", "Gas Distribution"],
  ["SUNPHARMA", "Healthcare", "Pharma"],
  ["CIPLA", "Healthcare", "Pharma"],
  ["DRREDDY", "Healthcare", "Pharma"],
  ["DIVISLAB", "Healthcare", "Pharma"],
  ["LUPIN", "Healthcare", "Pharma"],
  ["AUROPHARMA", "Healthcare", "Pharma"],
  ["APOLLOHOSP", "Healthcare", "Hospitals"],
  ["FORTIS", "Healthcare", "Hospitals"],
  ["HINDUNILVR", "Consumer", "FMCG"],
  ["ITC", "Consumer", "FMCG"],
  ["NESTLEIND", "Consumer", "FMCG"],
  ["BRITANNIA", "Consumer", "FMCG"],
  ["DABUR", "Consumer", "FMCG"],
  ["MARICO", "Consumer", "FMCG"],
  ["GODREJCP", "Consumer", "FMCG"],
  ["TATACONSUM", "Consumer", "FMCG"],
  ["TITAN", "Consumer", "Jewellery"],
  ["ASIANPAINT", "Consumer", "Paints"],
  ["BERGEPAINT", "Consumer", "Paints"],
  ["MARUTI", "Auto", "Passenger Vehicles"],
  ["TATAMOTORS", "Auto", "Commercial Vehicles"],
  ["HEROMOTOCO", "Auto", "Two Wheelers"],
  ["BAJAJ-AUTO", "Auto", "Two Wheelers"],
  ["EICHERMOT", "Auto", "Two Wheelers"],
  ["JSWSTEEL", "Materials", "Steel"],
  ["TATASTEEL", "Materials", "Steel"],
  ["SAIL", "Materials", "Steel"],
  ["HINDALCO", "Materials", "Aluminium"],
  ["VEDL", "Materials", "Metals & Mining"],
  ["ULTRACEMCO", "Materials", "Cement"],
  ["SHREECEM", "Materials", "Cement"],
  ["AMBUJACEM", "Materials", "Cement"],
  ["NTPC", "Utilities", "Power Generation"],
  ["POWERGRID", "Utilities", "Power Transmission"],
  ["NHPC", "Utilities", "Hydro Power"],
  ["ADANIGREEN", "Utilities", "Renewable Energy"],
  ["ADANIENT", "Industrials", "Conglomerate"],
  ["ADANIPORTS", "Industrials", "Ports & Logistics"],
  ["LT", "Industrials", "Engineering"],
  ["BHEL", "Industrials", "Engineering"],
  ["BEL", "Industrials", "Defence"],
  ["SIEMENS", "Industrials", "Engineering"],
  ["HAVELLS", "Industrials", "Electricals"],
  ["DLF", "Real Estate", "Real Estate"],
  ["GODREJPROP", "Real Estate", "Real Estate"],
  ["PRESTIGE", "Real Estate", "Real Estate"],
  ["BHARTIARTL", "Telecom", "Telecom Services"],
  ["INDUSTOWER", "Telecom", "Tower Infrastructure"]
];
function guessSector(symbol) {
  const up = symbol.toUpperCase();
  for (const [prefix, sector, industry] of SECTOR_HINTS) {
    if (up === prefix || up.startsWith(prefix)) return [sector, industry];
  }
  if (up.includes("BANK") || up.includes("FIN")) return ["Financials", "Banking"];
  if (up.includes("PHARMA") || up.includes("CHEM") || up.includes("LAB")) return ["Healthcare", "Pharma"];
  if (up.includes("TECH") || up.includes("SOFT") || up.includes("INFO")) return ["Technology", "IT Services"];
  if (up.includes("POWER") || up.includes("ENERGY") || up.includes("SOLAR")) return ["Utilities", "Power"];
  if (up.includes("STEEL") || up.includes("METAL") || up.includes("ALLOY")) return ["Materials", "Metals"];
  if (up.includes("CEMENT") || up.includes("INFRA") || up.includes("CONST")) return ["Industrials", "Infrastructure"];
  if (up.includes("AUTO") || up.includes("MOTOR") || up.includes("WHEEL")) return ["Auto", "Auto"];
  return ["Diversified", "Diversified"];
}
async function decompressJson(buffer) {
  const zlib = await import("zlib");
  const { promisify } = await import("util");
  const gunzip = promisify(zlib.gunzip);
  let jsonStr;
  try {
    const decompressed = await gunzip(buffer);
    jsonStr = decompressed.toString("utf8");
  } catch {
    jsonStr = buffer.toString("utf8");
  }
  return JSON.parse(jsonStr);
}
async function fetchBuffer(url) {
  const resp = await axios.get(url, { responseType: "arraybuffer", timeout: 6e4 });
  return Buffer.from(resp.data);
}
async function fetchAndParseJson() {
  const [nseBuffer, bseBuffer] = await Promise.all([
    fetchBuffer(NSE_JSON_URL),
    fetchBuffer(BSE_JSON_URL)
  ]);
  const [nseInstruments, bseInstruments] = await Promise.all([
    decompressJson(nseBuffer),
    decompressJson(bseBuffer)
  ]);
  const nseMap = /* @__PURE__ */ new Map();
  const bseMap = /* @__PURE__ */ new Map();
  for (const inst of nseInstruments) {
    if (inst.instrument_type !== "EQ") continue;
    if (inst.segment !== "NSE_EQ") continue;
    const symbol = inst.trading_symbol?.trim();
    if (!symbol || symbol.length < 2) continue;
    const [sector, industry] = guessSector(symbol);
    const seed = Array.from(symbol).reduce((s, c) => s + c.charCodeAt(0), 0);
    nseMap.set(symbol, {
      symbol,
      name: inst.name?.trim() || symbol,
      exchange: "NSE",
      sector,
      industry,
      marketCap: 500 + (seed * 137 + 53) % 2e5,
      averageVolume: 5e4 + seed * 53 % 5e6,
      instrumentKey: inst.instrument_key
    });
  }
  for (const inst of bseInstruments) {
    if (inst.segment !== "BSE_EQ") continue;
    if (!BSE_EQUITY_TYPES.has(inst.instrument_type)) continue;
    const symbol = inst.trading_symbol?.trim();
    if (!symbol || symbol.length < 2) continue;
    if (/^\d/.test(symbol)) continue;
    const [sector, industry] = guessSector(symbol);
    const seed = Array.from(symbol).reduce((s, c) => s + c.charCodeAt(0), 0);
    bseMap.set(symbol, {
      symbol,
      name: inst.name?.trim() || symbol,
      exchange: "BSE",
      sector,
      industry,
      marketCap: 500 + (seed * 137 + 53) % 2e5,
      averageVolume: 5e4 + seed * 53 % 5e6,
      instrumentKey: inst.instrument_key
    });
  }
  const result = [...nseMap.values()];
  for (const [sym, profile] of bseMap) {
    if (!nseMap.has(sym)) result.push(profile);
  }
  return result;
}
async function loadUniverse() {
  console.log("[StockUniverseService] Fetching full NSE+BSE equity instrument list...");
  const start = Date.now();
  try {
    const universe = await fetchAndParseJson();
    const nseCount = universe.filter((s) => s.exchange === "NSE").length;
    const bseCount = universe.filter((s) => s.exchange === "BSE").length;
    console.log(
      `[StockUniverseService] Loaded ${universe.length} unique equity stocks (NSE: ${nseCount}, BSE-only: ${bseCount}) in ${Date.now() - start}ms`
    );
    return universe;
  } catch (err) {
    console.warn(
      `[StockUniverseService] Fetch failed: ${err.message}. Using fallback (${fallbackUniverse.length} stocks).`
    );
    return fallbackUniverse.length > 0 ? fallbackUniverse : [];
  }
}
async function initUniverse() {
  if (loadPromise) {
    await loadPromise;
    return;
  }
  loadPromise = loadUniverse();
  cachedUniverse = await loadPromise;
  cacheTimestamp = Date.now();
  loadPromise = null;
}
function getUniverse() {
  if (Date.now() - cacheTimestamp > CACHE_TTL_MS && !loadPromise) {
    loadPromise = loadUniverse().then((u) => {
      cachedUniverse = u;
      cacheTimestamp = Date.now();
      loadPromise = null;
      return u;
    });
  }
  return cachedUniverse.length > 0 ? cachedUniverse : fallbackUniverse;
}

// server.ts
import axios4 from "axios";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

// serverLogger.ts
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
var LOG_DIR = path.join(process.cwd(), "logs");
var ARCHIVE_DIR = path.join(LOG_DIR, "archive");
var ACTION_LOG_FILE = path.join(LOG_DIR, "server-actions.log");
var ERROR_LOG_FILE = path.join(LOG_DIR, "server-errors.log");
var MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024;
var SENSITIVE_KEY_PATTERN = /(authorization|token|api[_-]?key|secret|password|cookie|session)/i;
var ensureLogDirectories = () => {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
  if (!fs.existsSync(ARCHIVE_DIR)) {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  }
};
var rotateIfNeeded = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const { size } = fs.statSync(filePath);
  if (size < MAX_LOG_SIZE_BYTES) {
    return;
  }
  const parsed = path.parse(filePath);
  const archivedFileName = `${parsed.name}.${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}${parsed.ext}`;
  fs.renameSync(filePath, path.join(ARCHIVE_DIR, archivedFileName));
};
var truncateString = (value) => {
  if (value.length <= 200) {
    return value;
  }
  return `${value.slice(0, 197)}...`;
};
var summarizeValue = (value, depth = 0) => {
  if (value === null || value === void 0) {
    return value;
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack?.split("\n").slice(0, 6).join(" | ")
    };
  }
  if (typeof value === "string") {
    return truncateString(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    if (depth >= 1) {
      return { type: "array", length: value.length };
    }
    return {
      type: "array",
      length: value.length,
      sample: value.slice(0, 3).map((item) => summarizeValue(item, depth + 1))
    };
  }
  if (typeof value === "object") {
    const entries = Object.entries(value);
    const summary = {};
    entries.slice(0, 12).forEach(([key, entryValue]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        summary[key] = "[REDACTED]";
        return;
      }
      if (depth >= 1 && typeof entryValue === "object" && entryValue !== null) {
        summary[key] = Array.isArray(entryValue) ? `array(${entryValue.length})` : "object";
        return;
      }
      summary[key] = summarizeValue(entryValue, depth + 1);
    });
    if (entries.length > 12) {
      summary.__truncated = `${entries.length - 12} more field(s)`;
    }
    return summary;
  }
  return String(value);
};
var writeLogLine = (filePath, payload) => {
  ensureLogDirectories();
  rotateIfNeeded(filePath);
  fs.appendFileSync(filePath, `${JSON.stringify(payload)}
`, "utf8");
};
var logAction = (event, context = {}) => {
  writeLogLine(ACTION_LOG_FILE, {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    level: "INFO",
    event,
    context: summarizeValue(context)
  });
};
var logError = (event, error, context = {}) => {
  writeLogLine(ERROR_LOG_FILE, {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    level: "ERROR",
    event,
    context: summarizeValue(context),
    error: summarizeValue(error)
  });
};
var requestLoggingMiddleware = () => {
  return (req, res, next) => {
    const requestId = req.header("X-Request-Id")?.trim() || randomUUID();
    const startedAt = process.hrtime.bigint();
    res.locals.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      logAction("request.completed", {
        requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
        query: summarizeValue(req.query),
        body: req.method === "GET" ? void 0 : summarizeValue(req.body)
      });
    });
    next();
  };
};
var withErrorBoundary = (handler) => {
  return (req, res, next) => {
    try {
      Promise.resolve(handler(req, res, next)).catch(next);
    } catch (error) {
      next(error);
    }
  };
};
var errorLoggingMiddleware = (error, req, res, next) => {
  const requestId = res.locals.requestId || req.header("X-Request-Id") || randomUUID();
  const statusCode = typeof res.statusCode === "number" && res.statusCode >= 400 ? res.statusCode : 500;
  logError("request.failed", error, {
    requestId,
    method: req.method,
    path: req.originalUrl,
    statusCode
  });
  if (res.headersSent) {
    next(error);
    return;
  }
  res.status(statusCode).json({
    error: "Unexpected server error",
    requestId
  });
};
var installProcessErrorHandlers = () => {
  process.on("uncaughtException", (error) => {
    logError("process.uncaughtException", error);
  });
  process.on("unhandledRejection", (reason) => {
    logError("process.unhandledRejection", reason instanceof Error ? reason : new Error(String(reason)));
  });
};

// src/services/upstox/UpstoxTokenManager.ts
import axios2 from "axios";
import path2 from "path";
import { createRequire } from "module";
var db = null;
if (!process.env.VERCEL) {
  try {
    const _require = createRequire(import.meta.url);
    const Database = _require("better-sqlite3");
    const dbPath = path2.join(process.cwd(), "upstox-tokens.db");
    db = new Database(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS upstox_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    console.log("[UpstoxTokenManager] SQLite storage initialised");
  } catch {
    console.log("[UpstoxTokenManager] SQLite unavailable, using env/memory storage");
  }
} else {
  console.log("[UpstoxTokenManager] Vercel environment \u2014 using env/memory storage");
}
var memoryToken = null;
function readRecord() {
  if (db) {
    const row = db.prepare("SELECT * FROM upstox_tokens ORDER BY id DESC LIMIT 1").get();
    if (!row) return null;
    return { access_token: row.access_token, refresh_token: row.refresh_token, expires_at: row.expires_at };
  }
  return memoryToken;
}
function writeRecord(r) {
  if (db) {
    const now = Date.now();
    db.prepare("DELETE FROM upstox_tokens").run();
    db.prepare(
      "INSERT INTO upstox_tokens (access_token, refresh_token, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run(r.access_token, r.refresh_token, r.expires_at, now, now);
  } else {
    memoryToken = r;
  }
}
var UpstoxTokenManager = class {
  constructor() {
    const envToken = process.env.UPSTOX_ACCESS_TOKEN;
    if (envToken && !readRecord()) {
      const expiresAt = Date.now() + 24 * 60 * 60 * 1e3;
      writeRecord({ access_token: envToken, refresh_token: null, expires_at: expiresAt });
    }
  }
  storeTokens(accessToken, refreshToken, expiresIn) {
    const expiresAt = Date.now() + expiresIn * 1e3;
    writeRecord({ access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt });
    console.log(`[UpstoxTokenManager] Tokens stored | expires=${new Date(expiresAt).toISOString()} | len=${accessToken.length}`);
  }
  isExpired(expiresAt) {
    return Date.now() >= expiresAt - 5 * 60 * 1e3;
  }
  async refreshAccessToken(refreshToken) {
    const { UPSTOX_CLIENT_ID: clientId, UPSTOX_CLIENT_SECRET: clientSecret, UPSTOX_REDIRECT_URI: redirectUri } = process.env;
    if (!clientId || !clientSecret || !redirectUri) throw new Error("Upstox credentials not configured");
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri
    });
    const { data } = await axios2.post("https://api.upstox.com/v2/login/authorization/token", params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }
    });
    const { access_token, refresh_token: newRefresh, expires_in } = data;
    if (!access_token) throw new Error("No access_token in refresh response");
    this.storeTokens(access_token, newRefresh || refreshToken, expires_in || 86400);
    console.log("[UpstoxTokenManager] Token refreshed successfully");
  }
  async getValidAccessToken() {
    const record = readRecord();
    if (!record) {
      console.log("[UpstoxTokenManager] No tokens found");
      return null;
    }
    if (this.isExpired(record.expires_at)) {
      if (!record.refresh_token) {
        console.error("[UpstoxTokenManager] Token expired, no refresh token");
        return null;
      }
      try {
        await this.refreshAccessToken(record.refresh_token);
        return readRecord()?.access_token || null;
      } catch (e) {
        console.error("[UpstoxTokenManager] Auto-refresh failed:", e);
        return null;
      }
    }
    const minsLeft = Math.round((record.expires_at - Date.now()) / 6e4);
    console.log(`[UpstoxTokenManager] Using valid access token (expires in ${minsLeft}m, length=${record.access_token.length})`);
    return record.access_token;
  }
  async exchangeAuthorizationCode(code) {
    const { UPSTOX_CLIENT_ID: clientId, UPSTOX_CLIENT_SECRET: clientSecret, UPSTOX_REDIRECT_URI: redirectUri } = process.env;
    if (!clientId || !clientSecret || !redirectUri) throw new Error("Upstox credentials not configured");
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri
    });
    const { data } = await axios2.post("https://api.upstox.com/v2/login/authorization/token", params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }
    });
    const { access_token, refresh_token, expires_in } = data;
    if (!access_token) throw new Error("No access_token in response");
    this.storeTokens(access_token, refresh_token || null, expires_in || 86400);
    console.log("[UpstoxTokenManager] Authorization code exchanged successfully");
  }
  close() {
  }
};

// src/services/upstox/UpstoxApiClient.ts
import axios3 from "axios";
var UpstoxApiClient = class {
  constructor(tokenManager) {
    this.tokenManager = tokenManager;
    this.axiosInstance = axios3.create({
      baseURL: "https://api.upstox.com/v2",
      timeout: 15e3,
      headers: {
        "Accept": "application/json"
      }
    });
  }
  /**
   * Make authenticated API request with auto-token-attachment
   */
  async makeRequest(config) {
    const token = await this.tokenManager.getValidAccessToken();
    if (!token) {
      throw new Error("No valid Upstox access token available. Please authenticate.");
    }
    try {
      const response = await this.axiosInstance.request({
        ...config,
        headers: {
          ...config.headers,
          "Authorization": `Bearer ${token}`
        }
      });
      return response.data;
    } catch (error) {
      const errorCode = error.response?.data?.errors?.[0]?.errorCode;
      if (errorCode === "UDAPI100011" || error.response?.status === 401) {
        console.error("[UpstoxApiClient] Token invalid/expired, please re-authenticate");
        throw new Error("Upstox token expired. Please re-authenticate.");
      }
      throw error;
    }
  }
  /**
   * Fetch historical candle data
   * 
   * @param instrumentKey - e.g., "NSE_EQ|INE002A01018"
   * @param interval - "1minute", "5minute", "30minute", "day", etc.
   * @param fromDate - "YYYY-MM-DD"
   * @param toDate - "YYYY-MM-DD"
   */
  async fetchHistoricalData(instrumentKey, interval, fromDate, toDate) {
    const encodedKey = encodeURIComponent(instrumentKey);
    const url = `/historical-candle/${encodedKey}/${interval}/${toDate}/${fromDate}`;
    return this.makeRequest({
      method: "GET",
      url
    });
  }
  /**
   * Fetch user holdings (portfolio)
   */
  async fetchHoldings() {
    return this.makeRequest({
      method: "GET",
      url: "/portfolio/long-term-holdings"
    });
  }
  /**
   * Fetch user positions (open trades)
   */
  async fetchPositions() {
    return this.makeRequest({
      method: "GET",
      url: "/portfolio/short-term-positions"
    });
  }
  /**
   * Fetch user profile
   */
  async fetchProfile() {
    return this.makeRequest({
      method: "GET",
      url: "/user/profile"
    });
  }
  /**
   * Fetch market quotes for instruments
   * 
   * @param instrumentKeys - Array of instrument keys
   */
  async fetchMarketQuotes(instrumentKeys) {
    return this.makeRequest({
      method: "GET",
      url: "/market-quote/quotes",
      params: {
        instrument_key: instrumentKeys.join(",")
      }
    });
  }
  /**
   * Place an order (extensibility for future trading features)
   * 
   * @param orderParams - Order parameters (quantity, price, instrument, etc.)
   */
  async placeOrder(orderParams) {
    return this.makeRequest({
      method: "POST",
      url: "/order/place",
      data: orderParams
    });
  }
  /**
   * Get order book (all orders)
   */
  async fetchOrderBook() {
    return this.makeRequest({
      method: "GET",
      url: "/order/retrieve-all"
    });
  }
  /**
   * Get funds and margin
   */
  async fetchFunds() {
    return this.makeRequest({
      method: "GET",
      url: "/user/get-funds-and-margin"
    });
  }
};

// src/services/upstox/UpstoxScheduler.ts
var UpstoxScheduler = class {
  constructor(tokenManager) {
    this.dailyRefreshInterval = null;
    this.tokenManager = tokenManager;
  }
  /**
   * Start the scheduler — validates token on startup and schedules daily refresh
   */
  start() {
    console.log("[UpstoxScheduler] Starting scheduler...");
    this.validateTokenOnStartup();
    this.scheduleDailyRefresh();
  }
  /**
   * Validate token on app startup
   */
  async validateTokenOnStartup() {
    try {
      const token = await this.tokenManager.getValidAccessToken();
      if (token) {
        console.log("[UpstoxScheduler] Token validated successfully on startup");
      } else {
        console.warn("[UpstoxScheduler] No valid token found. Please authenticate via OAuth.");
      }
    } catch (error) {
      console.error("[UpstoxScheduler] Token validation failed on startup:", error);
    }
  }
  /**
   * Schedule daily token refresh at 8:30 AM IST (before market open)
   */
  scheduleDailyRefresh() {
    const now = /* @__PURE__ */ new Date();
    const targetTime = /* @__PURE__ */ new Date();
    targetTime.setUTCHours(3, 0, 0, 0);
    if (now > targetTime) {
      targetTime.setDate(targetTime.getDate() + 1);
    }
    const msUntilTarget = targetTime.getTime() - now.getTime();
    console.log(`[UpstoxScheduler] Next token refresh scheduled at ${targetTime.toISOString()}`);
    setTimeout(() => {
      this.performDailyRefresh();
      this.dailyRefreshInterval = setInterval(() => {
        this.performDailyRefresh();
      }, 24 * 60 * 60 * 1e3);
    }, msUntilTarget);
  }
  /**
   * Perform daily token refresh
   */
  async performDailyRefresh() {
    console.log("[UpstoxScheduler] Performing daily token refresh...");
    try {
      const token = await this.tokenManager.getValidAccessToken();
      if (token) {
        console.log("[UpstoxScheduler] Daily token refresh successful");
      } else {
        console.warn("[UpstoxScheduler] Daily refresh failed: No valid token. Re-authentication required.");
      }
    } catch (error) {
      console.error("[UpstoxScheduler] Daily token refresh failed:", error);
    }
  }
  /**
   * Stop the scheduler
   */
  stop() {
    if (this.dailyRefreshInterval) {
      clearInterval(this.dailyRefreshInterval);
      this.dailyRefreshInterval = null;
      console.log("[UpstoxScheduler] Scheduler stopped");
    }
  }
};

// src/services/upstox/UpstoxService.ts
var UpstoxService = class _UpstoxService {
  static {
    this.instance = null;
  }
  constructor() {
    this.tokenManager = new UpstoxTokenManager();
    this.apiClient = new UpstoxApiClient(this.tokenManager);
    this.scheduler = new UpstoxScheduler(this.tokenManager);
  }
  /**
   * Get singleton instance
   */
  static getInstance() {
    if (!_UpstoxService.instance) {
      _UpstoxService.instance = new _UpstoxService();
    }
    return _UpstoxService.instance;
  }
  /**
   * Initialize the service (call on app startup)
   */
  initialize() {
    console.log("[UpstoxService] Initializing Upstox integration...");
    this.scheduler.start();
  }
  /**
   * Generate OAuth authorization URL for user login
   */
  getAuthorizationUrl() {
    const clientId = process.env.UPSTOX_CLIENT_ID;
    const redirectUri = process.env.UPSTOX_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      throw new Error("Upstox credentials not configured in .env");
    }
    return `https://api.upstox.com/v2/login/authorization/dialog?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;
  }
  /**
   * Handle OAuth callback (exchange code for tokens)
   */
  async handleOAuthCallback(code) {
    await this.tokenManager.exchangeAuthorizationCode(code);
  }
  /**
   * Check if user is authenticated
   */
  async isAuthenticated() {
    const token = await this.tokenManager.getValidAccessToken();
    return token !== null;
  }
  /**
   * Cleanup on app shutdown
   */
  shutdown() {
    this.scheduler.stop();
    this.tokenManager.close();
    console.log("[UpstoxService] Shutdown complete");
  }
};

// src/services/upstox/UpstoxMarketDataService.ts
var UpstoxMarketDataService = class {
  // 5 seconds cache
  constructor() {
    this.quoteCache = /* @__PURE__ */ new Map();
    this.CACHE_TTL = 5e3;
    this.upstoxService = UpstoxService.getInstance();
  }
  /**
   * Check if Upstox is connected
   */
  async isConnected() {
    return await this.upstoxService.isAuthenticated();
  }
  /**
   * Get live market quotes for multiple symbols
   */
  async getMarketQuotes(symbols) {
    const isConnected = await this.isConnected();
    console.log("[UpstoxMarketDataService] getMarketQuotes - connected:", isConnected, "symbols:", symbols.length);
    if (!isConnected) {
      console.log("[UpstoxMarketDataService] Not connected, using simulated quotes");
      return this.getSimulatedQuotes(symbols);
    }
    try {
      const instrumentKeys = symbols.map((s) => this.symbolToInstrumentKey(s));
      console.log("[UpstoxMarketDataService] Fetching quotes for instrument keys:", instrumentKeys.slice(0, 3), "...");
      const response = await this.upstoxService.apiClient.fetchMarketQuotes(instrumentKeys);
      console.log("[UpstoxMarketDataService] Received response:", response ? "yes" : "no");
      const quotes = this.parseUpstoxQuotes(response);
      console.log("[UpstoxMarketDataService] Parsed quotes:", quotes.length);
      return quotes;
    } catch (error) {
      console.error("[UpstoxMarketDataService] Failed to fetch quotes:", error.message);
      console.log("[UpstoxMarketDataService] Falling back to simulated quotes");
      return this.getSimulatedQuotes(symbols);
    }
  }
  /**
   * Get single stock quote with caching
   */
  async getQuote(symbol) {
    const cacheKey = `quote_${symbol}`;
    const cached = this.quoteCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    const quotes = await this.getMarketQuotes([symbol]);
    const quote = quotes[0] || null;
    if (quote) {
      this.quoteCache.set(cacheKey, {
        data: quote,
        expiresAt: Date.now() + this.CACHE_TTL
      });
    }
    return quote;
  }
  /**
   * Get real-time momentum stocks (top movers)
   */
  async getMomentumStocks(limit = 10) {
    const isConnected = await this.isConnected();
    console.log("[UpstoxMarketDataService] getMomentumStocks - connected:", isConnected);
    if (!isConnected) {
      console.log("[UpstoxMarketDataService] Not connected, using simulated momentum");
      return this.getSimulatedMomentum(limit);
    }
    try {
      const symbols = this.getPopularSymbols();
      console.log("[UpstoxMarketDataService] Fetching quotes for symbols:", symbols.length);
      const quotes = await this.getMarketQuotes(symbols);
      console.log("[UpstoxMarketDataService] Received quotes:", quotes.length);
      if (quotes.length === 0) {
        console.log("[UpstoxMarketDataService] No quotes received, using simulated momentum");
        return this.getSimulatedMomentum(limit);
      }
      const sorted = quotes.sort((a, b) => {
        const scoreA = Math.abs(a.changePercent) * Math.log(Math.max(a.volume, 1));
        const scoreB = Math.abs(b.changePercent) * Math.log(Math.max(b.volume, 1));
        return scoreB - scoreA;
      }).slice(0, limit);
      console.log("[UpstoxMarketDataService] Returning", sorted.length, "momentum stocks");
      return sorted.map((q) => ({
        symbol: q.symbol,
        priceChange: q.changePercent.toFixed(2),
        volumeRatio: (q.volume / 1e6).toFixed(2),
        strength: Math.min(100, Math.abs(q.changePercent) * 20 + 50),
        alert: Math.abs(q.changePercent) > 3 ? "High Velocity Spike" : Math.abs(q.changePercent) > 2 ? "Strong Momentum" : "Momentum Building"
      }));
    } catch (error) {
      console.error("[UpstoxMarketDataService] Failed to fetch momentum:", error);
      return this.getSimulatedMomentum(limit);
    }
  }
  /**
   * Get sector strength data from real market
   */
  async getSectorStrength() {
    const isConnected = await this.isConnected();
    if (!isConnected) {
      return this.getSimulatedSectors();
    }
    try {
      const sectorMap = this.getSectorMapping();
      const sectorData = [];
      for (const [sector, symbols] of Object.entries(sectorMap)) {
        const quotes = await this.getMarketQuotes(symbols);
        const avgChange = quotes.reduce((sum, q) => sum + q.changePercent, 0) / quotes.length;
        const leaders = quotes.sort((a, b) => b.changePercent - a.changePercent).slice(0, 3).map((q) => q.symbol);
        sectorData.push({
          sector,
          strength: avgChange,
          momentum: avgChange > 1 ? "Strong Bullish" : avgChange > 0.5 ? "Bullish" : avgChange > -0.5 ? "Neutral" : "Bearish",
          leaders
        });
      }
      return sectorData.sort((a, b) => b.strength - a.strength);
    } catch (error) {
      console.error("[UpstoxMarketDataService] Failed to fetch sectors:", error);
      return this.getSimulatedSectors();
    }
  }
  /**
   * Get user portfolio holdings (if authenticated)
   */
  async getHoldings() {
    const isConnected = await this.isConnected();
    if (!isConnected) {
      return [];
    }
    try {
      const response = await this.upstoxService.apiClient.fetchHoldings();
      return response.data || [];
    } catch (error) {
      console.error("[UpstoxMarketDataService] Failed to fetch holdings:", error);
      return [];
    }
  }
  /**
   * Get user positions (if authenticated)
   */
  async getPositions() {
    const isConnected = await this.isConnected();
    if (!isConnected) {
      return [];
    }
    try {
      const response = await this.upstoxService.apiClient.fetchPositions();
      return response.data || [];
    } catch (error) {
      console.error("[UpstoxMarketDataService] Failed to fetch positions:", error);
      return [];
    }
  }
  // ─── Helper Methods ────────────────────────────────────────────────────────
  /**
   * Map symbol to Upstox instrument key
   */
  symbolToInstrumentKey(symbol) {
    const mapping = {
      "RELIANCE": "NSE_EQ|INE002A01018",
      "TCS": "NSE_EQ|INE467B01029",
      "HDFCBANK": "NSE_EQ|INE040A01034",
      "INFY": "NSE_EQ|INE009A01021",
      "ICICIBANK": "NSE_EQ|INE090A01021",
      "SBIN": "NSE_EQ|INE062A01020",
      "BHARTIARTL": "NSE_EQ|INE397D01024",
      "LT": "NSE_EQ|INE018A01030",
      "ITC": "NSE_EQ|INE154A01025",
      "KOTAKBANK": "NSE_EQ|INE237A01028",
      "AXISBANK": "NSE_EQ|INE238A01034",
      "ADANIENT": "NSE_EQ|INE423A01024",
      "ASIANPAINT": "NSE_EQ|INE021A01026",
      "MARUTI": "NSE_EQ|INE585B01010",
      "SUNPHARMA": "NSE_EQ|INE044A01036",
      "TITAN": "NSE_EQ|INE280A01028",
      "BAJFINANCE": "NSE_EQ|INE296A01024",
      "HCLTECH": "NSE_EQ|INE860A01027",
      "WIPRO": "NSE_EQ|INE075A01022",
      "TATAMOTORS": "NSE_EQ|INE155A01022"
    };
    return mapping[symbol] || `NSE_EQ|${symbol}`;
  }
  /**
   * Parse Upstox quote response to MarketQuote format
   */
  parseUpstoxQuotes(response) {
    const quotes = [];
    if (!response.data) return quotes;
    for (const [key, value] of Object.entries(response.data)) {
      const data = value;
      const ohlc = data.ohlc || {};
      const lastPrice = data.last_price || ohlc.close || 0;
      const previousClose = ohlc.close || lastPrice;
      const change = lastPrice - previousClose;
      const changePercent = previousClose > 0 ? change / previousClose * 100 : 0;
      quotes.push({
        symbol: this.extractSymbolFromKey(key),
        lastPrice,
        change,
        changePercent,
        volume: data.volume || 0,
        high: ohlc.high || lastPrice,
        low: ohlc.low || lastPrice,
        open: ohlc.open || lastPrice,
        previousClose
      });
    }
    return quotes;
  }
  /**
   * Extract symbol from instrument key
   */
  extractSymbolFromKey(key) {
    const parts = key.split("|");
    return parts[0] || key;
  }
  /**
   * Get popular symbols for scanning
   */
  getPopularSymbols() {
    return [
      "RELIANCE",
      "TCS",
      "HDFCBANK",
      "INFY",
      "ICICIBANK",
      "SBIN",
      "BHARTIARTL",
      "LT",
      "ITC",
      "KOTAKBANK",
      "AXISBANK",
      "ASIANPAINT",
      "MARUTI",
      "SUNPHARMA",
      "TITAN"
    ];
  }
  /**
   * Get sector to symbols mapping
   */
  getSectorMapping() {
    return {
      "IT": ["TCS", "INFY", "HCLTECH", "WIPRO"],
      "Banking": ["HDFCBANK", "ICICIBANK", "SBIN", "KOTAKBANK", "AXISBANK"],
      "Auto": ["MARUTI", "TATAMOTORS"],
      "Pharma": ["SUNPHARMA"],
      "Industrials": ["LT", "ADANIENT"],
      "Consumer": ["ITC", "TITAN", "ASIANPAINT", "NESTLEIND"]
    };
  }
  // ─── Simulated Data Fallbacks ──────────────────────────────────────────────
  getSimulatedQuotes(symbols) {
    return symbols.map((symbol) => {
      const seed = symbol.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const random = () => {
        const x = Math.sin(seed + Date.now() / 1e4) * 1e4;
        return x - Math.floor(x);
      };
      const basePrice = 1e3 + random() * 2e3;
      const changePercent = (random() - 0.5) * 5;
      const change = basePrice * (changePercent / 100);
      return {
        symbol,
        lastPrice: basePrice,
        change,
        changePercent,
        volume: Math.floor(1e6 + random() * 5e6),
        high: basePrice * (1 + random() * 0.02),
        low: basePrice * (1 - random() * 0.02),
        open: basePrice * (1 + (random() - 0.5) * 0.01),
        previousClose: basePrice - change
      };
    });
  }
  getSimulatedMomentum(limit) {
    const symbols = this.getPopularSymbols();
    return Array.from({ length: Math.min(limit, symbols.length) }, (_, i) => ({
      symbol: symbols[i],
      priceChange: (1.5 + Math.random() * 2).toFixed(2),
      volumeRatio: (2 + Math.random() * 5).toFixed(2),
      strength: Math.floor(70 + Math.random() * 25),
      alert: i === 0 ? "High Velocity Spike" : i < 3 ? "Strong Momentum" : "Momentum Building"
    }));
  }
  getSimulatedSectors() {
    const sectors = ["IT", "Banking", "Pharma", "Energy", "Auto", "FMCG"];
    return sectors.map((sector) => ({
      sector,
      strength: -2 + Math.random() * 5,
      momentum: Math.random() > 0.5 ? "Bullish" : "Neutral",
      leaders: this.getPopularSymbols().slice(0, 3)
    }));
  }
};

// server.ts
import path3 from "path";
import fs2 from "fs";
dotenv.config();
installProcessErrorHandlers();
async function buildApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(requestLoggingMiddleware());
  app.get("/sb-terminal", (req, res) => {
    const templatePath = path3.join(process.cwd(), "src/main/resources/templates/index.html");
    if (fs2.existsSync(templatePath)) {
      let content = fs2.readFileSync(templatePath, "utf8");
      const apiKey = process.env.GEMINI_API_KEY || "";
      content = content.replace("process.env.GEMINI_API_KEY", `'${apiKey}'`);
      content = content.replace(/\[\[\$\{@environment\.getProperty\('GEMINI_API_KEY'\)\}\]\]/g, apiKey);
      res.send(content);
    } else {
      res.status(404).send("Template not found. Please ensure src/main/resources/templates/index.html exists.");
    }
  });
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
    { name: "HINDALCO INDUSTRIES LTD", symbol: "HINDALCO", key: "NSE_EQ|INE038A01020" }
  ];
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
  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const seededGenerator = (seed) => {
    let state = seed >>> 0;
    return () => {
      state = state * 1664525 + 1013904223 >>> 0;
      return state / 4294967296;
    };
  };
  const symbolSeed = (symbol) => Array.from(symbol).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const normalizeUltraQuantRequest = (payload = {}) => ({
    historicalPeriodYears: Math.min(15, Math.max(1, Number(payload.historicalPeriodYears ?? 5))),
    minCagr: Number(payload.minCagr ?? 18),
    sectorFilter: (payload.sectorFilter ?? "ALL").toString(),
    minMarketCap: Number(payload.minMarketCap ?? 0),
    maxMarketCap: Number(payload.maxMarketCap ?? Number.MAX_SAFE_INTEGER),
    minVolume: Number(payload.minVolume ?? 1e5),
    maxDrawdown: Number(payload.maxDrawdown ?? 45),
    volatilityThreshold: Number(payload.volatilityThreshold ?? 0.5),
    breakoutFrequency: Number(payload.breakoutFrequency ?? 0.08),
    trendStrengthThreshold: Number(payload.trendStrengthThreshold ?? 0.12),
    riskPercentage: Number(payload.riskPercentage ?? 1)
  });
  const NSE_STOCK_UNIVERSE = [
    // â”€â”€ LARGE CAP / NIFTY 50 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    { symbol: "RELIANCE", sector: "Energy", industry: "Oil & Gas", marketCap: 175e4, averageVolume: 8e6 },
    { symbol: "TCS", sector: "Technology", industry: "IT Services", marketCap: 14e5, averageVolume: 3e6 },
    { symbol: "HDFCBANK", sector: "Financials", industry: "Private Bank", marketCap: 12e5, averageVolume: 9e6 },
    { symbol: "INFY", sector: "Technology", industry: "IT Services", marketCap: 75e4, averageVolume: 5e6 },
    { symbol: "ICICIBANK", sector: "Financials", industry: "Private Bank", marketCap: 72e4, averageVolume: 1e7 },
    { symbol: "HINDUNILVR", sector: "Consumer", industry: "FMCG", marketCap: 6e5, averageVolume: 2e6 },
    { symbol: "SBIN", sector: "Financials", industry: "Public Bank", marketCap: 58e4, averageVolume: 15e6 },
    { symbol: "BHARTIARTL", sector: "Telecom", industry: "Telecom Services", marketCap: 56e4, averageVolume: 5e6 },
    { symbol: "ITC", sector: "Consumer", industry: "FMCG", marketCap: 54e4, averageVolume: 12e6 },
    { symbol: "KOTAKBANK", sector: "Financials", industry: "Private Bank", marketCap: 38e4, averageVolume: 4e6 },
    { symbol: "LT", sector: "Industrials", industry: "Engineering", marketCap: 37e4, averageVolume: 3e6 },
    { symbol: "AXISBANK", sector: "Financials", industry: "Private Bank", marketCap: 34e4, averageVolume: 8e6 },
    { symbol: "ASIANPAINT", sector: "Consumer", industry: "Paints", marketCap: 29e4, averageVolume: 15e5 },
    { symbol: "MARUTI", sector: "Auto", industry: "Passenger Vehicles", marketCap: 28e4, averageVolume: 8e5 },
    { symbol: "SUNPHARMA", sector: "Healthcare", industry: "Pharma", marketCap: 27e4, averageVolume: 3e6 },
    { symbol: "TITAN", sector: "Consumer", industry: "Jewellery", marketCap: 26e4, averageVolume: 2e6 },
    { symbol: "BAJFINANCE", sector: "Financials", industry: "NBFC", marketCap: 25e4, averageVolume: 35e5 },
    { symbol: "HCLTECH", sector: "Technology", industry: "IT Services", marketCap: 24e4, averageVolume: 4e6 },
    { symbol: "WIPRO", sector: "Technology", industry: "IT Services", marketCap: 23e4, averageVolume: 5e6 },
    { symbol: "TATAMOTORS", sector: "Auto", industry: "Commercial Vehicles", marketCap: 22e4, averageVolume: 1e7 },
    { symbol: "M&M", sector: "Auto", industry: "Passenger Vehicles", marketCap: 21e4, averageVolume: 3e6 },
    { symbol: "ULTRACEMCO", sector: "Materials", industry: "Cement", marketCap: 2e5, averageVolume: 8e5 },
    { symbol: "POWERGRID", sector: "Utilities", industry: "Power Transmission", marketCap: 195e3, averageVolume: 6e6 },
    { symbol: "NTPC", sector: "Utilities", industry: "Power Generation", marketCap: 19e4, averageVolume: 8e6 },
    { symbol: "NESTLEIND", sector: "Consumer", industry: "FMCG", marketCap: 185e3, averageVolume: 5e5 },
    { symbol: "BAJAJFINSV", sector: "Financials", industry: "Insurance", marketCap: 18e4, averageVolume: 2e6 },
    { symbol: "JSWSTEEL", sector: "Materials", industry: "Steel", marketCap: 175e3, averageVolume: 5e6 },
    { symbol: "HINDALCO", sector: "Materials", industry: "Aluminium", marketCap: 17e4, averageVolume: 7e6 },
    { symbol: "ADANIENT", sector: "Industrials", industry: "Conglomerate", marketCap: 165e3, averageVolume: 4e6 },
    { symbol: "ADANIPORTS", sector: "Industrials", industry: "Ports & Logistics", marketCap: 16e4, averageVolume: 4e6 },
    { symbol: "ONGC", sector: "Energy", industry: "Oil & Gas", marketCap: 155e3, averageVolume: 1e7 },
    { symbol: "COALINDIA", sector: "Energy", industry: "Mining", marketCap: 15e4, averageVolume: 6e6 },
    { symbol: "TATASTEEL", sector: "Materials", industry: "Steel", marketCap: 145e3, averageVolume: 12e6 },
    { symbol: "TECHM", sector: "Technology", industry: "IT Services", marketCap: 14e4, averageVolume: 4e6 },
    { symbol: "GRASIM", sector: "Materials", industry: "Diversified", marketCap: 135e3, averageVolume: 15e5 },
    { symbol: "INDUSINDBK", sector: "Financials", industry: "Private Bank", marketCap: 13e4, averageVolume: 4e6 },
    { symbol: "CIPLA", sector: "Healthcare", industry: "Pharma", marketCap: 125e3, averageVolume: 25e5 },
    { symbol: "DRREDDY", sector: "Healthcare", industry: "Pharma", marketCap: 12e4, averageVolume: 15e5 },
    { symbol: "EICHERMOT", sector: "Auto", industry: "Two Wheelers", marketCap: 115e3, averageVolume: 8e5 },
    { symbol: "HEROMOTOCO", sector: "Auto", industry: "Two Wheelers", marketCap: 11e4, averageVolume: 15e5 },
    { symbol: "BPCL", sector: "Energy", industry: "Oil Refining", marketCap: 105e3, averageVolume: 6e6 },
    { symbol: "TATACONSUM", sector: "Consumer", industry: "FMCG", marketCap: 1e5, averageVolume: 2e6 },
    { symbol: "APOLLOHOSP", sector: "Healthcare", industry: "Hospitals", marketCap: 95e3, averageVolume: 1e6 },
    { symbol: "DIVISLAB", sector: "Healthcare", industry: "Pharma", marketCap: 9e4, averageVolume: 8e5 },
    { symbol: "BRITANNIA", sector: "Consumer", industry: "FMCG", marketCap: 88e3, averageVolume: 6e5 },
    { symbol: "SBILIFE", sector: "Financials", industry: "Insurance", marketCap: 85e3, averageVolume: 15e5 },
    { symbol: "HDFCLIFE", sector: "Financials", industry: "Insurance", marketCap: 82e3, averageVolume: 2e6 },
    { symbol: "SHREECEM", sector: "Materials", industry: "Cement", marketCap: 8e4, averageVolume: 2e5 },
    // â”€â”€ NIFTY NEXT 50 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    { symbol: "ADANIGREEN", sector: "Utilities", industry: "Renewable Energy", marketCap: 78e3, averageVolume: 3e6 },
    { symbol: "ADANITRANS", sector: "Utilities", industry: "Power Transmission", marketCap: 75e3, averageVolume: 2e6 },
    { symbol: "AMBUJACEM", sector: "Materials", industry: "Cement", marketCap: 72e3, averageVolume: 4e6 },
    { symbol: "BAJAJ-AUTO", sector: "Auto", industry: "Two Wheelers", marketCap: 7e4, averageVolume: 6e5 },
    { symbol: "BANKBARODA", sector: "Financials", industry: "Public Bank", marketCap: 68e3, averageVolume: 1e7 },
    { symbol: "BERGEPAINT", sector: "Consumer", industry: "Paints", marketCap: 65e3, averageVolume: 8e5 },
    { symbol: "BOSCHLTD", sector: "Auto", industry: "Auto Components", marketCap: 63e3, averageVolume: 2e5 },
    { symbol: "CHOLAFIN", sector: "Financials", industry: "NBFC", marketCap: 6e4, averageVolume: 2e6 },
    { symbol: "COLPAL", sector: "Consumer", industry: "FMCG", marketCap: 58e3, averageVolume: 6e5 },
    { symbol: "DABUR", sector: "Consumer", industry: "FMCG", marketCap: 56e3, averageVolume: 2e6 },
    { symbol: "DLF", sector: "Real Estate", industry: "Real Estate", marketCap: 54e3, averageVolume: 5e6 },
    { symbol: "GAIL", sector: "Energy", industry: "Gas Distribution", marketCap: 52e3, averageVolume: 6e6 },
    { symbol: "GODREJCP", sector: "Consumer", industry: "FMCG", marketCap: 5e4, averageVolume: 15e5 },
    { symbol: "HAVELLS", sector: "Industrials", industry: "Electricals", marketCap: 48e3, averageVolume: 15e5 },
    { symbol: "ICICIPRULI", sector: "Financials", industry: "Insurance", marketCap: 46e3, averageVolume: 2e6 },
    { symbol: "INDIGO", sector: "Industrials", industry: "Aviation", marketCap: 44e3, averageVolume: 15e5 },
    { symbol: "IOC", sector: "Energy", industry: "Oil Refining", marketCap: 42e3, averageVolume: 8e6 },
    { symbol: "IRCTC", sector: "Industrials", industry: "Travel Services", marketCap: 4e4, averageVolume: 2e6 },
    { symbol: "JINDALSTEL", sector: "Materials", industry: "Steel", marketCap: 38e3, averageVolume: 3e6 },
    { symbol: "JUBLFOOD", sector: "Consumer", industry: "QSR", marketCap: 36e3, averageVolume: 15e5 },
    { symbol: "LICI", sector: "Financials", industry: "Insurance", marketCap: 35e4, averageVolume: 5e6 },
    { symbol: "LUPIN", sector: "Healthcare", industry: "Pharma", marketCap: 34e3, averageVolume: 2e6 },
    { symbol: "MARICO", sector: "Consumer", industry: "FMCG", marketCap: 32e3, averageVolume: 2e6 },
    { symbol: "MCDOWELL-N", sector: "Consumer", industry: "Beverages", marketCap: 3e4, averageVolume: 1e6 },
    { symbol: "MUTHOOTFIN", sector: "Financials", industry: "NBFC", marketCap: 28e3, averageVolume: 15e5 },
    { symbol: "NAUKRI", sector: "Technology", industry: "Internet Services", marketCap: 26e3, averageVolume: 5e5 },
    { symbol: "NMDC", sector: "Materials", industry: "Mining", marketCap: 24e3, averageVolume: 5e6 },
    { symbol: "PAGEIND", sector: "Consumer", industry: "Apparel", marketCap: 22e3, averageVolume: 1e5 },
    { symbol: "PIDILITIND", sector: "Materials", industry: "Adhesives", marketCap: 2e4, averageVolume: 6e5 },
    { symbol: "PIIND", sector: "Healthcare", industry: "Agrochemicals", marketCap: 18e3, averageVolume: 4e5 },
    { symbol: "PNB", sector: "Financials", industry: "Public Bank", marketCap: 16e3, averageVolume: 15e6 },
    { symbol: "RECLTD", sector: "Financials", industry: "NBFC", marketCap: 14e3, averageVolume: 5e6 },
    { symbol: "SAIL", sector: "Materials", industry: "Steel", marketCap: 12e3, averageVolume: 1e7 },
    { symbol: "SIEMENS", sector: "Industrials", industry: "Engineering", marketCap: 1e4, averageVolume: 4e5 },
    { symbol: "SRF", sector: "Materials", industry: "Chemicals", marketCap: 9500, averageVolume: 6e5 },
    { symbol: "TORNTPHARM", sector: "Healthcare", industry: "Pharma", marketCap: 9e3, averageVolume: 5e5 },
    { symbol: "TRENT", sector: "Consumer", industry: "Retail", marketCap: 8500, averageVolume: 1e6 },
    { symbol: "UBL", sector: "Consumer", industry: "Beverages", marketCap: 8e3, averageVolume: 4e5 },
    { symbol: "VEDL", sector: "Materials", industry: "Metals & Mining", marketCap: 7500, averageVolume: 8e6 },
    { symbol: "VOLTAS", sector: "Consumer", industry: "Consumer Durables", marketCap: 7e3, averageVolume: 1e6 },
    { symbol: "ZOMATO", sector: "Technology", industry: "Food Delivery", marketCap: 6500, averageVolume: 15e6 },
    { symbol: "PAYTM", sector: "Technology", industry: "Fintech", marketCap: 6e3, averageVolume: 5e6 },
    { symbol: "NYKAA", sector: "Consumer", industry: "E-Commerce", marketCap: 5500, averageVolume: 3e6 },
    { symbol: "POLICYBZR", sector: "Technology", industry: "Insurtech", marketCap: 5e3, averageVolume: 2e6 },
    { symbol: "DELHIVERY", sector: "Industrials", industry: "Logistics", marketCap: 4500, averageVolume: 2e6 },
    // â”€â”€ NIFTY MIDCAP 150 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    { symbol: "ABCAPITAL", sector: "Financials", industry: "NBFC", marketCap: 22e3, averageVolume: 3e6 },
    { symbol: "ABFRL", sector: "Consumer", industry: "Apparel", marketCap: 8e3, averageVolume: 3e6 },
    { symbol: "AIAENG", sector: "Industrials", industry: "Engineering", marketCap: 12e3, averageVolume: 2e5 },
    { symbol: "ALKEM", sector: "Healthcare", industry: "Pharma", marketCap: 14e3, averageVolume: 3e5 },
    { symbol: "APLLTD", sector: "Healthcare", industry: "Pharma", marketCap: 6e3, averageVolume: 5e5 },
    { symbol: "ASTRAL", sector: "Industrials", industry: "Pipes", marketCap: 18e3, averageVolume: 6e5 },
    { symbol: "ATUL", sector: "Materials", industry: "Chemicals", marketCap: 1e4, averageVolume: 1e5 },
    { symbol: "AUBANK", sector: "Financials", industry: "Small Finance Bank", marketCap: 16e3, averageVolume: 2e6 },
    { symbol: "AUROPHARMA", sector: "Healthcare", industry: "Pharma", marketCap: 15e3, averageVolume: 2e6 },
    { symbol: "BALKRISIND", sector: "Auto", industry: "Tyres", marketCap: 14e3, averageVolume: 5e5 },
    { symbol: "BANDHANBNK", sector: "Financials", industry: "Private Bank", marketCap: 13e3, averageVolume: 5e6 },
    { symbol: "BATAINDIA", sector: "Consumer", industry: "Footwear", marketCap: 12e3, averageVolume: 4e5 },
    { symbol: "BEL", sector: "Industrials", industry: "Defence", marketCap: 55e3, averageVolume: 8e6 },
    { symbol: "BHARATFORG", sector: "Auto", industry: "Auto Components", marketCap: 2e4, averageVolume: 15e5 },
    { symbol: "BHEL", sector: "Industrials", industry: "Engineering", marketCap: 25e3, averageVolume: 1e7 },
    { symbol: "BIOCON", sector: "Healthcare", industry: "Biotech", marketCap: 18e3, averageVolume: 3e6 },
    { symbol: "CANBK", sector: "Financials", industry: "Public Bank", marketCap: 22e3, averageVolume: 8e6 },
    { symbol: "CANFINHOME", sector: "Financials", industry: "Housing Finance", marketCap: 8e3, averageVolume: 1e6 },
    { symbol: "CASTROLIND", sector: "Energy", industry: "Lubricants", marketCap: 7e3, averageVolume: 1e6 },
    { symbol: "CEATLTD", sector: "Auto", industry: "Tyres", marketCap: 6e3, averageVolume: 4e5 },
    { symbol: "CGPOWER", sector: "Industrials", industry: "Electricals", marketCap: 3e4, averageVolume: 3e6 },
    { symbol: "COFORGE", sector: "Technology", industry: "IT Services", marketCap: 2e4, averageVolume: 5e5 },
    { symbol: "CONCOR", sector: "Industrials", industry: "Logistics", marketCap: 18e3, averageVolume: 1e6 },
    { symbol: "CROMPTON", sector: "Consumer", industry: "Consumer Durables", marketCap: 12e3, averageVolume: 15e5 },
    { symbol: "CUMMINSIND", sector: "Industrials", industry: "Engines", marketCap: 16e3, averageVolume: 5e5 },
    { symbol: "DEEPAKNTR", sector: "Materials", industry: "Chemicals", marketCap: 14e3, averageVolume: 6e5 },
    { symbol: "DIXON", sector: "Technology", industry: "Electronics Mfg", marketCap: 22e3, averageVolume: 4e5 },
    { symbol: "ESCORTS", sector: "Auto", industry: "Tractors", marketCap: 12e3, averageVolume: 6e5 },
    { symbol: "EXIDEIND", sector: "Auto", industry: "Batteries", marketCap: 1e4, averageVolume: 2e6 },
    { symbol: "FEDERALBNK", sector: "Financials", industry: "Private Bank", marketCap: 18e3, averageVolume: 5e6 },
    { symbol: "FORTIS", sector: "Healthcare", industry: "Hospitals", marketCap: 16e3, averageVolume: 3e6 },
    { symbol: "GLENMARK", sector: "Healthcare", industry: "Pharma", marketCap: 12e3, averageVolume: 15e5 },
    { symbol: "GMRINFRA", sector: "Industrials", industry: "Infrastructure", marketCap: 2e4, averageVolume: 8e6 },
    { symbol: "GODREJPROP", sector: "Real Estate", industry: "Real Estate", marketCap: 18e3, averageVolume: 15e5 },
    { symbol: "GRANULES", sector: "Healthcare", industry: "Pharma", marketCap: 6e3, averageVolume: 15e5 },
    { symbol: "GSPL", sector: "Energy", industry: "Gas Distribution", marketCap: 8e3, averageVolume: 1e6 },
    { symbol: "HDFCAMC", sector: "Financials", industry: "Asset Management", marketCap: 3e4, averageVolume: 5e5 },
    { symbol: "HINDPETRO", sector: "Energy", industry: "Oil Refining", marketCap: 14e3, averageVolume: 4e6 },
    { symbol: "HONAUT", sector: "Industrials", industry: "Automation", marketCap: 12e3, averageVolume: 5e4 },
    { symbol: "IDFCFIRSTB", sector: "Financials", industry: "Private Bank", marketCap: 2e4, averageVolume: 1e7 },
    { symbol: "IGL", sector: "Energy", industry: "Gas Distribution", marketCap: 16e3, averageVolume: 2e6 },
    { symbol: "INDHOTEL", sector: "Consumer", industry: "Hotels", marketCap: 18e3, averageVolume: 3e6 },
    { symbol: "INDUSTOWER", sector: "Telecom", industry: "Tower Infrastructure", marketCap: 22e3, averageVolume: 5e6 },
    { symbol: "INOXWIND", sector: "Utilities", industry: "Wind Energy", marketCap: 8e3, averageVolume: 2e6 },
    { symbol: "IPCALAB", sector: "Healthcare", industry: "Pharma", marketCap: 1e4, averageVolume: 5e5 },
    { symbol: "IRFC", sector: "Financials", industry: "NBFC", marketCap: 35e3, averageVolume: 8e6 },
    { symbol: "JKCEMENT", sector: "Materials", industry: "Cement", marketCap: 12e3, averageVolume: 2e5 },
    { symbol: "JSWENERGY", sector: "Utilities", industry: "Power Generation", marketCap: 2e4, averageVolume: 3e6 },
    { symbol: "JUBILANT", sector: "Healthcare", industry: "Pharma", marketCap: 8e3, averageVolume: 5e5 },
    { symbol: "KAJARIACER", sector: "Materials", industry: "Tiles", marketCap: 8e3, averageVolume: 4e5 },
    { symbol: "KANSAINER", sector: "Consumer", industry: "Paints", marketCap: 6e3, averageVolume: 3e5 },
    { symbol: "KEC", sector: "Industrials", industry: "Power T&D", marketCap: 1e4, averageVolume: 1e6 },
    { symbol: "KPITTECH", sector: "Technology", industry: "Auto Tech", marketCap: 14e3, averageVolume: 1e6 },
    { symbol: "LALPATHLAB", sector: "Healthcare", industry: "Diagnostics", marketCap: 1e4, averageVolume: 3e5 },
    { symbol: "LAURUSLABS", sector: "Healthcare", industry: "Pharma", marketCap: 8e3, averageVolume: 2e6 },
    { symbol: "LICHSGFIN", sector: "Financials", industry: "Housing Finance", marketCap: 12e3, averageVolume: 3e6 },
    { symbol: "LTIM", sector: "Technology", industry: "IT Services", marketCap: 4e4, averageVolume: 8e5 },
    { symbol: "LTTS", sector: "Technology", industry: "Engineering Services", marketCap: 18e3, averageVolume: 4e5 },
    { symbol: "MANAPPURAM", sector: "Financials", industry: "NBFC", marketCap: 8e3, averageVolume: 3e6 },
    { symbol: "MARICO", sector: "Consumer", industry: "FMCG", marketCap: 32e3, averageVolume: 2e6 },
    { symbol: "MAXHEALTH", sector: "Healthcare", industry: "Hospitals", marketCap: 16e3, averageVolume: 15e5 },
    { symbol: "MCX", sector: "Financials", industry: "Exchange", marketCap: 1e4, averageVolume: 5e5 },
    { symbol: "METROPOLIS", sector: "Healthcare", industry: "Diagnostics", marketCap: 8e3, averageVolume: 3e5 },
    { symbol: "MFSL", sector: "Financials", industry: "Insurance", marketCap: 1e4, averageVolume: 5e5 },
    { symbol: "MINDTREE", sector: "Technology", industry: "IT Services", marketCap: 12e3, averageVolume: 6e5 },
    { symbol: "MOTHERSON", sector: "Auto", industry: "Auto Components", marketCap: 3e4, averageVolume: 8e6 },
    { symbol: "MRF", sector: "Auto", industry: "Tyres", marketCap: 22e3, averageVolume: 5e4 },
    { symbol: "MUTHOOTFIN", sector: "Financials", industry: "NBFC", marketCap: 28e3, averageVolume: 15e5 },
    { symbol: "NATCOPHARM", sector: "Healthcare", industry: "Pharma", marketCap: 6e3, averageVolume: 5e5 },
    { symbol: "NBCC", sector: "Industrials", industry: "Construction", marketCap: 1e4, averageVolume: 5e6 },
    { symbol: "NCC", sector: "Industrials", industry: "Construction", marketCap: 8e3, averageVolume: 3e6 },
    { symbol: "NHPC", sector: "Utilities", industry: "Hydro Power", marketCap: 2e4, averageVolume: 8e6 },
    { symbol: "NLCINDIA", sector: "Utilities", industry: "Power Generation", marketCap: 12e3, averageVolume: 3e6 },
    { symbol: "OBEROIRLTY", sector: "Real Estate", industry: "Real Estate", marketCap: 14e3, averageVolume: 8e5 },
    { symbol: "OIL", sector: "Energy", industry: "Oil & Gas", marketCap: 1e4, averageVolume: 2e6 },
    { symbol: "OFSS", sector: "Technology", industry: "Banking Software", marketCap: 3e4, averageVolume: 2e5 },
    { symbol: "PERSISTENT", sector: "Technology", industry: "IT Services", marketCap: 22e3, averageVolume: 4e5 },
    { symbol: "PETRONET", sector: "Energy", industry: "Gas", marketCap: 14e3, averageVolume: 3e6 },
    { symbol: "PFIZER", sector: "Healthcare", industry: "Pharma", marketCap: 8e3, averageVolume: 1e5 },
    { symbol: "PHOENIXLTD", sector: "Real Estate", industry: "Retail Real Estate", marketCap: 16e3, averageVolume: 1e6 },
    { symbol: "POLYCAB", sector: "Industrials", industry: "Cables & Wires", marketCap: 2e4, averageVolume: 6e5 },
    { symbol: "PRESTIGE", sector: "Real Estate", industry: "Real Estate", marketCap: 14e3, averageVolume: 15e5 },
    { symbol: "PRINCEPIPE", sector: "Industrials", industry: "Pipes", marketCap: 6e3, averageVolume: 5e5 },
    { symbol: "PGHH", sector: "Consumer", industry: "FMCG", marketCap: 1e4, averageVolume: 1e5 },
    { symbol: "PVRINOX", sector: "Consumer", industry: "Entertainment", marketCap: 8e3, averageVolume: 1e6 },
    { symbol: "RAMCOCEM", sector: "Materials", industry: "Cement", marketCap: 8e3, averageVolume: 5e5 },
    { symbol: "RBLBANK", sector: "Financials", industry: "Private Bank", marketCap: 8e3, averageVolume: 5e6 },
    { symbol: "SBICARD", sector: "Financials", industry: "Credit Cards", marketCap: 2e4, averageVolume: 2e6 },
    { symbol: "SCHAEFFLER", sector: "Auto", industry: "Bearings", marketCap: 1e4, averageVolume: 2e5 },
    { symbol: "SHYAMMETL", sector: "Materials", industry: "Steel", marketCap: 6e3, averageVolume: 1e6 },
    { symbol: "SKFINDIA", sector: "Auto", industry: "Bearings", marketCap: 8e3, averageVolume: 1e5 },
    { symbol: "SONACOMS", sector: "Auto", industry: "Auto Components", marketCap: 1e4, averageVolume: 1e6 },
    { symbol: "STARHEALTH", sector: "Financials", industry: "Insurance", marketCap: 14e3, averageVolume: 1e6 },
    { symbol: "SUMICHEM", sector: "Materials", industry: "Agrochemicals", marketCap: 8e3, averageVolume: 4e5 },
    { symbol: "SUNDARMFIN", sector: "Financials", industry: "NBFC", marketCap: 12e3, averageVolume: 3e5 },
    { symbol: "SUNDRMFAST", sector: "Auto", industry: "Auto Components", marketCap: 6e3, averageVolume: 2e5 },
    { symbol: "SUNTV", sector: "Consumer", industry: "Media", marketCap: 14e3, averageVolume: 1e6 },
    { symbol: "SUPREMEIND", sector: "Industrials", industry: "Plastics", marketCap: 1e4, averageVolume: 3e5 },
    { symbol: "SYNGENE", sector: "Healthcare", industry: "CRO", marketCap: 12e3, averageVolume: 6e5 },
    { symbol: "TANLA", sector: "Technology", industry: "CPaaS", marketCap: 8e3, averageVolume: 5e5 },
    { symbol: "TATACHEM", sector: "Materials", industry: "Chemicals", marketCap: 14e3, averageVolume: 15e5 },
    { symbol: "TATACOMM", sector: "Telecom", industry: "Data Services", marketCap: 16e3, averageVolume: 5e5 },
    { symbol: "TATAELXSI", sector: "Technology", industry: "Design Services", marketCap: 2e4, averageVolume: 4e5 },
    { symbol: "TATAPOWER", sector: "Utilities", industry: "Power", marketCap: 3e4, averageVolume: 8e6 },
    { symbol: "TEAMLEASE", sector: "Industrials", industry: "Staffing", marketCap: 6e3, averageVolume: 2e5 },
    { symbol: "THERMAX", sector: "Industrials", industry: "Engineering", marketCap: 12e3, averageVolume: 2e5 },
    { symbol: "TIINDIA", sector: "Auto", industry: "Auto Components", marketCap: 1e4, averageVolume: 3e5 },
    { symbol: "TIMKEN", sector: "Auto", industry: "Bearings", marketCap: 8e3, averageVolume: 1e5 },
    { symbol: "TORNTPOWER", sector: "Utilities", industry: "Power", marketCap: 14e3, averageVolume: 1e6 },
    { symbol: "TTKPRESTIG", sector: "Consumer", industry: "Consumer Durables", marketCap: 6e3, averageVolume: 1e5 },
    { symbol: "TVSMOTORS", sector: "Auto", industry: "Two Wheelers", marketCap: 3e4, averageVolume: 15e5 },
    { symbol: "UPL", sector: "Materials", industry: "Agrochemicals", marketCap: 18e3, averageVolume: 5e6 },
    { symbol: "VAIBHAVGBL", sector: "Consumer", industry: "Jewellery", marketCap: 6e3, averageVolume: 2e5 },
    { symbol: "VGUARD", sector: "Consumer", industry: "Consumer Durables", marketCap: 8e3, averageVolume: 5e5 },
    { symbol: "VINATIORGA", sector: "Materials", industry: "Chemicals", marketCap: 8e3, averageVolume: 2e5 },
    { symbol: "WHIRLPOOL", sector: "Consumer", industry: "Consumer Durables", marketCap: 8e3, averageVolume: 2e5 },
    { symbol: "ZEEL", sector: "Consumer", industry: "Media", marketCap: 8e3, averageVolume: 3e6 },
    { symbol: "ZYDUSLIFE", sector: "Healthcare", industry: "Pharma", marketCap: 2e4, averageVolume: 2e6 },
    // â”€â”€ NIFTY SMALLCAP 250 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    { symbol: "AARTIIND", sector: "Materials", industry: "Chemicals", marketCap: 8e3, averageVolume: 1e6 },
    { symbol: "AAVAS", sector: "Financials", industry: "Housing Finance", marketCap: 8e3, averageVolume: 3e5 },
    { symbol: "ABBOTINDIA", sector: "Healthcare", industry: "Pharma", marketCap: 12e3, averageVolume: 1e5 },
    { symbol: "ACCELYA", sector: "Technology", industry: "Aviation Software", marketCap: 4e3, averageVolume: 1e5 },
    { symbol: "ACE", sector: "Industrials", industry: "Cranes", marketCap: 4e3, averageVolume: 5e5 },
    { symbol: "ACRYSIL", sector: "Consumer", industry: "Building Materials", marketCap: 2e3, averageVolume: 2e5 },
    { symbol: "ADANIPOWER", sector: "Utilities", industry: "Power Generation", marketCap: 5e4, averageVolume: 5e6 },
    { symbol: "AEGISLOG", sector: "Industrials", industry: "Logistics", marketCap: 4e3, averageVolume: 3e5 },
    { symbol: "AFFLE", sector: "Technology", industry: "AdTech", marketCap: 8e3, averageVolume: 3e5 },
    { symbol: "AJANTPHARM", sector: "Healthcare", industry: "Pharma", marketCap: 6e3, averageVolume: 2e5 },
    { symbol: "AKZOINDIA", sector: "Materials", industry: "Paints", marketCap: 4e3, averageVolume: 1e5 },
    { symbol: "AMARAJABAT", sector: "Auto", industry: "Batteries", marketCap: 6e3, averageVolume: 5e5 },
    { symbol: "AMBER", sector: "Consumer", industry: "Consumer Durables", marketCap: 6e3, averageVolume: 2e5 },
    { symbol: "AMBUJACEM", sector: "Materials", industry: "Cement", marketCap: 72e3, averageVolume: 4e6 },
    { symbol: "ANGELONE", sector: "Financials", industry: "Broking", marketCap: 1e4, averageVolume: 5e5 },
    { symbol: "ANURAS", sector: "Consumer", industry: "QSR", marketCap: 4e3, averageVolume: 2e5 },
    { symbol: "APARINDS", sector: "Industrials", industry: "Cables", marketCap: 6e3, averageVolume: 2e5 },
    { symbol: "APOLLOTYRE", sector: "Auto", industry: "Tyres", marketCap: 1e4, averageVolume: 2e6 },
    { symbol: "APTUS", sector: "Financials", industry: "Housing Finance", marketCap: 6e3, averageVolume: 5e5 },
    { symbol: "ARVINDFASN", sector: "Consumer", industry: "Apparel", marketCap: 4e3, averageVolume: 5e5 },
    { symbol: "ASAHIINDIA", sector: "Auto", industry: "Auto Glass", marketCap: 4e3, averageVolume: 3e5 },
    { symbol: "ASHOKLEY", sector: "Auto", industry: "Commercial Vehicles", marketCap: 2e4, averageVolume: 5e6 },
    { symbol: "ASKAUTOLTD", sector: "Auto", industry: "Auto Components", marketCap: 2e3, averageVolume: 2e5 },
    { symbol: "ATGL", sector: "Energy", industry: "Gas Distribution", marketCap: 8e3, averageVolume: 5e5 },
    { symbol: "ATUL", sector: "Materials", industry: "Chemicals", marketCap: 1e4, averageVolume: 1e5 },
    { symbol: "AVANTIFEED", sector: "Consumer", industry: "Aquaculture", marketCap: 4e3, averageVolume: 5e5 },
    { symbol: "AXISCADES", sector: "Technology", industry: "Engineering Services", marketCap: 2e3, averageVolume: 2e5 },
    { symbol: "BAJAJHLDNG", sector: "Financials", industry: "Investment", marketCap: 2e4, averageVolume: 1e5 },
    { symbol: "BALRAMCHIN", sector: "Consumer", industry: "Sugar", marketCap: 4e3, averageVolume: 1e6 },
    { symbol: "BASF", sector: "Materials", industry: "Chemicals", marketCap: 6e3, averageVolume: 1e5 },
    { symbol: "BAYERCROP", sector: "Materials", industry: "Agrochemicals", marketCap: 6e3, averageVolume: 1e5 },
    { symbol: "BEML", sector: "Industrials", industry: "Defence", marketCap: 6e3, averageVolume: 3e5 },
    { symbol: "BIKAJI", sector: "Consumer", industry: "FMCG", marketCap: 6e3, averageVolume: 5e5 },
    { symbol: "BLUESTARCO", sector: "Consumer", industry: "Consumer Durables", marketCap: 8e3, averageVolume: 3e5 },
    { symbol: "BORORENEW", sector: "Materials", industry: "Chemicals", marketCap: 2e3, averageVolume: 2e5 },
    { symbol: "BRIGADE", sector: "Real Estate", industry: "Real Estate", marketCap: 8e3, averageVolume: 5e5 },
    { symbol: "BSE", sector: "Financials", industry: "Exchange", marketCap: 1e4, averageVolume: 5e5 },
    { symbol: "BSOFT", sector: "Technology", industry: "Healthcare IT", marketCap: 4e3, averageVolume: 5e5 },
    { symbol: "CAMPUS", sector: "Consumer", industry: "Footwear", marketCap: 4e3, averageVolume: 5e5 },
    { symbol: "CAPLIPOINT", sector: "Healthcare", industry: "Pharma", marketCap: 4e3, averageVolume: 2e5 },
    { symbol: "CARBORUNIV", sector: "Industrials", industry: "Abrasives", marketCap: 4e3, averageVolume: 2e5 },
    { symbol: "CDSL", sector: "Financials", industry: "Depository", marketCap: 12e3, averageVolume: 1e6 },
    { symbol: "CENTURYPLY", sector: "Materials", industry: "Plywood", marketCap: 6e3, averageVolume: 5e5 },
    { symbol: "CENTURYTEX", sector: "Consumer", industry: "Textiles", marketCap: 4e3, averageVolume: 3e5 },
    { symbol: "CERA", sector: "Materials", industry: "Sanitaryware", marketCap: 4e3, averageVolume: 1e5 },
    { symbol: "CHALET", sector: "Consumer", industry: "Hotels", marketCap: 6e3, averageVolume: 5e5 },
    { symbol: "CHAMBLFERT", sector: "Materials", industry: "Fertilizers", marketCap: 4e3, averageVolume: 1e6 },
    { symbol: "CLEAN", sector: "Industrials", industry: "Waste Management", marketCap: 4e3, averageVolume: 3e5 },
    { symbol: "CMSINFO", sector: "Industrials", industry: "Cash Logistics", marketCap: 4e3, averageVolume: 3e5 },
    { symbol: "COCHINSHIP", sector: "Industrials", industry: "Shipbuilding", marketCap: 6e3, averageVolume: 5e5 },
    { symbol: "CRAFTSMAN", sector: "Auto", industry: "Auto Components", marketCap: 4e3, averageVolume: 1e5 },
    { symbol: "CRISIL", sector: "Financials", industry: "Rating Agency", marketCap: 8e3, averageVolume: 1e5 },
    { symbol: "CYIENT", sector: "Technology", industry: "Engineering Services", marketCap: 8e3, averageVolume: 3e5 },
    { symbol: "DATAPATTNS", sector: "Technology", industry: "Defence Electronics", marketCap: 6e3, averageVolume: 1e5 },
    { symbol: "DCMSHRIRAM", sector: "Materials", industry: "Chemicals", marketCap: 4e3, averageVolume: 3e5 },
    { symbol: "DELHIVERY", sector: "Industrials", industry: "Logistics", marketCap: 4500, averageVolume: 2e6 },
    { symbol: "DELTACORP", sector: "Consumer", industry: "Gaming", marketCap: 4e3, averageVolume: 1e6 },
    { symbol: "DEVYANI", sector: "Consumer", industry: "QSR", marketCap: 6e3, averageVolume: 1e6 },
    { symbol: "DHANI", sector: "Financials", industry: "Fintech", marketCap: 2e3, averageVolume: 1e6 },
    { symbol: "DHANUKA", sector: "Materials", industry: "Agrochemicals", marketCap: 4e3, averageVolume: 2e5 },
    { symbol: "DOMS", sector: "Consumer", industry: "Stationery", marketCap: 4e3, averageVolume: 2e5 },
    { symbol: "EASEMYTRIP", sector: "Technology", industry: "Travel Tech", marketCap: 4e3, averageVolume: 1e6 },
    { symbol: "EIDPARRY", sector: "Consumer", industry: "Sugar", marketCap: 4e3, averageVolume: 5e5 },
    { symbol: "ELECON", sector: "Industrials", industry: "Gears", marketCap: 4e3, averageVolume: 3e5 },
    { symbol: "ELGIEQUIP", sector: "Industrials", industry: "Compressors", marketCap: 6e3, averageVolume: 3e5 },
    { symbol: "EMAMILTD", sector: "Consumer", industry: "FMCG", marketCap: 8e3, averageVolume: 5e5 },
    { symbol: "ENGINERSIN", sector: "Industrials", industry: "Engineering", marketCap: 6e3, averageVolume: 5e5 },
    { symbol: "EPL", sector: "Industrials", industry: "Packaging", marketCap: 4e3, averageVolume: 5e5 },
    { symbol: "EQUITASBNK", sector: "Financials", industry: "Small Finance Bank", marketCap: 4e3, averageVolume: 2e6 },
    { symbol: "ESTER", sector: "Materials", industry: "Chemicals", marketCap: 2e3, averageVolume: 2e5 },
    { symbol: "ETHOS", sector: "Consumer", industry: "Luxury Retail", marketCap: 4e3, averageVolume: 1e5 },
    { symbol: "FINEORG", sector: "Materials", industry: "Specialty Chemicals", marketCap: 4e3, averageVolume: 1e5 },
    { symbol: "FINPIPE", sector: "Industrials", industry: "Pipes", marketCap: 2e3, averageVolume: 2e5 },
    { symbol: "FLAIR", sector: "Consumer", industry: "Stationery", marketCap: 2e3, averageVolume: 2e5 },
    { symbol: "FLUOROCHEM", sector: "Materials", industry: "Fluorochemicals", marketCap: 6e3, averageVolume: 2e5 },
    { symbol: "FMGOETZE", sector: "Auto", industry: "Auto Components", marketCap: 4e3, averageVolume: 1e5 },
    { symbol: "GABRIEL", sector: "Auto", industry: "Shock Absorbers", marketCap: 2e3, averageVolume: 3e5 },
    { symbol: "GALAXYSURF", sector: "Materials", industry: "Surfactants", marketCap: 4e3, averageVolume: 1e5 },
    { symbol: "GARFIBRES", sector: "Materials", industry: "Textiles", marketCap: 2e3, averageVolume: 1e5 },
    { symbol: "GESHIP", sector: "Industrials", industry: "Shipping", marketCap: 4e3, averageVolume: 3e5 },
    { symbol: "GHCL", sector: "Materials", industry: "Chemicals", marketCap: 4e3, averageVolume: 5e5 },
    { symbol: "GILLETTE", sector: "Consumer", industry: "FMCG", marketCap: 4e3, averageVolume: 5e4 },
    { symbol: "GLAXO", sector: "Healthcare", industry: "Pharma", marketCap: 6e3, averageVolume: 1e5 },
    { symbol: "GLOBUSSPR", sector: "Consumer", industry: "Apparel", marketCap: 2e3, averageVolume: 2e5 },
    { symbol: "GNFC", sector: "Materials", industry: "Fertilizers", marketCap: 4e3, averageVolume: 5e5 },
    { symbol: "GODFRYPHLP", sector: "Consumer", industry: "Tobacco", marketCap: 4e3, averageVolume: 1e5 },
    { symbol: "GODREJAGRO", sector: "Materials", industry: "Agrochemicals", marketCap: 4e3, averageVolume: 2e5 },
    { symbol: "GODREJIND", sector: "Consumer", industry: "Diversified", marketCap: 6e3, averageVolume: 3e5 },
    { symbol: "GPIL", sector: "Materials", industry: "Steel", marketCap: 4e3, averageVolume: 3e5 },
    { symbol: "GREAVESCOT", sector: "Industrials", industry: "Engines", marketCap: 4e3, averageVolume: 5e5 },
    { symbol: "GREENPANEL", sector: "Materials", industry: "Wood Panels", marketCap: 4e3, averageVolume: 5e5 },
    { symbol: "GRINDWELL", sector: "Industrials", industry: "Abrasives", marketCap: 6e3, averageVolume: 1e5 },
    { symbol: "GUJGASLTD", sector: "Energy", industry: "Gas Distribution", marketCap: 8e3, averageVolume: 1e6 },
    { symbol: "GULFOILLUB", sector: "Energy", industry: "Lubricants", marketCap: 2e3, averageVolume: 1e5 },
    { symbol: "HAPPSTMNDS", sector: "Technology", industry: "IT Services", marketCap: 6e3, averageVolume: 3e5 },
    { symbol: "HATSUN", sector: "Consumer", industry: "Dairy", marketCap: 6e3, averageVolume: 1e5 },
    { symbol: "HBLPOWER", sector: "Industrials", industry: "Batteries", marketCap: 4e3, averageVolume: 5e5 },
    { symbol: "HFCL", sector: "Technology", industry: "Telecom Equipment", marketCap: 6e3, averageVolume: 3e6 },
    { symbol: "HIKAL", sector: "Materials", industry: "Chemicals", marketCap: 4e3, averageVolume: 3e5 },
    { symbol: "HINDCOPPER", sector: "Materials", industry: "Copper", marketCap: 6e3, averageVolume: 3e6 },
    { symbol: "HINDWAREAP", sector: "Consumer", industry: "Building Materials", marketCap: 4e3, averageVolume: 2e5 },
    { symbol: "HOMEFIRST", sector: "Financials", industry: "Housing Finance", marketCap: 4e3, averageVolume: 3e5 },
    { symbol: "HUDCO", sector: "Financials", industry: "Housing Finance", marketCap: 8e3, averageVolume: 3e6 },
    { symbol: "IBREALEST", sector: "Real Estate", industry: "Real Estate", marketCap: 4e3, averageVolume: 2e6 },
    { symbol: "ICICIGI", sector: "Financials", industry: "Insurance", marketCap: 2e4, averageVolume: 1e6 },
    { symbol: "IDBI", sector: "Financials", industry: "Public Bank", marketCap: 2e4, averageVolume: 5e6 },
    { symbol: "IFBIND", sector: "Consumer", industry: "Consumer Durables", marketCap: 4e3, averageVolume: 1e5 },
    { symbol: "IIFL", sector: "Financials", industry: "NBFC", marketCap: 8e3, averageVolume: 1e6 },
    { symbol: "IIFLFIN", sector: "Financials", industry: "NBFC", marketCap: 6e3, averageVolume: 1e6 },
    { symbol: "IMAGICAA", sector: "Consumer", industry: "Entertainment", marketCap: 2e3, averageVolume: 5e5 },
    { symbol: "INDIAMART", sector: "Technology", industry: "B2B Marketplace", marketCap: 1e4, averageVolume: 2e5 },
    { symbol: "INDIANB", sector: "Financials", industry: "Public Bank", marketCap: 1e4, averageVolume: 3e6 },
    { symbol: "INDIACEM", sector: "Materials", industry: "Cement", marketCap: 4e3, averageVolume: 1e6 },
    { symbol: "INDIGOPNTS", sector: "Consumer", industry: "Paints", marketCap: 4e3, averageVolume: 2e5 },
    { symbol: "INOXGREEN", sector: "Utilities", industry: "Wind Energy", marketCap: 4e3, averageVolume: 5e5 },
    { symbol: "INTELLECT", sector: "Technology", industry: "Banking Software", marketCap: 6e3, averageVolume: 3e5 },
    { symbol: "IONEXCHANG", sector: "Materials", industry: "Chemicals", marketCap: 4e3, averageVolume: 2e5 },
    { symbol: "IRB", sector: "Industrials", industry: "Roads", marketCap: 8e3, averageVolume: 2e6 },
    { symbol: "IRCON", sector: "Industrials", industry: "Railways", marketCap: 8e3, averageVolume: 2e6 },
    { symbol: "ITDCEM", sector: "Industrials", industry: "Construction", marketCap: 4e3, averageVolume: 5e5 },
    { symbol: "JBCHEPHARM", sector: "Healthcare", industry: "Pharma", marketCap: 4e3, averageVolume: 2e5 },
    { symbol: "JBMA", sector: "Auto", industry: "Auto Components", marketCap: 4e3, averageVolume: 2e5 },
    { symbol: "JKIL", sector: "Industrials", industry: "Construction", marketCap: 4e3, averageVolume: 3e5 },
    { symbol: "JKLAKSHMI", sector: "Materials", industry: "Cement", marketCap: 4e3, averageVolume: 3e5 },
    { symbol: "JKPAPER", sector: "Materials", industry: "Paper", marketCap: 4e3, averageVolume: 3e5 },
    { symbol: "JMFINANCIL", sector: "Financials", industry: "Investment Banking", marketCap: 4e3, averageVolume: 5e5 },
    { symbol: "JSWINFRA", sector: "Industrials", industry: "Ports", marketCap: 1e4, averageVolume: 1e6 },
    { symbol: "JTEKTINDIA", sector: "Auto", industry: "Steering Systems", marketCap: 4e3, averageVolume: 3e5 },
    { symbol: "JUSTDIAL", sector: "Technology", industry: "Local Search", marketCap: 4e3, averageVolume: 3e5 },
    { symbol: "KALYANKJIL", sector: "Consumer", industry: "Jewellery", marketCap: 8e3, averageVolume: 2e6 },
    { symbol: "KANSAINER", sector: "Consumer", industry: "Paints", marketCap: 6e3, averageVolume: 3e5 },
    { symbol: "KAYNES", sector: "Technology", industry: "Electronics Mfg", marketCap: 6e3, averageVolume: 2e5 },
    { symbol: "KFINTECH", sector: "Financials", industry: "Registrar", marketCap: 6e3, averageVolume: 5e5 },
    { symbol: "KIMS", sector: "Healthcare", industry: "Hospitals", marketCap: 6e3, averageVolume: 3e5 },
    { symbol: "KIRLOSENG", sector: "Industrials", industry: "Pumps", marketCap: 4e3, averageVolume: 2e5 },
    { symbol: "KNRCON", sector: "Industrials", industry: "Roads", marketCap: 4e3, averageVolume: 3e5 },
    { symbol: "KRBL", sector: "Consumer", industry: "Food", marketCap: 4e3, averageVolume: 3e5 },
    { symbol: "KSCL", sector: "Materials", industry: "Seeds", marketCap: 4e3, averageVolume: 2e5 },
    { symbol: "LATENTVIEW", sector: "Technology", industry: "Data Analytics", marketCap: 6e3, averageVolume: 5e5 },
    { symbol: "LEMONTREE", sector: "Consumer", industry: "Hotels", marketCap: 4e3, averageVolume: 1e6 },
    { symbol: "LXCHEM", sector: "Materials", industry: "Chemicals", marketCap: 4e3, averageVolume: 2e5 },
    { symbol: "MAHINDCIE", sector: "Auto", industry: "Auto Components", marketCap: 6e3, averageVolume: 5e5 },
    { symbol: "MAHLIFE", sector: "Real Estate", industry: "Real Estate", marketCap: 4e3, averageVolume: 3e5 },
    { symbol: "MAHLOG", sector: "Industrials", industry: "Logistics", marketCap: 4e3, averageVolume: 3e5 },
    { symbol: "MAPMYINDIA", sector: "Technology", industry: "Mapping", marketCap: 6e3, averageVolume: 2e5 },
    { symbol: "MASTEK", sector: "Technology", industry: "IT Services", marketCap: 4e3, averageVolume: 2e5 },
    { symbol: "MEDANTA", sector: "Healthcare", industry: "Hospitals", marketCap: 6e3, averageVolume: 3e5 },
    { symbol: "MEDPLUS", sector: "Healthcare", industry: "Pharmacy Retail", marketCap: 4e3, averageVolume: 3e5 },
    { symbol: "METROBRAND", sector: "Consumer", industry: "Footwear", marketCap: 4e3, averageVolume: 3e5 },
    { symbol: "MHRIL", sector: "Consumer", industry: "Hospitality", marketCap: 2e3, averageVolume: 2e5 },
    { symbol: "MIDHANI", sector: "Industrials", industry: "Defence", marketCap: 4e3, averageVolume: 5e5 },
    { symbol: "MMTC", sector: "Industrials", industry: "Trading", marketCap: 4e3, averageVolume: 2e6 },
    { symbol: "MOIL", sector: "Materials", industry: "Manganese", marketCap: 4e3, averageVolume: 1e6 },
    { symbol: "MOREPENLAB", sector: "Healthcare", industry: "Pharma", marketCap: 2e3, averageVolume: 5e5 },
    { symbol: "MPHASIS", sector: "Technology", industry: "IT Services", marketCap: 2e4, averageVolume: 5e5 },
    { symbol: "MRPL", sector: "Energy", industry: "Oil Refining", marketCap: 6e3, averageVolume: 2e6 },
    { symbol: "MSTCLTD", sector: "Technology", industry: "E-Commerce", marketCap: 2e3, averageVolume: 3e5 },
    { symbol: "NAVA", sector: "Utilities", industry: "Power", marketCap: 4e3, averageVolume: 5e5 },
    { symbol: "NAVINFLUOR", sector: "Materials", industry: "Fluorochemicals", marketCap: 6e3, averageVolume: 2e5 },
    { symbol: "NESCO", sector: "Real Estate", industry: "Exhibition Centre", marketCap: 4e3, averageVolume: 1e5 },
    { symbol: "NETWORK18", sector: "Consumer", industry: "Media", marketCap: 4e3, averageVolume: 2e6 },
    { symbol: "NEWGEN", sector: "Technology", industry: "Enterprise Software", marketCap: 4e3, averageVolume: 2e5 },
    { symbol: "NIITLTD", sector: "Technology", industry: "IT Training", marketCap: 2e3, averageVolume: 5e5 },
    { symbol: "NSLNISP", sector: "Materials", industry: "Steel", marketCap: 4e3, averageVolume: 5e5 },
    { symbol: "NUVOCO", sector: "Materials", industry: "Cement", marketCap: 4e3, averageVolume: 3e5 },
    { symbol: "OLECTRA", sector: "Auto", industry: "Electric Buses", marketCap: 6e3, averageVolume: 5e5 },
    { symbol: "OMAXE", sector: "Real Estate", industry: "Real Estate", marketCap: 2e3, averageVolume: 3e5 },
    { symbol: "ORIENTCEM", sector: "Materials", industry: "Cement", marketCap: 4e3, averageVolume: 5e5 },
    { symbol: "ORIENTELEC", sector: "Consumer", industry: "Consumer Durables", marketCap: 2e3, averageVolume: 3e5 },
    { symbol: "PATELENG", sector: "Industrials", industry: "Construction", marketCap: 2e3, averageVolume: 3e5 },
    { symbol: "PATANJALI", sector: "Consumer", industry: "FMCG", marketCap: 6e3, averageVolume: 5e5 },
    { symbol: "PCBL", sector: "Materials", industry: "Carbon Black", marketCap: 4e3, averageVolume: 5e5 },
    { symbol: "PDSL", sector: "Technology", industry: "IT Services", marketCap: 2e3, averageVolume: 2e5 },
    { symbol: "PENIND", sector: "Industrials", industry: "Pipes", marketCap: 2e3, averageVolume: 3e5 },
    { symbol: "PNBHOUSING", sector: "Financials", industry: "Housing Finance", marketCap: 8e3, averageVolume: 1e6 },
    { symbol: "POKARNA", sector: "Materials", industry: "Granite", marketCap: 2e3, averageVolume: 1e5 },
    { symbol: "POLYMED", sector: "Healthcare", industry: "Medical Devices", marketCap: 4e3, averageVolume: 2e5 },
    { symbol: "POONAWALLA", sector: "Financials", industry: "NBFC", marketCap: 8e3, averageVolume: 1e6 },
    { symbol: "POWERMECH", sector: "Industrials", industry: "Power Services", marketCap: 4e3, averageVolume: 2e5 },
    { symbol: "PRAXIS", sector: "Healthcare", industry: "Hospitals", marketCap: 2e3, averageVolume: 2e5 },
    { symbol: "PRICOLLTD", sector: "Auto", industry: "Auto Components", marketCap: 2e3, averageVolume: 2e5 },
    { symbol: "PRIMESECU", sector: "Financials", industry: "Broking", marketCap: 2e3, averageVolume: 2e5 },
    { symbol: "PRIVISCL", sector: "Industrials", industry: "Cables", marketCap: 2e3, averageVolume: 2e5 },
    { symbol: "PRUDENT", sector: "Financials", industry: "Wealth Management", marketCap: 4e3, averageVolume: 2e5 },
    { symbol: "PTCIL", sector: "Utilities", industry: "Power Trading", marketCap: 4e3, averageVolume: 1e6 },
    { symbol: "PURVA", sector: "Real Estate", industry: "Real Estate", marketCap: 4e3, averageVolume: 5e5 },
    { symbol: "RADICO", sector: "Consumer", industry: "Beverages", marketCap: 6e3, averageVolume: 3e5 },
    { symbol: "RAILTEL", sector: "Technology", industry: "Telecom", marketCap: 6e3, averageVolume: 1e6 },
    { symbol: "RAJRATAN", sector: "Materials", industry: "Steel Wire", marketCap: 2e3, averageVolume: 1e5 },
    { symbol: "RALLIS", sector: "Materials", industry: "Agrochemicals", marketCap: 4e3, averageVolume: 3e5 },
    { symbol: "RATNAMANI", sector: "Materials", industry: "Steel Pipes", marketCap: 6e3, averageVolume: 2e5 },
    { symbol: "RAYMOND", sector: "Consumer", industry: "Textiles", marketCap: 6e3, averageVolume: 5e5 },
    { symbol: "REDINGTON", sector: "Technology", industry: "IT Distribution", marketCap: 6e3, averageVolume: 1e6 },
    { symbol: "RELAXO", sector: "Consumer", industry: "Footwear", marketCap: 6e3, averageVolume: 3e5 },
    { symbol: "RITES", sector: "Industrials", industry: "Consulting", marketCap: 6e3, averageVolume: 5e5 },
    { symbol: "RKFORGE", sector: "Auto", industry: "Forgings", marketCap: 4e3, averageVolume: 2e5 },
    { symbol: "ROSSARI", sector: "Materials", industry: "Specialty Chemicals", marketCap: 4e3, averageVolume: 2e5 },
    { symbol: "ROUTE", sector: "Technology", industry: "Messaging", marketCap: 4e3, averageVolume: 2e5 },
    { symbol: "RPGLIFE", sector: "Healthcare", industry: "Pharma", marketCap: 2e3, averageVolume: 1e5 },
    { symbol: "RPOWER", sector: "Utilities", industry: "Power", marketCap: 4e3, averageVolume: 5e6 },
    { symbol: "RVNL", sector: "Industrials", industry: "Railways", marketCap: 2e4, averageVolume: 5e6 },
    { symbol: "SAFARI", sector: "Consumer", industry: "Luggage", marketCap: 4e3, averageVolume: 2e5 },
    { symbol: "SAREGAMA", sector: "Consumer", industry: "Music", marketCap: 4e3, averageVolume: 2e5 },
    { symbol: "SBFC", sector: "Financials", industry: "NBFC", marketCap: 4e3, averageVolume: 5e5 },
    { symbol: "SEQUENT", sector: "Healthcare", industry: "Pharma", marketCap: 4e3, averageVolume: 5e5 },
    { symbol: "SHARDACROP", sector: "Materials", industry: "Agrochemicals", marketCap: 4e3, averageVolume: 2e5 },
    { symbol: "SHILPAMED", sector: "Healthcare", industry: "Medical Devices", marketCap: 4e3, averageVolume: 2e5 },
    { symbol: "SHOPERSTOP", sector: "Consumer", industry: "Retail", marketCap: 4e3, averageVolume: 3e5 },
    { symbol: "SHRIRAMEPC", sector: "Industrials", industry: "EPC", marketCap: 4e3, averageVolume: 3e5 },
    { symbol: "SHRIRAMFIN", sector: "Financials", industry: "NBFC", marketCap: 3e4, averageVolume: 2e6 },
    { symbol: "SIGNATURE", sector: "Financials", industry: "NBFC", marketCap: 2e3, averageVolume: 2e5 },
    { symbol: "SJVN", sector: "Utilities", industry: "Hydro Power", marketCap: 1e4, averageVolume: 3e6 },
    { symbol: "SMLISUZU", sector: "Auto", industry: "Commercial Vehicles", marketCap: 2e3, averageVolume: 1e5 },
    { symbol: "SOBHA", sector: "Real Estate", industry: "Real Estate", marketCap: 6e3, averageVolume: 5e5 },
    { symbol: "SOLARA", sector: "Healthcare", industry: "Pharma", marketCap: 2e3, averageVolume: 2e5 },
    { symbol: "SPARC", sector: "Healthcare", industry: "Pharma", marketCap: 4e3, averageVolume: 5e5 },
    { symbol: "SPANDANA", sector: "Financials", industry: "Microfinance", marketCap: 4e3, averageVolume: 3e5 },
    { symbol: "SPECIALITY", sector: "Healthcare", industry: "Hospitals", marketCap: 2e3, averageVolume: 2e5 },
    { symbol: "SPENCERS", sector: "Consumer", industry: "Retail", marketCap: 2e3, averageVolume: 3e5 },
    { symbol: "SPORTKING", sector: "Consumer", industry: "Textiles", marketCap: 2e3, averageVolume: 1e5 },
    { symbol: "SRINDUS", sector: "Industrials", industry: "Cables", marketCap: 2e3, averageVolume: 2e5 },
    { symbol: "STLTECH", sector: "Technology", industry: "Optical Fibre", marketCap: 4e3, averageVolume: 1e6 },
    { symbol: "SUBROS", sector: "Auto", industry: "Auto Components", marketCap: 2e3, averageVolume: 2e5 },
    { symbol: "SUDARSCHEM", sector: "Materials", industry: "Chemicals", marketCap: 4e3, averageVolume: 2e5 },
    { symbol: "SUPRIYA", sector: "Healthcare", industry: "Pharma", marketCap: 4e3, averageVolume: 2e5 },
    { symbol: "SURYAROSNI", sector: "Industrials", industry: "Lighting", marketCap: 4e3, averageVolume: 3e5 },
    { symbol: "SUZLON", sector: "Utilities", industry: "Wind Energy", marketCap: 2e4, averageVolume: 1e7 },
    { symbol: "SWSOLAR", sector: "Utilities", industry: "Solar EPC", marketCap: 4e3, averageVolume: 5e5 },
    { symbol: "SYMPHONY", sector: "Consumer", industry: "Consumer Durables", marketCap: 4e3, averageVolume: 2e5 }
  ];
  setFallbackUniverse(NSE_STOCK_UNIVERSE.map((s) => ({
    ...s,
    name: s.symbol,
    exchange: "NSE",
    instrumentKey: `NSE_EQ|${s.symbol}`
  })));
  const createUltraQuantUniverse = () => getUniverse().map((s) => ({
    symbol: s.symbol,
    sector: s.sector,
    industry: s.industry,
    marketCap: s.marketCap,
    averageVolume: s.averageVolume
  }));
  const buildReturns = (prices) => {
    const returns = [];
    for (let index = 1; index < prices.length; index++) {
      returns.push((prices[index] - prices[index - 1]) / prices[index - 1]);
    }
    return returns;
  };
  const buildEma = (values, period) => {
    if (!values.length) return [];
    const multiplier = 2 / (period + 1);
    const ema = [values[0]];
    for (let index = 1; index < values.length; index++) {
      ema.push((values[index] - ema[index - 1]) * multiplier + ema[index - 1]);
    }
    return ema;
  };
  const calculateSlope = (values) => {
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
  const calculateVolatility = (returns) => {
    if (returns.length < 2) return 0;
    const mean = average(returns);
    const variance = average(returns.map((item) => Math.pow(item - mean, 2)));
    return Math.sqrt(variance);
  };
  const calculateMaxDrawdown = (prices) => {
    if (!prices.length) return 0;
    let peak = prices[0];
    let maxDrawdown = 0;
    for (const price of prices) {
      peak = Math.max(peak, price);
      maxDrawdown = Math.max(maxDrawdown, (peak - price) / peak);
    }
    return maxDrawdown * 100;
  };
  const calculateVolumeProfile = (candles, binSize) => {
    const volumeAtPrice = /* @__PURE__ */ new Map();
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
  const calculateAtr = (candles, period) => {
    if (candles.length < 2) {
      return 0;
    }
    const startIndex = Math.max(1, candles.length - period);
    const trueRanges = [];
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
  const relativePenalty = (value, target) => {
    if (target <= 0) {
      return 0;
    }
    return Math.abs(value - target) / target;
  };
  const normalizeScore = (value, min, max) => {
    if (max === min) {
      return value > 0 ? 100 : 50;
    }
    return clamp((value - min) / (max - min)) * 100;
  };
  const createOrderBook = (symbol, lastPrice) => {
    const random = seededGenerator(symbolSeed(symbol) * 31);
    const bids = Array.from({ length: 10 }, (_, index) => ({
      price: Number((lastPrice - (index + 1) * 0.35).toFixed(2)),
      volume: Math.round(2500 + random() * 9e3 * (index === 0 ? 1.8 : 1))
    }));
    const asks = Array.from({ length: 10 }, (_, index) => ({
      price: Number((lastPrice + (index + 1) * 0.35).toFixed(2)),
      volume: Math.round(2200 + random() * 7e3 * (index === 0 ? 0.9 : 1))
    }));
    return { bids, asks };
  };
  const analyzeUltraQuantProfile = (profile, request) => {
    const random = seededGenerator(symbolSeed(profile.symbol));
    const totalDays = Math.max(260, request.historicalPeriodYears * 252);
    const sectorDrift = {
      Technology: 165e-5,
      Financials: 12e-4,
      Energy: 11e-4,
      Healthcare: 145e-5,
      Consumer: 115e-5,
      Industrials: 105e-5,
      Telecom: 1e-3,
      Materials: 95e-5
    }[profile.sector] ?? 1e-3;
    const candles = [];
    let close = 80 + random() * 1800;
    for (let day = 0; day < totalDays; day++) {
      const open = close;
      const drift = sectorDrift + Math.sin(day / 31 + random()) * 6e-3 + (random() - 0.5) * 0.05;
      close = Math.max(20, close * (1 + drift));
      const high = Math.max(open, close) * (1 + 2e-3 + random() * 0.02);
      const low = Math.min(open, close) * (1 - 2e-3 - random() * 0.018);
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
    const priceChange1m = closes.length > 1 ? (endPrice - closes[closes.length - 2]) / closes[closes.length - 2] * 100 : 0;
    const priceChange5m = closes.length > 5 ? (endPrice - closes[closes.length - 6]) / closes[closes.length - 6] * 100 : 0;
    const recentVolumeRatio = average(candles.slice(-10).map((candle) => candle.volume)) / Math.max(1, average(candles.slice(-50).map((candle) => candle.volume)));
    const vwap = candles.slice(-50).reduce((sum, candle) => sum + candle.close * candle.volume, 0) / Math.max(1, candles.slice(-50).reduce((sum, candle) => sum + candle.volume, 0));
    const vwapDistance = (endPrice - vwap) / Math.max(vwap, 1) * 100;
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
    const alignmentSpread = (ema20Last - ema50Last + (ema50Last - ema200Last)) / Math.max(endPrice, 1);
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
    const hedgeBreakoutRaw = 0.45 * clamp((breakoutAboveHigh - 0.985) / 0.06) + 0.35 * clamp((recentVolumeRatio - 1) / 2.2) + 0.2 * volatilityCompression;
    const fullVolumeProfile = calculateVolumeProfile(candles, Math.max(1, endPrice * 25e-4));
    const liquidityClusters = [
      { type: "Support Cluster", price: orderBook.bids[0].price, strength: "High" },
      { type: "Resistance Cluster", price: orderBook.asks[0].price, strength: "Medium" },
      { type: "Liquidity Gap", price: Number((endPrice * 1.012).toFixed(2)), strength: "Watch" }
    ];
    const regimeScore = marketRegime === "Trending" ? 0.9 : marketRegime === "High Volatility" ? 0.4 : 0.55;
    const stateScore = marketState === "Breakout" ? 0.95 : marketState === "Accumulation" ? 0.82 : marketState === "Distribution" ? 0.18 : 0.5;
    const lstmScore = clamp((lstmPredictedPrice / Math.max(endPrice, 1) - 0.96) / 0.12);
    const finalPredictionScore = (0.3 * gradientBoost + 0.25 * lstmScore + 0.2 * regimeScore + 0.15 * stateScore + 0.1 * (sentimentScore / 100)) * 100;
    const score = (0.35 * clamp(cagr / 40) + 0.2 * clamp((momentum - 1) / 1.5) + 0.2 * clamp(Math.abs(trendStrength) * 8) + 0.15 * (1 - Math.min(maxDrawdown / 100, 1)) + 0.1 * clamp(volumeGrowth / 2.5)) * 100;
    const drawdownProbability = clamp(volatility * 2.2 + maxDrawdown / 100 * 0.6) * 100;
    const stopLossDistance = Math.max(endPrice * Math.max(volatility, 0.01), endPrice * 0.015);
    const positionSize = 1e6 * (request.riskPercentage / 100) / stopLossDistance;
    const alerts = [
      gradientBoost > 0.7 ? { stockSymbol: profile.symbol, signalType: "AI_BULLISH", confidenceScore: Number((gradientBoost * 100).toFixed(2)), timestamp: (/* @__PURE__ */ new Date()).toISOString() } : null,
      recentVolumeRatio > 1.4 ? { stockSymbol: profile.symbol, signalType: "MOMENTUM_SCANNER", confidenceScore: Number(Math.min(99, recentVolumeRatio * 35).toFixed(2)), timestamp: (/* @__PURE__ */ new Date()).toISOString() } : null,
      breakoutFrequency > 0.12 ? { stockSymbol: profile.symbol, signalType: "VOLATILITY_BREAKOUT", confidenceScore: Number(Math.min(99, breakoutFrequency * 600).toFixed(2)), timestamp: (/* @__PURE__ */ new Date()).toISOString() } : null,
      orderImbalance > 2.5 ? { stockSymbol: profile.symbol, signalType: "ORDER_FLOW_ACCUMULATION", confidenceScore: Number(Math.min(99, 50 + (orderImbalance - 2.5) * 10).toFixed(2)), timestamp: (/* @__PURE__ */ new Date()).toISOString() } : null
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
  const buildHedgeFundSignalDashboard = (analyzedUniverse, request) => {
    const filtered = analyzedUniverse.filter((item) => {
      const sectorMatches = request.sectorFilter === "ALL" || !request.sectorFilter || item.sector === request.sectorFilter;
      return sectorMatches && item.marketCap >= request.minMarketCap && item.marketCap <= request.maxMarketCap && (item.hedgeFactors?.averageVolume ?? 0) >= request.minVolume && (item.hedgeFactors?.volatilityQualityRaw ?? 0) >= clamp(1 - request.volatilityThreshold * 2);
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
    }, /* @__PURE__ */ new Map())).reduce((accumulator, [sector, values]) => {
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
    const rankings = filtered.map((item) => {
      const momentumScore = normalizeScore(item.hedgeFactors.momentumRaw, momentumMin, momentumMax);
      const trendScore = item.hedgeFactors.trendRaw * 100;
      const volumeScore = normalizeScore(item.hedgeFactors.volumeRaw, volumeMin, volumeMax);
      const volatilityScore = item.hedgeFactors.volatilityQualityRaw * 100;
      const sectorScore = sectorScores[item.sector] ?? 50;
      const institutionalScore = normalizeScore(item.hedgeFactors.institutionalRaw, institutionalMin, institutionalMax);
      const breakoutScore = normalizeScore(item.hedgeFactors.breakoutRaw, breakoutMin, breakoutMax);
      const finalScore = 0.25 * momentumScore + 0.2 * trendScore + 0.15 * volumeScore + 0.1 * volatilityScore + 0.1 * sectorScore + 0.1 * institutionalScore + 0.1 * breakoutScore;
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
    }).sort((left, right) => right.finalScore - left.finalScore).slice(0, 100).map((signal, index) => ({
      ...signal,
      rank: index + 1
    }));
    const sectorStrength = Object.entries(sectorReturns).map(([sector, averageReturn]) => ({
      sector,
      averageReturn: Number((averageReturn * 100).toFixed(2)),
      sectorScore: Number((sectorScores[sector] ?? 50).toFixed(2)),
      leaders: rankings.filter((signal) => signal.sector === sector).slice(0, 3).map((signal) => signal.stockSymbol)
    })).sort((left, right) => right.sectorScore - left.sectorScore);
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
  const buildUltraQuantDashboard = (payload = {}) => {
    const request = normalizeUltraQuantRequest(payload);
    const rawUniverse = createUltraQuantUniverse();
    const totalLoaded = rawUniverse.length;
    const analyzedUniverse = rawUniverse.map((profile) => analyzeUltraQuantProfile(profile, request));
    const totalProcessed = analyzedUniverse.length;
    const sectorFiltered = request.sectorFilter === "ALL" || !request.sectorFilter ? analyzedUniverse : analyzedUniverse.filter((r) => r.sector === request.sectorFilter);
    const totalAfterFilter = sectorFiltered.length;
    const sorted = sectorFiltered.map(({ hedgeFactors, ...result }) => result).sort((left, right) => right.score - left.score);
    const resultPool = sorted.length >= 100 ? sorted : analyzedUniverse.map(({ hedgeFactors, ...result }) => result).sort((left, right) => right.score - left.score);
    const results = resultPool.slice(0, 100);
    const totalReturned = results.length;
    console.log(JSON.stringify({ totalLoaded, totalProcessed, totalAfterFilter, totalReturned }));
    const alerts = results.flatMap((result) => result.alerts).sort((left, right) => right.confidenceScore - left.confidenceScore).slice(0, 12);
    const sectors = Array.from(results.reduce((accumulator, result) => {
      if (!accumulator.has(result.sector)) {
        accumulator.set(result.sector, []);
      }
      accumulator.get(result.sector)?.push(result);
      return accumulator;
    }, /* @__PURE__ */ new Map())).map(([sector, sectorResults]) => ({
      sector,
      sectorStrength: Number(average(sectorResults.map((item) => item.momentum)).toFixed(2)),
      averageScore: Number(average(sectorResults.map((item) => item.score)).toFixed(2)),
      leaders: sectorResults.slice(0, 3).map((item) => item.symbol)
    })).sort((left, right) => right.averageScore - left.averageScore);
    const summary = {
      scannedUniverse: totalLoaded,
      returned: totalReturned,
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
  const historicalCache = /* @__PURE__ */ new Map();
  const HISTORICAL_CACHE_TTL_MS = 6e4;
  const intervalToMinutes = (selectedInterval) => {
    switch (selectedInterval) {
      case "1minute":
        return 1;
      case "5minute":
        return 5;
      case "30minute":
        return 30;
      case "day":
        return 24 * 60;
      case "week":
        return 7 * 24 * 60;
      default:
        return 5;
    }
  };
  const buildHistoricalCacheKey = (instrumentKey, selectedInterval, fromDate, toDate) => [instrumentKey, selectedInterval, fromDate, toDate].join("|");
  const createSimulatedHistoricalPayload = (instrumentKey, selectedInterval, fromDate, toDate, notice) => {
    const seed = symbolSeed(`${instrumentKey}-${selectedInterval}`);
    const random = seededGenerator(seed);
    const stepMs = intervalToMinutes(selectedInterval) * 60 * 1e3;
    const startTime = (/* @__PURE__ */ new Date(`${fromDate}T09:15:00Z`)).getTime();
    const endTime = (/* @__PURE__ */ new Date(`${toDate}T15:30:00Z`)).getTime();
    const maxPoints = selectedInterval === "day" ? 400 : 1200;
    const candles = [];
    let cursor = startTime;
    let lastClose = 80 + seed % 2400 / 10;
    while (cursor <= endTime && candles.length < maxPoints) {
      const drift = (random() - 0.46) * (selectedInterval === "day" ? 3.4 : 1.2);
      const open = Number(lastClose.toFixed(2));
      const close = Number(Math.max(20, open + drift).toFixed(2));
      const high = Number((Math.max(open, close) + random() * 1.8).toFixed(2));
      const low = Number(Math.max(5, Math.min(open, close) - random() * 1.6).toFixed(2));
      const volume = Math.round(12e4 + random() * 18e5);
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
  const cacheHistoricalPayload = (cacheKey, payload) => {
    historicalCache.set(cacheKey, {
      expiresAt: Date.now() + HISTORICAL_CACHE_TTL_MS,
      payload
    });
  };
  const getCachedHistoricalPayload = (cacheKey) => {
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
  const averageClose = (candles) => candles.length ? candles.reduce((sum, candle) => sum + Number(candle.close ?? 0), 0) / candles.length : 0;
  const buildFallbackAiAnalysis = ({
    symbol,
    data,
    interval,
    quantData,
    advancedIntelligence,
    reason
  }) => {
    const recentCandles = data.slice(-20);
    const latest = data[data.length - 1] ?? {};
    const previous = data[data.length - 2] ?? latest;
    const recentAverage = averageClose(recentCandles);
    const longAverage = averageClose(data.slice(-50));
    const priceChangePct = previous.close ? (Number(latest.close ?? 0) - Number(previous.close ?? 0)) / Number(previous.close) * 100 : 0;
    const trendBias = recentAverage && Number(latest.close ?? 0) >= recentAverage ? "Bullish" : "Bearish";
    const momentumBias = longAverage && recentAverage >= longAverage ? "Improving" : "Mixed";
    const support = Math.min(...recentCandles.map((candle) => Number(candle.low ?? candle.close ?? 0)));
    const resistance = Math.max(...recentCandles.map((candle) => Number(candle.high ?? candle.close ?? 0)));
    const averageVolume = recentCandles.length ? recentCandles.reduce((sum, candle) => sum + Number(candle.volume ?? 0), 0) / recentCandles.length : 0;
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
  app.get("/api/stocks/search", (req, res) => {
    const raw = (req.query.q || "").trim();
    if (!raw) return res.json([]);
    const q = raw.toUpperCase();
    const universe = getUniverse();
    const exact = [];
    const startsWith = [];
    const partial = [];
    for (const s of universe) {
      const sym = s.symbol.toUpperCase();
      if (sym === q) {
        exact.push(s);
        continue;
      }
      if (sym.startsWith(q)) {
        startsWith.push(s);
        continue;
      }
      if (sym.includes(q)) {
        partial.push(s);
      }
    }
    const ranked = [...exact, ...startsWith, ...partial].slice(0, 20);
    console.log(`[Search] q="${raw}" universe=${universe.length} results=${ranked.length}`);
    res.json(ranked.map((s) => ({
      symbol: s.symbol,
      name: s.symbol,
      // instrument JSON has no company name — symbol used
      key: s.instrumentKey,
      exchange: s.exchange,
      sector: s.sector
    })));
  });
  app.get("/api/stocks/universe", (req, res) => {
    const universe = getUniverse();
    console.log(`[Universe] Serving ${universe.length} stocks`);
    res.setHeader("Cache-Control", "no-store");
    res.json(universe.map((s) => ({
      symbol: s.symbol,
      name: s.name || s.symbol,
      key: s.instrumentKey,
      exchange: s.exchange,
      sector: s.sector
    })));
  });
  const toV3Interval = (iv) => {
    switch (iv) {
      case "1minute":
        return { unit: "minutes", n: "1" };
      case "5minute":
        return { unit: "minutes", n: "5" };
      case "30minute":
        return { unit: "minutes", n: "30" };
      case "day":
        return { unit: "days", n: "1" };
      case "week":
        return { unit: "weeks", n: "1" };
      case "month":
        return { unit: "months", n: "1" };
      default:
        return { unit: "minutes", n: "5" };
    }
  };
  const maxDaysPerChunk = (iv) => {
    switch (iv) {
      case "1minute":
        return 28;
      // 1-15 min: 1 month max
      case "5minute":
        return 28;
      case "30minute":
        return 85;
      // >15 min: 1 quarter max
      default:
        return 3650;
    }
  };
  const fetchV3Chunk = async (token, instrumentKey, iv, from, to) => {
    const { unit, n } = toV3Interval(iv);
    const encodedKey = encodeURIComponent(instrumentKey);
    const url = `https://api.upstox.com/v3/historical-candle/${encodedKey}/${unit}/${n}/${to}/${from}`;
    const response = await axios4.get(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      timeout: 15e3
    });
    return response.data?.data?.candles ?? [];
  };
  app.get("/api/stocks/historical", withErrorBoundary(async (req, res) => {
    const { instrumentKey, interval, fromDate, toDate } = req.query;
    const _svc = UpstoxService.getInstance();
    let token = await _svc.tokenManager.getValidAccessToken();
    if (!token) token = process.env.UPSTOX_ACCESS_TOKEN || null;
    const selectedInterval = interval || "5minute";
    const to = toDate || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const from = fromDate || to;
    if (!instrumentKey) {
      return res.status(400).json({ error: "instrumentKey is required" });
    }
    const cacheKey = buildHistoricalCacheKey(
      String(instrumentKey),
      selectedInterval,
      from,
      to
    );
    const cachedPayload = getCachedHistoricalPayload(cacheKey);
    if (cachedPayload) {
      logAction("historical.cache.hit", { instrumentKey, interval: selectedInterval });
      return res.json(cachedPayload);
    }
    if (!token || token === "your_token_here") {
      const isAuthenticated = await _svc.isAuthenticated();
      const message = isAuthenticated ? "Upstox connected but token refresh in progress. Using local replay temporarily." : "Connect to Upstox for live market data. Visit /upstox/connect to authenticate.";
      const fallbackPayload = createSimulatedHistoricalPayload(String(instrumentKey), selectedInterval, from, to, message);
      cacheHistoricalPayload(cacheKey, fallbackPayload);
      logAction("historical.fallback.used", { instrumentKey, interval: selectedInterval, reason: "missing_upstox_token" });
      return res.json(fallbackPayload);
    }
    try {
      const chunkDays = maxDaysPerChunk(selectedInterval);
      const fromMs = new Date(from).getTime();
      const toMs = new Date(to).getTime();
      const totalDays = Math.ceil((toMs - fromMs) / 864e5);
      let allCandles = [];
      if (totalDays <= chunkDays) {
        allCandles = await fetchV3Chunk(token, String(instrumentKey), selectedInterval, from, to);
      } else {
        let chunkTo = new Date(to);
        while (chunkTo.getTime() > fromMs) {
          const chunkFrom = new Date(Math.max(fromMs, chunkTo.getTime() - chunkDays * 864e5));
          const chunkFromStr = chunkFrom.toISOString().slice(0, 10);
          const chunkToStr = chunkTo.toISOString().slice(0, 10);
          const chunk = await fetchV3Chunk(token, String(instrumentKey), selectedInterval, chunkFromStr, chunkToStr);
          allCandles = [...chunk, ...allCandles];
          chunkTo = new Date(chunkFrom.getTime() - 864e5);
          if (allCandles.length > 5e3) break;
        }
      }
      const payload = {
        status: "success",
        data: { candles: allCandles },
        meta: { source: "upstox" }
      };
      cacheHistoricalPayload(cacheKey, payload);
      logAction("historical.fetch.completed", {
        instrumentKey,
        interval: selectedInterval,
        source: "upstox",
        candles: allCandles.length
      });
      res.json(payload);
    } catch (error) {
      const errorData = error.response?.data;
      logError("historical.fetch.failed", error, { instrumentKey, interval: selectedInterval, fromDate: from, toDate: to, providerPayload: errorData });
      const fallbackPayload = createSimulatedHistoricalPayload(
        String(instrumentKey || "MARKET"),
        selectedInterval,
        from,
        to,
        "Live historical request failed. Showing deterministic local replay."
      );
      cacheHistoricalPayload(cacheKey, fallbackPayload);
      logAction("historical.fallback.used", { instrumentKey, interval: selectedInterval, reason: "upstox_request_failed" });
      res.json(fallbackPayload);
    }
  }));
  const upstoxService = UpstoxService.getInstance();
  const marketDataService = new UpstoxMarketDataService();
  app.get("/api/upstox/auth-url", (req, res) => {
    try {
      const authUrl = upstoxService.getAuthorizationUrl();
      logAction("upstox.auth_url.generated", { authUrl });
      res.json({ authUrl });
    } catch (error) {
      logError("upstox.auth_url.failed", error);
      res.status(500).json({ error: error.message });
    }
  });
  app.get("/api/upstox/callback", withErrorBoundary(async (req, res) => {
    const { code } = req.query;
    if (!code) {
      logAction("upstox.callback.rejected", { reason: "missing_code" });
      return res.status(400).send(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h2 style="color: #e74c3c;">\xE2\x9D\u0152 Authorization Failed</h2>
            <p>No authorization code received from Upstox.</p>
            <a href="/" style="color: #3498db;">Return to App</a>
          </body>
        </html>
      `);
    }
    try {
      await upstoxService.handleOAuthCallback(String(code));
      logAction("upstox.callback.success", { code: "***" });
      res.send(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h2 style="color: #27ae60;">\xE2\u0153\u2026 Authorization Successful!</h2>
            <p>Your Upstox account has been connected successfully.</p>
            <p>Tokens are stored securely and will auto-refresh daily.</p>
            <a href="/" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #3498db; color: white; text-decoration: none; border-radius: 5px;">Return to App</a>
          </body>
        </html>
      `);
    } catch (error) {
      logError("upstox.callback.failed", error);
      res.status(500).send(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h2 style="color: #e74c3c;">\xE2\x9D\u0152 Authorization Failed</h2>
            <p>${error.message}</p>
            <a href="/" style="color: #3498db;">Return to App</a>
          </body>
        </html>
      `);
    }
  }));
  app.get("/api/upstox/status", withErrorBoundary(async (req, res) => {
    const isAuthenticated = await upstoxService.isAuthenticated();
    res.json({
      authenticated: isAuthenticated,
      message: isAuthenticated ? "Connected to Upstox. Tokens will auto-refresh daily." : "Not connected. Please authenticate via OAuth."
    });
  }));
  app.post("/api/upstox/refresh", withErrorBoundary(async (req, res) => {
    try {
      const token = await upstoxService.tokenManager.getValidAccessToken();
      if (token) {
        logAction("upstox.manual_refresh.success");
        res.json({ success: true, message: "Token refreshed successfully" });
      } else {
        logAction("upstox.manual_refresh.failed", { reason: "no_token" });
        res.status(401).json({ success: false, message: "No valid token. Please re-authenticate." });
      }
    } catch (error) {
      logError("upstox.manual_refresh.error", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }));
  app.get("/api/upstox/profile", withErrorBoundary(async (req, res) => {
    try {
      const profile = await upstoxService.apiClient.fetchProfile();
      logAction("upstox.profile.fetched");
      res.json(profile);
    } catch (error) {
      logError("upstox.profile.failed", error);
      res.status(500).json({ error: error.message });
    }
  }));
  app.get("/api/upstox/connection-info", withErrorBoundary(async (req, res) => {
    const isAuthenticated = await upstoxService.isAuthenticated();
    let userInfo = null;
    if (isAuthenticated) {
      try {
        const profile = await upstoxService.apiClient.fetchProfile();
        userInfo = {
          userId: profile.data?.user_id,
          userName: profile.data?.user_name,
          email: profile.data?.email
        };
      } catch (error) {
      }
    }
    res.json({
      connected: isAuthenticated,
      isAuthenticated,
      dataSource: isAuthenticated ? "live" : "simulated",
      message: isAuthenticated ? "Connected to Upstox. All tabs using live market data." : "Not connected. Using simulated data. Authenticate to get live data.",
      userInfo,
      features: {
        liveQuotes: isAuthenticated,
        historicalData: isAuthenticated,
        portfolio: isAuthenticated,
        orders: isAuthenticated
      }
    });
  }));
  app.get("/api/upstox/quick-connect", withErrorBoundary(async (req, res) => {
    const isAuthenticated = await upstoxService.isAuthenticated();
    if (isAuthenticated) {
      return res.json({
        connected: true,
        message: "Already connected to Upstox",
        action: null
      });
    }
    try {
      const authUrl = upstoxService.getAuthorizationUrl();
      res.json({
        connected: false,
        message: "Click below to connect your Upstox account and get live market data",
        action: {
          type: "oauth",
          url: authUrl,
          label: "Connect Upstox Account"
        },
        steps: [
          '1. Click "Connect Upstox Account" button',
          "2. Login to your Upstox account",
          "3. Authorize the application",
          "4. You'll be redirected back automatically",
          "5. All tabs will switch to live data!"
        ]
      });
    } catch (error) {
      res.json({
        connected: false,
        message: "Upstox credentials not configured. Please contact administrator.",
        action: null,
        error: "Configuration required in .env file"
      });
    }
  }));
  app.get("/upstox/connect", withErrorBoundary(async (req, res) => {
    const isAuthenticated = await upstoxService.isAuthenticated();
    const STYLES = `<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0A0A0B;color:#e4e4e7;font-family:system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.card{background:#18181b;border:1px solid rgba(255,255,255,0.07);border-radius:24px;padding:40px;max-width:520px;width:100%;box-shadow:0 32px 80px rgba(0,0,0,0.6)}.logo{display:flex;align-items:center;gap:12px;margin-bottom:32px}.logo-icon{width:40px;height:40px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px}.logo-text{font-size:18px;font-weight:800;letter-spacing:-0.5px}.logo-sub{font-size:10px;color:#71717a;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;margin-top:2px}h1{font-size:22px;font-weight:800;letter-spacing:-0.5px;margin-bottom:6px}.subtitle{font-size:13px;color:#71717a;margin-bottom:28px}.badge{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:28px}.badge-green{background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.3);color:#34d399}.badge-red{background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);color:#f87171}.dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}.dot-green{background:#10b981;box-shadow:0 0 8px rgba(16,185,129,0.8)}.dot-red{background:#ef4444;animation:pulse 1.5s infinite}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px}.info-card{background:#09090b;border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:16px}.info-label{font-size:9px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:0.15em;margin-bottom:6px}.info-value{font-size:13px;font-weight:700;color:#e4e4e7}.green{color:#34d399}.amber{color:#fbbf24}.steps-box{background:#09090b;border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:20px;margin-bottom:24px}.section-label{font-size:9px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:0.15em;margin-bottom:14px}.step{display:flex;align-items:flex-start;gap:12px;margin-bottom:12px}.step:last-child{margin-bottom:0}.step-num{width:22px;height:22px;border-radius:50%;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);color:#818cf8;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}.step-text{font-size:12px;color:#a1a1aa;line-height:1.5}.benefits{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:24px}.benefit{display:flex;align-items:center;gap:8px;font-size:11px;color:#a1a1aa;background:#09090b;border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:10px 12px}.bdot{width:6px;height:6px;border-radius:50%;background:#6366f1;flex-shrink:0}.btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:14px 24px;border-radius:14px;font-size:13px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;text-decoration:none;border:none;cursor:pointer;transition:all 0.2s;margin-bottom:10px}.btn-primary{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;box-shadow:0 8px 24px rgba(99,102,241,0.3)}.btn-secondary{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#a1a1aa}.warn-box{background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);border-radius:12px;padding:14px 16px;margin-bottom:24px;display:flex;gap:12px}.warn-text{font-size:12px;color:#fbbf24;line-height:1.5}.code-box{background:#09090b;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px;font-family:monospace;font-size:11px;color:#818cf8;line-height:1.8;margin-bottom:24px}.note{font-size:10px;color:#3f3f46;text-align:center;margin-top:16px;line-height:1.6}</style>`;
    if (isAuthenticated) {
      return res.send(`<!DOCTYPE html><html><head><title>Upstox Connected</title>${STYLES}</head><body><div class="card"><div class="logo"><div class="logo-icon">&#128200;</div><div><div class="logo-text">StockPulse</div><div class="logo-sub">Premium Terminal</div></div></div><div class="badge badge-green"><div class="dot dot-green"></div>Live Connected</div><h1>Upstox Connected</h1><p class="subtitle">Your account is active. All tabs are receiving live market data.</p><div class="grid2"><div class="info-card"><div class="info-label">Status</div><div class="info-value green">&#9679; Active</div></div><div class="info-card"><div class="info-label">Data Source</div><div class="info-value green">Upstox Live</div></div><div class="info-card"><div class="info-label">Auto-Refresh</div><div class="info-value amber">8:30 AM IST</div></div><div class="info-card"><div class="info-label">Token Storage</div><div class="info-value">SQLite DB</div></div></div><div class="benefits"><div class="benefit"><div class="bdot"></div>Real-time quotes</div><div class="benefit"><div class="bdot"></div>Live price feed</div><div class="benefit"><div class="bdot"></div>Actual volume</div><div class="benefit"><div class="bdot"></div>Auto token refresh</div><div class="benefit"><div class="bdot"></div>5000+ instruments</div><div class="benefit"><div class="bdot"></div>NSE + BSE data</div></div><a href="/" class="btn btn-primary">&#8592; Back to Dashboard</a><a href="/api/upstox/status" class="btn btn-secondary">View API Status</a><p class="note">Token auto-refreshes daily. No manual re-login required.</p></div></body></html>`);
    }
    try {
      const authUrl = upstoxService.getAuthorizationUrl();
      res.send(`<!DOCTYPE html><html><head><title>Connect Upstox</title>${STYLES}</head><body><div class="card"><div class="logo"><div class="logo-icon">&#128200;</div><div><div class="logo-text">StockPulse</div><div class="logo-sub">Premium Terminal</div></div></div><div class="badge badge-red"><div class="dot dot-red"></div>Not Connected</div><h1>Connect to Upstox</h1><p class="subtitle">Authorize once to unlock live market data across all tabs.</p><div class="warn-box"><div style="font-size:16px;flex-shrink:0">&#9888;&#65039;</div><div class="warn-text"><strong>Currently using simulated data.</strong> Connect your Upstox account to switch to real-time live market feeds instantly.</div></div><div class="steps-box"><div class="section-label">What happens next</div><div class="step"><div class="step-num">1</div><div class="step-text">Redirected to Upstox login page</div></div><div class="step"><div class="step-num">2</div><div class="step-text">Login with your Upstox credentials</div></div><div class="step"><div class="step-num">3</div><div class="step-text">Authorize StockPulse to access market data</div></div><div class="step"><div class="step-num">4</div><div class="step-text">Redirected back automatically \u2014 token saved securely</div></div><div class="step"><div class="step-num">5</div><div class="step-text">All tabs switch to live data instantly</div></div></div><div class="benefits"><div class="benefit"><div class="bdot"></div>Real-time quotes</div><div class="benefit"><div class="bdot"></div>Live price feed</div><div class="benefit"><div class="bdot"></div>Actual volume data</div><div class="benefit"><div class="bdot"></div>5000+ instruments</div><div class="benefit"><div class="bdot"></div>NSE + BSE coverage</div><div class="benefit"><div class="bdot"></div>Auto daily refresh</div></div><a href="${authUrl}" class="btn btn-primary">&#128640; Authorize Upstox Account</a><a href="/" class="btn btn-secondary">&#8592; Back to Dashboard</a><p class="note">Credentials stored locally. OAuth 2.0 secured. Never shared.</p></div></body></html>`);
    } catch (error) {
      res.send(`<!DOCTYPE html><html><head><title>Setup Required</title>${STYLES}</head><body><div class="card"><div class="logo"><div class="logo-icon">&#9881;&#65039;</div><div><div class="logo-text">StockPulse</div><div class="logo-sub">Configuration</div></div></div><div class="badge badge-red"><div class="dot dot-red"></div>Config Missing</div><h1>Setup Required</h1><p class="subtitle">Upstox API credentials are not configured in your <code style="color:#818cf8">.env</code> file.</p><div class="section-label" style="font-size:9px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:0.15em;margin-bottom:12px">Add to your .env file</div><div class="code-box">UPSTOX_CLIENT_ID=your_client_id<br>UPSTOX_CLIENT_SECRET=your_client_secret<br>UPSTOX_REDIRECT_URI=http://localhost:3000/api/upstox/callback</div><a href="https://account.upstox.com/developer/apps" target="_blank" class="btn btn-primary">Get Credentials from Upstox &#8594;</a><a href="/" class="btn btn-secondary">&#8592; Back to Dashboard</a><p class="note">After adding credentials, restart with <code style="color:#818cf8">npm run dev</code></p></div></body></html>`);
    }
  }));
  app.get("/api/stocks/live-price", withErrorBoundary(async (req, res) => {
    const { instrumentKey } = req.query;
    if (!instrumentKey) {
      return res.status(400).json({ error: "instrumentKey is required" });
    }
    let token = await upstoxService.tokenManager.getValidAccessToken();
    if (!token) token = process.env.UPSTOX_ACCESS_TOKEN || null;
    if (!token || token === "your_token_here") {
      return res.json({ ltp: null, source: "unavailable", message: "Connect Upstox for live price" });
    }
    try {
      const encodedKey = encodeURIComponent(String(instrumentKey));
      const url = `https://api.upstox.com/v2/market-quote/ltp?instrument_key=${encodedKey}`;
      const response = await axios4.get(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        timeout: 5e3
      });
      const quoteData = response.data?.data;
      if (!quoteData) return res.json({ ltp: null, source: "upstox", message: "No data returned" });
      const key = Object.keys(quoteData)[0];
      const quote = quoteData[key];
      return res.json({
        ltp: quote?.last_price ?? null,
        change: quote?.net_change ?? null,
        changePercent: quote?.net_change_percentage ?? null,
        source: "upstox",
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch (error) {
      logError("live-price.fetch.failed", error, { instrumentKey });
      return res.json({ ltp: null, source: "error", message: error.message });
    }
  }));
  app.get("/api/stocks/stream", (req, res) => {
    const { instrumentKey } = req.query;
    if (!instrumentKey) {
      res.status(400).end();
      return;
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    let lastLtp = null;
    let tickCount = 0;
    const sendEvent = (data) => {
      try {
        res.write(`data: ${JSON.stringify(data)}

`);
      } catch {
      }
    };
    const heartbeatId = setInterval(() => {
      try {
        res.write(`: heartbeat

`);
      } catch {
      }
    }, 15e3);
    const tick = async () => {
      tickCount++;
      try {
        let token = await upstoxService.tokenManager.getValidAccessToken();
        if (!token) token = process.env.UPSTOX_ACCESS_TOKEN || null;
        if (!token || token === "your_token_here") {
          sendEvent({ type: "no_auth", message: "Upstox not authenticated. Visit /upstox/connect to authorize." });
          return;
        }
        const encodedKey = encodeURIComponent(String(instrumentKey));
        const url = `https://api.upstox.com/v2/market-quote/ltp?instrument_key=${encodedKey}`;
        const response = await axios4.get(url, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          timeout: 4e3
        });
        const quoteData = response.data?.data;
        if (!quoteData) {
          sendEvent({ type: "error", message: "No quote data returned from Upstox", code: "NO_DATA" });
          return;
        }
        const key = Object.keys(quoteData)[0];
        const quote = quoteData[key];
        const ltp = quote?.last_price;
        if (ltp == null) {
          sendEvent({ type: "error", message: "LTP is null in Upstox response", code: "NULL_LTP" });
          return;
        }
        const direction = lastLtp !== null ? ltp > lastLtp ? "up" : ltp < lastLtp ? "down" : "flat" : "flat";
        lastLtp = ltp;
        sendEvent({
          type: "tick",
          ltp,
          change: quote?.net_change ?? null,
          changePercent: quote?.net_change_percentage ?? null,
          direction,
          ts: Date.now()
        });
        if (tickCount <= 3) {
          console.log(`[SSE] Tick #${tickCount} for ${instrumentKey}: LTP=${ltp}`);
        }
        if (tickCount === 1) {
          console.log(`[SSE] Streaming live ticks for ${instrumentKey}`);
        }
      } catch (err) {
        const status = err.response?.status;
        const upstoxError = err.response?.data?.errors?.[0];
        const msg = upstoxError?.message || err.message;
        const code = upstoxError?.errorCode || `HTTP_${status || "ERR"}`;
        console.error(`[SSE] Tick error for ${instrumentKey}: [${code}] ${msg}`);
        sendEvent({ type: "error", message: msg, code });
        if (status === 401 || code === "UDAPI100011") {
          sendEvent({ type: "no_auth", message: "Upstox token expired. Please re-authenticate." });
        }
      }
    };
    tick();
    const intervalId = setInterval(tick, 1e3);
    req.on("close", () => {
      clearInterval(intervalId);
      clearInterval(heartbeatId);
    });
  });
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
  app.post("/api/ai/analyze", withErrorBoundary(async (req, res) => {
    const { symbol, data, interval, quantData, advancedIntelligence } = req.body;
    if (!data || !Array.isArray(data) || data.length === 0) {
      logAction("ai.analysis.rejected", {
        symbol,
        reason: "missing_price_data"
      });
      return res.status(400).json({ error: "No data provided for analysis" });
    }
    try {
      const model = process.env.GEMINI_MODEL || "gemini-1.5-pro";
      const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === "YOUR_API_KEY") {
        logAction("ai.analysis.fallback", {
          symbol,
          provider: "local-fallback",
          reason: "missing_gemini_api_key"
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
      const maskedKey = apiKey.length > 8 ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` : "****";
      logAction("ai.analysis.provider.selected", {
        symbol,
        provider: "gemini",
        apiKey: maskedKey,
        interval
      });
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `
        As a world-class financial analyst and technical trader, analyze the following stock data for ${symbol} (${interval} interval).
        
        Price Data (last 50 candles):
        ${JSON.stringify(data.slice(-50).map((c) => ({
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
        ` : ""}

        ${advancedIntelligence ? `
        Advanced AI Intelligence:
        - Momentum Prediction: ${advancedIntelligence.momentumPrediction?.probability}% probability of ${advancedIntelligence.momentumPrediction?.predictedMove} move.
        - Order Flow: ${advancedIntelligence.orderFlow?.status} (Imbalance: ${advancedIntelligence.orderFlow?.imbalance}x)
        - Pattern Recognition: ${advancedIntelligence.patternRecognition?.pattern} (${advancedIntelligence.patternRecognition?.status})
        - Smart Money: ${advancedIntelligence.smartMoney?.phase} (Score: ${advancedIntelligence.smartMoney?.accumulationScore})
        ` : ""}

      Current Date/Time: ${(/* @__PURE__ */ new Date()).toISOString()}

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
      let result;
      let retries = 3;
      let delay = 2e3;
      while (retries > 0) {
        try {
          result = await ai.models.generateContent({
            model,
            contents: prompt
          });
          break;
        } catch (err) {
          const is503 = err.message?.includes("503") || err.status === 503 || err.error?.code === 503;
          if (is503 && retries > 1) {
            console.log(`Gemini 503 error, retrying in ${delay}ms... (${retries - 1} retries left)`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            retries--;
            delay *= 2;
          } else {
            throw err;
          }
        }
      }
      if (!result) {
        throw new Error("Failed to get response from Gemini");
      }
      const text = result.text || "";
      const confidenceMatch = text.match(/Confidence(?:\s+Score)?:\s*(\d+)%/i);
      const confidence = confidenceMatch ? parseInt(confidenceMatch[1]) : 75;
      const recommendationMatch = text.match(/\*\*Strategic Recommendation\*\*:\s*(Buy|Sell|Hold)/i);
      const recommendation = recommendationMatch ? recommendationMatch[1].toUpperCase() : "NEUTRAL";
      const sources = result.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk) => ({
        title: chunk.web?.title,
        url: chunk.web?.uri
      })).filter((s) => s.title && s.url) || [];
      res.json({
        analysis: text,
        sources,
        confidence,
        recommendation,
        provider: "gemini"
      });
    } catch (error) {
      logError("ai.analysis.failed", error, {
        symbol,
        interval
      });
      logAction("ai.analysis.fallback", {
        symbol,
        provider: "local-fallback",
        reason: error?.message || "gemini_request_failed"
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
  app.get("/api/premium/momentum", withErrorBoundary(async (req, res) => {
    const momentumStocks = await marketDataService.getMomentumStocks(5);
    const alerts = momentumStocks.map((stock) => ({
      symbol: stock.symbol,
      change5m: stock.priceChange,
      volumeRatio: stock.volumeRatio,
      type: "Momentum Alert"
    }));
    res.json(alerts);
  }));
  app.get("/api/premium/breakouts", (req, res) => {
    const types = ["Prev Day High", "VWAP", "Bollinger Band", "Range"];
    const breakouts = Array.from({ length: 4 }, () => ({
      symbol: POPULAR_STOCKS[Math.floor(Math.random() * POPULAR_STOCKS.length)].symbol,
      type: types[Math.floor(Math.random() * types.length)],
      price: (1e3 + Math.random() * 5e3).toFixed(2),
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
  app.get("/api/premium/sector-rotation", withErrorBoundary(async (req, res) => {
    const sectors = await marketDataService.getSectorStrength();
    const formattedSectors = sectors.map((s) => ({
      name: s.sector,
      strength: s.strength.toFixed(2),
      leader: s.leaders[0] || "N/A"
    }));
    res.json(formattedSectors);
  }));
  app.get("/api/premium/ai-predictions", (req, res) => {
    const patterns = ["Bullish Flag", "Double Bottom", "Cup & Handle", "Ascending Triangle"];
    const predictions = Array.from({ length: 3 }, () => ({
      symbol: POPULAR_STOCKS[Math.floor(Math.random() * POPULAR_STOCKS.length)].symbol,
      pattern: patterns[Math.floor(Math.random() * patterns.length)],
      probability: 75 + Math.floor(Math.random() * 20),
      target: (1e3 + Math.random() * 5e3).toFixed(2)
    }));
    res.json(predictions);
  });
  app.get("/api/premium/psychology", (req, res) => {
    const symbol = (req.query.symbol || "MARKET").toUpperCase();
    const seed = symbol.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const pseudoRandom = (offset) => {
      const x = Math.sin(seed + offset) * 1e4;
      return x - Math.floor(x);
    };
    const fearGreedIndex = Math.floor(pseudoRandom(1) * 100);
    const retailSentiment = 40 + Math.floor(pseudoRandom(2) * 40);
    const institutionalSentiment = 30 + Math.floor(pseudoRandom(3) * 50);
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
    const triggers = triggerOptions.sort(() => pseudoRandom(5) - 0.5).slice(0, 2 + Math.floor(pseudoRandom(6) * 2));
    res.json({
      symbol,
      fearGreedIndex,
      marketMood,
      retailSentiment,
      institutionalBias,
      triggers,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
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
  app.get("/api/quant/momentum", withErrorBoundary(async (req, res) => {
    const momentumStocks = await marketDataService.getMomentumStocks(10);
    res.json(momentumStocks);
  }));
  app.get("/api/quant/breakouts", (req, res) => {
    const breakouts = [
      { symbol: "INFY", level: 1650, strength: 88, vwap: 1620, prevHigh: 1645 },
      { symbol: "ICICIBANK", level: 1120, strength: 75, vwap: 1105, prevHigh: 1115 }
    ];
    res.json(breakouts);
  });
  app.get("/api/quant/volume-surge", (req, res) => {
    const surges = [
      { symbol: "SBIN", ratio: 5.2, alert: "Institutional Accumulation", timestamp: (/* @__PURE__ */ new Date()).toISOString() },
      { symbol: "AXISBANK", ratio: 4.1, alert: "Large Block Deal Detected", timestamp: (/* @__PURE__ */ new Date()).toISOString() }
    ];
    res.json(surges);
  });
  app.get("/api/quant/indicators", (req, res) => {
    const indicators = [
      { symbol: "RELIANCE", rsi: 65, ema20: 2950, ema50: 2900, vwap: 2940, signal: "BUY" },
      { symbol: "TCS", rsi: 72, ema20: 4100, ema50: 4050, vwap: 4080, signal: "STRONG BUY" },
      { symbol: "WIPRO", rsi: 35, ema20: 480, ema50: 495, vwap: 485, signal: "SELL" }
    ];
    res.json(indicators);
  });
  app.get("/api/quant/sectors", withErrorBoundary(async (req, res) => {
    const sectors = await marketDataService.getSectorStrength();
    const formattedSectors = sectors.map((s) => ({
      name: s.sector,
      return: Number(s.strength.toFixed(2)),
      momentum: s.momentum,
      status: s.strength > 1 ? "Leading" : s.strength > 0 ? "Improving" : s.strength > -1 ? "Consolidating" : "Lagging"
    }));
    res.json(formattedSectors);
  }));
  app.get("/api/quant/money-flow", (req, res) => {
    const flow = [
      { symbol: "RELIANCE", flow: 125e6, status: "Accumulation", priceStability: "High" },
      { symbol: "HDFCBANK", flow: 85e6, status: "Neutral", priceStability: "Medium" },
      { symbol: "TCS", flow: 11e7, status: "Accumulation", priceStability: "High" }
    ];
    res.json(flow);
  });
  app.get("/api/quant/trends", (req, res) => {
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
    const totalBidVol = bids.reduce((sum, level) => sum + (level.volume || 0), 0);
    const totalAskVol = asks.reduce((sum, level) => sum + (level.volume || 0), 0);
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
    const { candles, binSize = 1 } = req.body;
    if (!candles || !Array.isArray(candles)) {
      return res.status(400).json({ error: "Invalid candles" });
    }
    const volumeAtPrice = {};
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
        returns.push(0);
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
    const data = assets.map((asset) => ({
      name: asset,
      value: Number((0.5 + random() * 0.45).toFixed(2))
    }));
    res.json(data);
  });
  app.get("/api/institutional/sector-rotation", withErrorBoundary(async (req, res) => {
    const sectors = await marketDataService.getSectorStrength();
    const formattedSectors = sectors.slice(0, 4).map((s) => ({
      sector: s.sector,
      strength: Math.round(50 + s.strength * 10),
      // Convert to 0-100 scale
      leader: s.leaders[0] || "N/A",
      flow: s.momentum === "Strong Bullish" ? "High beta accumulation" : s.momentum === "Bullish" ? "Steady broad-based bids" : s.momentum === "Neutral" ? "Mixed commodity response" : "Distribution phase",
      bias: s.strength > 1 ? "LEADING" : s.strength > 0 ? "IMPROVING" : "LAGGING"
    }));
    res.json(formattedSectors);
  }));
  app.get("/api/institutional/microstructure", withErrorBoundary(async (req, res) => {
    const { instrumentKey } = req.query;
    const lastPrice = parseFloat(req.query.lastPrice) || 0;
    try {
      const token = await UpstoxService.getInstance().tokenManager.getValidAccessToken();
      if (!token || !instrumentKey) throw new Error("no_token");
      const encodedKey = encodeURIComponent(String(instrumentKey));
      const url = `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodedKey}`;
      const response = await axios4.get(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        timeout: 5e3
      });
      const quoteData = response.data?.data;
      const key = quoteData ? Object.keys(quoteData)[0] : null;
      const quote = key ? quoteData[key] : null;
      if (quote) {
        const depth = quote.depth || {};
        const bids = depth.buy || [];
        const asks = depth.sell || [];
        const bestBid = bids[0]?.price ?? quote.last_price ?? lastPrice;
        const bestAsk = asks[0]?.price ?? quote.last_price ?? lastPrice;
        const spread = bestAsk > 0 && bestBid > 0 ? (bestAsk - bestBid) / bestBid * 100 : 0;
        const totalBidQty = bids.reduce((s, b) => s + (b.quantity || 0), 0);
        const totalAskQty = asks.reduce((s, a) => s + (a.quantity || 0), 0);
        const totalQty = totalBidQty + totalAskQty;
        const accumulation = totalQty > 0 ? Math.round(totalBidQty / totalQty * 100) : 50;
        const avgTradeSize = quote.average_trade_price > 0 ? quote.average_trade_price : 1;
        const frequency = Math.min(500, Math.round((quote.volume || 0) / Math.max(1, avgTradeSize / 100)));
        return res.json({ frequency, spread: parseFloat(spread.toFixed(4)), accumulation });
      }
    } catch (_err) {
    }
    res.json({
      frequency: Math.floor(120 + Math.random() * 50),
      spread: 0.05 + Math.random() * 0.1,
      accumulation: Math.floor(65 + Math.random() * 25)
    });
  }));
  app.get("/api/institutional/order-book", withErrorBoundary(async (req, res) => {
    const { instrumentKey } = req.query;
    const lastPrice = parseFloat(req.query.lastPrice) || 100;
    try {
      const token = await UpstoxService.getInstance().tokenManager.getValidAccessToken();
      if (!token || !instrumentKey) throw new Error("no_token");
      const encodedKey = encodeURIComponent(String(instrumentKey));
      const url = `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodedKey}`;
      const response = await axios4.get(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        timeout: 5e3
      });
      const quoteData = response.data?.data;
      const key = quoteData ? Object.keys(quoteData)[0] : null;
      const quote = key ? quoteData[key] : null;
      if (quote?.depth) {
        const rawBids = quote.depth.buy || [];
        const rawAsks = quote.depth.sell || [];
        const bids2 = rawBids.map((b) => ({ price: b.price, volume: b.quantity }));
        const asks2 = rawAsks.map((a) => ({ price: a.price, volume: a.quantity }));
        return res.json({ bids: bids2, asks: asks2 });
      }
    } catch (_err) {
    }
    const bids = [];
    const asks = [];
    for (let i = 0; i < 10; i++) {
      bids.push({ price: lastPrice - (i + 1) * 0.5, volume: Math.floor(Math.random() * 5e3) + (i === 0 ? 1e4 : 0) });
      asks.push({ price: lastPrice + (i + 1) * 0.5, volume: Math.floor(Math.random() * 2e3) });
    }
    res.json({ bids, asks });
  }));
  app.get("/api/institutional/metrics", (req, res) => {
    const { symbol } = req.query;
    const metrics = {
      symbol: symbol || "MARKET",
      orderImbalance: (1.2 + Math.random() * 2.5).toFixed(2),
      accumulationScore: (60 + Math.random() * 35).toFixed(0),
      tradeFrequency: (100 + Math.random() * 500).toFixed(0),
      spreadDynamics: (0.02 + Math.random() * 0.08).toFixed(3),
      marketRegime: ["TRENDING", "SIDEWAYS", "VOLATILE"][Math.floor(Math.random() * 3)],
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    res.json(metrics);
  });
  const MB_CYCLE_WEIGHTS = {
    //          trend  mom    rs     vol    brk    sec    stab
    30: { trend: 0.15, momentum: 0.25, relStrength: 0.15, volume: 0.15, breakout: 0.15, sector: 0.1, stability: 0.05 },
    60: { trend: 0.18, momentum: 0.23, relStrength: 0.15, volume: 0.15, breakout: 0.13, sector: 0.1, stability: 0.06 },
    90: { trend: 0.25, momentum: 0.2, relStrength: 0.15, volume: 0.15, breakout: 0.1, sector: 0.1, stability: 0.05 },
    120: { trend: 0.27, momentum: 0.18, relStrength: 0.15, volume: 0.14, breakout: 0.09, sector: 0.1, stability: 0.07 },
    180: { trend: 0.3, momentum: 0.15, relStrength: 0.14, volume: 0.13, breakout: 0.07, sector: 0.11, stability: 0.1 },
    300: { trend: 0.32, momentum: 0.12, relStrength: 0.13, volume: 0.12, breakout: 0.05, sector: 0.12, stability: 0.14 }
  };
  const MB_COMPANY_NAMES = {
    RELIANCE: "Reliance Industries Ltd",
    TCS: "Tata Consultancy Services Ltd",
    HDFCBANK: "HDFC Bank Ltd",
    INFY: "Infosys Ltd",
    ICICIBANK: "ICICI Bank Ltd",
    SBIN: "State Bank of India",
    BHARTIARTL: "Bharti Airtel Ltd",
    LT: "Larsen & Toubro Ltd",
    ITC: "ITC Ltd",
    KOTAKBANK: "Kotak Mahindra Bank Ltd",
    AXISBANK: "Axis Bank Ltd",
    ADANIENT: "Adani Enterprises Ltd",
    ASIANPAINT: "Asian Paints Ltd",
    MARUTI: "Maruti Suzuki India Ltd",
    SUNPHARMA: "Sun Pharmaceutical Ind Ltd",
    TITAN: "Titan Company Ltd",
    BAJFINANCE: "Bajaj Finance Ltd",
    HCLTECH: "HCL Technologies Ltd",
    WIPRO: "Wipro Ltd",
    TATAMOTORS: "Tata Motors Ltd",
    "M&M": "Mahindra & Mahindra Ltd",
    ULTRACEMCO: "UltraTech Cement Ltd",
    POWERGRID: "Power Grid Corp of India Ltd",
    NTPC: "NTPC Ltd",
    NESTLEIND: "Nestle India Ltd",
    BAJAJFINSV: "Bajaj Finserv Ltd",
    JSWSTEEL: "JSW Steel Ltd",
    HINDALCO: "Hindalco Industries Ltd"
  };
  const MB_SECTOR_DRIFT = {
    Technology: 165e-5,
    Financials: 12e-4,
    Healthcare: 145e-5,
    Consumer: 115e-5,
    Industrials: 105e-5,
    Energy: 11e-4,
    Telecom: 1e-3,
    Materials: 95e-5
  };
  const mbTrendScore = (closes) => {
    const last = closes[closes.length - 1];
    const ema50 = buildEma(closes, 50);
    const ema200 = buildEma(closes, 200);
    const dma50 = ema50[ema50.length - 1] ?? last;
    const dma200 = ema200[ema200.length - 1] ?? last;
    let raw = 0;
    if (last > dma50) raw += 40;
    if (dma50 > dma200) raw += 30;
    if (last > dma200) raw += 30;
    const slope = calculateSlope(ema50.slice(-20)) / Math.max(last, 1);
    return Math.min(100, raw + clamp(slope * 600) * 10);
  };
  const mbMomentumScore = (closes) => {
    const last = closes[closes.length - 1];
    const n = closes.length;
    const ret = (days) => {
      const base = closes[Math.max(0, n - 1 - days)];
      return base > 0 ? last / base - 1 : 0;
    };
    const ret30 = ret(30);
    const ret90 = ret(90);
    const ret180 = ret(180);
    const norm = (r) => clamp((r + 0.2) / 0.5) * 100;
    const score = norm(ret30) * 0.5 + norm(ret90) * 0.3 + norm(ret180) * 0.2;
    return { score, ret30, ret90, ret180 };
  };
  const mbRelStrengthRaw = (closes, cycleDays) => {
    const n = closes.length;
    const base = closes[Math.max(0, n - 1 - cycleDays)];
    const last = closes[n - 1];
    return base > 0 ? last / base - 1 : 0;
  };
  const mbVolumeScore = (volumes) => {
    const n = volumes.length;
    const last20Avg = average(volumes.slice(-20));
    const overallAvg = average(volumes);
    const lastVol = volumes[n - 1] ?? 0;
    let raw = 0;
    if (last20Avg > overallAvg) raw += 50;
    if (lastVol > last20Avg * 1.5) raw += 50;
    const volRatio = overallAvg > 0 ? last20Avg / overallAvg : 1;
    const signal = raw >= 80 ? "STRONG" : raw >= 40 ? "MODERATE" : "WEAK";
    return { score: raw, volRatio, signal };
  };
  const mbBreakoutScore = (closes) => {
    const n = closes.length;
    const last = closes[n - 1];
    const high52w = Math.max(...closes.slice(Math.max(0, n - 252)));
    const proximityScore = high52w > 0 && last / high52w >= 0.95 ? 50 : 0;
    let recentBreakout = false;
    const lookback = Math.min(20, n - 1);
    for (let i = n - lookback; i < n; i++) {
      if (closes[i] > Math.max(...closes.slice(Math.max(0, i - 20), i))) {
        recentBreakout = true;
        break;
      }
    }
    return proximityScore + (recentBreakout ? 50 : 0);
  };
  const mbStabilityScore = (closes) => {
    const returns = buildReturns(closes.slice(-Math.min(closes.length, 252)));
    const dailyVol = calculateVolatility(returns);
    const annualVol = dailyVol * Math.sqrt(252);
    return clamp(1 - annualVol / 0.6) * 100;
  };
  const mbBuildSeries = (profile, cycleDays) => {
    const totalDays = Math.max(cycleDays + 380, 400);
    const drift = MB_SECTOR_DRIFT[profile.sector] ?? 1e-3;
    const random = seededGenerator(symbolSeed(profile.symbol) ^ cycleDays * 6271);
    const closes = [];
    const volumes = [];
    let price = 80 + random() * 1800;
    for (let d = 0; d < totalDays; d++) {
      const dailyDrift = drift + Math.sin(d / 31 + random()) * 6e-3 + (random() - 0.5) * 0.05;
      price = Math.max(20, price * (1 + dailyDrift));
      closes.push(price);
      volumes.push(profile.averageVolume * (0.75 + random() * 1.1));
    }
    return { closes, volumes };
  };
  const mbNormalise = (values) => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (max === min) return values.map(() => 50);
    return values.map((v) => clamp((v - min) / (max - min)) * 100);
  };
  const mbPercentileRank = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return values.map((v) => sorted.filter((x) => x <= v).length / sorted.length * 100);
  };
  const mbSectorScores = (universe, cycleReturns) => {
    const sectorReturnMap = /* @__PURE__ */ new Map();
    universe.forEach((p, i) => {
      if (!sectorReturnMap.has(p.sector)) sectorReturnMap.set(p.sector, []);
      sectorReturnMap.get(p.sector).push(cycleReturns[i]);
    });
    const sectorAvg = {};
    for (const [sector, rets] of sectorReturnMap) {
      sectorAvg[sector] = rets.reduce((a, b) => a + b, 0) / rets.length;
    }
    const sectorNames = Object.keys(sectorAvg);
    const normScores = mbNormalise(sectorNames.map((s) => sectorAvg[s]));
    const sectorRanks = {};
    sectorNames.forEach((s, i) => {
      sectorRanks[s] = normScores[i];
    });
    const leadingSector = sectorNames.reduce(
      (best, s) => sectorAvg[s] > (sectorAvg[best] ?? -Infinity) ? s : best,
      sectorNames[0] ?? "Technology"
    );
    return {
      scores: universe.map((p) => sectorRanks[p.sector] ?? 50),
      sectorRanks,
      leadingSector
    };
  };
  const multibaggerCache = /* @__PURE__ */ new Map();
  const MULTIBAGGER_CACHE_TTL = {
    30: 3e4,
    60: 45e3,
    90: 6e4,
    120: 9e4,
    180: 12e4,
    300: 18e4
  };
  const buildMultibaggerScan = (cycleDays) => {
    const cached = multibaggerCache.get(cycleDays);
    if (cached && cached.expiresAt > Date.now()) return cached.payload;
    const weights = MB_CYCLE_WEIGHTS[cycleDays];
    const universe = createUltraQuantUniverse();
    const seriesCache = universe.map((p) => mbBuildSeries(p, cycleDays));
    const trendScores = seriesCache.map(({ closes }) => mbTrendScore(closes));
    const momentumResults = seriesCache.map(({ closes }) => mbMomentumScore(closes));
    const cycleReturns = seriesCache.map(({ closes }) => mbRelStrengthRaw(closes, cycleDays));
    const volumeResults = seriesCache.map(({ volumes }) => mbVolumeScore(volumes));
    const breakoutScores = seriesCache.map(({ closes }) => mbBreakoutScore(closes));
    const stabilityScores = seriesCache.map(({ closes }) => mbStabilityScore(closes));
    const momentumNorm = mbNormalise(momentumResults.map((r) => r.score));
    const rsPercentiles = mbPercentileRank(cycleReturns);
    const { scores: sectorScores, sectorRanks, leadingSector } = mbSectorScores(universe, cycleReturns);
    const scored = universe.map((profile, i) => {
      const trend = trendScores[i];
      const momentum = momentumNorm[i];
      const relStr = rsPercentiles[i];
      const volume = volumeResults[i].score;
      const breakout = breakoutScores[i];
      const sector = sectorScores[i];
      const stability = stabilityScores[i];
      const bullishScore = trend * weights.trend + momentum * weights.momentum + relStr * weights.relStrength + volume * weights.volume + breakout * weights.breakout + sector * weights.sector + stability * weights.stability;
      const sentimentTag = bullishScore >= 80 ? "Strong Bullish" : bullishScore >= 65 ? "Accumulation" : bullishScore >= 50 ? "Neutral Watch" : bullishScore >= 35 ? "Weak" : void 0;
      return {
        symbol: profile.symbol,
        companyName: MB_COMPANY_NAMES[profile.symbol] ?? `${profile.symbol} Ltd`,
        sector: profile.sector,
        bullishScore: Number(bullishScore.toFixed(2)),
        trendScore: Number(trend.toFixed(2)),
        momentumScore: Number(momentum.toFixed(2)),
        relativeStrength: Number(relStr.toFixed(2)),
        volumeScore: Number(volume.toFixed(2)),
        breakoutScore: Number(breakout.toFixed(2)),
        sectorScore: Number(sector.toFixed(2)),
        stabilityScore: Number(stability.toFixed(2)),
        sectorRank: Number((sectorRanks[profile.sector] ?? 50).toFixed(2)),
        // Legacy fields kept for UI compatibility
        trendStrength: Number(trend.toFixed(2)),
        momentumIndicator: Number((1 + cycleReturns[i]).toFixed(4)),
        ret30: Number((momentumResults[i].ret30 * 100).toFixed(2)),
        ret90: Number((momentumResults[i].ret90 * 100).toFixed(2)),
        ret180: Number((momentumResults[i].ret180 * 100).toFixed(2)),
        volumeSignal: volumeResults[i].signal,
        volRatio: Number(volumeResults[i].volRatio.toFixed(3)),
        sentimentTag
      };
    });
    scored.sort((a, b) => b.bullishScore - a.bullishScore);
    const topScore = scored[0]?.bullishScore ?? 0;
    const finalStocks = topScore < 10 ? (() => {
      const norm = mbNormalise(scored.map((s) => s.bullishScore));
      return scored.map((s, i) => ({ ...s, bullishScore: Number(norm[i].toFixed(2)) }));
    })() : scored;
    const top100 = finalStocks.slice(0, 100).map((s, i) => ({ rank: i + 1, ...s }));
    const avgBullishScore = top100.reduce((sum, s) => sum + s.bullishScore, 0) / top100.length;
    const totalLoaded = universe.length;
    const totalProcessed = scored.length;
    const totalAfterFilter = scored.length;
    const totalReturned = top100.length;
    console.log(JSON.stringify({ totalLoaded, totalProcessed, totalAfterFilter, totalReturned }));
    const payload = {
      cycle: cycleDays,
      scannedUniverse: universe.length,
      returned: top100.length,
      stocks: top100,
      leadingSector,
      avgBullishScore: Number(avgBullishScore.toFixed(2)),
      cachedAt: (/* @__PURE__ */ new Date()).toLocaleTimeString()
    };
    multibaggerCache.set(cycleDays, { expiresAt: Date.now() + MULTIBAGGER_CACHE_TTL[cycleDays], payload });
    return payload;
  };
  app.get("/api/multibagger/scan", (req, res) => {
    const rawCycle = parseInt(String(req.query.cycle ?? "90"), 10);
    const validCycles = [30, 60, 90, 120, 180, 300];
    const cycle = validCycles.includes(rawCycle) ? rawCycle : 90;
    const result = buildMultibaggerScan(cycle);
    logAction("multibagger.scan.completed", {
      cycle,
      returned: result.returned,
      leadingSector: result.leadingSector
    });
    res.json(result);
  });
  app.post("/api/ultra-quant/scan", (req, res) => {
    const dashboard = buildUltraQuantDashboard(req.body || {});
    logAction("ultra_quant.scan.completed", {
      filters: req.body || {},
      resultCount: dashboard.results.length
    });
    res.json(dashboard.results);
  });
  app.post("/api/ultra-quant/dashboard", (req, res) => {
    const dashboard = buildUltraQuantDashboard(req.body || {});
    logAction("ultra_quant.dashboard.completed", {
      filters: req.body || {},
      resultCount: dashboard.results.length,
      alertCount: dashboard.alerts.length,
      sectorCount: dashboard.sectors.length
    });
    res.json(dashboard);
  });
  app.post("/api/ultra-quant/hedge-fund-ranking", (req, res) => {
    const dashboard = buildUltraQuantDashboard(req.body || {});
    logAction("ultra_quant.hedge_fund.completed", {
      filters: req.body || {},
      resultCount: dashboard.hedgeFundSignals.rankings.length
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
  let aiIntelCache = null;
  const buildAIIntelligenceDashboard = (forceRefresh = false) => {
    if (!forceRefresh && aiIntelCache && aiIntelCache.expiresAt > Date.now()) {
      return aiIntelCache.payload;
    }
    const universe = createUltraQuantUniverse();
    const ema = (prices, period) => {
      if (prices.length < period) return prices.slice();
      const k = 2 / (period + 1);
      const result = [];
      let prev = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
      result.push(prev);
      for (let i = period; i < prices.length; i++) {
        prev = prices[i] * k + prev * (1 - k);
        result.push(prev);
      }
      return result;
    };
    const stdDev = (arr) => {
      if (arr.length < 2) return 0;
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
    };
    const clampN = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
    const results = universe.map((profile) => {
      const rng = seededGenerator(symbolSeed(profile.symbol) ^ 3735928559);
      const totalDays = 260;
      const sectorDrift = {
        Technology: 165e-5,
        Financials: 12e-4,
        Energy: 11e-4,
        Healthcare: 145e-5,
        Consumer: 115e-5,
        Industrials: 105e-5,
        Telecom: 1e-3,
        Materials: 95e-5
      };
      const drift0 = sectorDrift[profile.sector] ?? 1e-3;
      const closes = [];
      const volumes = [];
      let price = 80 + rng() * 1800;
      for (let d = 0; d < totalDays; d++) {
        const drift = drift0 + Math.sin(d / 31 + rng()) * 6e-3 + (rng() - 0.5) * 0.05;
        price = Math.max(20, price * (1 + drift));
        closes.push(price);
        volumes.push(profile.averageVolume * (0.85 + rng() * 0.9) * (1 + Math.max(0, drift * 10)));
      }
      const cur = closes[closes.length - 1];
      const prev = closes[closes.length - 2];
      const price15ago = closes[Math.max(0, closes.length - 4)];
      const priceAccel = price15ago > 0 ? (cur - price15ago) / price15ago * 100 : 0;
      const avgVol = volumes.reduce((a, b) => a + b, 0) / volumes.length;
      const curVol = volumes[volumes.length - 1];
      const volSpike = avgVol > 0 ? curVol / avgVol : 1;
      const earlyRallySignal = priceAccel > 1.2 && volSpike > 1.8;
      const recentStd = stdDev(closes.slice(-5));
      const longerStd = stdDev(closes.slice(-20));
      const compressionScore = longerStd > 0 ? clampN(1 - recentStd / longerStd) : 0;
      const rallyScore = clampN(
        0.4 * clampN(priceAccel / 5) + 0.4 * clampN((volSpike - 1) / 4) + 0.2 * compressionScore
      );
      const ema50vals = ema(closes, 50);
      const ema50last = ema50vals[ema50vals.length - 1];
      const ema20vals = ema(closes, 20);
      const ema20last = ema20vals[ema20vals.length - 1];
      const momentum6m = closes[Math.max(0, closes.length - 130)];
      const momentumRaw = momentum6m > 0 ? cur / momentum6m : 1;
      const momentumScore = clampN((momentumRaw - 0.8) / 0.8);
      const trendScore = clampN((cur > ema20last ? 0.6 : 0.3) + (cur > ema50last ? 0.2 : 0) + (ema20last > ema50last ? 0.2 : 0));
      const recentVolAvg = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
      const olderVolAvg = volumes.slice(0, -5).reduce((a, b) => a + b, 0) / Math.max(1, volumes.length - 5);
      const volAccScore = clampN(recentVolAvg / Math.max(1, olderVolAvg) / 2);
      const returns = closes.slice(1).map((c, i) => (c - closes[i]) / closes[i]);
      const volatility = stdDev(returns);
      const volQualScore = clampN(1 - volatility * 5);
      const high20 = Math.max(...closes.slice(-21, -1));
      const breakoutScore = cur >= high20 ? 1 : clampN(cur / high20);
      const peak = closes.reduce((m, c) => Math.max(m, c), closes[0]);
      const maxDD = peak > 0 ? (peak - cur) / peak : 0;
      const drawdownScore = clampN(1 - maxDD / 0.3);
      const quantScore = clampN(
        0.25 * momentumScore + 0.2 * trendScore + 0.15 * volAccScore + 0.15 * volQualScore + 0.15 * breakoutScore + 0.1 * drawdownScore
      );
      const priceChangePct = prev > 0 ? (cur - prev) / prev * 100 : 0;
      const credWeight = clampN(profile.marketCap / 1e5);
      const engScore = clampN((volSpike - 1) / 3);
      const momSentiment = clampN(Math.min(0.8, (priceChangePct + 5) / 10));
      const sectorBuzz = {
        Technology: 0.75,
        Financials: 0.65,
        Healthcare: 0.6,
        Energy: 0.55,
        Consumer: 0.58
      };
      const socialScore = clampN(0.3 * credWeight + 0.3 * engScore + 0.25 * momSentiment + 0.15 * (sectorBuzz[profile.sector] ?? 0.5));
      const newsBoost = { Technology: 0.1, Financials: 0.08, Healthcare: 0.07, Energy: 0.05 };
      const newsScore = clampN(0.5 + priceChangePct / 20 + (newsBoost[profile.sector] ?? 0.03));
      const newsImpact = clampN((volSpike - 1) / 4 + (newsBoost[profile.sector] ?? 0.03));
      const macroBase = {
        Technology: 0.72,
        Financials: 0.65,
        Energy: 0.58,
        Healthcare: 0.7,
        Consumer: 0.62,
        Industrials: 0.6,
        Telecom: 0.55,
        Materials: 0.52
      };
      const macroScore = clampN((macroBase[profile.sector] ?? 0.55) + rng() * 0.1);
      let bidVol = 0, askVol = 0;
      const window = Math.min(20, closes.length - 1);
      for (let i = closes.length - window; i < closes.length; i++) {
        if (closes[i] >= closes[i - 1]) bidVol += volumes[i];
        else askVol += volumes[i];
      }
      const orderImbalance = askVol > 0 ? bidVol / askVol : 1;
      const institutionalSignal = orderImbalance > 2.5;
      const instScore = clampN(
        0.5 * clampN((orderImbalance - 1) / 3) + 0.3 * clampN((volSpike - 1) / 4) + 0.2 * clampN(priceAccel / 5)
      );
      let gbScore = 0;
      if (priceChangePct > 0.5) gbScore += 0.2;
      if (priceAccel > 1.5) gbScore += 0.3;
      if (volSpike > 2) gbScore += 0.2;
      if (volatility < 0.3) gbScore += 0.1;
      gbScore = clampN(gbScore + rng() * 0.1);
      const regime = volatility > 0.8 ? "High Volatility" : volatility < 0.2 && Math.abs(trendScore - 0.5) < 0.05 ? "Low Volatility Sideways" : trendScore > 0.6 ? "Trending Up" : trendScore < 0.4 ? "Trending Down" : "Sideways";
      const regimeScore = regime === "Trending Up" ? 0.9 : regime === "Trending Down" ? 0.1 : regime === "High Volatility" ? 0.4 : 0.5;
      const hmmState = volSpike > 2.5 && priceChangePct > 0 ? "Accumulation" : volSpike > 2.5 && priceChangePct < 0 ? "Distribution" : Math.abs(priceChangePct) > 3 ? "Breakout" : "Reversal Watch";
      const hmmScore = hmmState === "Accumulation" ? 0.8 : hmmState === "Breakout" ? 0.95 : hmmState === "Distribution" ? 0.2 : 0.5;
      const aiScore = clampN(0.3 * gbScore + 0.25 * regimeScore + 0.2 * hmmScore + 0.15 * hmmScore + 0.1 * socialScore);
      const qBuy = 0.4 * trendScore + 0.3 * socialScore + 0.3 * instScore;
      const rlAction = qBuy > 0.45 ? "BUY" : qBuy < 0.28 ? "SELL" : "HOLD";
      const finalScore = clampN(
        0.2 * rallyScore + 0.15 * quantScore + 0.15 * socialScore + 0.15 * newsScore + 0.1 * macroScore + 0.15 * instScore + 0.1 * aiScore
      );
      const signal = finalScore > 0.72 && rlAction === "BUY" ? "STRONG BUY" : finalScore > 0.55 ? "BUY" : finalScore > 0.38 ? "HOLD" : "SELL";
      const confidence = finalScore > 0.72 ? "HIGH" : finalScore > 0.48 ? "MEDIUM" : "LOW";
      const ts = (/* @__PURE__ */ new Date()).toISOString();
      const alerts = [];
      if (earlyRallySignal) alerts.push({ stockSymbol: profile.symbol, alertType: "RALLY", severity: "HIGH", reason: `Price acceleration ${priceAccel.toFixed(2)}% with volume spike ${volSpike.toFixed(1)}x \u2014 early rally detected`, confidenceScore: +rallyScore.toFixed(2), timestamp: ts });
      if (institutionalSignal) alerts.push({ stockSymbol: profile.symbol, alertType: "INSTITUTIONAL", severity: "HIGH", reason: `Order imbalance ${orderImbalance.toFixed(2)}x \u2014 smart money accumulation`, confidenceScore: +instScore.toFixed(2), timestamp: ts });
      if (newsImpact > 0.7) alerts.push({ stockSymbol: profile.symbol, alertType: "NEWS", severity: "MEDIUM", reason: "High-impact news event \u2014 significant price catalyst", confidenceScore: +newsImpact.toFixed(2), timestamp: ts });
      if (volSpike > 4) alerts.push({ stockSymbol: profile.symbol, alertType: "VOLUME", severity: "HIGH", reason: `Volume surge ${volSpike.toFixed(1)}x above average`, confidenceScore: +Math.min(0.95, volSpike / 6).toFixed(2), timestamp: ts });
      if (aiScore > 0.8) alerts.push({ stockSymbol: profile.symbol, alertType: "AI_PREDICTION", severity: "HIGH", reason: "AI ensemble confidence > 80% \u2014 strong directional signal", confidenceScore: +aiScore.toFixed(2), timestamp: ts });
      return {
        symbol: profile.symbol,
        sector: profile.sector,
        industry: profile.industry,
        currentPrice: +cur.toFixed(2),
        priceChange: +(cur - prev).toFixed(2),
        priceChangePercent: +priceChangePct.toFixed(2),
        priceAcceleration: +priceAccel.toFixed(2),
        volumeSpike: +volSpike.toFixed(2),
        earlyRallySignal,
        rallyProbabilityScore: +rallyScore.toFixed(2),
        quantFilterScore: +quantScore.toFixed(2),
        socialSentimentScore: +socialScore.toFixed(2),
        newsSentimentScore: +newsScore.toFixed(2),
        newsImpactScore: +newsImpact.toFixed(2),
        macroScore: +macroScore.toFixed(2),
        sectorImpact: { Technology: "Positive \u2014 rate stability, IT exports", Financials: "Positive \u2014 credit growth", Energy: "Neutral \u2014 crude stable", Healthcare: "Positive \u2014 export demand", Consumer: "Positive \u2014 rural recovery" }[profile.sector] ?? "Neutral",
        orderImbalance: +orderImbalance.toFixed(2),
        institutionalSignal,
        institutionalScore: +instScore.toFixed(2),
        aiPredictionScore: +aiScore.toFixed(2),
        marketRegime: regime,
        rlAction,
        finalScore: +finalScore.toFixed(2),
        alerts,
        signal,
        confidence,
        rank: 0
      };
    });
    const seen = /* @__PURE__ */ new Set();
    const ranked = results.filter((r) => {
      if (seen.has(r.symbol)) return false;
      seen.add(r.symbol);
      return true;
    }).sort((a, b) => b.finalScore - a.finalScore).map((r, i) => ({ ...r, rank: i + 1 }));
    const top50 = ranked.slice(0, 50);
    const earlyRallyCandidates = ranked.filter((r) => r.earlyRallySignal).slice(0, 15);
    const liveAlerts = ranked.slice(0, 30).flatMap((r) => r.alerts).sort((a, b) => b.confidenceScore - a.confidenceScore).slice(0, 20);
    const sectorMap = /* @__PURE__ */ new Map();
    ranked.forEach((r) => {
      if (!sectorMap.has(r.sector)) sectorMap.set(r.sector, []);
      sectorMap.get(r.sector).push(r.finalScore);
    });
    const sectorStrength = [...sectorMap.entries()].map(([sector, scores]) => {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      const max = Math.max(...scores);
      return { sector, avgScore: +avg.toFixed(2), maxScore: +max.toFixed(2), stockCount: scores.length, strength: avg > 0.65 ? "STRONG" : avg > 0.5 ? "MODERATE" : "WEAK" };
    }).sort((a, b) => b.avgScore - a.avgScore);
    const bullish = ranked.filter((r) => r.finalScore > 0.65).length;
    const highConf = ranked.filter((r) => r.confidence === "HIGH").length;
    const avgScore = ranked.reduce((s, r) => s + r.finalScore, 0) / Math.max(1, ranked.length);
    const payload = {
      rankings: top50,
      earlyRallyCandidates,
      liveAlerts,
      newsFeed: top50.slice(0, 20).map((r, i) => ({
        symbol: r.symbol,
        headline: `${r.symbol} (${r.sector}): ${r.signal} signal \u2014 score ${Math.round(r.finalScore * 100)}, vol spike ${r.volumeSpike.toFixed(1)}x, ${r.priceChangePercent >= 0 ? "up" : "down"} ${Math.abs(r.priceChangePercent).toFixed(2)}% today`,
        sector: r.sector,
        impact: r.finalScore > 0.7 ? "HIGH" : r.finalScore > 0.5 ? "MEDIUM" : "LOW",
        sentiment: r.signal === "STRONG BUY" || r.signal === "BUY" ? "POSITIVE" : r.signal === "SELL" ? "NEGATIVE" : "NEUTRAL",
        rallyRelevance: r.earlyRallySignal ? "RALLY CANDIDATE" : r.institutionalSignal ? "INSTITUTIONAL FLOW" : "WATCHLIST",
        priceChange: r.priceChangePercent,
        volumeSpike: r.volumeSpike,
        aiScore: Math.round(r.finalScore * 100),
        timestamp: new Date(Date.now() - i * 12e4).toISOString(),
        source: "AI Intelligence Engine"
      })),
      macroSnapshot: {
        repoRate: { value: "6.50%", trend: "STABLE", impact: "NEUTRAL" },
        inflation: { value: "4.85%", trend: "FALLING", impact: "POSITIVE" },
        crudePriceUSD: { value: "82.40", trend: "STABLE", impact: "NEUTRAL" },
        usdinr: { value: "83.45", trend: "STABLE", impact: "NEUTRAL" },
        nifty50Trend: { value: "Bullish", momentum: "STRONG" },
        fiiFlow: { value: "+3,240 Cr", trend: "INFLOW", impact: "POSITIVE" },
        globalSentiment: { value: "Risk-On", vix: "14.2", impact: "POSITIVE" }
      },
      sectorStrength,
      summary: {
        totalScanned: ranked.length,
        bullishCount: bullish,
        earlyRallyCount: earlyRallyCandidates.length,
        highConfidenceCount: highConf,
        averageFinalScore: +avgScore.toFixed(2),
        marketBias: avgScore > 0.6 ? "BULLISH" : avgScore > 0.45 ? "NEUTRAL" : "BEARISH"
      },
      computedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    aiIntelCache = { expiresAt: Date.now() + 6e4, payload };
    return payload;
  };
  let geminiEnrichCache = null;
  const enrichDashboardWithGemini = async (base, forceRefresh = false) => {
    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) return base;
    if (!forceRefresh && geminiEnrichCache && geminiEnrichCache.expiresAt > Date.now()) {
      return { ...base, ...geminiEnrichCache.payload };
    }
    try {
      const ai = new GoogleGenAI({ apiKey });
      const today = (/* @__PURE__ */ new Date()).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
      const topStocks = base.rankings.slice(0, 15).map(
        (r) => `${r.symbol}|${r.sector}|score=${Math.round(r.finalScore * 100)}|signal=${r.signal}|chg=${r.priceChangePercent > 0 ? "+" : ""}${r.priceChangePercent.toFixed(2)}%|vol=${r.volumeSpike.toFixed(1)}x|rally=${r.earlyRallySignal}`
      ).join("\n");
      const prompt = `You are a senior Indian equity market analyst and financial journalist. Today is ${today}.

Analyze these top-ranked NSE/BSE stocks and generate individual stock-specific news that explains WHY each stock may rally or fall next:

${topStocks}

Respond with valid JSON only (no markdown):

{
  "marketSummary": "<one sentence on today's overall Indian market>",
  "aiInsights": "<2-sentence outlook for Indian equities today>",
  "stockNews": [
    {
      "symbol": "<exact symbol from list>",
      "headline": "<specific news headline about THIS stock \u2014 earnings/results/order win/FII buying/technical breakout/sector catalyst>",
      "sector": "<sector>",
      "impact": "HIGH|MEDIUM|LOW",
      "sentiment": "POSITIVE|NEGATIVE|NEUTRAL",
      "rallyTrigger": "<one sentence: specific reason this stock could rally \u2014 e.g. Q4 results beat, FII accumulation, breakout above resistance>",
      "riskFactor": "<one sentence: key risk to watch>",
      "source": "Economic Times|Moneycontrol|Bloomberg|Reuters|CNBC TV18|NSE Filing"
    }
  ],
  "macroNews": [
    { "headline": "...", "sector": "Macro|Financials|Energy|Technology|Consumer|Healthcare|Materials", "impact": "HIGH|MEDIUM|LOW", "sentiment": "POSITIVE|NEGATIVE|NEUTRAL", "source": "..." }
  ],
  "macroSnapshot": {
    "repoRate":        { "value": "...", "trend": "STABLE|RISING|FALLING", "impact": "POSITIVE|NEGATIVE|NEUTRAL" },
    "inflation":       { "value": "...", "trend": "STABLE|RISING|FALLING", "impact": "POSITIVE|NEGATIVE|NEUTRAL" },
    "crudePriceUSD":   { "value": "...", "trend": "STABLE|RISING|FALLING", "impact": "POSITIVE|NEGATIVE|NEUTRAL" },
    "usdinr":          { "value": "...", "trend": "STABLE|RISING|FALLING", "impact": "POSITIVE|NEGATIVE|NEUTRAL" },
    "nifty50Trend":    { "value": "...", "momentum": "STRONG|MODERATE|WEAK" },
    "fiiFlow":         { "value": "...", "trend": "INFLOW|OUTFLOW", "impact": "POSITIVE|NEGATIVE|NEUTRAL" },
    "globalSentiment": { "value": "...", "vix": "...", "impact": "POSITIVE|NEGATIVE|NEUTRAL" }
  }
}

Generate stockNews for ALL ${Math.min(15, base.rankings.length)} stocks. Generate 4 macroNews items.`;
      const result = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });
      const raw = result.text || "{}";
      const parsed = JSON.parse(raw);
      const rankMap = new Map(base.rankings.map((r) => [r.symbol, r]));
      const stockNews = (parsed.stockNews || []).map((item, i) => {
        const quant = rankMap.get(item.symbol);
        return {
          ...item,
          type: "stock",
          aiScore: quant ? Math.round(quant.finalScore * 100) : 0,
          signal: quant?.signal || "HOLD",
          priceChange: quant?.priceChangePercent || 0,
          volumeSpike: quant?.volumeSpike || 1,
          earlyRally: quant?.earlyRallySignal || false,
          timestamp: new Date(Date.now() - i * 9e4).toISOString()
        };
      });
      const macroNews = (parsed.macroNews || []).map((item, i) => ({
        ...item,
        type: "macro",
        symbol: null,
        timestamp: new Date(Date.now() - i * 18e4).toISOString()
      }));
      const combinedFeed = [
        ...stockNews.sort((a, b) => b.aiScore - a.aiScore),
        ...macroNews
      ];
      const enrichment = {
        newsFeed: combinedFeed.length > 0 ? combinedFeed : base.newsFeed,
        macroSnapshot: parsed.macroSnapshot || base.macroSnapshot,
        aiInsights: parsed.aiInsights || "",
        marketSummary: parsed.marketSummary || "",
        aiPowered: true
      };
      geminiEnrichCache = { expiresAt: Date.now() + 5 * 6e4, payload: enrichment };
      logAction("ai-intelligence.gemini.enriched", { stockNews: stockNews.length, macroNews: macroNews.length });
      return { ...base, ...enrichment };
    } catch (err) {
      logError("ai-intelligence.gemini.enrich.failed", err);
      return base;
    }
  };
  app.get("/api/ai-intelligence/dashboard", async (req, res) => {
    try {
      const base = buildAIIntelligenceDashboard();
      const enriched = await enrichDashboardWithGemini(base);
      res.json(enriched);
    } catch (err) {
      logError("ai-intelligence.dashboard.failed", err);
      res.status(500).json({ error: "Failed to build AI Intelligence dashboard" });
    }
  });
  app.post("/api/ai-intelligence/refresh", async (req, res) => {
    try {
      const base = buildAIIntelligenceDashboard(true);
      const enriched = await enrichDashboardWithGemini(base, true);
      res.json(enriched);
    } catch (err) {
      logError("ai-intelligence.refresh.failed", err);
      res.status(500).json({ error: "Failed to refresh AI Intelligence dashboard" });
    }
  });
  app.get("/api/ai-intelligence/alerts", (req, res) => {
    try {
      res.json({ alerts: buildAIIntelligenceDashboard().liveAlerts });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch alerts" });
    }
  });
  app.get("/api/ai-intelligence/rally-candidates", (req, res) => {
    try {
      res.json(buildAIIntelligenceDashboard().earlyRallyCandidates);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch rally candidates" });
    }
  });
  function predEMA(closes, period) {
    if (closes.length < period) return closes[closes.length - 1] ?? 0;
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
    return ema;
  }
  function predRSI(closes, period = 14) {
    if (closes.length < period + 1) return 50;
    const changes = closes.slice(-(period + 1)).map((c, i, a) => i === 0 ? 0 : c - a[i - 1]).slice(1);
    const gains = changes.filter((c) => c > 0).reduce((s, c) => s + c, 0) / period;
    const losses = changes.filter((c) => c < 0).reduce((s, c) => s + Math.abs(c), 0) / period;
    if (losses === 0) return 100;
    return 100 - 100 / (1 + gains / losses);
  }
  function predMACD(closes) {
    if (closes.length < 35) return 0;
    const k12 = 2 / 13, k26 = 2 / 27;
    let e12 = closes.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
    let e26 = closes.slice(0, 26).reduce((a, b) => a + b, 0) / 26;
    const macdSeries = [];
    for (let i = 12; i < closes.length; i++) {
      e12 = closes[i] * k12 + e12 * (1 - k12);
      if (i >= 26) {
        e26 = closes[i] * k26 + e26 * (1 - k26);
        macdSeries.push(e12 - e26);
      }
    }
    if (macdSeries.length < 9) return 0;
    const k9 = 2 / 10;
    let sig = macdSeries.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
    for (let i = 9; i < macdSeries.length; i++) sig = macdSeries[i] * k9 + sig * (1 - k9);
    return macdSeries[macdSeries.length - 1] - sig;
  }
  function predATR(candles, period = 14) {
    if (candles.length < 2) return 0;
    const trs = candles.slice(1).map((c, i) => Math.max(c.h - c.l, Math.abs(c.h - candles[i].c), Math.abs(c.l - candles[i].c)));
    return trs.slice(-period).reduce((a, b) => a + b, 0) / Math.min(period, trs.length);
  }
  function predVolRatio(vols) {
    if (vols.length < 5) return 1;
    const cur = vols[vols.length - 1];
    const avg = vols.slice(-11, -1).reduce((a, b) => a + b, 0) / 10;
    return avg > 0 ? cur / avg : 1;
  }
  function makePredCandles(symbol, avgVol, count = 60) {
    let state = symbol.split("").reduce((s, c, i) => s * 31 + c.charCodeAt(0) * (i + 1) >>> 0, 1234567891);
    const rng = () => {
      state = state * 1664525 + 1013904223 >>> 0;
      return state / 4294967295;
    };
    const bias = (rng() - 0.5) * 0.01;
    let price = 50 + rng() * 1950;
    const vol = avgVol > 0 ? avgVol : 5e5;
    const candles = [];
    for (let i = 0; i < count; i++) {
      const noise = (rng() - 0.5) * 0.022;
      const change = bias + noise;
      const o = price;
      const c = price * (1 + change);
      const h = Math.max(o, c) * (1 + rng() * 6e-3);
      const l = Math.min(o, c) * (1 - rng() * 6e-3);
      const v = Math.round(vol * (0.5 + rng() * 1));
      candles.push({ h: +h.toFixed(2), l: +l.toFixed(2), c: +c.toFixed(2), v });
      price = c;
    }
    return candles;
  }
  function predictStock(symbol, sector, exchange, avgVol) {
    const candles = makePredCandles(symbol, avgVol);
    const closes = candles.map((c) => c.c);
    const vols = candles.map((c) => c.v);
    const rsi = predRSI(closes);
    const macdHist = predMACD(closes);
    const ema20 = predEMA(closes, 20);
    const ema50 = predEMA(closes, 50);
    const volRatio = predVolRatio(vols);
    const atr = predATR(candles, 14);
    const price = closes[closes.length - 1];
    const rsiScore = Math.max(-1, Math.min(1, (rsi - 50) / 30));
    const macdScore = price > 0 ? Math.max(-1, Math.min(1, macdHist / (price * 5e-3))) : macdHist > 0 ? 1 : -1;
    const volAmp = Math.min(1, Math.max(0, (volRatio - 0.5) / 2));
    const dirSignal = rsiScore + macdScore;
    const volScore = dirSignal !== 0 ? volAmp * Math.sign(dirSignal) : 0;
    const trendScore = ema50 > 0 ? Math.max(-1, Math.min(1, (ema20 - ema50) / (ema50 * 0.02))) : 0;
    const score = 0.3 * rsiScore + 0.3 * macdScore + 0.2 * volScore + 0.2 * trendScore;
    if (Math.abs(score) < 0.15) return null;
    const prediction = score > 0 ? "Bullish" : "Bearish";
    const volFactor = price > 0 ? Math.min(0.4, atr / price * 8) : 0;
    const dir = score > 0 ? 1 : -1;
    const signals = [rsiScore, macdScore, volScore, trendScore];
    const agreeing = signals.filter((s) => s * dir > 0.05).length;
    const agreement = 0.4 + 0.6 * (agreeing / signals.length);
    const confidence = Math.max(52, Math.min(95, Math.round(Math.abs(score) * 160 * (1 - volFactor) * agreement)));
    if (confidence < 55) return null;
    const parts = [];
    if (rsi > 60) parts.push(`RSI ${rsi.toFixed(0)} strong`);
    else if (rsi < 40) parts.push(`RSI ${rsi.toFixed(0)} oversold`);
    if (macdHist > 0) parts.push("MACD bullish");
    else parts.push("MACD bearish");
    if (volRatio > 1.5) parts.push(`${volRatio.toFixed(1)}x volume`);
    if (trendScore > 0.3) parts.push("uptrend");
    else if (trendScore < -0.3) parts.push("downtrend");
    const explanation = `${prediction} \u2014 ${parts.slice(0, 3).join(", ") || "mixed signals"}`;
    const atrPct = price > 0 ? atr / price : 0.01;
    const predictedPrice = +(price * (1 + atrPct * (prediction === "Bullish" ? 0.4 : -0.4))).toFixed(2);
    return {
      stock: symbol,
      sector,
      exchange,
      prediction,
      confidence,
      signals: { RSI: +rsiScore.toFixed(3), MACD: +macdScore.toFixed(3), Volume: +volScore.toFixed(3), Trend: +trendScore.toFixed(3), Sentiment: 0, Bollinger: 0 },
      explanation,
      predicted_price: predictedPrice,
      current_price: +price.toFixed(2),
      raw_score: +score.toFixed(4),
      indicators: { rsi: +rsi.toFixed(1), atr: +atr.toFixed(2), volumeRatio: +volRatio.toFixed(2), ema20: +ema20.toFixed(2), ema50: +ema50.toFixed(2) }
    };
  }
  const predHistory = /* @__PURE__ */ new Map();
  let predCache = null;
  let predRunning = false;
  const PRED_CACHE_TTL = 15 * 60 * 1e3;
  async function runPredictionScan() {
    if (predRunning) return;
    predRunning = true;
    try {
      const universe = getUniverse();
      if (universe.length === 0) {
        predRunning = false;
        return;
      }
      const bullish = [];
      const bearish = [];
      const BATCH = 500;
      for (let i = 0; i < universe.length; i += BATCH) {
        await new Promise((r) => setImmediate(r));
        for (const p of universe.slice(i, i + BATCH)) {
          try {
            const result = predictStock(p.symbol, p.sector || "Unknown", p.exchange || "NSE", p.averageVolume || 0);
            if (!result) continue;
            if (result.prediction === "Bullish") bullish.push(result);
            else bearish.push(result);
          } catch {
          }
        }
      }
      bullish.sort((a, b) => b.confidence - a.confidence);
      bearish.sort((a, b) => b.confidence - a.confidence);
      const topBullish = bullish.slice(0, 20);
      const topBearish = bearish.slice(0, 20);
      const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      predHistory.set(today, [...topBullish, ...topBearish]);
      predCache = {
        data: {
          bullish: topBullish,
          bearish: topBearish,
          totalScanned: universe.length,
          bullishCount: bullish.length,
          bearishCount: bearish.length,
          generatedAt: (/* @__PURE__ */ new Date()).toISOString()
        },
        ts: Date.now()
      };
      console.log(`[PredictionScan] Done \u2014 ${universe.length} stocks, ${bullish.length} bullish, ${bearish.length} bearish`);
    } finally {
      predRunning = false;
    }
  }
  setTimeout(() => runPredictionScan().catch((e) => console.error("[PredictionScan]", e)), 3e4);
  app.get("/api/predictions/run", (req, res) => {
    const now = Date.now();
    const refresh = req.query.refresh === "true";
    if (!refresh && predCache && now - predCache.ts < PRED_CACHE_TTL) {
      return res.json(predCache.data);
    }
    if (!predRunning) runPredictionScan().catch((e) => console.error("[PredictionScan]", e));
    if (predCache) return res.json({ ...predCache.data, stale: true });
    return res.json({
      computing: true,
      message: "Scanning universe \u2014 ready in ~15s. Click Refresh.",
      bullish: [],
      bearish: [],
      totalScanned: 0,
      bullishCount: 0,
      bearishCount: 0,
      generatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app.get("/api/predictions/dates", (req, res) => {
    const dates = [...predHistory.keys()].sort().reverse();
    res.json({ dates });
  });
  app.get("/api/predictions/history/:date", (req, res) => {
    const preds = predHistory.get(req.params.date) || [];
    res.json({
      date: req.params.date,
      bullish: preds.filter((p) => p.prediction === "Bullish"),
      bearish: preds.filter((p) => p.prediction === "Bearish"),
      total: preds.length
    });
  });
  app.get("/api/predictions/accuracy", (req, res) => {
    res.json({ total: 0, correct: 0, accuracy: 0, avgConfidence: 0 });
  });
  app.post("/api/predictions/update-actual", express.json(), (req, res) => {
    res.json({ success: true });
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path3.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path3.join(process.cwd(), "dist/index.html"));
    });
  }
  app.use(errorLoggingMiddleware);
  upstoxService.initialize();
  return app;
}
async function startServer() {
  const app = await buildApp();
  const PORT = 3e3;
  app.listen(PORT, "0.0.0.0", () => {
    logAction("server.started", {
      port: PORT,
      nodeEnv: process.env.NODE_ENV || "development"
    });
    console.log(`Server running on http://localhost:${PORT}`);
    initUniverse().catch(
      (err) => console.warn("[StockUniverseService] Background init failed:", err.message)
    );
  });
  process.on("SIGTERM", () => {
    console.log("SIGTERM received, shutting down gracefully...");
    UpstoxService.getInstance().shutdown();
    process.exit(0);
  });
  process.on("SIGINT", () => {
    console.log("SIGINT received, shutting down gracefully...");
    UpstoxService.getInstance().shutdown();
    process.exit(0);
  });
}
async function startServerlessApp() {
  const app = await buildApp();
  initUniverse().catch(
    (err) => console.warn("[StockUniverseService] Background init failed:", err.message)
  );
  return app;
}
if (!process.env.VERCEL) {
  startServer().catch((error) => {
    logError("server.startup.failed", error);
    process.exitCode = 1;
  });
}
export {
  startServerlessApp
};
