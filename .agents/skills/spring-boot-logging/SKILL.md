---
name: spring-boot-logging
description: 'Use when configuring or reviewing logging in a Spring Boot 3.5 service, including Logback setup, logback-spring.xml, springProfile, springProperty, JSON output, logstash-logback-encoder, MDC and correlation ids, level strategy, appender selection, AsyncAppender queue tuning, sensitive data redaction, and log volume control. Triggers include logging.level, logger name, log pattern, console appender, file appender, rolling policy, stdout, MDC.put, traceId, DEBUG logs in production, log flooding, and log-driven debugging of one request. Do not use for metric or trace emission, nor for actuator endpoint exposure. When other skills also apply, reconcile ownership before mutation.'
license: MIT
metadata:
  author: Walthergl66
  version: '1.0.0'
---

# Spring Boot Logging and Log Structure

Own what the process writes, in what shape, with what context, and at what volume. Logback is already configured sensibly by default; the work here is deciding what to override, what to never print, and how to follow one request through the whole system without generating a million lines to do it.

## When to use

- Adding or restructuring `logback-spring.xml`, appenders, encoders, or rolling policies.
- Switching to JSON output for a log collector, or deciding not to.
- Putting a correlation id, trace id, or tenant into MDC and clearing it correctly.
- Debugging one specific request end to end, or a loop or batch job flooding the collector.
- Deciding what must be redacted, and enforcing it rather than trusting reviewers.

## When not to use

- Meter, observation, and span design belong to `spring-boot-observability`.
- Which actuator endpoints are exposed and on which port belong to `spring-boot-actuator`.
- Creating the request context and the observation belong to `spring-boot-mvc`.
- Log shipping, retention, and index limits belong to the platform, not to the application.
- Traces and metrics that the log lines reference belong to `spring-boot-observability`.

## Ownership and sibling boundaries

This skill owns log configuration, format, context, and volume.

- `spring-boot-observability` owns the trace id source. Hand it the requirement that the log carries the same id the span uses.
- `spring-boot-mvc` owns where the inbound request and its context begin. Hand it the filter that populates and clears MDC.
- `spring-boot-actuator` owns endpoint exposure. Hand it the rule that the management port may log less than the application port.
- `spring-boot-docker` owns where the process runs. Hand it the contract that logs go to stdout and stderr, never to a file in the image.
- `spring-boot-ci-cd` owns the pipeline. Hand it the level overrides used in a build so a failing test is not hidden.

## Hard rules

1. **Override Logback only for a stated reason.** Boot already sets sane levels, a console appender, and a pattern. Every override is a maintenance obligation.
2. **Use `logback-spring.xml`, not `logback.xml`.** Only the `-spring` variant resolves `<springProfile>`, `<springProperty>`, and `<springBean>`.
3. **Logs go to stdout and stderr.** Never write to a file inside the container; there is no lifecycle manager for it and no clean way to ship it.
4. **Never generate a second correlation id.** If a trace exists, its trace id is the correlation id. A synthetic id is a fallback for work outside an observed request and must be namespaced.
5. **Credentials, tokens, cookies, authorization headers, full request bodies, and session ids never reach a log statement.** Enforce with a redaction layout, not with reviewer discipline.
6. **`DEBUG` is off in production.** A level is a budget: raising one logger to DEBUG without a removal plan is an incident waiting for load.
7. **Every log line in a request is attributable to a decision.** A line nobody acts on is cost. Log the outcome, not every step.
8. **Bound the volume of any loop.** Aggregate first, then log one summary line with counts and any sample identifiers.

## Boot defaults and when to override

Boot already attaches a `CONSOLE` appender to stdout, sets the root level to `INFO`, applies a readable pattern, and honours `logging.level.*` before the config file loads. Override only for a stated reason: JSON output, a different date format, the service name in every line, or an appender the platform needs. A file appender is a local or batch-only decision; there is no rotation daemon in a container.

