package com.stockpulse.service;

import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.Map;

@Service
public class PremiumMarketService {

    public List<Map<String, Object>> getMomentum() {
        return Arrays.asList(
                Map.of("symbol", "RELIANCE", "change5m", "2.45", "volumeRatio", "3.2", "type", "Momentum Alert"),
                Map.of("symbol", "HDFCBANK", "change5m", "1.80", "volumeRatio", "2.5", "type", "Momentum Alert")
        );
    }

    public List<Map<String, Object>> getBreakouts() {
        return Arrays.asList(
                Map.of("symbol", "INFY", "type", "VWAP", "price", "1650.20", "strength", "High"),
                Map.of("symbol", "TCS", "type", "Prev Day High", "price", "4100.50", "strength", "High")
        );
    }

    public Map<String, Object> getSentiment() {
        return Map.of("overall", "Bullish", "score", 78, "advancing", 32, "declining", 18, "vix", 14.2);
    }

    public List<Map<String, Object>> getSectorRotation() {
        return Arrays.asList(
                Map.of("name", "Banking", "strength", "2.5", "leader", "HDFCBANK"),
                Map.of("name", "IT", "strength", "1.8", "leader", "TCS")
        );
    }

    public List<Map<String, Object>> getAiPredictions() {
        return Arrays.asList(
                Map.of("symbol", "RELIANCE", "pattern", "Bullish Flag", "probability", 85, "target", "3150.00")
        );
    }

    public Map<String, Object> getPsychology(String symbol) {
        return Map.of(
                "symbol", symbol,
                "fearGreedIndex", 65,
                "marketMood", "Greed",
                "retailSentiment", 45,
                "institutionalBias", "Accumulation",
                "triggers", Arrays.asList(
                        "Institutional absorption of sell orders observed.",
                        "High FOMO levels in retail social sentiment."
                ),
                "timestamp", new Date().toString()
        );
    }

    public Map<String, Object> getMarketIntelligence() {
        return Map.of(
                "globalSentiment", "The global markets are currently in a 'Wait and Watch' mode.",
                "hotSectors", Arrays.asList(
                        Map.of("name", "Renewable Energy", "trend", "Bullish", "reason", "New policy announcements")
                ),
                "topTradeIdeas", Arrays.asList(
                        Map.of(
                                "symbol", "RELIANCE",
                                "setup", "Bullish Flag Breakout",
                                "target", "3150",
                                "stop", "2920",
                                "confidence", 88,
                                "timeframe", "Swing (3-5 Days)",
                                "rrRatio", "1:2.4"
                        )
                )
        );
    }

    public List<Map<String, Object>> getAiNewsFeed() {
        return Arrays.asList(
                Map.of("id", 1, "time", "2m ago", "text", "AI detects unusual call option activity in HDFCBANK near 1700 strike.", "type", "alert")
        );
    }
}
