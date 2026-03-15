package com.stockpulse.analyzer;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class SignalAggregatorTest {

    private final SignalAggregator signalAggregator = new SignalAggregator();

    @Test
    void aggregatesSignalsUsingConfiguredWeights() {
        double score = signalAggregator.aggregatePredictions(0.8, 0.7, 0.6, 0.5, 0.9);
        assertEquals(0.70, Math.round(score * 100.0) / 100.0);
    }

    @Test
    void mapsRegimeScoresPredictably() {
        assertEquals(0.9, signalAggregator.mapRegimeToScore("Trending Up"));
        assertEquals(0.1, signalAggregator.mapRegimeToScore("Trending Down"));
    }
}
