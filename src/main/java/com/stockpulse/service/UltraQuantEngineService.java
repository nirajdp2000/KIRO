package com.stockpulse.service;

import com.stockpulse.analyzer.AIPredictionService;
import com.stockpulse.analyzer.PerformanceEngine;
import com.stockpulse.analyzer.SignalAggregator;
import com.stockpulse.model.AnalysisResult;
import com.stockpulse.model.QuantRequest;
import com.stockpulse.model.UltraQuantDashboardResponse;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.SplittableRandom;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;

@Service
public class UltraQuantEngineService {

    private static final double DEFAULT_CAPITAL = 1_000_000.0;
    private static final Logger log = LoggerFactory.getLogger(UltraQuantEngineService.class);

    private final PerformanceEngine performanceEngine;
    private final AIPredictionService aiPredictionService;
    private final SignalAggregator signalAggregator;
    private final InstitutionalService institutionalService;
    private final ExecutorService executorService;
    private final ConcurrentHashMap<String, AnalysisResult> cache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, UltraQuantDashboardResponse> dashboardCache = new ConcurrentHashMap<>();

    public UltraQuantEngineService(
            PerformanceEngine performanceEngine,
            AIPredictionService aiPredictionService,
            SignalAggregator signalAggregator,
            InstitutionalService institutionalService
    ) {
        this.performanceEngine = performanceEngine;
        this.aiPredictionService = aiPredictionService;
        this.signalAggregator = signalAggregator;
        this.institutionalService = institutionalService;
        this.executorService = Executors.newFixedThreadPool(Math.max(4, Runtime.getRuntime().availableProcessors()));
    }

    public List<AnalysisResult> scanStocks(QuantRequest request) {
        return buildDashboard(request).getResults();
    }

    public UltraQuantDashboardResponse buildDashboard(QuantRequest request) {
        String cacheKey = buildRequestCacheKey(request);
        UltraQuantDashboardResponse cached = dashboardCache.get(cacheKey);
        if (cached != null) {
            return cached;
        }

        List<StockProfile> universe = buildUniverse();

        List<CompletableFuture<AnalysisResult>> futures = universe.stream()
                .map(profile -> CompletableFuture.supplyAsync(() -> analyzeProfile(profile, request), executorService))
                .toList();

        List<AnalysisResult> ranked = futures.stream()
                .map(this::joinSafely)
                .filter(result -> result != null && passesFilters(result, request))
                .sorted(Comparator.comparingDouble(AnalysisResult::getScore).reversed())
                .limit(100)
                .toList();

        UltraQuantDashboardResponse dashboard = UltraQuantDashboardResponse.builder()
                .results(ranked)
                .alerts(buildAlerts(ranked))
                .sectors(buildSectorRotation(ranked))
                .summary(buildSummary(ranked, request, universe.size()))
                .architecture(buildArchitecture())
                .build();
        dashboardCache.put(cacheKey, dashboard);
        log.debug("Built ultra quant dashboard for cache key {}", cacheKey);
        return dashboard;
    }

    private AnalysisResult analyzeProfile(StockProfile profile, QuantRequest request) {
        String cacheKey = profile.symbol() + ":" + request.getHistoricalPeriodYears();
        return cache.computeIfAbsent(cacheKey, key -> buildAnalysis(profile, request));
    }

