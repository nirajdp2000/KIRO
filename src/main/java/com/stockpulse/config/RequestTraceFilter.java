package com.stockpulse.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Optional;
import java.util.UUID;

@Component
public class RequestTraceFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RequestTraceFilter.class);

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        long startedAt = System.currentTimeMillis();
        String requestId = Optional.ofNullable(request.getHeader("X-Request-Id"))
                .filter(value -> !value.isBlank())
                .orElseGet(() -> UUID.randomUUID().toString());

        MDC.put("requestId", requestId);
        response.setHeader("X-Request-Id", requestId);

        try {
            filterChain.doFilter(request, response);
        } finally {
            long durationMs = System.currentTimeMillis() - startedAt;
            int status = response.getStatus();

            if (status >= 500) {
                log.error(
                        "API request completed with server error method={} path={} status={} durationMs={}",
                        request.getMethod(),
                        request.getRequestURI(),
                        status,
                        durationMs
                );
            } else if (status >= 400) {
                log.warn(
                        "API request completed with client error method={} path={} status={} durationMs={}",
                        request.getMethod(),
                        request.getRequestURI(),
                        status,
                        durationMs
                );
            } else {
                log.info(
                        "API request completed method={} path={} status={} durationMs={}",
                        request.getMethod(),
                        request.getRequestURI(),
                        status,
                        durationMs
                );
            }

            MDC.remove("requestId");
        }
    }
}
