package com.stockpulse.analyzer;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PerformanceEngineTest {

    private final PerformanceEngine performanceEngine = new PerformanceEngine();

    @Test
    void calculatesCagrForPositiveSeries() {
        double cagr = performanceEngine.calculateCAGR(100, 225, 3);
        assertTrue(cagr > 30);
    }

    @Test
    void calculatesMaxDrawdownAsPercentage() {
        double drawdown = performanceEngine.calculateMaxDrawdown(List.of(100.0, 110.0, 90.0, 120.0, 100.0));
        assertEquals(18.18, Math.round(drawdown * 100.0) / 100.0);
    }

    @Test
    void calculatesVolatilityForReturnSeries() {
        double volatility = performanceEngine.calculateVolatility(List.of(0.01, -0.02, 0.03, 0.015));
        assertTrue(volatility > 0);
    }
}