    private AnalysisResult buildAnalysis(StockProfile profile, QuantRequest request) {
        List<Candle> candles = generateCandles(profile, request.getHistoricalPeriodYears());
        List<Double> closes = candles.stream().map(Candle::close).toList();
        List<Double> returns = buildReturns(closes);
        List<Double> ema50 = buildEma(closes, 50);

        double endingPrice = closes.get(closes.size() - 1);
        double startingPrice = closes.get(0);
        double sixMonthPrice = closes.get(Math.max(0, closes.size() - 126));
        int fiveYearWindow = Math.min(closes.size() - 1, 252 * Math.min(5, request.getHistoricalPeriodYears()));
        double fiveYearReference = closes.get(Math.max(0, closes.size() - 1 - fiveYearWindow));

        double cagr = performanceEngine.calculateCAGR(startingPrice, endingPrice, Math.max(1, request.getHistoricalPeriodYears()));
        double momentum = performanceEngine.calculateMomentum(endingPrice, sixMonthPrice);
        double growthRatio = performanceEngine.calculateGrowthRatio(endingPrice, fiveYearReference);
        double trendStrength = performanceEngine.calculateTrendStrength(ema50);
        double volatility = performanceEngine.calculateVolatility(returns);
        double maxDrawdown = performanceEngine.calculateMaxDrawdown(closes);
        double earningsGrowth = Math.max(0, cagr * 0.72 + normalizedNoise(profile.symbol(), 11) * 18);
        double revenueGrowth = Math.max(0, cagr * 0.58 + normalizedNoise(profile.symbol(), 19) * 14);
        double volumeGrowth = computeVolumeGrowth(candles);
        double breakoutFrequency = computeBreakoutFrequency(closes);
        double sentimentScore = computeSentimentScore(profile, momentum, growthRatio);

        List<Double> last50Prices = closes.subList(Math.max(0, closes.size() - 50), closes.size());
        List<Candle> last50Candles = candles.subList(Math.max(0, candles.size() - 50), candles.size());
        double priceChange1m = percentageChange(closes, 1);
        double priceChange5m = percentageChange(closes, 5);
        double volumeRatio = recentVolumeRatio(candles);
        double vwapDistance = computeVwapDistance(last50Candles, endingPrice);

        double gradientBoost = aiPredictionService.predictGradientBoosting(
                priceChange1m,
                priceChange5m,
                volumeRatio,
                vwapDistance,
                volatility
        );
        double lstmPredictedPrice = aiPredictionService.predictLSTM(last50Prices);
        String regime = aiPredictionService.detectRegime(volatility, trendStrength);
        String hmmState = aiPredictionService.detectHMMState(volumeRatio, priceChange5m);
        String rlAction = aiPredictionService.getRLAction(endingPrice, trendStrength, sentimentScore / 100.0);

        Map<String, List<Map<String, Double>>> orderBook = generateOrderBook(endingPrice, profile.symbol());
        Map<String, Object> imbalance = institutionalService.calculateOrderImbalance(orderBook);
        Map<String, Object> volumeProfile = institutionalService.calculateVolumeProfile(
                candles.stream().map(candle -> Map.of("close", candle.close(), "volume", candle.volume())).toList(),
                Math.max(1.0, endingPrice * 0.0025)
        );
        List<Map<String, Object>> liquidityClusters = institutionalService.calculateLiquidityHeatmap(
                orderBook.get("bids").stream().map(level -> level.get("price")).toList(),
                orderBook.get("asks").stream().map(level -> level.get("price")).toList()
        );

        double finalPredictionScore = signalAggregator.aggregatePredictions(
                gradientBoost,
                normalizeLstmScore(lstmPredictedPrice, endingPrice),
                signalAggregator.mapRegimeToScore(regime),
                signalAggregator.mapHMMStateToScore(hmmState),
                sentimentScore / 100.0
        );

        double rankingScore =
                0.35 * clamp(cagr / 40.0) +
                0.20 * clamp((momentum - 1.0) / 1.5) +
                0.20 * clamp(Math.abs(trendStrength) * 8.0) +
                0.15 * (1.0 - Math.min(maxDrawdown / 100.0, 1.0)) +
                0.10 * clamp(volumeGrowth / 2.5);

        double drawdownProbability = clamp((volatility * 2.2) + (maxDrawdown / 100.0) * 0.6) * 100.0;
        double stopLossDistance = Math.max(endingPrice * Math.max(volatility, 0.01), endingPrice * 0.015);
        double positionSize = (DEFAULT_CAPITAL * (request.getRiskPercentage() / 100.0)) / stopLossDistance;

        return AnalysisResult.builder()
                .symbol(profile.symbol())
                .sector(profile.sector())
                .industry(profile.industry())
                .marketCap(profile.marketCap())
                .cagr(cagr)
                .momentum(momentum)
                .trendStrength(trendStrength)
                .volatility(volatility)
                .maxDrawdown(maxDrawdown)
                .growthRatio(growthRatio)
                .earningsGrowth(earningsGrowth)
                .revenueGrowth(revenueGrowth)
                .volumeGrowth(volumeGrowth)
                .breakoutFrequency(breakoutFrequency)
                .sentimentScore(sentimentScore)
                .score(rankingScore * 100.0)
                .gradientBoostProb(gradientBoost * 100.0)
                .lstmPredictedPrice(lstmPredictedPrice)
                .marketRegime(regime)
                .marketState(hmmState)
                .rlAction(rlAction)
                .finalPredictionScore(finalPredictionScore * 100.0)
                .orderImbalance(asDouble(imbalance.get("imbalance")))
                .volumeProfile(volumeProfile)
                .liquidityClusters(liquidityClusters)
                .drawdownProbability(drawdownProbability)
                .positionSize(positionSize)
                .alerts(buildPerStockAlerts(profile.symbol(), gradientBoost, volumeRatio, breakoutFrequency, imbalance))
                .build();
    }

