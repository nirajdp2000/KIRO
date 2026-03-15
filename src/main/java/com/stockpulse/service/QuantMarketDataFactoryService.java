package com.stockpulse.service;

import com.stockpulse.model.MarketCandle;
import com.stockpulse.model.StockProfile;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.SplittableRandom;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class QuantMarketDataFactoryService {

    private final ConcurrentHashMap<String, List<MarketCandle>> candleCache = new ConcurrentHashMap<>();
    private volatile List<StockProfile> universeCache;

    public List<StockProfile> buildUniverse() {
        if (universeCache != null) {
            return universeCache;
        }

        synchronized (this) {
            if (universeCache != null) {
                return universeCache;
            }

            String[][] sectorMap = {
                    {"Technology", "Software"},
                    {"Financials", "Banking"},
                    {"Energy", "Oil & Gas"},
                    {"Healthcare", "Pharma"},
                    {"Consumer", "Retail"},
                    {"Industrials", "Capital Goods"},
                    {"Telecom", "Digital Networks"},
                    {"Materials", "Metals"}
            };

            List<String> roots = Arrays.asList(
                    "ALPHA", "NOVA", "ZEN", "ORBIT", "PRIME", "VECTOR", "AURA", "PULSE", "SUMMIT", "QUANT",
                    "TITAN", "VISTA", "RAPID", "FOCUS", "UNITY", "DELTA", "OMEGA", "MATRIX", "ARROW", "GALAXY"
            );

            List<StockProfile> profiles = new ArrayList<>();
            int counter = 0;
            for (String root : roots) {
                for (int i = 0; i < 30; i++) {
                    String[] sector = sectorMap[counter % sectorMap.length];
                    String symbol = root + (char) ('A' + (i % 26)) + String.format(Locale.US, "%02d", i);
                    double marketCap = 5_000 + ((counter * 137L) % 180_000);
                    double avgVolume = 80_000 + ((counter * 53L) % 2_500_000);
                    profiles.add(StockProfile.builder()
                            .symbol(symbol)
                            .sector(sector[0])
                            .industry(sector[1])
                            .marketCap(marketCap)
                            .averageVolume(avgVolume)
                            .build());
                    counter++;
                }
            }

            profiles.addAll(List.of(
                    StockProfile.builder().symbol("RELIANCE").sector("Energy").industry("Oil & Gas").marketCap(175_000).averageVolume(1_950_000).build(),
                    StockProfile.builder().symbol("TCS").sector("Technology").industry("Software").marketCap(150_000).averageVolume(1_250_000).build(),
                    StockProfile.builder().symbol("HDFCBANK").sector("Financials").industry("Banking").marketCap(130_000).averageVolume(1_850_000).build(),
                    StockProfile.builder().symbol("INFY").sector("Technology").industry("Software").marketCap(110_000).averageVolume(1_720_000).build(),
                    StockProfile.builder().symbol("SUNPHARMA").sector("Healthcare").industry("Pharma").marketCap(95_000).averageVolume(910_000).build()
            ));

            universeCache = List.copyOf(profiles);
            return universeCache;
        }
    }

    public List<MarketCandle> generateCandles(StockProfile profile, int years) {
        String cacheKey = profile.getSymbol() + ":" + years;
        return candleCache.computeIfAbsent(cacheKey, ignored -> createCandles(profile, years));
    }

    public Map<String, List<Map<String, Double>>> generateOrderBook(double lastPrice, String symbol) {
        SplittableRandom random = new SplittableRandom(symbol.hashCode() * 31L);
        List<Map<String, Double>> bids = new ArrayList<>();
        List<Map<String, Double>> asks = new ArrayList<>();
        for (int i = 1; i <= 10; i++) {
            bids.add(Map.of(
                    "price", lastPrice - (i * 0.35),
                    "volume", 2_000 + random.nextDouble(1_000, 10_000) * (i == 1 ? 1.8 : 1.0)
            ));
            asks.add(Map.of(
                    "price", lastPrice + (i * 0.35),
                    "volume", 1_800 + random.nextDouble(1_000, 8_000) * (i == 1 ? 0.9 : 1.0)
            ));
        }
        return Map.of("bids", bids, "asks", asks);
    }

    private List<MarketCandle> createCandles(StockProfile profile, int years) {
        int totalDays = Math.max(260, years * 252);
        SplittableRandom random = new SplittableRandom(profile.getSymbol().hashCode());
        List<MarketCandle> candles = new ArrayList<>(totalDays);
        double basePrice = 80 + random.nextDouble(2400);
        double sectorDrift = switch (profile.getSector()) {
            case "Technology" -> 0.0016;
            case "Financials" -> 0.0012;
            case "Healthcare" -> 0.0014;
            case "Energy" -> 0.0011;
            default -> 0.0010;
        };

        LocalDate startDate = LocalDate.now().minusDays(totalDays);
        double close = basePrice;
        for (int day = 0; day < totalDays; day++) {
            double noise = (random.nextDouble() - 0.5) * 0.05;
            double cyclical = Math.sin(day / 33.0 + random.nextDouble()) * 0.006;
            double drift = sectorDrift + cyclical + noise;
            double open = close;
            close = Math.max(15, close * (1 + drift));
            double high = Math.max(open, close) * (1 + random.nextDouble(0.001, 0.025));
            double low = Math.min(open, close) * (1 - random.nextDouble(0.001, 0.022));
            double volume = profile.getAverageVolume() * (0.85 + random.nextDouble() * 0.9) * (1 + Math.max(0, drift * 12));
            candles.add(MarketCandle.builder()
                    .date(startDate.plusDays(day))
                    .open(open)
                    .high(high)
                    .low(low)
                    .close(close)
                    .volume(volume)
                    .build());
        }
        return List.copyOf(candles);
    }
}
