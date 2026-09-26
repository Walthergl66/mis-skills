# Signals and SLOs

Load this when setting a metric cardinality budget, choosing which signals justify an SLO, sizing the cost of trace sampling, or designing dashboards, queries, and burn-rate alerts.

## Start from a question

Instrumentation exists to answer a decision. Write the question first, then pick the signal.

| Decision the operator must make | Signal | Instrument |
| --- | --- | --- |
| Do we page now | Error ratio over a window | `http.server.requests` with `outcome` |
| Do we open a ticket | Saturation trend | `hikaricp.connections.usage`, `jvm.memory.usage`, `process.cpu.usage` |
| Where is the latency | Latency percentiles per route and per dependency | `http.server.requests`, `jdbc.queries`, client observations |
| Is a customer affected | Business outcome rate, not an infrastructure proxy | A domain counter such as `acme.payment.settle` with `outcome` |
| Is the release bad | Comparison against the previous deployment window | `process.start.time` markers plus error ratio |

An uptime signal derived from inside the process is not an availability SLO. Measure success at the boundary the consumer experiences, or accept that the SLO measures your own health checks rather than your service.

## The four signal types

| Type | Counts | Verdict | Use for |
| --- | --- | --- | --- |
| Counter | Monotonic events | Rate and ratio | Errors, requests, retries, business outcomes |
| Gauge | A level right now | Current and maximum | Pool usage, queue depth, cache size, thread count |
| Timer | Events with a duration | Distribution | Latency, and anything where a percentile matters |
| DistributionSummary | Events with a non-duration value | Distribution | Payload size, batch size, result counts |

## Cardinality budget

Cardinality is the product of the tag value counts. A meter with four tags of 5, 20, 3, and 2 values produces 600 series per meter. Ten such meters is 6000 series, per instance, per scrape interval.

| Dimension | Allowed | Forbidden |
| --- | --- | --- |
| Route | Route template, `/orders/{id}` | Full path, query string, raw path |
| Method | `GET`, `POST`, `PUT`, `DELETE`, `PATCH` | Custom verbs from a request header |
| Status | Status class, `2XX`, `4XX`, `5XX` | Full status codes where only the class is queried |
| Outcome | `SUCCESS`, `ERROR`, `UNKNOWN` | The exception message |
| Business dimension | Enum or a bounded code list | User id, tenant id, order id, account id |
| Time | Buckets, or nothing | Timestamp, date, age in seconds |
| Result size | Bucketized summary | Exact value as a tag |

```java
package com.acme.billing.config;

import io.micrometer.core.instrument.config.MeterFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class CardinalityBudgetConfig {

    private static final int MAX_ROUTES = 200;
    private static final int MAX_TENANTS = 50;

    @Bean
    MeterFilter routeTagBudget() {
        return MeterFilter.maximumAllowableTags("http.server.requests", "uri", MAX_ROUTES, MeterFilter.deny());
    }

    @Bean
    MeterFilter tenantTagBudget() {
        return MeterFilter.maximumAllowableTags("acme.billing.invoice.total", "tenant", MAX_TENANTS, MeterFilter.deny());
    }
}
```

| Enforcement | Mechanism | When |
| --- | --- | --- |
| Hard deny | `MeterFilter.deny()` | Above budget, the extra value must not create a series |
| Collapse | `MeterFilter.aggregateTags` or a custom `MeterFilter` | Several values belong to one operational question |
| Replace | `MeterFilter.replaceTagValues` | Route to a coarse class such as `/orders/**` |
| Budget by monitor | Backend series-limit alert | A code-level filter you forgot still gets caught |

Track the per-meter series count in a dashboard. A sudden jump in series is a defect even when every value is technically bounded.

## From signal to SLO

```text
SLI   = good events / valid events
SLI   = count of requests with outcome != ERROR
valid = count of all requests to the public API, excluding probe paths

SLO   = SLI >= 99.9 percent measured over a rolling 28-day window
       = error budget of 0.1 percent of requests, approximately 43 minutes at constant traffic

Alert = burn rate over 1 hour and 5 minutes
       page   when 1h burn > 14.4x   (2 percent of budget in 1 hour)
       ticket when 6h burn > 6x      (5 percent of budget in 6 hours)
       ticket when 3d burn > 1x      (10 percent of budget in 3 days)
```