    private boolean passesFilters(AnalysisResult result, QuantRequest request) {
        boolean sectorMatches = request.getSectorFilter() == null
                || request.getSectorFilter().isBlank()
                || "ALL".equalsIgnoreCase(request.getSectorFilter())
                || result.getSector().equalsIgnoreCase(request.getSectorFilter());

        return sectorMatches
                && result.getCagr() >= request.getMinCagr()
                && result.getMarketCap() >= request.getMinMarketCap()
                && result.getMarketCap() <= request.getMaxMarketCap()
                && result.getMaxDrawdown() <= request.getMaxDrawdown()
                && result.getVolatility() <= request.getVolatilityThreshold()
                && result.getBreakoutFrequency() >= request.getBreakoutFrequency()
                && Math.abs(result.getTrendStrength()) >= request.getTrendStrengthThreshold()
                && result.getVolumeGrowth() * 100000 >= request.getMinVolume()
                && result.getGrowthRatio() > 4.0;
    }

    private List<StockProfile> buildUniverse() {
        String[][] sectorMap = {
                {"Technology", "Software"},
                {"Financials", "Banking"},
                {"Energy", "Oil & Gas"},
                {"Healthcare", "Pharma"},
                {"Consumer", "Retail"},
                {"Industrials", "Capital Goods"},
                {"Telecom", "Digital Networks"},
                {"Materials", "Metals"}
        };

        List<String> roots = Arrays.asList(
                "ALPHA", "NOVA", "ZEN", "ORBIT", "PRIME", "VECTOR", "AURA", "PULSE", "SUMMIT", "QUANT",
                "TITAN", "VISTA", "RAPID", "FOCUS", "UNITY", "DELTA", "OMEGA", "MATRIX", "ARROW", "GALAXY"
        );

        List<StockProfile> profiles = new ArrayList<>();
        int counter = 0;
        for (String root : roots) {
            for (int i = 0; i < 30; i++) {
                String[] sector = sectorMap[counter % sectorMap.length];
                String symbol = root + (char) ('A' + (i % 26)) + String.format(Locale.US, "%02d", i);
                double marketCap = 5_000 + ((counter * 137L) % 180_000);
                double avgVolume = 80_000 + ((counter * 53L) % 2_500_000);
                profiles.add(new StockProfile(symbol, sector[0], sector[1], marketCap, avgVolume));
                counter++;
            }
        }

        profiles.addAll(List.of(
                new StockProfile("RELIANCE", "Energy", "Oil & Gas", 175_000, 1_950_000),
                new StockProfile("TCS", "Technology", "Software", 150_000, 1_250_000),
                new StockProfile("HDFCBANK", "Financials", "Banking", 130_000, 1_850_000),
                new StockProfile("INFY", "Technology", "Software", 110_000, 1_720_000),
                new StockProfile("SUNPHARMA", "Healthcare", "Pharma", 95_000, 910_000)
        ));

        return profiles;
    }

