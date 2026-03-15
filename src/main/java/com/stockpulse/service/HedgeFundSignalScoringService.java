package com.stockpulse.service;

import com.stockpulse.analyzer.PerformanceEngine;
import com.stockpulse.model.HedgeFundSignalDashboard;
import com.stockpulse.model.HedgeFundSignalScore;
import com.stockpulse.model.MarketCandle;
import com.stockpulse.model.QuantRequest;
import com.stockpulse.model.StockProfile;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

@Service
public class HedgeFundSignalScoringService {

    private static final double TARGET_ATR_PCT = 0.025;
    private static final double TARGET_STD_DEV = 0.018;

    private final PerformanceEngine performanceEngine;
    private final InstitutionalService institutionalService;
    private final QuantMarketDataFactoryService quantMarketDataFactoryService;
    private final ExecutorService executorService;
    private final ConcurrentHashMap<String, HedgeFundSignalDashboard> cache = new ConcurrentHashMap<>();

    public HedgeFundSignalScoringService(
            PerformanceEngine performanceEngine,
            InstitutionalService institutionalService,
            QuantMarketDataFactoryService quantMarketDataFactoryService
    ) {
        this.performanceEngine = performanceEngine;
        this.institutionalService = institutionalService;
        this.quantMarketDataFactoryService = quantMarketDataFactoryService;
        this.executorService = Executors.newFixedThreadPool(Math.max(4, Runtime.getRuntime().availableProcessors()));
    }

    public HedgeFundSignalDashboard buildDashboard(QuantRequest request) {
        String cacheKey = buildCacheKey(request);
        HedgeFundSignalDashboard cached = cache.get(cacheKey);
        if (cached != null) {
            return cached;
        }

        List<StockProfile> universe = quantMarketDataFactoryService.buildUniverse();
        List<FactorSnapshot> snapshots = universe.stream()
                .map(profile -> CompletableFuture.supplyAsync(() -> buildSnapshot(profile, request), executorService))
                .map(this::joinSafely)
                .filter(snapshot -> snapshot != null && passesFilters(snapshot, request))
                .toList();

        if (snapshots.isEmpty()) {
            HedgeFundSignalDashboard emptyDashboard = HedgeFundSignalDashboard.builder()
                    .rankings(List.of())
                    .sectorStrength(List.of())
                    .momentumHeatmap(List.of())
                    .summary(Map.of(
                            "scannedUniverse", universe.size(),
                            "returned", 0,
                            "averageFinalScore", 0.0,
                            "leadingSector", "N/A",
                            "institutionalAccumulationCandidates", 0L
                    ))
                    .build();
            cache.put(cacheKey, emptyDashboard);
            return emptyDashboard;
        }

        Map<String, Double> sectorReturns = snapshots.stream()
                .collect(Collectors.groupingBy(FactorSnapshot::sector, Collectors.averagingDouble(FactorSnapshot::sectorReturn)));
        Map<String, Double> sectorScores = normalizeMap(sectorReturns);

        double momentumMin = snapshots.stream().mapToDouble(FactorSnapshot::momentumRaw).min().orElse(0);
        double momentumMax = snapshots.stream().mapToDouble(FactorSnapshot::momentumRaw).max().orElse(1);
        double volumeMin = snapshots.stream().mapToDouble(FactorSnapshot::volumeRaw).min().orElse(0);
        double volumeMax = snapshots.stream().mapToDouble(FactorSnapshot::volumeRaw).max().orElse(1);
        double institutionalMin = snapshots.stream().mapToDouble(FactorSnapshot::institutionalRaw).min().orElse(0);
        double institutionalMax = snapshots.stream().mapToDouble(FactorSnapshot::institutionalRaw).max().orElse(1);
        double breakoutMin = snapshots.stream().mapToDouble(FactorSnapshot::breakoutRaw).min().orElse(0);
        double breakoutMax = snapshots.stream().mapToDouble(FactorSnapshot::breakoutRaw).max().orElse(1);

        List<HedgeFundSignalScore> rankedSignals = snapshots.stream()
                .map(snapshot -> toSignalScore(
                        snapshot,
                        momentumMin,
                        momentumMax,
                        volumeMin,
                        volumeMax,
                        institutionalMin,
                        institutionalMax,
                        breakoutMin,
                        breakoutMax,
                        sectorScores
                ))
                .sorted(Comparator.comparingDouble(HedgeFundSignalScore::getFinalScore).reversed())
                .limit(100)
                .toList();

        List<HedgeFundSignalScore> rankings = IntStream.range(0, rankedSignals.size())
                .mapToObj(index -> {
                    HedgeFundSignalScore signal = rankedSignals.get(index);
                    signal.setRank(index + 1);
                    return signal;
                })
                .toList();

        List<Map<String, Object>> sectorStrength = sectorReturns.entrySet().stream()
                .map(entry -> {
                    Map<String, Object> payload = new HashMap<>();
                    payload.put("sector", entry.getKey());
                    payload.put("averageReturn", round(entry.getValue() * 100.0));
                    payload.put("sectorScore", round(sectorScores.getOrDefault(entry.getKey(), 50.0)));
                    payload.put("leaders", rankings.stream()
                            .filter(signal -> signal.getSector().equalsIgnoreCase(entry.getKey()))
                            .limit(3)
                            .map(HedgeFundSignalScore::getStockSymbol)
                            .toList());
                    return payload;
                })
                .sorted((left, right) -> Double.compare(asDouble(right.get("sectorScore")), asDouble(left.get("sectorScore"))))
                .toList();

        List<Map<String, Object>> momentumHeatmap = rankings.stream()
                .limit(18)
                .map(signal -> Map.<String, Object>of(
                        "symbol", signal.getStockSymbol(),
                        "sector", signal.getSector(),
                        "momentumScore", round(signal.getMomentumScore()),
                        "finalScore", round(signal.getFinalScore()),
                        "breakoutScore", round(signal.getBreakoutScore())
                ))
                .toList();

        HedgeFundSignalDashboard dashboard = HedgeFundSignalDashboard.builder()
                .rankings(rankings)
                .sectorStrength(sectorStrength)
                .momentumHeatmap(momentumHeatmap)
                .summary(Map.of(
                        "scannedUniverse", universe.size(),
                        "returned", rankings.size(),
                        "averageFinalScore", round(rankings.stream().mapToDouble(HedgeFundSignalScore::getFinalScore).average().orElse(0)),
                        "leadingSector", sectorStrength.isEmpty() ? "N/A" : sectorStrength.get(0).get("sector"),
                        "institutionalAccumulationCandidates", rankings.stream().filter(signal -> signal.getOrderImbalance() > 2.5).count()
                ))
                .build();
        cache.put(cacheKey, dashboard);
        return dashboard;
    }

