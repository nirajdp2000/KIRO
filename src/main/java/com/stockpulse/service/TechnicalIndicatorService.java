package com.stockpulse.service;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class TechnicalIndicatorService {

    public List<Double> calculateSma(List<Map<String, Double>> data, int period) {
        List<Double> smaValues = new ArrayList<>();
        for (int i = 0; i < data.size(); i++) {
            if (i < period - 1) {
                smaValues.add(null);
            } else {
                double sum = 0;
                for (int j = i - period + 1; j <= i; j++) {
                    sum += data.get(j).getOrDefault("close", 0.0);
                }
                smaValues.add(sum / period);
            }
        }
        return smaValues;
    }
}