    private List<Candle> generateCandles(StockProfile profile, int years) {
        int totalDays = Math.max(260, years * 252);
        SplittableRandom random = new SplittableRandom(profile.symbol().hashCode());
        List<Candle> candles = new ArrayList<>(totalDays);
        double basePrice = 80 + random.nextDouble(2400);
        double sectorDrift = switch (profile.sector()) {
            case "Technology" -> 0.0016;
            case "Financials" -> 0.0012;
            case "Healthcare" -> 0.0014;
            case "Energy" -> 0.0011;
            default -> 0.0010;
        };

        LocalDate startDate = LocalDate.now().minusDays(totalDays);
        double close = basePrice;
        for (int day = 0; day < totalDays; day++) {
            double noise = (random.nextDouble() - 0.5) * 0.05;
            double cyclical = Math.sin(day / 33.0 + random.nextDouble()) * 0.006;
            double drift = sectorDrift + cyclical + noise;
            double open = close;
            close = Math.max(15, close * (1 + drift));
            double high = Math.max(open, close) * (1 + random.nextDouble(0.001, 0.025));
            double low = Math.min(open, close) * (1 - random.nextDouble(0.001, 0.022));
            double volume = profile.averageVolume() * (0.85 + random.nextDouble() * 0.9) * (1 + Math.max(0, drift * 12));
            candles.add(new Candle(startDate.plusDays(day), open, high, low, close, volume));
        }
        return candles;
    }

    private List<Double> buildReturns(List<Double> closes) {
        List<Double> returns = new ArrayList<>();
        for (int i = 1; i < closes.size(); i++) {
            returns.add((closes.get(i) - closes.get(i - 1)) / closes.get(i - 1));
        }
        return returns;
    }

    private List<Double> buildEma(List<Double> values, int period) {
        List<Double> ema = new ArrayList<>(values.size());
        double multiplier = 2.0 / (period + 1.0);
        double previous = values.get(0);
        ema.add(previous);
        for (int i = 1; i < values.size(); i++) {
            previous = ((values.get(i) - previous) * multiplier) + previous;
            ema.add(previous);
        }
        return ema;
    }

    private double computeVolumeGrowth(List<Candle> candles) {
        int window = Math.max(20, candles.size() / 10);
        double early = candles.subList(0, window).stream().mapToDouble(Candle::volume).average().orElse(1.0);
        double recent = candles.subList(candles.size() - window, candles.size()).stream().mapToDouble(Candle::volume).average().orElse(1.0);
        return Math.max(0, recent / early);
    }

    private double computeBreakoutFrequency(List<Double> closes) {
        int window = 20;
        if (closes.size() <= window) {
            return 0;
        }
        int breakouts = 0;
        for (int i = window; i < closes.size(); i++) {
            double priorHigh = closes.subList(i - window, i).stream().mapToDouble(Double::doubleValue).max().orElse(closes.get(i));
            if (closes.get(i) > priorHigh) {
                breakouts++;
            }
        }
        return (double) breakouts / (closes.size() - window);
    }

    private double computeSentimentScore(StockProfile profile, double momentum, double growthRatio) {
        double sectorBias = switch (profile.sector()) {
            case "Technology" -> 12;
            case "Financials" -> 8;
            case "Healthcare" -> 10;
            case "Energy" -> 6;
            default -> 4;
        };
        return Math.min(100, Math.max(15, 40 + sectorBias + (momentum - 1) * 25 + (growthRatio - 4) * 6));
    }

    private double percentageChange(List<Double> values, int lookback) {
        if (values.size() <= lookback) {
            return 0;
        }
        double current = values.get(values.size() - 1);
        double previous = values.get(values.size() - 1 - lookback);
        return ((current - previous) / previous) * 100.0;
    }