    private FactorSnapshot buildSnapshot(StockProfile profile, QuantRequest request) {
        List<MarketCandle> candles = quantMarketDataFactoryService.generateCandles(profile, request.getHistoricalPeriodYears());
        if (candles.size() < 210) {
            return null;
        }

        List<Double> closes = candles.stream().map(MarketCandle::getClose).toList();
        List<Double> returns = buildReturns(closes);
        List<Double> ema20 = buildEma(closes, 20);
        List<Double> ema50 = buildEma(closes, 50);
        List<Double> ema200 = buildEma(closes, 200);

        double currentPrice = closes.get(closes.size() - 1);
        double price3MonthsAgo = closes.get(Math.max(0, closes.size() - 63));
        double momentumRaw = price3MonthsAgo > 0 ? currentPrice / price3MonthsAgo : 1.0;

        double ema20Last = ema20.get(ema20.size() - 1);
        double ema50Last = ema50.get(ema50.size() - 1);
        double ema200Last = ema200.get(ema200.size() - 1);
        boolean alignedTrend = ema20Last > ema50Last && ema50Last > ema200Last;
        double alignmentSpread = ((ema20Last - ema50Last) + (ema50Last - ema200Last)) / Math.max(currentPrice, 1.0);
        double emaSlope = calculateSlope(ema20.subList(Math.max(0, ema20.size() - 20), ema20.size())) / Math.max(currentPrice, 1.0);
        double trendRaw = clamp((alignedTrend ? 0.55 : 0.20) + clamp(alignmentSpread * 35.0) * 0.30 + clamp(Math.max(0, emaSlope) * 450.0) * 0.15);

        double averageVolume = candles.subList(Math.max(0, candles.size() - 20), candles.size())
                .stream()
                .mapToDouble(MarketCandle::getVolume)
                .average()
                .orElse(profile.getAverageVolume());
        double currentVolume = candles.get(candles.size() - 1).getVolume();
        double volumeRatio = averageVolume <= 0 ? 1.0 : currentVolume / averageVolume;
        double volumeTrendBoost = alignedTrend ? 1.25 : currentPrice > ema20Last ? 1.0 : 0.72;
        double volumeRaw = volumeRatio * volumeTrendBoost;

        double atr = calculateAtr(candles, 14);
        double stdDev = performanceEngine.calculateVolatility(returns);
        double atrPct = currentPrice <= 0 ? 0 : atr / currentPrice;
        double volatilityPenalty = 0.55 * relativePenalty(atrPct, TARGET_ATR_PCT) + 0.45 * relativePenalty(stdDev, TARGET_STD_DEV);
        double volatilityQuality = clamp(1.0 - volatilityPenalty);

        double sectorReturn = price3MonthsAgo > 0 ? (currentPrice - price3MonthsAgo) / price3MonthsAgo : 0;

        Map<String, List<Map<String, Double>>> orderBook = quantMarketDataFactoryService.generateOrderBook(currentPrice, profile.getSymbol());
        Map<String, Object> imbalance = institutionalService.calculateOrderImbalance(orderBook);
        double orderImbalance = asDouble(imbalance.get("imbalance"));
        double institutionalRaw = clamp(Math.max(0, orderImbalance - 1.0) / 2.5);

        double previousHigh = closes.subList(Math.max(0, closes.size() - 21), closes.size() - 1)
                .stream()
                .mapToDouble(Double::doubleValue)
                .max()
                .orElse(currentPrice);
        double breakoutAboveHigh = previousHigh <= 0 ? 1.0 : currentPrice / previousHigh;
        double longAtr = calculateAtr(candles, 28);
        double volatilityCompression = longAtr <= 0 ? 0.5 : clamp(1.0 - (atr / longAtr));
        double breakoutRaw =
                0.45 * clamp((breakoutAboveHigh - 0.985) / 0.06) +
                0.35 * clamp((volumeRatio - 1.0) / 2.2) +
                0.20 * volatilityCompression;

        return new FactorSnapshot(
                profile.getSymbol(),
                profile.getSector(),
                profile.getMarketCap(),
                averageVolume,
                momentumRaw,
                trendRaw,
                volumeRaw,
                volatilityQuality,
                sectorReturn,
                institutionalRaw,
                breakoutRaw,
                orderImbalance
        );
    }

