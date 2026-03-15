package com.stockpulse.model;

import lombok.Data;
import lombok.Builder;
import java.util.Map;
import java.util.List;

@Data
@Builder
public class AnalysisResult {
    private String symbol;
    private double cagr;
    private double momentum;
    private double trendStrength;
    private double volatility;
    private double maxDrawdown;
    private double growthRatio;
    private double score;
    private double earningsGrowth;
    private double revenueGrowth;
    private double volumeGrowth;
    private double breakoutFrequency;
    private double sentimentScore;
    private double marketCap;
    private double drawdownProbability;
    private double positionSize;
    
    // AI Predictions
    private double gradientBoostProb;
    private double lstmPredictedPrice;
    private String marketRegime;
    private String marketState; // HMM
    private String rlAction;
    private double finalPredictionScore;

    // Institutional Metrics
    private double orderImbalance;
    private Map<String, Object> volumeProfile;
    private List<Map<String, Object>> liquidityClusters;
    private List<Map<String, Object>> alerts;
    
    private String industry;
    private String sector;
}
