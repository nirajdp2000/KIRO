package com.stockpulse.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriUtils;

import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Map;

@Service
public class UpstoxMarketDataService {

    private static final Logger log = LoggerFactory.getLogger(UpstoxMarketDataService.class);

    @Value("${upstox.access.token:}")
    private String upstoxToken;

    private final RestTemplate restTemplate;

    public UpstoxMarketDataService(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    public Map fetchHistoricalData(String instrumentKey, String interval, String fromDate, String toDate) {
        String token = upstoxToken != null && !upstoxToken.isEmpty() ? upstoxToken : "your_token_here";
        if ("your_token_here".equals(token)) {
            throw new IllegalStateException("Upstox Access Token is missing.");
        }

        String encodedKey = UriUtils.encodePathSegment(instrumentKey, StandardCharsets.UTF_8);
        String url = String.format(
                "https://api.upstox.com/v2/historical-candle/%s/%s/%s/%s",
                encodedKey,
                interval,
                toDate,
                fromDate
        );

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setAccept(Collections.singletonList(MediaType.APPLICATION_JSON));

        try {
            ResponseEntity<Map> response = restTemplate.exchange(url, HttpMethod.GET, new HttpEntity<>(headers), Map.class);
            return response.getBody();
        } catch (Exception ex) {
            log.error("Failed to fetch Upstox historical data for {}", instrumentKey, ex);
            throw new IllegalStateException("Failed to fetch data", ex);
        }
    }
}