    private HedgeFundSignalScore toSignalScore(
            FactorSnapshot snapshot,
            double momentumMin,
            double momentumMax,
            double volumeMin,
            double volumeMax,
            double institutionalMin,
            double institutionalMax,
            double breakoutMin,
            double breakoutMax,
            Map<String, Double> sectorScores
    ) {
        double momentumScore = normalize(snapshot.momentumRaw(), momentumMin, momentumMax);
        double trendScore = snapshot.trendRaw() * 100.0;
        double volumeScore = normalize(snapshot.volumeRaw(), volumeMin, volumeMax);
        double volatilityScore = snapshot.volatilityQuality() * 100.0;
        double sectorScore = sectorScores.getOrDefault(snapshot.sector(), 50.0);
        double institutionalScore = normalize(snapshot.institutionalRaw(), institutionalMin, institutionalMax);
        double breakoutScore = normalize(snapshot.breakoutRaw(), breakoutMin, breakoutMax);

        double finalScore =
                0.25 * momentumScore +
                0.20 * trendScore +
                0.15 * volumeScore +
                0.10 * volatilityScore +
                0.10 * sectorScore +
                0.10 * institutionalScore +
                0.10 * breakoutScore;

        return HedgeFundSignalScore.builder()
                .stockSymbol(snapshot.symbol())
                .sector(snapshot.sector())
                .momentumScore(round(momentumScore))
                .trendScore(round(trendScore))
                .volumeScore(round(volumeScore))
                .volatilityScore(round(volatilityScore))
                .sectorScore(round(sectorScore))
                .institutionalScore(round(institutionalScore))
                .breakoutScore(round(breakoutScore))
                .finalScore(round(finalScore))
                .momentumValue(round(snapshot.momentumRaw()))
                .orderImbalance(round(snapshot.orderImbalance()))
                .breakoutProbability(round(breakoutScore))
                .build();
    }

