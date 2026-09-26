# Metrics and Tracing

Load this when adding custom instrumentation, choosing between a manual meter and an Observation, wiring Micrometer Tracing with OpenTelemetry, or restoring context across thread and message boundaries.

## Naming rules

| Element | Convention | Example |
| --- | --- | --- |
| Meter name | Dotted, lowercase, unit as the final segment | `acme.ledger.publish.duration` |
| Base unit | Seconds for time, bytes for size, entries for counts, percent for ratios | `.baseUnit("seconds")` |
| Tag keys | Lowercase dotted or snake, one dimension per level of the question | `currency`, `outcome` |
| Tag values | From a closed set: enum, status class, route template | `outcome="SUCCESS"` |
| Observation name | Matches the metric name it produces, no unit suffix | `acme.ledger.publish` |

| Mistake | Symptom | Fix |
| --- | --- | --- |
| Raw path in a tag | One series per resource, thousands of series | Use the route template, `/orders/{id}` |
| Exception message in a tag | Unbounded and frequently changing | Use the exception class name only |
| User or order id in a tag | Cardinality explosion, and personal data in the metric store | Never; keep it in a trace attribute or a log field |
| Timestamp or duration in a name | Every value becomes a new meter | Buckets only |
| `Counter` for a level | Wrong monotonicity, readers assume a rate | `Gauge` for a level, `Counter` for events |

## What Actuator already publishes

| Group | Meters | Notes |
| --- | --- | --- |
| HTTP server and client | `http.server.requests`, `http.client.requests` | `uri` is already the route template, plus `status`, `method`, `outcome`, `exception` |
| DataSource and pool | `jdbc.connections.idle`, `.active`, `.max`, `.min`, `.pending`, `.acquire` and `hikaricp.connections.*` | `acquire` is a timer of pool checkout latency |
| JVM memory and GC | `jvm.memory.used`, `.committed`, `.max`, `jvm.gc.pause`, `jvm.gc.memory.promoted` | Pool name tags are bounded |
| Threads and buffers | `jvm.threads.live`, `.peak`, `.daemon`, `jvm.buffer.count`, `jvm.buffer.memory.used` | A leak shows up in `live`; direct buffers in `jvm.buffer` |
| Process | `process.cpu.usage`, `process.uptime`, `process.start.time` | `start.time` is a deployment marker |
| Cache | `cache.gets`, `cache.puts`, `cache.size`, `cache.eviction` | Requires a bound cache abstraction |

Before writing a meter, search the live registry. `Search.in(registry).meters().stream().map(Meter::getId).toList()` is the fastest way to prove a meter already exists.

## Manual meters, once

```java
@Service
public class LedgerService {

    private final Timer publishTimer;
    private final MeterRegistry registry;

    public LedgerService(MeterRegistry registry) {
        this.registry = registry;
        this.publishTimer = Timer.builder("acme.ledger.publish")
                .description("Time spent writing a ledger entry to the journal")
                .baseUnit("seconds")
                .tag("currency", "EUR")
                .publishPercentileHistogram()
                .register(registry);
    }

    public <T> T publish(Callable<T> work) throws Exception {
        return publishTimer.recordCallable(work);
    }
}
```

Creating a meter in a constructor or in a `@PostConstruct` is correct. Creating one inside a method body is a defect: Micrometer returns a new object for a new tag combination, and the allocation shows up under load.

`Timer.recordCallable` wraps exceptions and rethrows. For a body with several exit points, use `Timer.Sample`:

```java
Timer.Sample sample = Timer.start(registry);
try {
    return journal.append(entry);
} finally {
    sample.stop(Timer.builder("acme.ledger.journal.append").register(registry));
}
```

For a level, register a `Gauge` in a `DefaultMeterBinder.bindTo` so it is created exactly once against the registry Boot builds.

## Observation, the default choice

`Observation` produces a metric named after the observation and, when a tracer is on the classpath, a span with the same name and the same dimensions. One declaration, two signals, no drift.

```java
@Service
public class PaymentService {

    private final ObservationRegistry observations;

    public PaymentService(ObservationRegistry observations) {
        this.observations = observations;
    }

    public <T> T settle(String method, Callable<T> work) {
        return Observation.createNotStarted("acme.payment.settle", observations)
                .lowCardinalityKeyValue("method", method)
                .highCardinalityKeyValue("order.id", "sanitised-for-trace-only")
                .observe(work::call);
    }

    public Observation createSpan(String method) {
        return Observation.createNotStarted("acme.payment.settle", observations)
                .contextualName("settle " + method)
                .lowCardinalityKeyValue("method", method);
    }
}
```

