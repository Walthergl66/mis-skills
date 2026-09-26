# Log Context and Safety

Load this when populating MDC, propagating a correlation id, redacting sensitive values, controlling log volume, or reconstructing the story of one request from its log lines.

## Where the context comes from

| Source | Provides | Owner |
| --- | --- | --- |
| Micrometer Tracing `Tracer` | `traceId` and `spanId` matching the trace backend | `spring-boot-observability` |
| Servlet filter | Request method, route, and the entry and exit timestamps | `spring-boot-mvc` |
| Authentication | A principal identifier, hashed if it is an identifier | `spring-boot-security` |
| Application code | A job name, a batch id, a tenant | This skill |

One rule decides the whole design: **if a trace exists, the trace id is the correlation id.** A second id that does not match the trace backend is a join key nobody can use. A request without a trace header gets a sampler-created trace id or a namespaced `requestId` clearly not a trace id; a scheduled task opens an observation first and reads its span, or generates a `jobId`; an unauthenticated request gets no principal key at all rather than an empty string.

## MDC discipline

```java
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class CorrelationFilter extends OncePerRequestFilter {

    private static final String REQUEST_ID = "requestId";

    private final Tracer tracer;

    public CorrelationFilter(Tracer tracer) {
        this.tracer = tracer;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        try {
            Span span = tracer.currentSpan();
            if (span != null) {
                MDC.put("traceId", span.context().traceId());
                MDC.put("spanId", span.context().spanId());
            } else {
                // Unobserved request: a namespaced id, never presented as a trace id.
                MDC.put(REQUEST_ID, UUID.randomUUID().toString());
            }
            MDC.put("method", request.getMethod());
            MDC.put("route", RouteTemplate.of(request));
            long startedAt = System.nanoTime();
            chain.doFilter(request, response);
            MDC.put("durationMs", String.valueOf((System.nanoTime() - startedAt) / 1_000_000L));
        } finally {
            MDC.clear();
        }
    }
}
```

| Rule | Consequence of breaking it |
| --- | --- |
| Clear MDC in a `finally` | A pooled thread carries the previous request context into the next request |
| Never let MDC grow per iteration | A loop that puts a key per item produces a huge map and a huge pattern cost |
| Keep keys lowercase and stable | Changing a key silently breaks every log query and dashboard |
| Do not put an object in MDC | `%X` calls `toString`, so a lazily serialised entity blocks on a database call inside the log encoder |
| MDC is not a transport | It does not cross a thread without a decorator, and it does not cross a process without a header |

A cleaner route template is available from the `HandlerMapping` attribute, populated after dispatch:

```java
package com.acme.billing.support;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.servlet.HandlerMapping;

final class RouteTemplate {

    private RouteTemplate() {}

    static String of(HttpServletRequest request) {
        Object pattern = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
        return pattern == null ? "unmatched" : pattern.toString();
    }
}
```

Request logging of the raw URI puts every order id in the log store. Use the route template in the log line and keep the raw path only if a policy requires it.

## Propagation across boundaries

| Boundary | Mechanism | Gap |
| --- | --- | --- |
| `@Async` executor | `ContextPropagatingTaskDecorator` | No decoration, no context |
| Task scheduler | Same decorator | Default scheduler loses context |
| `CompletableFuture` | Executor with the decorator, or a captured `ContextSnapshot` | Default common pool loses context |
| Outbound HTTP | Observation instrumentation writes the trace header | Nothing needed |
| Message publish and consume | Observation-enabled messaging instrumentation | Verify the observation is created in the listener |
| Kafka producer interceptor | Trace header in the record headers | Manual `send` with a raw producer skips it |

For a listener, the observation must be opened inside the listener method. Opening it in the producer creates one trace that spans an arbitrary amount of queue time and couples unrelated requests.

## What must never be logged

| Category | Examples | Enforcement |
| --- | --- | --- |
| Credentials | Passwords, client secrets, private keys, connection strings with a password | Do not accept them as a log argument; redaction pattern as a backstop |
| Tokens and keys | Bearer tokens, API keys, refresh tokens, JWTs | Do not log the request headers at all |
| Session and cookie data | `JSESSIONID`, `Authorization`, `Cookie` | Header logging allowlist, not blocklist |
| Personal data | Full request bodies, email addresses, national identifiers, addresses | Log a hash or a length, never the value |
| Payment data | PAN, CVV, IBAN | Log a masked form at most, and prefer a token from the provider |
| Signed URLs | Pre-signed download links | Log the object key, not the URL |
| Secrets in errors | A connection string inside an exception message | Sanitise at the log boundary, and check exception types before logging |

