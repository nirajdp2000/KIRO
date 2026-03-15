package com.stockpulse.model;

import lombok.Builder;
import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
@Builder
public class UltraQuantDashboardResponse {
    private List<AnalysisResult> results;
    private List<Map<String, Object>> alerts;
    private List<Map<String, Object>> sectors;
    private HedgeFundSignalDashboard hedgeFundSignals;
    private Map<String, Object> summary;
    private List<Map<String, Object>> architecture;
}
