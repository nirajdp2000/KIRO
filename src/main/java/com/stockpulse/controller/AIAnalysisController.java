package com.stockpulse.controller;

import com.stockpulse.service.GeminiService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import java.util.Map;

@RestController
@RequestMapping("/api/ai")
public class AIAnalysisController {

    private static final Logger log = LoggerFactory.getLogger(AIAnalysisController.class);

    private final GeminiService geminiService;

    public AIAnalysisController(GeminiService geminiService) {
        this.geminiService = geminiService;
    }

    @PostMapping("/analyze")
    public ResponseEntity<?> analyze(@RequestBody Map<String, Object> requestBody) {
        try {
            Map<String, Object> result = geminiService.analyzeStockData(requestBody);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("AI analysis failed", e);
            return ResponseEntity.status(500).body(Map.of("error", "Failed to generate AI analysis"));
        }
    }
}
