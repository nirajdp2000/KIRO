package com.stockpulse.controller;

import com.stockpulse.model.AIStockIntelligenceDashboard;
import com.stockpulse.service.AIStockIntelligenceService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * REST controller for the AI Stock Intelligence tab.
 * All endpoints are under /api/ai-intelligence
 */
@RestController
@RequestMapping("/api/ai-intelligence")
public class AIStockIntelligenceController {

    private static final Logger log = LoggerFactory.getLogger(AIStockIntelligenceController.class);

    private final AIStockIntelligenceService service;

    public AIStockIntelligenceController(AIStockIntelligenceService service) {
        this.service = service;
    }

    /**
     * GET /api/ai-intelligence/dashboard
     * Returns the full AI Stock Intelligence dashboard (cached 60s).
     */
    @GetMapping("/dashboard")
    public ResponseEntity<AIStockIntelligenceDashboard> getDashboard() {
        try {
            return ResponseEntity.ok(service.buildDashboard());
        } catch (Exception e) {
            log.error("Failed to build AI intelligence dashboard", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * POST /api/ai-intelligence/refresh
     * Force-refreshes the dashboard, bypassing the 60s cache.
     */
    @PostMapping("/refresh")
    public ResponseEntity<AIStockIntelligenceDashboard> refresh() {
        try {
            return ResponseEntity.ok(service.refresh());
        } catch (Exception e) {
            log.error("Failed to refresh AI intelligence dashboard", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * GET /api/ai-intelligence/alerts
     * Returns only the live alerts (lightweight polling endpoint).
     */
    @GetMapping("/alerts")
    public ResponseEntity<?> getAlerts() {
        try {
            return ResponseEntity.ok(Map.of("alerts", service.buildDashboard().getLiveAlerts()));
        } catch (Exception e) {
            log.error("Failed to fetch alerts", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * GET /api/ai-intelligence/rally-candidates
     * Returns only early rally candidates.
     */
    @GetMapping("/rally-candidates")
    public ResponseEntity<?> getRallyCandidates() {
        try {
            return ResponseEntity.ok(service.buildDashboard().getEarlyRallyCandidates());
        } catch (Exception e) {
            log.error("Failed to fetch rally candidates", e);
            return ResponseEntity.internalServerError().build();
        }
    }
}
