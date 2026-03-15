package com.stockpulse.controller;

import com.stockpulse.model.AnalysisResult;
import com.stockpulse.model.QuantRequest;
import com.stockpulse.model.UltraQuantDashboardResponse;
import com.stockpulse.service.UltraQuantEngineService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/ultra-quant")
public class UltraQuantController {

    private final UltraQuantEngineService ultraQuantEngineService;

    public UltraQuantController(UltraQuantEngineService ultraQuantEngineService) {
        this.ultraQuantEngineService = ultraQuantEngineService;
    }

    @PostMapping("/scan")
    public List<AnalysisResult> scanStocks(@RequestBody QuantRequest request) {
        return ultraQuantEngineService.scanStocks(request);
    }

    @PostMapping("/dashboard")
    public UltraQuantDashboardResponse dashboard(@RequestBody QuantRequest request) {
        return ultraQuantEngineService.buildDashboard(request);
    }

    @GetMapping("/alerts")
    public List<Map<String, Object>> getRealTimeAlerts() {
        return ultraQuantEngineService.buildDashboard(new QuantRequest()).getAlerts();
    }

    @GetMapping("/architecture")
    public List<Map<String, Object>> architecture() {
        return ultraQuantEngineService.buildDashboard(new QuantRequest()).getArchitecture();
    }
}
