package com.stockpulse.service;

import com.stockpulse.analyzer.PerformanceEngine;
import com.stockpulse.model.HedgeFundSignalDashboard;
import com.stockpulse.model.QuantRequest;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class HedgeFundSignalScoringServiceTest {

    private final HedgeFundSignalScoringService hedgeFundSignalScoringService = new HedgeFundSignalScoringService(
            new PerformanceEngine(),
            new InstitutionalService(),
            new QuantMarketDataFactoryService()
    );

    @Test
    void buildsRankedSignalDashboard() {
        QuantRequest request = new QuantRequest();
        request.setHistoricalPeriodYears(5);
        request.setMinMarketCap(0);
        request.setMaxMarketCap(250_000);
        request.setMinVolume(50_000);

        HedgeFundSignalDashboard dashboard = hedgeFundSignalScoringService.buildDashboard(request);

        assertNotNull(dashboard);
        assertNotNull(dashboard.getRankings());
        assertNotNull(dashboard.getSectorStrength());
        assertNotNull(dashboard.getMomentumHeatmap());
        assertFalse(dashboard.getRankings().isEmpty());
        assertTrue(dashboard.getRankings().size() <= 100);
    }
}
