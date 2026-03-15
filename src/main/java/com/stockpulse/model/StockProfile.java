package com.stockpulse.model;

import lombok.Builder;
import lombok.Value;

@Value
@Builder
public class StockProfile {
    String symbol;
    String sector;
    String industry;
    double marketCap;
    double averageVolume;
}
