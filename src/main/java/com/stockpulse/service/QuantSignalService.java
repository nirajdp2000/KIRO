package com.stockpulse.service;

import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.Map;

@Service
public class QuantSignalService {

    public List<Map<String, Object>> getMomentum() {
        return Arrays.asList(
                Map.of("symbol", "RELIANCE", "priceChange", 2.4, "volumeRatio", 4.2, "strength", 85, "alert", "Strong Momentum")
        );
    }

    public List<Map<String, Object>> getBreakouts() {
        return Arrays.asList(
                Map.of("symbol", "INFY", "level", 1650, "strength", 88, "vwap", 1620, "prevHigh", 1645)
        );
    }

    public List<Map<String, Object>> getVolumeSurge() {
        return Arrays.asList(
                Map.of("symbol", "SBIN", "ratio", 5.2, "alert", "Institutional Accumulation", "timestamp", new Date().toString())
        );
    }

    public List<Map<String, Object>> getIndicators() {
        return Arrays.asList(
                Map.of("symbol", "RELIANCE", "rsi", 65, "ema20", 2950, "ema50", 2900, "vwap", 2940, "signal", "BUY")
        );
    }

    public List<Map<String, Object>> getSectors() {
        return Arrays.asList(
                Map.of("name", "IT", "return", 1.8, "momentum", "High", "status", "Leading")
        );
    }

    public List<Map<String, Object>> getMoneyFlow() {
        return Arrays.asList(
                Map.of("symbol", "RELIANCE", "flow", 125000000, "status", "Accumulation", "priceStability", "High")
        );
    }

    public List<Map<String, Object>> getTrends() {
        return Arrays.asList(
                Map.of("symbol", "RELIANCE", "score", 82, "momentum", 0.4, "volume", 0.3, "breakout", 0.3)
        );
    }

    public Map<String, Object> getAdvancedIntelligence() {
        return Map.of(
                "momentumPrediction", Map.of("probability", 82, "predictedMove", "+1.45%", "confidence", "High"),
                "orderFlow", Map.of("imbalance", 3.42, "activityScore", 88, "status", "Institutional Buying"),
                "smartMoney", Map.of("accumulationScore", 92, "phase", "Late Accumulation"),
                "volatility", Map.of("compression", true, "squeezeProbability", 78),
                "patternRecognition", Map.of("pattern", "Ascending Triangle", "confidence", 89, "status", "Breakout Imminent", "target", "Rs 3,250")
        );
    }

    public Map<String, Object> getSentiment() {
        return Map.of("status", "Bullish Market", "adRatio", 1.8, "indexMomentum", "Strong", "volatility", "Low", "confidence", 85);
    }
}
