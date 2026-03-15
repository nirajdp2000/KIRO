package com.stockpulse.service;

import org.springframework.stereotype.Service;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class InstitutionalService {

    public Map<String, Object> calculateOrderImbalance(Map<String, List<Map<String, Double>>> orderBook) {
        List<Map<String, Double>> bids = orderBook.getOrDefault("bids", Collections.emptyList());
        List<Map<String, Double>> asks = orderBook.getOrDefault("asks", Collections.emptyList());

        double totalBidVol = bids.stream().mapToDouble(level -> level.getOrDefault("volume", 0.0)).sum();
        double totalAskVol = asks.stream().mapToDouble(level -> level.getOrDefault("volume", 0.0)).sum();

        double imbalance = totalAskVol == 0 ? totalBidVol : totalBidVol / totalAskVol;

        String signal = "NEUTRAL";
        double score = 50;

        if (imbalance > 2.5) {
            signal = "INSTITUTIONAL ACCUMULATION";
            score = Math.min(100, 50 + (imbalance - 2.5) * 10);
        } else if (imbalance < 0.4) {
            signal = "INSTITUTIONAL DISTRIBUTION";
            score = Math.max(0, 50 - (0.4 - imbalance) * 100);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("imbalance", imbalance);
        result.put("signal", signal);
        result.put("score", score);
        return result;
    }

    public Map<String, Object> calculateVolumeProfile(List<Map<String, Double>> candles, double binSize) {
        Map<String, Double> volumeAtPrice = new HashMap<>();
        double totalVolume = 0;

        for (Map<String, Double> candle : candles) {
            double close = candle.getOrDefault("close", 0.0);
            double volume = candle.getOrDefault("volume", 0.0);
            double priceBin = Math.round(close / binSize) * binSize;
            String key = String.valueOf(priceBin);
            volumeAtPrice.put(key, volumeAtPrice.getOrDefault(key, 0.0) + volume);
            totalVolume += volume;
        }

        List<Double> sortedPrices = volumeAtPrice.keySet().stream()
                .map(Double::valueOf)
                .sorted()
                .collect(Collectors.toList());

        double maxVol = 0;
        double poc = 0;

        List<Map<String, Object>> profile = new ArrayList<>();
        for (Double price : sortedPrices) {
            double vol = volumeAtPrice.get(String.valueOf(price));
            if (vol > maxVol) {
                maxVol = vol;
                poc = price;
            }
            Map<String, Object> node = new HashMap<>();
            node.put("price", price);
            node.put("volume", vol);
            node.put("isPOC", false);
            node.put("isInValueArea", false);
            profile.add(node);
        }

        // Mark POC
        for (Map<String, Object> node : profile) {
            if ((Double) node.get("price") == poc) {
                node.put("isPOC", true);
            }
        }

        // Value Area (70% of volume)
        double targetVA = totalVolume * 0.7;
        double currentVA = maxVol;
        
        int pocIdx = -1;
        for (int i = 0; i < profile.size(); i++) {
            if ((Double) profile.get(i).get("price") == poc) {
                pocIdx = i;
                break;
            }
        }
        
        int lowIdx = pocIdx;
        int highIdx = pocIdx;

        while (currentVA < targetVA && (lowIdx > 0 || highIdx < profile.size() - 1)) {
            double lowVol = lowIdx > 0 ? (Double) profile.get(lowIdx - 1).get("volume") : 0;
            double highVol = highIdx < profile.size() - 1 ? (Double) profile.get(highIdx + 1).get("volume") : 0;

            if (lowVol >= highVol && lowIdx > 0) {
                lowIdx--;
                currentVA += lowVol;
            } else if (highIdx < profile.size() - 1) {
                highIdx++;
                currentVA += highVol;
            } else {
                break;
            }
        }

        double val = (Double) profile.get(lowIdx).get("price");
        double vah = (Double) profile.get(highIdx).get("price");

        for (int i = 0; i < profile.size(); i++) {
            if (i >= lowIdx && i <= highIdx) {
                profile.get(i).put("isInValueArea", true);
            }
        }

        Map<String, Object> result = new HashMap<>();
        result.put("profile", profile);
        result.put("poc", poc);
        result.put("vah", vah);
        result.put("val", val);
        return result;
    }

    public double calculateCorrelation(List<Double> seriesA, List<Double> seriesB) {
        int n = Math.min(seriesA.size(), seriesB.size());
        if (n < 2) return 0;

        double meanA = seriesA.stream().mapToDouble(Double::doubleValue).sum() / n;
        double meanB = seriesB.stream().mapToDouble(Double::doubleValue).sum() / n;

        double num = 0;
        double denA = 0;
        double denB = 0;

        for (int i = 0; i < n; i++) {
            double diffA = seriesA.get(i) - meanA;
            double diffB = seriesB.get(i) - meanB;
            num += diffA * diffB;
            denA += diffA * diffA;
            denB += diffB * diffB;
        }

        return num / Math.sqrt(denA * denB);
    }

    public String detectMarketRegime(List<Map<String, Double>> candles) {
        if (candles.size() < 20) return "SIDEWAYS";

        List<Map<String, Double>> last20 = candles.subList(candles.size() - 20, candles.size());
        List<Double> returns = new ArrayList<>();
        for (int i = 0; i < last20.size(); i++) {
            if (i == 0) {
                returns.add(0.0);
            } else {
                double prevClose = last20.get(i - 1).getOrDefault("close", 0.0);
                double currentClose = last20.get(i).getOrDefault("close", 0.0);
                returns.add((currentClose - prevClose) / prevClose);
            }
        }

        double sumSquares = returns.stream().mapToDouble(r -> r * r).sum();
        double volatility = Math.sqrt(sumSquares / returns.size());

        double firstPrice = last20.get(0).getOrDefault("close", 0.0);
        double lastPrice = last20.get(last20.size() - 1).getOrDefault("close", 0.0);
        double totalReturn = Math.abs((lastPrice - firstPrice) / firstPrice);

        if (volatility > 0.02) return "VOLATILE";
        if (totalReturn > 0.03) return "TRENDING";
        return "SIDEWAYS";
    }
    public List<Map<String, Object>> calculateLiquidityHeatmap(List<Double> bids, List<Double> asks) {
        List<Map<String, Object>> clusters = new ArrayList<>();
        // Simple logic to detect clusters of orders
        if (bids.size() > 5) {
            clusters.add(Map.of("type", "Support Cluster", "price", bids.get(0), "strength", "High"));
        }
        if (asks.size() > 5) {
            clusters.add(Map.of("type", "Resistance Cluster", "price", asks.get(0), "strength", "Medium"));
        }
        return clusters;
    }

    public List<Map<String, Object>> analyzeSectorRotation(Map<String, List<Double>> sectorReturns) {
        List<Map<String, Object>> rotation = new ArrayList<>();
        sectorReturns.forEach((name, returns) -> {
            double avgReturn = returns.stream().mapToDouble(Double::doubleValue).average().orElse(0);
            rotation.add(Map.of("sector", name, "momentum", avgReturn, "strength", avgReturn > 0.01 ? "Strong" : "Neutral"));
        });
        return rotation.stream()
                .sorted((a, b) -> Double.compare((Double) b.get("momentum"), (Double) a.get("momentum")))
                .collect(Collectors.toList());
    }
}