| Objective | Error budget | Fast page | Slow page | Release signal |
| --- | --- | --- | --- | --- |
| 99 percent | 1 percent | 1h burn above 10x | 6h burn above 3x | Budget exhausted, feature work pauses |
| 99.9 percent | 0.1 percent | 1h burn above 14.4x | 6h burn above 6x | Budget exhausted, releases freeze |
| 99.99 percent | 0.01 percent | 1h burn above 28.8x | 6h burn above 12x | Budget exhausted, all changes reviewed |

Use two windows per alert. A single long window is slow to page; a single short window pages on every spike. The short window fires fast, the long window confirms it is not transient, and both are required before a page.

## Sampling cost

| Factor | Effect on cost | How to control it |
| --- | --- | --- |
| Probability | Linear | Lower the probability for high-fanout services |
| Spans per trace | Linear per span | Do not create an observation per loop iteration |
| Log-based correlation | Free | Use the trace id in logs instead of forcing full traces |
| Retention window | Linear | Keep a short window in the hot store, longer in cold storage |
| Attribute size | Non-linear when large | Never put a request body in a span attribute |

| Service profile | Probability | Rationale |
| --- | --- | --- |
| Low traffic, high value per request | `1.0` | Trace volume is small and every trace matters |
| Medium traffic business service | `0.10` to `0.25` | Enough to explain a sampled incident |
| High fanout, many internal calls | `0.01` or lower | Span count, not trace count, drives cost |
| Load test or chaos run | `0.0` or `1.0` | Mixed probabilities make the results unreadable |

Force-trace on errors when a tail-based sampler is available. Head-based probability sampling cannot know the outcome at entry, so an errored request is only kept if it happened to be sampled.

## Query recipes

Prometheus-style, using the Actuator `prometheus` endpoint.

```promql
# Error ratio per route over 5 minutes.
sum by (uri) (rate(http_server_requests_seconds_count{outcome="SERVER_ERROR"}[5m]))
/
sum by (uri) (rate(http_server_requests_seconds_count[5m]))

# p95 latency per route.
histogram_quantile(0.95,
  sum by (le, uri) (rate(http_server_requests_seconds_bucket[5m])))

# Connection pool saturation.
max by (application) (hikaricp_connections_usage)

# Threads that never die.
jvm_threads_live{application="ledger"}

# Deployment marker: when did this instance start.
max by (application, version) (process_start_time_seconds)

# SLO burn rate over a one hour window.
(
  sum(rate(http_server_requests_seconds_count{outcome="SERVER_ERROR"}[1h]))
  / sum(rate(http_server_requests_seconds_count[1h]))
) / 0.001
```

## Dashboard shape

| Row | Content | Decision it supports |
| --- | --- | --- |
| 1 | SLO state, error budget remaining, burn rate | Page or do not page |
| 2 | Request rate, error ratio, p50, p95, p99 by route | Where is the damage |
| 3 | `hikaricp_connections_usage`, `jdbc.connections.acquire`, `jvm.threads.live` | Saturation or a resource limit |
| 4 | JVM memory used after GC, GC pause, process CPU | JVM pressure versus external pressure |
| 5 | Dependency client latency and errors by target | Is the fault ours or theirs |
| 6 | Deployment markers and configuration revision | Did it start now |
| 7 | Restarts, OOM kills, readiness failures | Is the runtime itself failing |

Drill down in that order: symptom, then the dimension that partitions it, then the dependency or resource, then a trace or a log line. A grid of unrelated charts is not an operational model.

## Alert quality

| Rule | Reason |
| --- | --- |
| Alert on user impact, not on a single component | A CPU spike with no user-visible effect is a ticket |
| Include the dashboard link, the runbook, and the owner | An alert without an action is a notification |
| Require both windows for a page | Removes spike noise without slowing detection |
| Inhibit dependent alerts | One database outage must not page five services independently |
| Test the alert path | An unexercised alert path is an assumption |
| Review alerts after every incident | Delete any that fired without producing a decision |

| Anti-pattern | Why it fails |
| --- | --- |
| Alert on a single health check failing | Health checks are cheap and often wrong under load |
| Alert on pod restart count | Restarts are a symptom; alert on the impact the restart caused |
| Alert on absolute CPU percentage | Meaningless without a request rate and an objective attached |
| Threshold set from a histogram of normal days | Alerts then sit inside the noise band |
