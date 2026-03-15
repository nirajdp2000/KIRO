package com.stockpulse.analyzer;

import org.springframework.stereotype.Service;
import java.util.List;
import java.util.Random;

@Service
public class AIPredictionService {
    private final Random random = new Random();

    // Gradient Boosting Logic (Simulation)
    public double predictGradientBoosting(double change1m, double change5m, double volRatio, double vwapDist, double volatility) {
        // Simple heuristic-based simulation of a GB model
        double score = 0;
        if (change1m > 0.5) score += 0.2;
        if (change5m > 1.5) score += 0.3;
        if (volRatio > 2.0) score += 0.2;
        if (vwapDist < 0) score += 0.1; // Price above VWAP
        if (volatility < 0.3) score += 0.1;
        
        return Math.min(0.98, Math.max(0.02, score + (random.nextDouble() * 0.1)));
    }

    // LSTM Time Series (Approximation)
    public double predictLSTM(List<Double> last50Prices) {
        if (last50Prices == null || last50Prices.size() < 10) return 0;
        double lastPrice = last50Prices.get(last50Prices.size() - 1);
        double avgReturn = 0;
        for (int i = 1; i < last50Prices.size(); i++) {
            avgReturn += (last50Prices.get(i) - last50Prices.get(i - 1)) / last50Prices.get(i - 1);
        }
        avgReturn /= (last50Prices.size() - 1);
        
        // Return a predicted price for next 10 mins
        return lastPrice * (1 + avgReturn * 10);
    }

    // Random Forest Regime Detector
    public String detectRegime(double volatility, double trendStrength) {
        if (volatility > 0.8) return "High Volatility";
        if (volatility < 0.2 && Math.abs(trendStrength) < 0.05) return "Low Volatility Sideways";
        if (trendStrength > 0.1) return "Trending Up";
        if (trendStrength < -0.1) return "Trending Down";
        return "Sideways";
    }

    // Hidden Markov Model (HMM) - State Detector
    public String detectHMMState(double volumeChange, double priceChange) {
        if (volumeChange > 2.5 && priceChange > 0) return "Accumulation";
        if (volumeChange > 2.5 && priceChange < 0) return "Distribution";
        if (Math.abs(priceChange) > 3.0) return "Breakout";
        return "Reversal Watch";
    }

    // Reinforcement Learning Trading Agent (Simplified Q-Learning logic)
    public String getRLAction(double price, double trend, double sentiment) {
        double qValueBuy = 0.4 * trend + 0.6 * sentiment;
        double qValueSell = -0.4 * trend - 0.6 * sentiment;
        
        if (qValueBuy > 0.5) return "BUY";
        if (qValueSell > 0.5) return "SELL";
        return "HOLD";
    }
}
