package com.stockpulse.analyzer;

import org.springframework.stereotype.Component;
import java.util.List;
import java.util.Map;

@Component
public class PerformanceEngine {

    public double calculateCAGR(double startPrice, double endPrice, int years) {
        if (startPrice <= 0 || years <= 0) return 0;
        return (Math.pow(endPrice / startPrice, 1.0 / years) - 1) * 100;
    }

    public double calculateMomentum(double currentPrice, double price6MonthsAgo) {
        if (price6MonthsAgo <= 0) return 0;
        return (currentPrice / price6MonthsAgo);
    }

    public double calculateTrendStrength(List<Double> ema50Values) {
        if (ema50Values == null || ema50Values.size() < 2) return 0;
        // Simple slope calculation: (y2 - y1) / (x2 - x1) where x is time index
        double sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        int n = ema50Values.size();
        for (int i = 0; i < n; i++) {
            sumX += i;
            sumY += ema50Values.get(i);
            sumXY += i * ema50Values.get(i);
            sumX2 += i * i;
        }
        return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    }

    public double calculateVolatility(List<Double> returns) {
        if (returns == null || returns.size() < 2) return 0;
        double mean = returns.stream().mapToDouble(Double::doubleValue).average().orElse(0);
        double variance = returns.stream()
                .mapToDouble(r -> Math.pow(r - mean, 2))
                .average().orElse(0);
        return Math.sqrt(variance);
    }

    public double calculateMaxDrawdown(List<Double> prices) {
        if (prices == null || prices.isEmpty()) return 0;
        double maxDrawdown = 0;
        double peak = prices.get(0);
        for (double price : prices) {
            if (price > peak) {
                peak = price;
            }
            double drawdown = (peak - price) / peak;
            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
            }
        }
        return maxDrawdown * 100;
    }

    public double calculateGrowthRatio(double priceToday, double priceNyearsAgo) {
        if (priceNyearsAgo <= 0) return 0;
        return priceToday / priceNyearsAgo;
    }
}
