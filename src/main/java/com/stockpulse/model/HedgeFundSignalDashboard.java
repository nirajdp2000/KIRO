package com.stockpulse.model;

import lombok.Builder;
import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
@Builder
public class HedgeFundSignalDashboard {
    private List<HedgeFundSignalScore> rankings;
    private List<Map<String, Object>> sectorStrength;
    private List<Map<String, Object>> momentumHeatmap;
    private Map<String, Object> summary;
}