## Format decision

| Target | Format | Why |
| --- | --- | --- |
| Container log collector with a JSON pipeline | JSON via `logstash-logback-encoder` | Fields are queryable without a grok rule |
| Local development, `kubectl logs`, a tail | Pattern layout with `%d`, `%5p`, `%c`, `%X{traceId}` | Readable without tooling |
| Mixed | JSON everywhere, a readable pattern under a `local` profile | One file, two profiles |
| Nothing structured required | Keep the Boot default | The lowest-maintenance option, often correct |

## Correlation and MDC

```java
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class CorrelationFilter extends OncePerRequestFilter {

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
            }
            MDC.put("method", request.getMethod());
            MDC.put("route", RouteTemplate.of(request));
            chain.doFilter(request, response);
        } finally {
            MDC.clear();
        }
    }
}
```

`MDC.clear()` in a `finally` block is not optional. A pooled request thread without a clear leaks the previous request context into the next one, which is the single most common source of impossible-looking log lines.

| Key | Value | Notes |
| --- | --- | --- |
| `traceId` | `span.context().traceId()` | Same value the trace backend uses; this is the join key |
| `spanId` | `span.context().spanId()` | Lets a log line point at a specific span |
| `method`, `route` | Request attributes | The route template, not the raw path with identifiers |
| `tenant` | Only if non-sensitive and bounded | A log field is fine; a metric tag is a cardinality decision |

## Levels as a budget
| Level | Production use | Rule |
| --- | --- | --- |
| `ERROR` | Unrecoverable failure needing a human | One per incident, at the owning boundary |
| `WARN` | Degraded but handled, or a near miss | Must be countable, or it is noise |
| `INFO` | Business outcome and lifecycle events | The default; write an outcome, not a step |
| `DEBUG` | Off in production | On demand, per logger, with a documented revert |
| `TRACE` | Never | Off by default everywhere |

```yaml
logging:
  level:
    root: INFO
    org.springframework.web: INFO
    org.hibernate.SQL: WARN
    com.acme.billing: INFO
```

## Volume control

| Source of flood | Bound |
| --- | --- |
| A log statement inside a loop over rows | Log the count, the duration, and up to five sample ids |
| A per-request log at INFO on a high-frequency endpoint | Demote to `DEBUG`, keep the aggregate in a metric |
| A retry loop | Log the first attempt, the final outcome, and the attempt count |
| A debug dump of a large object | Log the size and a hash, fetch detail from a trace or a store |
| A scheduler that logs every tick | Log on state change, not on every tick |

## Async appender

Put a bounded `AsyncAppender` in front of the real appender, and set all three knobs explicitly rather than inheriting the defaults: `queueSize` sized from the measured peak, `discardingThreshold` set to `0` because the default silently drops the lowest levels at 80 percent full, and `neverBlock` set with the failure mode you accept stated. Blocking the request thread preserves delivery; never blocking preserves latency and loses lines invisibly. An `ERROR` line without its stack trace is half an event.

## Reference routing

| Task | Load |
| --- | --- |
| Write `logback-spring.xml`, split by profile, emit JSON, or tune an async appender | [logback-config.md](references/logback-config.md) |
| Populate and clear MDC, redact sensitive values, control volume, and debug one request | [context-and-safety.md](references/context-and-safety.md) |

## Expected response

- **Format decision:** pattern or JSON, the target collector, and the exact `logback-spring.xml` shape including profile splits.
- **Level plan:** per-logger levels for production, which loggers are temporary `DEBUG`, and how they are reverted.
- **Context contract:** the MDC keys, who sets them, who clears them, and confirmation that no competing id is generated.
- **Redaction list:** every field that must never be logged and the mechanism that enforces it.
- **Volume plan:** the flooding sources, the aggregation that bounds them, and the appender queue settings.
- **Verification:** a command that retrieves every line for one trace id, and a test that asserts a redacted field never appears in output.