    private boolean passesFilters(FactorSnapshot snapshot, QuantRequest request) {
        boolean sectorMatches = request.getSectorFilter() == null
                || request.getSectorFilter().isBlank()
                || "ALL".equalsIgnoreCase(request.getSectorFilter())
                || snapshot.sector().equalsIgnoreCase(request.getSectorFilter());

        return sectorMatches
                && snapshot.marketCap() >= request.getMinMarketCap()
                && snapshot.marketCap() <= request.getMaxMarketCap()
                && snapshot.averageVolume() >= request.getMinVolume()
                && snapshot.volatilityQuality() >= clamp(1.0 - (request.getVolatilityThreshold() * 2.0));
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

    private double calculateSlope(List<Double> values) {
        if (values.size() < 2) {
            return 0;
        }

        double sumX = 0;
        double sumY = 0;
        double sumXY = 0;
        double sumX2 = 0;
        int n = values.size();
        for (int i = 0; i < n; i++) {
            sumX += i;
            sumY += values.get(i);
            sumXY += i * values.get(i);
            sumX2 += i * i;
        }

        double denominator = n * sumX2 - sumX * sumX;
        return denominator == 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
    }

    private double calculateAtr(List<MarketCandle> candles, int period) {
        if (candles.size() < 2) {
            return 0;
        }

        int startIndex = Math.max(1, candles.size() - period);
        List<Double> trueRanges = new ArrayList<>();
        for (int i = startIndex; i < candles.size(); i++) {
            MarketCandle current = candles.get(i);
            MarketCandle previous = candles.get(i - 1);
            double trueRange = Math.max(
                    current.getHigh() - current.getLow(),
                    Math.max(
                            Math.abs(current.getHigh() - previous.getClose()),
                            Math.abs(current.getLow() - previous.getClose())
                    )
            );
            trueRanges.add(trueRange);
        }

        return trueRanges.stream().mapToDouble(Double::doubleValue).average().orElse(0);
    }

    private Map<String, Double> normalizeMap(Map<String, Double> rawValues) {
        double min = rawValues.values().stream().mapToDouble(Double::doubleValue).min().orElse(0);
        double max = rawValues.values().stream().mapToDouble(Double::doubleValue).max().orElse(1);
        Map<String, Double> normalized = new HashMap<>();
        rawValues.forEach((key, value) -> normalized.put(key, normalize(value, min, max)));
        return normalized;
    }

    private double normalize(double value, double min, double max) {
        if (Double.compare(max, min) == 0) {
            return value > 0 ? 100.0 : 50.0;
        }
        return clamp((value - min) / (max - min)) * 100.0;
    }

    private double relativePenalty(double value, double target) {
        if (target <= 0) {
            return 0;
        }
        return Math.abs(value - target) / target;
    }

    private double clamp(double value) {
        return Math.max(0.0, Math.min(1.0, value));
    }

    private double asDouble(Object value) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        return 0.0;
    }

    private double round(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    private FactorSnapshot joinSafely(CompletableFuture<FactorSnapshot> future) {
        try {
            return future.join();
        } catch (CompletionException ex) {
            return null;
        }
    }

    private String buildCacheKey(QuantRequest request) {
        return String.join(":",
                String.valueOf(request.getHistoricalPeriodYears()),
                String.valueOf(request.getSectorFilter()),
                String.valueOf(request.getMinMarketCap()),
                String.valueOf(request.getMaxMarketCap()),
                String.valueOf(request.getMinVolume()),
                String.valueOf(request.getVolatilityThreshold())
        );
    }

    @PreDestroy
    public void shutdown() {
        executorService.shutdown();
    }

    private record FactorSnapshot(
            String symbol,
            String sector,
            double marketCap,
            double averageVolume,
            double momentumRaw,
            double trendRaw,
            double volumeRaw,
            double volatilityQuality,
            double sectorReturn,
            double institutionalRaw,
            double breakoutRaw,
            double orderImbalance
    ) {}
}
