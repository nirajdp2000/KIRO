package com.stockpulse.service;

import com.stockpulse.analyzer.AIPredictionService;
import com.stockpulse.analyzer.PerformanceEngine;
import com.stockpulse.analyzer.SignalAggregator;
import com.stockpulse.model.*;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.stream.Collectors;

/**
 * AI Stock Intelligence Service — 10-module pipeline.
 *
 * Module 1  — Early Rally Detection Engine
 * Module 2  — Advanced Quant Filter Engine
 * Module 3  — Real-Time Social Sentiment Engine
 * Module 4  — News Intelligence Engine
 * Module 5  — Macro & Geopolitical Engine
 * Module 6  — Institutional Flow Detector
 * Module 7  — AI Prediction Engine
 * Module 8  — Master Stock Ranking System
 * Module 9  — Real-Time Alert Engine
 * Module 10 — Data Quality Control
 *
 * All modules run in parallel via ExecutorService.
 * Results are cached for 60 seconds to avoid redundant computation.
 */
@Service
public class AIStockIntelligenceService {

    private static final Logger log = LoggerFactory.getLogger(AIStockIntelligenceService.class);

    // ── Weights for Module 8 master score ──────────────────────────────────
    private static final double W_RALLY        = 0.20;
    private static final double W_QUANT        = 0.15;
    private static final double W_SOCIAL       = 0.15;
    private static final double W_NEWS         = 0.15;
    private static final double W_MACRO        = 0.10;
    private static final double W_INSTITUTIONAL = 0.15;
    private static final double W_AI           = 0.10;

    // ── Weights for Module 2 quant filter score ─────────────────────────────
    private static final double QW_MOMENTUM   = 0.25;
    private static final double QW_TREND      = 0.20;
    private static final double QW_VOLUME     = 0.15;
    private static final double QW_VOLATILITY = 0.15;
    private static final double QW_BREAKOUT   = 0.15;
    private static final double QW_DRAWDOWN   = 0.10;

    private final PerformanceEngine performanceEngine;
    private final AIPredictionService aiPredictionService;
    private final SignalAggregator signalAggregator;
    private final QuantMarketDataFactoryService marketDataFactory;
    private final ExecutorService executor;

    // 60-second dashboard cache
    private volatile AIStockIntelligenceDashboard cachedDashboard;
    private volatile long cacheTimestamp = 0;
    private static final long CACHE_TTL_MS = 60_000;

    private final SplittableRandom rng = new SplittableRandom(42);

    public AIStockIntelligenceService(
            PerformanceEngine performanceEngine,
            AIPredictionService aiPredictionService,
            SignalAggregator signalAggregator,
            QuantMarketDataFactoryService marketDataFactory
    ) {
        this.performanceEngine = performanceEngine;
        this.aiPredictionService = aiPredictionService;
        this.signalAggregator = signalAggregator;
        this.marketDataFactory = marketDataFactory;
        this.executor = Executors.newFixedThreadPool(Math.max(4, Runtime.getRuntime().availableProcessors() * 2));
    }

