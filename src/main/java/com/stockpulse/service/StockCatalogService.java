package com.stockpulse.service;

import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class StockCatalogService {

    private static final List<Map<String, String>> POPULAR_STOCKS = Arrays.asList(
            Map.of("name", "RELIANCE INDUSTRIES LTD", "symbol", "RELIANCE", "key", "NSE_EQ|INE002A01018"),
            Map.of("name", "TATA CONSULTANCY SERVICES LTD", "symbol", "TCS", "key", "NSE_EQ|INE467B01029"),
            Map.of("name", "HDFC BANK LTD", "symbol", "HDFCBANK", "key", "NSE_EQ|INE040A01034"),
            Map.of("name", "INFOSYS LTD", "symbol", "INFY", "key", "NSE_EQ|INE009A01021"),
            Map.of("name", "ICICI BANK LTD", "symbol", "ICICIBANK", "key", "NSE_EQ|INE090A01021"),
            Map.of("name", "STATE BANK OF INDIA", "symbol", "SBIN", "key", "NSE_EQ|INE062A01020"),
            Map.of("name", "BHARTI AIRTEL LTD", "symbol", "BHARTIARTL", "key", "NSE_EQ|INE397D01024"),
            Map.of("name", "LARSEN & TOUBRO LTD", "symbol", "LT", "key", "NSE_EQ|INE018A01030"),
            Map.of("name", "ITC LTD", "symbol", "ITC", "key", "NSE_EQ|INE154A01025"),
            Map.of("name", "KOTAK MAHINDRA BANK LTD", "symbol", "KOTAKBANK", "key", "NSE_EQ|INE237A01028")
    );

    public List<Map<String, String>> searchStocks(String query) {
        String normalizedQuery = query == null ? "" : query.trim().toUpperCase();
        if (normalizedQuery.isEmpty()) {
            return Collections.emptyList();
        }

        return POPULAR_STOCKS.stream()
                .filter(stock -> stock.get("symbol").contains(normalizedQuery) || stock.get("name").contains(normalizedQuery))
                .limit(10)
                .collect(Collectors.toList());
    }

    public List<Map<String, String>> getPopularStocks() {
        return POPULAR_STOCKS;
    }
}
