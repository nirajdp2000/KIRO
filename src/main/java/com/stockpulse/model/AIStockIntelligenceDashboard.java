package com.stockpulse.model;

import lombok.Builder;
import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * Top-level dashboard response for the AI Stock Intelligence tab.
 */
@Data
@Builder
public class AIStockIntelligenceDashboard {

    /** Module 8 — Top ranked stocks (up to 50) */
    private List<StockIntelligenceResult> rankings;

    /** Module 1 — Early rally candidates only */
    private List<StockIntelligenceResult> earlyRallyCandidates;

    /** Module 9 — All live alerts across the universe */
    private List<StockAlert> liveAlerts;

    /** Module 4 — Simulated news feed items */
    private List<Map<String, Object>> newsFeed;

    /** Module 5 — Macro environment snapshot */
    private Map<String, Object> macroSnapshot;

    /** Sector strength summary (sector -> avg score) */
    private List<Map<String, Object>> sectorStrength;

    /** Summary statistics */
    private Map<String, Object> summary;

    /** ISO timestamp of when this dashboard was computed */
    private String computedAt;
}
