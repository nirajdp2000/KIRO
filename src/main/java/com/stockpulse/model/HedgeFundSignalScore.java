package com.stockpulse.model;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class HedgeFundSignalScore {
    private int rank;
    private String stockSymbol;
    private String sector;
    private double momentumScore;
    private double trendScore;
    private double volumeScore;
    private double volatilityScore;
    private double sectorScore;
    private double institutionalScore;
    private double breakoutScore;
    private double finalScore;
    private double momentumValue;
    private double orderImbalance;
    private double breakoutProbability;
}
