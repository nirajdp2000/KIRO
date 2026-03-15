package com.stockpulse.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class StockCatalogServiceTest {

    private final StockCatalogService stockCatalogService = new StockCatalogService();

    @Test
    void returnsEmptyResultsForShortBlankQuery() {
        assertTrue(stockCatalogService.searchStocks(" ").isEmpty());
    }

    @Test
    void findsKnownStocksBySymbol() {
        assertFalse(stockCatalogService.searchStocks("INFY").isEmpty());
    }
}