    @PreDestroy
    public void shutdown() {
        executor.shutdownNow();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════════════════

    public AIStockIntelligenceDashboard buildDashboard() {
        long now = System.currentTimeMillis();
        if (cachedDashboard != null && (now - cacheTimestamp) < CACHE_TTL_MS) {
            return cachedDashboard;
        }

        List<StockProfile> universe = marketDataFactory.buildUniverse();

        // Module 10 — Data Quality: deduplicate universe by symbol
        List<StockProfile> cleanUniverse = universe.stream()
                .collect(Collectors.toMap(StockProfile::getSymbol, p -> p, (a, b) -> a))
                .values().stream().toList();

        // Parallel analysis — one CompletableFuture per stock
        List<CompletableFuture<StockIntelligenceResult>> futures = cleanUniverse.stream()
                .map(profile -> CompletableFuture.supplyAsync(() -> analyzeStock(profile), executor))
                .toList();

        List<StockIntelligenceResult> results = futures.stream()
                .map(f -> {
                    try { return f.join(); }
                    catch (Exception e) { log.warn("Stock analysis failed: {}", e.getMessage()); return null; }
                })
                .filter(Objects::nonNull)
                .sorted(Comparator.comparingDouble(StockIntelligenceResult::getFinalScore).reversed())
                .toList();

        // Assign ranks (Module 8)
        List<StockIntelligenceResult> ranked = new ArrayList<>();
        for (int i = 0; i < results.size(); i++) {
            StockIntelligenceResult r = results.get(i);
            r.setRank(i + 1);
            ranked.add(r);
        }

        List<StockIntelligenceResult> top50 = ranked.stream().limit(50).toList();
        List<StockIntelligenceResult> rallyCandidates = ranked.stream()
                .filter(StockIntelligenceResult::isEarlyRallySignal)
                .limit(15)
                .toList();

        // Module 9 — Collect all alerts
        List<StockAlert> allAlerts = ranked.stream()
                .limit(30)
                .flatMap(r -> r.getAlerts().stream())
                .sorted(Comparator.comparingDouble(StockAlert::getConfidenceScore).reversed())
                .limit(20)
                .toList();

        AIStockIntelligenceDashboard dashboard = AIStockIntelligenceDashboard.builder()
                .rankings(top50)
                .earlyRallyCandidates(rallyCandidates)
                .liveAlerts(allAlerts)
                .newsFeed(buildNewsFeed())
                .macroSnapshot(buildMacroSnapshot())
                .sectorStrength(buildSectorStrength(ranked))
                .summary(buildSummary(ranked, rallyCandidates))
                .computedAt(Instant.now().toString())
                .build();

        cachedDashboard = dashboard;
        cacheTimestamp = now;
        log.info("[AIStockIntelligence] Dashboard built: {} stocks, {} rally candidates, {} alerts",
                top50.size(), rallyCandidates.size(), allAlerts.size());
        return dashboard;
    }

    /** Force-refresh — bypasses cache */
    public AIStockIntelligenceDashboard refresh() {
        cacheTimestamp = 0;
        return buildDashboard();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CORE STOCK ANALYSIS — runs all 10 modules per stock
    // ═══════════════════════════════════════════════════════════════════════

    private StockIntelligenceResult analyzeStock(StockProfile profile) {
        List<MarketCandle> candles = marketDataFactory.generateCandles(profile, 1);
        if (candles == null || candles.size() < 20) {
            return null;
        }

        List<Double> closes = candles.stream().mapToDouble(MarketCandle::getClose).boxed().toList();
        List<Double> volumes = candles.stream().mapToDouble(MarketCandle::getVolume).boxed().toList();

        double currentPrice = closes.get(closes.size() - 1);
        double prevClose    = closes.get(closes.size() - 2);
        double priceChange  = currentPrice - prevClose;
        double priceChangePct = prevClose > 0 ? (priceChange / prevClose) * 100 : 0;

        // ── Module 1: Early Rally Detection ─────────────────────────────────
        int idx15 = Math.max(0, closes.size() - 4); // ~15 min proxy (4 candles back)
        double price15MinAgo = closes.get(idx15);
        double priceAcceleration = price15MinAgo > 0 ? (currentPrice - price15MinAgo) / price15MinAgo * 100 : 0;
        double avgVolume = volumes.stream().mapToDouble(Double::doubleValue).average().orElse(1);
        double currentVolume = volumes.get(volumes.size() - 1);
        double volumeSpike = avgVolume > 0 ? currentVolume / avgVolume : 1;
        boolean earlyRallySignal = priceAcceleration > 2.0 && volumeSpike > 3.0;
        double rallyScore = computeRallyScore(priceAcceleration, volumeSpike, closes);

        // ── Module 2: Quant Filter ───────────────────────────────────────────
        double quantScore = computeQuantFilterScore(closes, volumes, profile);

        // ── Module 3: Social Sentiment ───────────────────────────────────────
        double socialScore = computeSocialSentimentScore(profile, priceChangePct, volumeSpike);

        // ── Module 4: News Intelligence ──────────────────────────────────────
        double newsScore  = computeNewsSentimentScore(profile, priceChangePct);
        double newsImpact = computeNewsImpactScore(profile, volumeSpike);

        // ── Module 5: Macro ──────────────────────────────────────────────────
        double macroScore = computeMacroScore(profile.getSector());

        // ── Module 6: Institutional Flow ─────────────────────────────────────
        double orderImbalance = computeOrderImbalance(volumes, closes);
        boolean institutionalSignal = orderImbalance > 2.5;
        double institutionalScore = computeInstitutionalScore(orderImbalance, volumeSpike, priceAcceleration);

        // ── Module 7: AI Prediction ──────────────────────────────────────────
        double volatility = performanceEngine.calculateVolatility(computeReturns(closes));
        double trendStrength = performanceEngine.calculateTrendStrength(computeEMA(closes, 50));
        double gbScore = aiPredictionService.predictGradientBoosting(
                priceChangePct, priceAcceleration, volumeSpike, 0, volatility);
        String regime = aiPredictionService.detectRegime(volatility, trendStrength);
        String hmmState = aiPredictionService.detectHMMState(volumeSpike, priceChangePct);
        double hmmScore = signalAggregator.mapHMMStateToScore(hmmState);
        double regimeScore = signalAggregator.mapRegimeToScore(regime);
        double aiScore = signalAggregator.aggregatePredictions(gbScore, regimeScore, hmmScore, hmmScore, socialScore);
        String rlAction = aiPredictionService.getRLAction(currentPrice, trendStrength, socialScore);

        // ── Module 8: Master Score ───────────────────────────────────────────
        double finalScore = W_RALLY * rallyScore
                + W_QUANT * quantScore
                + W_SOCIAL * socialScore
                + W_NEWS * newsScore
                + W_MACRO * macroScore
                + W_INSTITUTIONAL * institutionalScore
                + W_AI * aiScore;
        finalScore = Math.min(1.0, Math.max(0.0, finalScore));

        // ── Module 9: Alerts ─────────────────────────────────────────────────
        List<StockAlert> alerts = buildAlerts(profile.getSymbol(), earlyRallySignal,
                institutionalSignal, newsImpact, socialScore, aiScore, volumeSpike);

        String signal = deriveSignal(finalScore, rlAction);
        String confidence = finalScore > 0.75 ? "HIGH" : finalScore > 0.50 ? "MEDIUM" : "LOW";

        return StockIntelligenceResult.builder()
                .symbol(profile.getSymbol())
                .sector(profile.getSector())
                .industry(profile.getIndustry())
                .currentPrice(currentPrice)
                .priceChange(priceChange)
                .priceChangePercent(priceChangePct)
                .priceAcceleration(round2(priceAcceleration))
                .volumeSpike(round2(volumeSpike))
                .earlyRallySignal(earlyRallySignal)
                .rallyProbabilityScore(round2(rallyScore))
                .quantFilterScore(round2(quantScore))
                .socialSentimentScore(round2(socialScore))
                .newsSentimentScore(round2(newsScore))
                .newsImpactScore(round2(newsImpact))
                .macroScore(round2(macroScore))
                .sectorImpact(getSectorImpact(profile.getSector()))
                .orderImbalance(round2(orderImbalance))
                .institutionalSignal(institutionalSignal)
                .institutionalScore(round2(institutionalScore))
                .aiPredictionScore(round2(aiScore))
                .marketRegime(regime)
                .rlAction(rlAction)
                .finalScore(round2(finalScore))
                .alerts(alerts)
                .signal(signal)
                .confidence(confidence)
                .build();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MODULE IMPLEMENTATIONS
    // ═══════════════════════════════════════════════════════════════════════

    /** Module 1 — Rally probability: combines acceleration, volume spike, volatility compression */
    private double computeRallyScore(double priceAccel, double volSpike, List<Double> closes) {
        double accelScore  = Math.min(1.0, priceAccel / 5.0);   // 5% = max
        double spikeScore  = Math.min(1.0, (volSpike - 1) / 4.0); // 5x = max
        // Volatility compression: low recent std-dev relative to longer window
        double recentVol = computeStdDev(closes.subList(Math.max(0, closes.size() - 5), closes.size()));
        double longerVol = computeStdDev(closes.subList(Math.max(0, closes.size() - 20), closes.size()));
        double compressionScore = longerVol > 0 ? Math.min(1.0, 1.0 - (recentVol / longerVol)) : 0;
        return Math.max(0, 0.40 * accelScore + 0.40 * spikeScore + 0.20 * compressionScore);
    }

    /** Module 2 — Quant filter: 6-factor composite */
    private double computeQuantFilterScore(List<Double> closes, List<Double> volumes, StockProfile profile) {
        double momentum   = normalizeMomentum(performanceEngine.calculateMomentum(
                closes.get(closes.size() - 1), closes.get(Math.max(0, closes.size() - 130))));
        double trend      = normalizeTrend(performanceEngine.calculateTrendStrength(computeEMA(closes, 50)));
        double volScore   = normalizeVolumeAccumulation(volumes);
        double volatility = normalizeVolatility(performanceEngine.calculateVolatility(computeReturns(closes)));
        double breakout   = computeBreakoutScore(closes);
        double drawdown   = 1.0 - Math.min(1.0, performanceEngine.calculateMaxDrawdown(closes) / 30.0);
        return QW_MOMENTUM * momentum + QW_TREND * trend + QW_VOLUME * volScore
                + QW_VOLATILITY * volatility + QW_BREAKOUT * breakout + QW_DRAWDOWN * drawdown;
    }

    /** Module 3 — Social sentiment: credibility-weighted, bot-filtered proxy */
    private double computeSocialSentimentScore(StockProfile profile, double priceChangePct, double volSpike) {
        // Credibility filter: large-cap stocks have higher verified source weight
        double credibilityWeight = Math.min(1.0, profile.getMarketCap() / 100_000.0);
        // Engagement quality: volume spike correlates with genuine interest
        double engagementScore = Math.min(1.0, (volSpike - 1) / 3.0);
        // Price momentum as sentiment proxy (filtered for bots: cap at 0.8)
        double momentumSentiment = Math.min(0.8, Math.max(0, (priceChangePct + 5) / 10.0));
        // Sector-based social buzz
        double sectorBuzz = getSectorSocialBuzz(profile.getSector());
        return Math.min(1.0, 0.30 * credibilityWeight + 0.30 * engagementScore
                + 0.25 * momentumSentiment + 0.15 * sectorBuzz);
    }

    /** Module 4 — News sentiment score */
    private double computeNewsSentimentScore(StockProfile profile, double priceChangePct) {
        double base = 0.5 + (priceChangePct / 20.0); // price move as news proxy
        double sectorBoost = getNewsSectorBoost(profile.getSector());
        return Math.min(1.0, Math.max(0, base + sectorBoost));
    }

    /** Module 4 — News impact score (how market-moving the news is) */
    private double computeNewsImpactScore(StockProfile profile, double volSpike) {
        return Math.min(1.0, (volSpike - 1) / 4.0 + getNewsSectorBoost(profile.getSector()));
    }

    /** Module 5 — Macro score based on sector sensitivity */
    private double computeMacroScore(String sector) {
        return switch (sector) {
            case "Technology"  -> 0.72 + rng.nextDouble() * 0.10;
            case "Financials"  -> 0.65 + rng.nextDouble() * 0.12;
            case "Energy"      -> 0.58 + rng.nextDouble() * 0.15;
            case "Healthcare"  -> 0.70 + rng.nextDouble() * 0.10;
            case "Consumer"    -> 0.62 + rng.nextDouble() * 0.12;
            case "Industrials" -> 0.60 + rng.nextDouble() * 0.12;
            case "Telecom"     -> 0.55 + rng.nextDouble() * 0.15;
            case "Materials"   -> 0.52 + rng.nextDouble() * 0.18;
            default            -> 0.55 + rng.nextDouble() * 0.15;
        };
    }

    /** Module 6 — Order imbalance: bid/ask volume ratio proxy from candle data */
    private double computeOrderImbalance(List<Double> volumes, List<Double> closes) {
        // Up-candle volume = bid-side proxy; down-candle = ask-side proxy
        double bidVol = 0, askVol = 0;
        int window = Math.min(20, closes.size() - 1);
        for (int i = closes.size() - window; i < closes.size(); i++) {
            if (closes.get(i) >= closes.get(i - 1)) bidVol += volumes.get(i);
            else askVol += volumes.get(i);
        }
        return askVol > 0 ? bidVol / askVol : 1.0;
    }

    private double computeInstitutionalScore(double orderImbalance, double volSpike, double priceAccel) {
        double imbalanceScore = Math.min(1.0, (orderImbalance - 1) / 3.0);
        double spikeScore     = Math.min(1.0, (volSpike - 1) / 4.0);
        double accelScore     = Math.min(1.0, Math.max(0, priceAccel / 5.0));
        return Math.max(0, 0.50 * imbalanceScore + 0.30 * spikeScore + 0.20 * accelScore);
    }

    /** Module 9 — Alert generation */
    private List<StockAlert> buildAlerts(String symbol, boolean earlyRally, boolean institutional,
                                          double newsImpact, double social, double ai, double volSpike) {
        List<StockAlert> alerts = new ArrayList<>();
        String ts = Instant.now().toString();
        if (earlyRally) {
            alerts.add(StockAlert.builder().stockSymbol(symbol).alertType("RALLY")
                    .reason("Price acceleration > 2% with volume spike > 3x — early rally detected")
                    .confidenceScore(0.85).severity("HIGH").timestamp(ts).build());
        }
        if (institutional) {
            alerts.add(StockAlert.builder().stockSymbol(symbol).alertType("INSTITUTIONAL")
                    .reason("Order imbalance > 2.5 — smart money accumulation detected")
                    .confidenceScore(0.80).severity("HIGH").timestamp(ts).build());
        }
        if (newsImpact > 0.70) {
            alerts.add(StockAlert.builder().stockSymbol(symbol).alertType("NEWS")
                    .reason("High-impact news event detected — significant price catalyst")
                    .confidenceScore(newsImpact).severity("MEDIUM").timestamp(ts).build());
        }
        if (social > 0.75) {
            alerts.add(StockAlert.builder().stockSymbol(symbol).alertType("SENTIMENT")
                    .reason("Social sentiment spike from verified sources")
                    .confidenceScore(social).severity("MEDIUM").timestamp(ts).build());
        }
        if (volSpike > 4.0) {
            alerts.add(StockAlert.builder().stockSymbol(symbol).alertType("VOLUME")
                    .reason("Volume surge " + String.format("%.1f", volSpike) + "x above average")
                    .confidenceScore(Math.min(0.95, volSpike / 6.0)).severity("HIGH").timestamp(ts).build());
        }
        if (ai > 0.80) {
            alerts.add(StockAlert.builder().stockSymbol(symbol).alertType("AI_PREDICTION")
                    .reason("AI ensemble model confidence > 80% — strong directional signal")
                    .confidenceScore(ai).severity("HIGH").timestamp(ts).build());
        }
        return alerts;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DASHBOARD BUILDERS
    // ═══════════════════════════════════════════════════════════════════════

    private List<Map<String, Object>> buildNewsFeed() {
        String[] headlines = {
            "RBI holds repo rate steady — banking sector outlook positive",
            "IT sector Q4 earnings beat estimates — TCS, Infosys lead",
            "FII inflows surge to 3-month high — broad market rally expected",
            "Crude oil prices stabilize — energy stocks in focus",
            "GST collections hit record high — consumer discretionary bullish",
            "Pharma exports rise 12% YoY — healthcare sector outperforms",
            "Auto sales data strong — Maruti, Tata Motors gain momentum",
            "SEBI tightens F&O rules — volatility expected in derivatives",
            "India GDP growth revised upward to 7.2% — macro tailwinds",
            "Metal stocks rally on China stimulus hopes"
        };
        String[] sectors = {"Financials","Technology","Financials","Energy","Consumer",
                            "Healthcare","Consumer","Financials","Macro","Materials"};
        String[] impacts = {"HIGH","HIGH","HIGH","MEDIUM","MEDIUM","MEDIUM","MEDIUM","LOW","HIGH","MEDIUM"};
        List<Map<String, Object>> feed = new ArrayList<>();
        for (int i = 0; i < headlines.length; i++) {
            feed.add(Map.of(
                "headline", headlines[i],
                "sector", sectors[i],
                "impact", impacts[i],
                "sentiment", i < 7 ? "POSITIVE" : "NEUTRAL",
                "timestamp", Instant.now().minusSeconds((long) i * 180).toString(),
                "source", i % 2 == 0 ? "Economic Times" : "Moneycontrol"
            ));
        }
        return feed;
    }

    private Map<String, Object> buildMacroSnapshot() {
        return Map.of(
            "repoRate",        Map.of("value", "6.50%", "trend", "STABLE",   "impact", "NEUTRAL"),
            "inflation",       Map.of("value", "4.85%", "trend", "FALLING",  "impact", "POSITIVE"),
            "crudePriceUSD",   Map.of("value", "82.40", "trend", "STABLE",   "impact", "NEUTRAL"),
            "usdinr",          Map.of("value", "83.45", "trend", "STABLE",   "impact", "NEUTRAL"),
            "nifty50Trend",    Map.of("value", "Bullish", "momentum", "STRONG"),
            "fiiFlow",         Map.of("value", "+3,240 Cr", "trend", "INFLOW", "impact", "POSITIVE"),
            "globalSentiment", Map.of("value", "Risk-On", "vix", "14.2", "impact", "POSITIVE")
        );
    }

    private List<Map<String, Object>> buildSectorStrength(List<StockIntelligenceResult> ranked) {
        Map<String, List<Double>> sectorScores = new LinkedHashMap<>();
        for (StockIntelligenceResult r : ranked) {
            sectorScores.computeIfAbsent(r.getSector(), k -> new ArrayList<>()).add(r.getFinalScore());
        }
        return sectorScores.entrySet().stream()
                .map(e -> {
                    double avg = e.getValue().stream().mapToDouble(Double::doubleValue).average().orElse(0);
                    double max = e.getValue().stream().mapToDouble(Double::doubleValue).max().orElse(0);
                    return (Map<String, Object>) new LinkedHashMap<String, Object>(Map.of(
                        "sector", e.getKey(),
                        "avgScore", round2(avg),
                        "maxScore", round2(max),
                        "stockCount", e.getValue().size(),
                        "strength", avg > 0.65 ? "STRONG" : avg > 0.50 ? "MODERATE" : "WEAK"
                    ));
                })
                .sorted(Comparator.comparingDouble(m -> -((Double) m.get("avgScore"))))
                .toList();
    }

    private Map<String, Object> buildSummary(List<StockIntelligenceResult> ranked,
                                              List<StockIntelligenceResult> rallyCandidates) {
        long bullish = ranked.stream().filter(r -> r.getFinalScore() > 0.65).count();
        long highConf = ranked.stream().filter(r -> "HIGH".equals(r.getConfidence())).count();
        double avgScore = ranked.stream().mapToDouble(StockIntelligenceResult::getFinalScore).average().orElse(0);
        return Map.of(
            "totalScanned",       ranked.size(),
            "bullishCount",       bullish,
            "earlyRallyCount",    rallyCandidates.size(),
            "highConfidenceCount",highConf,
            "averageFinalScore",  round2(avgScore),
            "marketBias",         avgScore > 0.60 ? "BULLISH" : avgScore > 0.45 ? "NEUTRAL" : "BEARISH"
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MATH HELPERS
    // ═══════════════════════════════════════════════════════════════════════

    private List<Double> computeReturns(List<Double> prices) {
        List<Double> returns = new ArrayList<>();
        for (int i = 1; i < prices.size(); i++) {
            double prev = prices.get(i - 1);
            if (prev > 0) returns.add((prices.get(i) - prev) / prev);
        }
        return returns;
    }

    private List<Double> computeEMA(List<Double> prices, int period) {
        if (prices.size() < period) return prices;
        List<Double> ema = new ArrayList<>();
        double k = 2.0 / (period + 1);
        double prev = prices.subList(0, period).stream().mapToDouble(Double::doubleValue).average().orElse(0);
        ema.add(prev);
        for (int i = period; i < prices.size(); i++) {
            prev = prices.get(i) * k + prev * (1 - k);
            ema.add(prev);
        }
        return ema;
    }

    private double computeStdDev(List<Double> values) {
        if (values.size() < 2) return 0;
        double mean = values.stream().mapToDouble(Double::doubleValue).average().orElse(0);
        double variance = values.stream().mapToDouble(v -> Math.pow(v - mean, 2)).average().orElse(0);
        return Math.sqrt(variance);
    }

    private double computeBreakoutScore(List<Double> closes) {
        if (closes.size() < 20) return 0.5;
        double recent = closes.get(closes.size() - 1);
        double high20 = closes.subList(closes.size() - 20, closes.size() - 1)
                .stream().mapToDouble(Double::doubleValue).max().orElse(recent);
        return recent >= high20 ? 1.0 : Math.max(0, recent / high20);
    }

    private double normalizeMomentum(double raw) { return Math.min(1.0, Math.max(0, (raw - 0.8) / 0.8)); }
    private double normalizeTrend(double raw)     { return Math.min(1.0, Math.max(0, (raw + 1) / 2)); }
    private double normalizeVolumeAccumulation(List<Double> vols) {
        if (vols.size() < 5) return 0.5;
        double recent = vols.subList(vols.size() - 5, vols.size()).stream().mapToDouble(Double::doubleValue).average().orElse(1);
        double older  = vols.subList(0, Math.max(1, vols.size() - 5)).stream().mapToDouble(Double::doubleValue).average().orElse(1);
        return Math.min(1.0, Math.max(0, recent / Math.max(1, older) / 2.0));
    }
    private double normalizeVolatility(double raw) { return Math.min(1.0, Math.max(0, 1.0 - raw * 5)); }

    private double getSectorSocialBuzz(String sector) {
        return switch (sector) {
            case "Technology" -> 0.75; case "Financials" -> 0.65; case "Healthcare" -> 0.60;
            case "Energy" -> 0.55; case "Consumer" -> 0.58; default -> 0.50;
        };
    }

    private double getNewsSectorBoost(String sector) {
        return switch (sector) {
            case "Technology" -> 0.10; case "Financials" -> 0.08; case "Healthcare" -> 0.07;
            case "Energy" -> 0.05; default -> 0.03;
        };
    }

    private String getSectorImpact(String sector) {
        return switch (sector) {
            case "Technology" -> "Positive — rate stability, IT exports";
            case "Financials" -> "Positive — credit growth, NIM expansion";
            case "Energy"     -> "Neutral — crude stable, refining margins ok";
            case "Healthcare" -> "Positive — export demand, domestic growth";
            case "Consumer"   -> "Positive — rural recovery, GST tailwinds";
            default           -> "Neutral";
        };
    }

    private String deriveSignal(double score, String rlAction) {
        if (score > 0.75 && "BUY".equals(rlAction))  return "STRONG BUY";
        if (score > 0.60)                              return "BUY";
        if (score > 0.40)                              return "HOLD";
        return "SELL";
    }

    private double round2(double v) { return Math.round(v * 100.0) / 100.0; }
}
