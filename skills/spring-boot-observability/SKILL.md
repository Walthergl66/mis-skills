---
name: spring-boot-observability
description: 'Use when adding or reviewing metrics, traces, and instrumentation in a Spring Boot 3.5 service. Triggers include MeterRegistry, Counter, Timer, Gauge, Observation, ObservationRegistry, ObservedAspect, @Observed, Micrometer Tracing, OpenTelemetry export, management.tracing.sampling.probability, micrometer-registry-prometheus, actuator prometheus, hikaricp, jdbc.connections, jvm.memory, MeterFilter, cardinality, SLO, error budget, and burn rate. Do not use for log format, MDC, or appender configuration, nor for endpoint exposure rules and the management port. When other skills also apply, reconcile ownership before mutation.'
license: MIT
metadata:
  author: Walthergl66
  version: '1.0.0'
---

# Spring Boot Metrics, Traces, and Instrumentation

Own what the service emits and what those signals are allowed to mean: meter names and tag budgets, where instrumentation goes, how observations become both metrics and spans, and which signals justify an SLO. Actuator already produces a large useful baseline; most of this skill is deciding what to add and what to delete.

## When to use

- A metric, span, or dashboard is missing, wrong, or too expensive to store.
- Choosing between a manual `Timer`, `Observation`, and `@Observed` for a code path.
- Tag or label cardinality is growing, or a time series is missing from the backend.
- Traces stop at a thread boundary, a message, or an outbound call.
- Deciding which signal maps to which SLO and alert, or reviewing instrumentation across layers.

## When not to use

- Log format, encoders, MDC, and appender tuning belong to `spring-boot-logging`.
- Which actuator endpoints exist, on which port, and under which auth belong to `spring-boot-actuator`.
- Controller, filter, and interceptor placement belongs to `spring-boot-mvc`.
- Repository, entity, and query instrumentation points belong to `spring-boot-data-jpa`.
- Alert delivery rules, pipelines, and runbooks belong to `spring-boot-ci-cd`.
- Image and container telemetry wiring belongs to `spring-boot-docker`.

## Ownership and sibling boundaries

This skill owns signal design, instrumentation, and cardinality.

- `spring-boot-logging` owns the log line format and the MDC fields that carry the correlation id. Hand it the trace id and span id to render.
- `spring-boot-actuator` owns endpoint exposure and the management port. Hand it the list of endpoints an operator must reach.
- `spring-boot-mvc` owns where the inbound request context is created. Hand it the filter that opens the observation.
- `spring-boot-data-jpa` owns the repository and transaction internals. Hand it the query and fetch-plan concerns behind a slow span.
- `spring-boot-ci-cd` owns alert rules and dashboards in the repository. Hand it the SLO targets and burn-rate thresholds.

## Hard rules

1. **An instrumented number nobody alerts on and nobody queries is cost without value.** Every new meter names the SLO, dashboard panel, or decision it serves. If none exists, delete it instead of shipping it.
2. **Register every meter once.** Build meters from a `MeterRegistry` at construction or bind once in a `DefaultMeterBinder`. Creating a `Counter` inside a request path returns a new object on every call and leaks.
3. **Tag values come from a closed set.** Route templates, enums, outcome classes, and bounded result codes. Never a user id, request id, raw URL, exception message, or timestamp.
4. **Prefer `Observation` over a hand-rolled `Timer` when a trace matters.** An observation emits a metric and a span from one declaration, so they cannot drift apart.
5. **`http.server.requests` already exists.** Do not re-instrument the inbound request path with a second timer that measures the same thing.
6. **Tag cardinality is a budget with a numeric cap.** Enforce it with a `MeterFilter`, not with a review comment.
7. **Instrument outcomes, not code paths.** A meter must be answerable to an operational question, not a code-coverage one.
8. **Percentiles configured in code are a trap.** Use `management.metrics.distribution.percentiles-histogram` and let the backend compute percentiles.
9. **Assert instrumentation in a test.** A meter name and its label set are an interface; a rename breaks a dashboard silently.

## The baseline Actuator already gives you