| Use | Mechanism | Consequence |
| --- | --- | --- |
| `lowCardinalityKeyValue` | Becomes a metric tag | Keep values in a closed set |
| `highCardinalityKeyValue` | Span attribute only | Safe for an id, never becomes a series |
| `contextualName` | Span name | Span names stay low-cardinality in the trace backend |
| `error()` on the scope | Marks the observation as an error | Feeds both the metric and the span status |

## `@Observed` for uniform service methods

```java
@Service
public class StatementService {

    @Observed(name = "acme.statement.generate", contextualName = "generate statement")
    public String generate(String period) {
        return render(period);
    }
}
```

The aspect is `io.micrometer.observation.aop.ObservedAspect`, auto-configured by Boot. It is Spring AOP, so it needs `spring-boot-starter-aop` and does not apply to self-invocation within the same bean. `@Observed` cannot interpolate a tag from a method argument, so a dynamic dimension needs an explicit `Observation`.

## Tracing configuration

```xml
<dependency>
  <groupId>io.micrometer</groupId>
  <artifactId>micrometer-tracing-bridge-otel</artifactId>
</dependency>
<dependency>
  <groupId>io.micrometer</groupId>
  <artifactId>micrometer-registry-prometheus</artifactId>
  <scope>runtime</scope>
</dependency>
```

```yaml
management:
  tracing:
    sampling:
      probability: 0.10
  otlp:
    tracing:
      endpoint: http://otel-collector:4318/v1/traces
  endpoints:
    web:
      exposure:
        include: health,prometheus
```

| Property | Effect | Trap |
| --- | --- | --- |
| `management.tracing.sampling.probability` | Fraction of traces kept | Sampling must be decided only at the entry point, or a trace is half-recorded |
| `management.otlp.tracing.endpoint` | OTLP trace target | A collector that silently drops looks like sampling loss |
| `management.metrics.export.url` | OTLP metric target | Metrics and traces can go to different backends; keep the retention model understood |
| `management.metrics.tags.*` | Global tags on every meter | A global tag with an unbounded value breaks every meter at once |
| `management.observations.key-values.*` | Global attributes on every observation | Same risk, and it lands in every trace |

## Reading the current span

```java
Span span = tracer.currentSpan();
if (span != null) {
    MDC.put("traceId", span.context().traceId());
    MDC.put("spanId", span.context().spanId());
}
```

Never generate a second correlation id. If the request has a trace, the trace id is the correlation id; otherwise the work is outside an observed request and a synthetic id is acceptable only if it is namespaced and not presented as a trace id.

## Context propagation

| Boundary | Default | Fix |
| --- | --- | --- |
| `@Async` and the task scheduler | Lost | `ContextPropagatingTaskDecorator` on the executor or scheduler |
| `CompletableFuture` on the default pool | Lost | An executor with the decorator, or a captured `ContextSnapshot` |
| `new Thread(...)` | Lost | Never; use an executor |
| `RestClient` and `RestTemplate` | Propagated by observation instrumentation | Nothing |
| `@JmsListener` and `@KafkaListener` | Propagated when the observation is created in the listener | Open the observation in the listener, not the caller |
| Server-sent events and streaming | Propagated for the request thread | Long-lived work must create its own observation |

```java
@Bean
ContextPropagatingTaskDecorator contextPropagatingTaskDecorator() {
    return new ContextPropagatingTaskDecorator();
}
```

The decorator copies thread-local context at submit time, including the active observation and the `SecurityContext`. Outside Spring control, capture it explicitly with `ContextSnapshotFactory.builder().clearMissing(true).build().captureAll()`, which strips context the target thread should not inherit.

## Verify the instrumentation

```java
class LedgerMetricsTest {

    @Test
    void publishObservationEmitsATimer() {
        MeterRegistry meters = new SimpleMeterRegistry();
        ObservationRegistry observations = ObservationRegistry.create();
        observations.observationConfig().meterRegistry(meters);

        new LedgerMetrics(observations).publishObservation("EUR").observe(() -> { });

        assertThat(meters.find("acme.ledger.publish").timer()).isNotNull();
        assertThat(meters.find("acme.ledger.publish").tag("currency", "EUR").timer().count())
                .isEqualTo(1);
    }
}
```

Assert on `SimpleMeterRegistry` in unit tests, and assert on the actuator `prometheus` scrape in one integration test so the exported name and label set are verified end to end. A meter name is an interface: a rename in a refactor breaks a dashboard silently unless a test pins it.