```java
@Component
public class LogRedactor {

    private static final Pattern BEARER = Pattern.compile("(?i)bearer\\s+[A-Za-z0-9._~+/=-]+");
    private static final Pattern LONG_DIGITS = Pattern.compile("\\b\\d{12,19}\\b");

    public String scrub(String message) {
        if (message == null) {
            return null;
        }
        return LONG_DIGITS.matcher(BEARER.matcher(message).replaceAll("Bearer [REDACTED]"))
                .replaceAll(matchResult -> "[MASKED:" + matchResult.group().length() + "]");
    }

    public String maskEmail(String email) {
        int at = email.indexOf('@');
        return at <= 1 ? "[MASKED]" : email.charAt(0) + "***" + email.substring(at);
    }
}
```

| Trap | Symptom | Fix |
| --- | --- | --- |
| Logging an exception message that embeds a JDBC URL with a password | The password is in the log store and the exception type name is the only warning | Never build a log message from a raw exception message |
| `log.info("payload={}", object)` with a wide `toString` | A whole graph is serialised on the hot path | Log identifiers, not objects |
| Redaction only at the call site | The next developer forgets | Redact in the encoder and add a test |
| Redaction pattern that misses a new key | A silent leak | Add a test that scans captured output for known secret fixtures |

## Volume control

| Flood source | Symptom | Bound |
| --- | --- | --- |
| A log statement inside a row loop | Collector rate limit, dropped logs, cost | Aggregate, log one summary with counts and up to five sample ids |
| `log.debug(entity)` in a JPA listener | Millions of lines in development, and it masks everything else | Remove it; use a query log or a profiler instead |
| Per-retry logging in a resilience library | One stack per attempt | Log the first attempt and the final outcome, keep the count |
| INFO on a high-frequency internal endpoint | The INFO budget is spent on noise | Demote to `DEBUG`, keep the rate in a metric |
| A scheduler that logs every tick | Volume scales with tick frequency | Log on state change, and log the tick summary once per window |
| Dumping a large payload for debugging | Multi-megabyte lines truncate in every collector | Log the byte size and a content hash, fetch the payload from a store |

```java
package com.acme.billing.service;

import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class ImportService {

    private static final Logger log = LoggerFactory.getLogger(ImportService.class);
    private static final int SAMPLE_SIZE = 5;

    public ImportSummary importAll(List<Row> rows) {
        long startedAt = System.nanoTime();
        int rejected = 0;
        List<String> samples = new java.util.ArrayList<>(SAMPLE_SIZE);
        for (Row row : rows) {
            if (!row.isValid() && samples.size() < SAMPLE_SIZE) {
                samples.add(row.id());
            }
            if (!row.isValid()) {
                rejected++;
            }
        }
        log.info("import complete total={} rejected={} durationMs={} rejectedSample={}",
                rows.size(), rejected, (System.nanoTime() - startedAt) / 1_000_000L, samples);
        return new ImportSummary(rows.size(), rejected);
    }
}
```

## Debugging one request

```bash
# 1. Pull every line for a trace, in order.
TRACE_ID=<traceId>
kubectl logs deploy/ledger --since=1h | jq -c --arg t "$TRACE_ID" 'select(.traceId == $t)' \
  | jq -r '"\(.["@timestamp"]) \(.level) \(.logger) \(.message)"'

# 2. Find the slowest operation in that trace from the span view in the trace backend.

# 3. Turn on debug for one package only, for a bounded window, then revert.
kubectl set env deploy/ledger LOGGING_LEVEL_COM_ACME_BILLING_REPO=DEBUG
kubectl rollout status deploy/ledger
# ... reproduce ...
kubectl set env deploy/ledger LOGGING_LEVEL_COM_ACME_BILLING_REPO=INFO
```

| Step | Rule |
| --- | --- |
| Search by trace id, never by user id or order id | The trace id is the join key that every service shares |
| Order by timestamp, not by log stream arrival | Multi-line and async output reorders on the wire |
| Prefer the trace backend for timing | Log timestamps are millisecond-resolution and lose sub-millisecond ordering |
| One flag change at a time | Two simultaneous changes make the result unreadable |
| Revert the debug flag in the same session | A left-on `DEBUG` is an incident waiting for peak traffic |

| Anti-pattern | Why it fails |
| --- | --- |
| Logging every step at INFO "temporarily" | The change survives, and the volume is the only trace of it |
| Copying a request body into a log for debugging | Personal data and secrets in a durable store |
| Logging a stack for every layer that catches an exception | One failure, five stacks, no signal |
| Searching logs by timestamp alone | Replicas share a clock and the match set is ambiguous |
