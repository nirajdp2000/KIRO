package com.stockpulse.controller;

import com.stockpulse.service.QuantSignalService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/quant")
public class QuantEngineController {

    private final QuantSignalService quantSignalService;

    public QuantEngineController(QuantSignalService quantSignalService) {
        this.quantSignalService = quantSignalService;
    }

    @GetMapping("/momentum")
    public List<Map<String, Object>> getQuantMomentum() {
        return quantSignalService.getMomentum();
    }

    @GetMapping("/breakouts")
    public List<Map<String, Object>> getQuantBreakouts() {
        return quantSignalService.getBreakouts();
    }

    @GetMapping("/volume-surge")
    public List<Map<String, Object>> getVolumeSurge() {
        return quantSignalService.getVolumeSurge();
    }

    @GetMapping("/indicators")
    public List<Map<String, Object>> getIndicators() {
        return quantSignalService.getIndicators();
    }

    @GetMapping("/sectors")
    public List<Map<String, Object>> getSectors() {
        return quantSignalService.getSectors();
    }

    @GetMapping("/money-flow")
    public List<Map<String, Object>> getMoneyFlow() {
        return quantSignalService.getMoneyFlow();
    }

    @GetMapping("/trends")
    public List<Map<String, Object>> getTrends() {
        return quantSignalService.getTrends();
    }

    @GetMapping("/advanced-intelligence")
    public Map<String, Object> getAdvancedIntelligence() {
        return quantSignalService.getAdvancedIntelligence();
    }

    @GetMapping("/sentiment")
    public Map<String, Object> getSentiment() {
        return quantSignalService.getSentiment();
    }
}
