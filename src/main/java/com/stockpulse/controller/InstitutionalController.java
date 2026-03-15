package com.stockpulse.controller;

import com.stockpulse.service.InstitutionalService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/institutional")
public class InstitutionalController {

    @Autowired
    private InstitutionalService institutionalService;

    @PostMapping("/imbalance")
    public Map<String, Object> getOrderImbalance(@RequestBody Map<String, List<Map<String, Double>>> orderBook) {
        return institutionalService.calculateOrderImbalance(orderBook);
    }

    @PostMapping("/volume-profile")
    public Map<String, Object> getVolumeProfile(@RequestBody Map<String, Object> payload) {
        List<Map<String, Double>> candles = (List<Map<String, Double>>) payload.get("candles");
        double binSize = payload.containsKey("binSize") ? Double.parseDouble(payload.get("binSize").toString()) : 1.0;
        return institutionalService.calculateVolumeProfile(candles, binSize);
    }

    @PostMapping("/correlation")
    public Map<String, Object> getCorrelation(@RequestBody Map<String, List<Double>> payload) {
        List<Double> seriesA = payload.get("seriesA");
        List<Double> seriesB = payload.get("seriesB");
        double correlation = institutionalService.calculateCorrelation(seriesA, seriesB);
        return Map.of("correlation", correlation);
    }

    @PostMapping("/market-regime")
    public Map<String, String> getMarketRegime(@RequestBody List<Map<String, Double>> candles) {
        String regime = institutionalService.detectMarketRegime(candles);
        return Map.of("regime", regime);
    }

    @GetMapping("/order-book")
    public Map<String, List<Map<String, Double>>> getOrderBook(@RequestParam double lastPrice) {
        Random random = new Random();
        List<Map<String, Double>> bids = new ArrayList<>();
        List<Map<String, Double>> asks = new ArrayList<>();

        for (int i = 0; i < 10; i++) {
            Map<String, Double> bid = new HashMap<>();
            bid.put("price", lastPrice - (i + 1) * 0.5);
            bid.put("volume", (double) (random.nextInt(5000) + (i == 0 ? 10000 : 0)));
            bids.add(bid);

            Map<String, Double> ask = new HashMap<>();
            ask.put("price", lastPrice + (i + 1) * 0.5);
            ask.put("volume", (double) random.nextInt(2000));
            asks.add(ask);
        }

        return Map.of("bids", bids, "asks", asks);
    }

    @GetMapping("/correlation-data")
    public List<Map<String, Object>> getCorrelationData(@RequestParam String symbol) {
        Random random = new Random();
        String[] assets = {"NIFTY 50", "BANK NIFTY", "USD/INR", "CRUDE OIL", "GOLD"};
        List<Map<String, Object>> data = new ArrayList<>();
        for (String asset : assets) {
            data.add(Map.of("name", asset, "value", 0.5 + random.nextDouble() * 0.45));
        }
        return data;
    }

    @GetMapping("/microstructure")
    public Map<String, Object> getMicrostructure() {
        Random random = new Random();
        return Map.of(
            "frequency", 120 + random.nextInt(50),
            "spread", 0.05 + random.nextDouble() * 0.1,
            "accumulation", 65 + random.nextInt(25)
        );
    }
}