    private double recentVolumeRatio(List<Candle> candles) {
        int recentWindow = Math.min(10, candles.size());
        int baseWindow = Math.min(50, candles.size());
        double recent = candles.subList(candles.size() - recentWindow, candles.size()).stream().mapToDouble(Candle::volume).average().orElse(1.0);
        double base = candles.subList(candles.size() - baseWindow, candles.size()).stream().mapToDouble(Candle::volume).average().orElse(1.0);
        return recent / base;
    }

    private double computeVwapDistance(List<Candle> candles, double currentPrice) {
        double volumeSum = candles.stream().mapToDouble(Candle::volume).sum();
        double priceVolumeSum = candles.stream().mapToDouble(candle -> candle.close() * candle.volume()).sum();
        double vwap = volumeSum == 0 ? currentPrice : priceVolumeSum / volumeSum;
        return ((currentPrice - vwap) / vwap) * 100.0;
    }

    private Map<String, List<Map<String, Double>>> generateOrderBook(double lastPrice, String symbol) {
        SplittableRandom random = new SplittableRandom(symbol.hashCode() * 31L);
        List<Map<String, Double>> bids = new ArrayList<>();
        List<Map<String, Double>> asks = new ArrayList<>();
        for (int i = 1; i <= 10; i++) {
            bids.add(Map.of(
                    "price", lastPrice - (i * 0.35),
                    "volume", 2_000 + random.nextDouble(1_000, 10_000) * (i == 1 ? 1.8 : 1.0)
            ));
            asks.add(Map.of(
                    "price", lastPrice + (i * 0.35),
                    "volume", 1_800 + random.nextDouble(1_000, 8_000) * (i == 1 ? 0.9 : 1.0)
            ));
        }
        return Map.of("bids", bids, "asks", asks);
    }

    private double normalizeLstmScore(double prediction, double currentPrice) {
        if (currentPrice <= 0) {
            return 0.5;
        }
        return clamp((prediction / currentPrice - 0.96) / 0.12);
    }

    private List<Map<String, Object>> buildPerStockAlerts(
            String symbol,
            double gradientBoost,
            double volumeRatio,
            double breakoutFrequency,
            Map<String, Object> imbalance
    ) {
        List<Map<String, Object>> alerts = new ArrayList<>();
        if (gradientBoost > 0.7) {
            alerts.add(alert(symbol, "AI_BULLISH", gradientBoost * 100));
        }
        if (volumeRatio > 1.4) {
            alerts.add(alert(symbol, "MOMENTUM_SCANNER", Math.min(99, volumeRatio * 35)));
        }
        if (breakoutFrequency > 0.12) {
            alerts.add(alert(symbol, "VOLATILITY_BREAKOUT", breakoutFrequency * 600));
        }
        if (asDouble(imbalance.get("imbalance")) > 2.5) {
            alerts.add(alert(symbol, "ORDER_FLOW_ACCUMULATION", Math.min(99, asDouble(imbalance.get("score")))));
        }
        return alerts;
    }

    private List<Map<String, Object>> buildAlerts(List<AnalysisResult> ranked) {
        return ranked.stream()
                .flatMap(result -> result.getAlerts().stream())
                .sorted((left, right) -> Double.compare(asDouble(right.get("confidenceScore")), asDouble(left.get("confidenceScore"))))
                .limit(12)
                .toList();
    }

    private List<Map<String, Object>> buildSectorRotation(List<AnalysisResult> ranked) {
        return ranked.stream()
                .collect(Collectors.groupingBy(AnalysisResult::getSector))
                .entrySet().stream()
                .map(entry -> {
                    double strength = entry.getValue().stream().mapToDouble(AnalysisResult::getMomentum).average().orElse(0);
                    double score = entry.getValue().stream().mapToDouble(AnalysisResult::getScore).average().orElse(0);
                    return Map.<String, Object>of(
                            "sector", entry.getKey(),
                            "sectorStrength", Math.round(strength * 100.0) / 100.0,
                            "averageScore", Math.round(score * 100.0) / 100.0,
                            "leaders", entry.getValue().stream().limit(3).map(AnalysisResult::getSymbol).toList()
                    );
                })
                .sorted((left, right) -> Double.compare(asDouble(right.get("averageScore")), asDouble(left.get("averageScore"))))
                .toList();
    }

