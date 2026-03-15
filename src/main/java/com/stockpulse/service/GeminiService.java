package com.stockpulse.service;

import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class GeminiService {

    private static final Logger log = LoggerFactory.getLogger(GeminiService.class);

    @Value("${gemini.api.key:}")
    private String apiKey;

    private static final String GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=";
    private final RestTemplate restTemplate;

    public GeminiService(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    public Map<String, Object> analyzeStockData(Map<String, Object> requestBody) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException("Gemini API key is missing.");
        }

        String prompt = constructPrompt(requestBody);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        
        Map<String, Object> payload = new HashMap<>();
        payload.put("contents", Collections.singletonList(
            Collections.singletonMap("parts", Collections.singletonList(
                Collections.singletonMap("text", prompt)
            ))
        ));

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(payload, headers);

        int retries = 3;
        long delay = 2000;
        
        while (retries > 0) {
            try {
                ResponseEntity<Map> response = restTemplate.postForEntity(GEMINI_API_URL + apiKey, entity, Map.class);
                String text = extractTextFromResponse(response.getBody());
                
                int confidence = extractConfidence(text);
                String recommendation = extractRecommendation(text);
                
                Map<String, Object> result = new HashMap<>();
                result.put("analysis", text);
                result.put("sources", new ArrayList<>()); // Extract sources if needed
                result.put("confidence", confidence);
                result.put("recommendation", recommendation);
                
                return result;
            } catch (Exception e) {
                if (retries > 1) {
                    log.warn("Gemini request failed, retrying. Remaining retries: {}", retries - 1, e);
                    try {
                        Thread.sleep(delay);
                    } catch (InterruptedException interruptedException) {
                        Thread.currentThread().interrupt();
                        throw new IllegalStateException("Gemini request interrupted", interruptedException);
                    }
                    retries--;
                    delay *= 2;
                } else {
                    log.error("Gemini analysis failed after retries", e);
                    throw new RuntimeException("Failed to analyze data after retries", e);
                }
            }
        }
        return Map.of("error", "Analysis failed");
    }

    private String constructPrompt(Map<String, Object> data) {
        String symbol = (String) data.get("symbol");
        String interval = (String) data.get("interval");
        return "As a world-class financial analyst, analyze the stock data for " + symbol + " (" + interval + "). Data: " + data.get("data");
    }

    private String extractTextFromResponse(Map responseBody) {
        try {
            List<Map> candidates = (List<Map>) responseBody.get("candidates");
            Map content = (Map) candidates.get(0).get("content");
            List<Map> parts = (List<Map>) content.get("parts");
            return (String) parts.get(0).get("text");
        } catch (Exception e) {
            return "Analysis result unavailable.";
        }
    }
    
    private int extractConfidence(String text) {
        Pattern pattern = Pattern.compile("Confidence(?:\\\\s+Score)?:\\\\s*(\\\\d+)%", Pattern.CASE_INSENSITIVE);
        Matcher matcher = pattern.matcher(text);
        if (matcher.find()) {
            return Integer.parseInt(matcher.group(1));
        }
        return 75;
    }
    
    private String extractRecommendation(String text) {
        Pattern pattern = Pattern.compile("\\\\*\\\\*Strategic Recommendation\\\\*\\\\*:\\\\s*(Buy|Sell|Hold)", Pattern.CASE_INSENSITIVE);
        Matcher matcher = pattern.matcher(text);
        if (matcher.find()) {
            return matcher.group(1).toUpperCase();
        }
        return "NEUTRAL";
    }
}