Actuator already publishes `http.server.requests` and `http.client.requests` with `uri`, `method`, `status`, `outcome`, and `exception`; `jdbc.connections.*` and `hikaricp.connections.*` including `usage`, `pending`, `max`, and `acquire`; `jvm.memory.used`, `jvm.gc.pause`, `jvm.threads.live`, and `jvm.buffer.*`; `process.cpu.usage`, `process.start.time`, and `process.uptime`; and `cache.gets`, `cache.puts`, `cache.size`, and `cache.eviction` when a cache abstraction is bound. If a number you need is in that list, do not build a custom meter for it. Extend it only when a required dimension is missing, and add that dimension as a bounded tag.

## Custom instrumentation

```java
@Component
public class LedgerMetrics {

    private final AtomicLong unpublished = new AtomicLong();
    private final ObservationRegistry observations;

    public LedgerMetrics(ObservationRegistry observations, MeterRegistry registry) {
        this.observations = observations;
        Gauge.builder("acme.ledger.unpublished", unpublished, AtomicLong::get)
                .description("Entries accepted but not yet written to the journal")
                .baseUnit("entries")
                .register(registry);
    }

    public Counter rejections(String currency) {
        return Counter.builder("acme.ledger.publish.rejections")
                .description("Publish attempts rejected by policy")
                .tag("currency", currency)
                .register(observations.getOrCreateMeterRegistry());
    }

    public Observation publishObservation(String currency) {
        return Observation.createNotStarted("acme.ledger.publish", observations)
                .lowCardinalityKeyValue(KeyName("currency").asString(currency));
    }
}
```

`observations.getOrCreateMeterRegistry()` returns the composite registry, so a meter created through it lands in every backend that exists at runtime. Use `Counter` for discrete events, `Timer` for durations, `DistributionSummary` for non-duration sizes, `Gauge` for a level that rises and falls, `Observation` when a metric and a span come from one declaration, and `@Observed` with `ObservedAspect` for a whole service class.

Bound the tags in code. Boot applies every `MeterFilter` bean to the registry it builds, so the cap is enforced before the first scrape rather than after a decision review:

```java
@Bean
MeterFilter currencyTagBudget() {
    return MeterFilter.maximumAllowableTags("acme.ledger.publish", "currency", 20, MeterFilter.deny());
}
```

## Tracing

```yaml
management:
  tracing:
    sampling:
      probability: 0.10
  otlp:
    tracing:
      endpoint: http://otel-collector:4318/v1/traces
  distribution:
    percentiles-histogram:
      http.server.requests: true
      jdbc.connections.acquire: true
```

Start at `0.10` for a non-critical service. Raise it for a low-traffic service where every trace matters, lower it for a high-fanout service where traces cost more than they explain. Sample on the entry point only; Boot applies the decision once per trace. A head-based sampler cannot know the outcome at entry, so an errored request is kept only if it happened to be sampled.

## Losing context at a thread boundary

`@Async`, `CompletableFuture`, schedulers, and reactive operators run on a thread whose thread-locals were never populated. Without a task decorator, the work is untraced and the log lines lose their correlation id.

```java
@Bean
ThreadPoolTaskExecutor applicationTaskExecutor(ContextPropagatingTaskDecorator decorator) {
    ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    executor.setTaskDecorator(decorator);
    executor.initialize();
    return executor;
}
```

The decorator copies thread-local context, including the active observation, at submit time. It also copies a `SecurityContext`, so scope the copied values deliberately.

## Reference routing

| Task | Load |
| --- | --- |
| Choose and implement custom meters, `@Observed`, Observation, tracing configuration, or context propagation | [metrics-and-tracing.md](references/metrics-and-tracing.md) |
| Set a cardinality budget, map signals to SLOs, size sampling cost, and build dashboard and query recipes | [signals-and-slos.md](references/signals-and-slos.md) |

## Expected response

- **Signal inventory:** existing Actuator meters that already cover the question, and the exact gap the new meter fills.
- **Meter definition:** name, base unit, bounded tag set with the numeric cap, and the one operational decision it serves.
- **Instrumentation form:** manual meter, `Observation`, or `@Observed`, with the reason and the registration site.
- **Trace path:** propagation across HTTP, thread boundaries, messages, and outbound clients, plus the sampling probability and its cost.
- **Correlation contract:** the fields the log format must carry and where they are set.
- **SLO mapping:** the indicator, the window, the objective, and the burn-rate alert that would page.
