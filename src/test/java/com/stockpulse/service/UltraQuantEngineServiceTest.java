package com.stockpulse.service;

import com.stockpulse.analyzer.AIPredictionService;
import com.stockpulse.analyzer.PerformanceEngine;
import com.stockpulse.analyzer.SignalAggregator;
import com.stockpulse.model.QuantRequest;
import com.stockpulse.model.UltraQuantDashboardResponse;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class UltraQuantEngineServiceTest {

    private final UltraQuantEngineService ultraQuantEngineService = new UltraQuantEngineService(
            new PerformanceEngine(),
            new AIPredictionService(),
            new SignalAggregator(),
            new InstitutionalService()
    );

    @Test
    void buildsDashboardWithArchitectureAndResults() {
        QuantRequest request = new QuantRequest();
        request.setMinCagr(10);
        request.setMaxDrawdown(45);
        request.setVolatilityThreshold(0.5);
        request.setBreakoutFrequency(0.05);
        request.setTrendStrengthThreshold(0.05);

        UltraQuantDashboardResponse response = ultraQuantEngineService.buildDashboard(request);

        assertNotNull(response);
        assertNotNull(response.getArchitecture());
        assertFalse(response.getArchitecture().isEmpty());
        assertTrue(response.getResults().size() <= 100);
    }
}
