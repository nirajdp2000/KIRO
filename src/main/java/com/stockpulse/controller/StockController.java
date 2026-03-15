package com.stockpulse.controller;

import com.stockpulse.service.StockCatalogService;
import com.stockpulse.service.TechnicalIndicatorService;
import com.stockpulse.service.UpstoxMarketDataService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/stocks")
public class StockController {

    private static final Logger log = LoggerFactory.getLogger(StockController.class);

    private final StockCatalogService stockCatalogService;
    private final UpstoxMarketDataService upstoxMarketDataService;
    private final TechnicalIndicatorService technicalIndicatorService;

    public StockController(
            StockCatalogService stockCatalogService,
            UpstoxMarketDataService upstoxMarketDataService,
            TechnicalIndicatorService technicalIndicatorService
    ) {
        this.stockCatalogService = stockCatalogService;
        this.upstoxMarketDataService = upstoxMarketDataService;
        this.technicalIndicatorService = technicalIndicatorService;
    }

    @GetMapping("/search")
    public List<Map<String, String>> searchStocks(@RequestParam(defaultValue = "") String q) {
        return stockCatalogService.searchStocks(q);
    }

    @GetMapping("/historical")
    public ResponseEntity<?> getHistoricalData(
            @RequestParam String instrumentKey,
            @RequestParam String interval,
            @RequestParam String fromDate,
            @RequestParam String toDate
    ) {
        try {
            return ResponseEntity.ok(upstoxMarketDataService.fetchHistoricalData(instrumentKey, interval, fromDate, toDate));
        } catch (IllegalStateException ex) {
            if ("Upstox Access Token is missing.".equals(ex.getMessage())) {
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body(Map.of("status", "error", "errors", List.of(Map.of("message", ex.getMessage()))));
            }
            log.error("Historical data request failed for {}", instrumentKey, ex);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to fetch data", "details", ex.getMessage()));
        }
    }

    @PostMapping("/sma")
    public ResponseEntity<?> calculateSMA(@RequestBody Map<String, Object> payload) {
        try {
            List<Map<String, Double>> data = (List<Map<String, Double>>) payload.get("data");
            int period = (int) payload.get("period");
            return ResponseEntity.ok(Map.of("sma", technicalIndicatorService.calculateSma(data, period)));
        } catch (Exception ex) {
            log.error("SMA calculation failed", ex);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to calculate SMA", "details", ex.getMessage()));
        }
    }
}