    private Map<String, Object> buildSummary(List<AnalysisResult> ranked, QuantRequest request, int scannedUniverse) {
        double avgScore = ranked.stream().mapToDouble(AnalysisResult::getScore).average().orElse(0);
        long multibaggers = ranked.stream().filter(result -> result.getGrowthRatio() >= 5.0).count();
        long buySignals = ranked.stream().filter(result -> "BUY".equals(result.getRlAction())).count();
        return Map.of(
                "scannedUniverse", scannedUniverse,
                "returned", ranked.size(),
                "historicalPeriodYears", request.getHistoricalPeriodYears(),
                "avgScore", Math.round(avgScore * 100.0) / 100.0,
                "multibaggerCandidates", multibaggers,
                "buySignals", buySignals
        );
    }

    private List<Map<String, Object>> buildArchitecture() {
        return List.of(
                Map.of("stage", "Market Feed", "description", "Ingests websocket ticks and historical candles through provider adapters."),
                Map.of("stage", "Tick Processor", "description", "Normalizes OHLCV, order book snapshots, and sector metadata."),
                Map.of("stage", "Feature Generator", "description", "Builds CAGR, EMA slope, RSI, ATR, VWAP distance, drawdown, and volume profile features."),
                Map.of("stage", "AI Prediction Models", "description", "Runs gradient boost, LSTM proxy, regime detection, hidden state logic, and RL policy scoring."),
                Map.of("stage", "Signal Aggregator", "description", "Combines technical, AI, and sentiment signals into a unified prediction score."),
                Map.of("stage", "Stock Ranking Engine", "description", "Ranks filtered stocks and generates sector rotation plus risk outputs."),
                Map.of("stage", "Ultra Quant Analyzer Tab", "description", "Presents top opportunities, filters, architecture, and model diagnostics."),
                Map.of("stage", "Alert Engine", "description", "Emits real-time alert objects with symbol, signal type, confidence, and timestamp.")
        );
    }

    private AnalysisResult joinSafely(CompletableFuture<AnalysisResult> future) {
        try {
            return future.join();
        } catch (CompletionException ex) {
            log.warn("Skipping analysis future due to completion failure", ex);
            return null;
        }
    }

    private String buildRequestCacheKey(QuantRequest request) {
        return String.join(":",
                String.valueOf(request.getHistoricalPeriodYears()),
                String.valueOf(request.getMinCagr()),
                String.valueOf(request.getSectorFilter()),
                String.valueOf(request.getMinMarketCap()),
                String.valueOf(request.getMaxMarketCap()),
                String.valueOf(request.getMinVolume()),
                String.valueOf(request.getMaxDrawdown()),
                String.valueOf(request.getVolatilityThreshold()),
                String.valueOf(request.getBreakoutFrequency()),
                String.valueOf(request.getTrendStrengthThreshold()),
                String.valueOf(request.getRiskPercentage())
        );
    }

    private Map<String, Object> alert(String symbol, String type, double confidence) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("stockSymbol", symbol);
        payload.put("signalType", type);
        payload.put("confidenceScore", Math.round(confidence * 100.0) / 100.0);
        payload.put("timestamp", Instant.now().toString());
        return payload;
    }

    private double normalizedNoise(String symbol, int salt) {
        return new SplittableRandom(symbol.hashCode() * 13L + salt).nextDouble();
    }

    private double clamp(double value) {
        return Math.max(0, Math.min(1, value));
    }

    private double asDouble(Object value) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        return 0;
    }

    @PreDestroy
    public void shutdown() {
        executorService.shutdown();
    }

    private record StockProfile(String symbol, String sector, String industry, double marketCap, double averageVolume) {}

    private record Candle(LocalDate date, double open, double high, double low, double close, double volume) {}
}
