package com.stockpulse.model;

import lombok.Builder;
import lombok.Value;

import java.time.LocalDate;

@Value
@Builder
public class MarketCandle {
    LocalDate date;
    double open;
    double high;
    double low;
    double close;
    double volume;
}
