package com.stockpulse.model;

import lombok.Data;

@Data
public class QuantRequest {
    private int historicalPeriodYears = 5;
    private double minCagr = 15.0;
    private String sectorFilter;
    private double minMarketCap = 0.0;
    private double maxMarketCap = Double.MAX_VALUE;
    private double minVolume = 100000;
    private double maxDrawdown = 30.0;
    private double volatilityThreshold = 0.5;
    private double breakoutFrequency = 0.1;
    private double trendStrengthThreshold = 0.2;
    private double riskPercentage = 1.0;
}
