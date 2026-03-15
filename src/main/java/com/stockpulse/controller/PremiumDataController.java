package com.stockpulse.controller;

import com.stockpulse.service.PremiumMarketService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/premium")
public class PremiumDataController {

    private final PremiumMarketService premiumMarketService;

    public PremiumDataController(PremiumMarketService premiumMarketService) {
        this.premiumMarketService = premiumMarketService;
    }

    @GetMapping("/momentum")
    public List<Map<String, Object>> getMomentum() {
        return premiumMarketService.getMomentum();
    }

    @GetMapping("/breakouts")
    public List<Map<String, Object>> getBreakouts() {
        return premiumMarketService.getBreakouts();
    }

    @GetMapping("/sentiment")
    public Map<String, Object> getSentiment() {
        return premiumMarketService.getSentiment();
    }

    @GetMapping("/sector-rotation")
    public List<Map<String, Object>> getSectorRotation() {
        return premiumMarketService.getSectorRotation();
    }

    @GetMapping("/ai-predictions")
    public List<Map<String, Object>> getAiPredictions() {
        return premiumMarketService.getAiPredictions();
    }

    @GetMapping("/psychology")
    public Map<String, Object> getPsychology(@RequestParam(defaultValue = "MARKET") String symbol) {
        return premiumMarketService.getPsychology(symbol);
    }

    @GetMapping("/market-intelligence")
    public Map<String, Object> getMarketIntelligence() {
        return premiumMarketService.getMarketIntelligence();
    }

    @GetMapping("/ai-news-feed")
    public List<Map<String, Object>> getAiNewsFeed() {
        return premiumMarketService.getAiNewsFeed();
    }
}
