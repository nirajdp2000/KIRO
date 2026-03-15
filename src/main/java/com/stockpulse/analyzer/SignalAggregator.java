package com.stockpulse.analyzer;

import org.springframework.stereotype.Service;

@Service
public class SignalAggregator {

    public double aggregatePredictions(double gbScore, double lstmScore, double rfScore, double hmmScore, double sentimentScore) {
        // final_prediction_score = 0.30 gradient_boost + 0.25 lstm + 0.20 random_forest + 0.15 hmm + 0.10 sentiment
        return (0.30 * gbScore) + 
               (0.25 * lstmScore) + 
               (0.20 * rfScore) + 
               (0.15 * hmmScore) + 
               (0.10 * sentimentScore);
    }
    
    public double mapRegimeToScore(String regime) {
        return switch (regime) {
            case "Trending Up" -> 0.9;
            case "Trending Down" -> 0.1;
            case "High Volatility" -> 0.4;
            default -> 0.5;
        };
    }
    
    public double mapHMMStateToScore(String state) {
        return switch (state) {
            case "Accumulation" -> 0.8;
            case "Breakout" -> 0.95;
            case "Distribution" -> 0.2;
            default -> 0.5;
        };
    }
}
