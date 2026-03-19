package com.stockpulse.model;

import lombok.Builder;
import lombok.Data;

import java.util.List;

/**
 * Master result object for the AI Stock Intelligence system.
 * Aggregates all 10 module scores into a single ranked entry.
 */
@Data
@Builder
public class StockIntelligenceResult {

    private String symbol;
    private String sector;
    private String industry;

    // Module 1 — Early Rally Detection
    private double priceAcceleration;   // (current - 15min_ago) / 15min_ago
    private double volumeSpike;         // current_volume / avg_volume
    private boolean earlyRallySignal;   // price_accel > 2% AND vol_spike > 3
    private double rallyProbabilityScore;

    // Module 2 — Quant Filter
    private double quantFilterScore;    // composite 6-factor score

    // Module 3 — Social Sentiment
    private double socialSentimentScore;

    // Module 4 — News Intelligence
    private double newsSentimentScore;
    private double newsImpactScore;

    // Module 5 — Macro
    private double macroScore;
    private String sectorImpact;

    // Module 6 — Institutional Flow
    private double orderImbalance;
    private boolean institutionalSignal; // imbalance > 2.5
    private double institutionalScore;

    // Module 7 — AI Prediction
    private double aiPredictionScore;
    private String marketRegime;
    private String rlAction;

    // Module 8 — Master Ranking
    private double finalScore;
    private int rank;

    // Module 9 — Alerts
    private List<StockAlert> alerts;

    // Display helpers
    private double currentPrice;
    private double priceChange;
    private double priceChangePercent;
    private String signal;              // STRONG BUY / BUY / HOLD / SELL
    private String confidence;          // HIGH / MEDIUM / LOW
}
