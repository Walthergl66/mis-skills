---
name: spring-boot-actuator
description: 'Use when exposing, securing, or debugging Spring Boot 3.5 Actuator endpoints. Triggers include management.endpoints.web.exposure.include, management.server.port, management.endpoint.health.probes.enabled, livenessState, readinessState, HealthIndicator, AbstractHealthIndicator, management.endpoint.health.group, show-details, management.info.env, info contributors, conditions endpoint, /actuator/metrics, server.shutdown=graceful, spring.lifecycle.timeout-per-shutdown-phase, and probe configuration. Do not use for metric or trace design, nor for container build choices and pipeline rollout strategy. When other skills also apply, reconcile ownership before mutation.'
license: MIT
metadata:
  author: Walthergl66
  version: '1.0.0'
---

# Spring Boot Actuator, Probes, and Shutdown

Own the management surface: which endpoints exist, who can reach them, what health means to an orchestrator, and what happens between the first `SIGTERM` and process exit. Actuator is the only part of the service an operator talks to directly, so its exposure is a security decision and its semantics are a correctness decision.

## When to use

- Choosing which endpoints to expose and on which port.
- Health checks return `DOWN` for the wrong reason, or a pod crash-loops on a downstream outage.
- Writing a custom `HealthIndicator` that cannot hang.
- A probe passes but the service cannot serve traffic, or fails while traffic is fine.
- Deciding what `/actuator/info` and `/actuator/env` may reveal.
- Requests are cut off during a rollout instead of finishing.
- Diagnosing an auto-configuration or a bean that is not active.

## When not to use

- Meter, observation, and SLO design belongs to `spring-boot-observability`.
- Probe wiring in a manifest and container liveness belong to `spring-boot-docker`.
- Rollout, readiness gating, and rollback belong to `spring-boot-ci-cd`.
- The `SecurityFilterChain` that protects management endpoints belongs to `spring-boot-security`.
- Log format for the management endpoint belongs to `spring-boot-logging`.

## Ownership and sibling boundaries

This skill owns endpoint exposure, health semantics, and the shutdown sequence. `spring-boot-observability` owns which signals are collected and gets the exposure list. `spring-boot-docker` owns the image and process and gets the requirement that the health path is cheap and `SIGTERM` reaches the JVM. `spring-boot-ci-cd` owns the deployment gate and gets the readiness contract. `spring-boot-security` owns authentication and gets the management port and matcher path to protect. `spring-boot-core` owns configuration binding and gets the management property surface.

## Hard rules

1. **Never use `management.endpoints.web.exposure.include: "*"` in production.** It is a defect, not a shortcut. Name the endpoints explicitly.
2. **`env` and `configprops` are production data leaks.** They print bound configuration including values masked only by key name matching. Expose them on the management port behind auth, in a non-production profile, or not at all.
3. **Liveness must not depend on a downstream service.** A liveness check that fails on a database outage makes every replica restart simultaneously, turning a degradation into an outage.
4. **Readiness may depend on downstream services**, and a readiness check must be cheap and bounded.
5. **`Status.UNKNOWN` is not `Status.DOWN`.** Reserve `DOWN` for conditions where a restart genuinely helps.
6. **Every custom health indicator must be bounded.** A health endpoint that can hang is a worse outage than a wrong answer.
7. **Health details are gated by `show-details`,** which is `never` by default. Verify it in every environment.
8. **Graceful shutdown is two properties working together.** `server.shutdown=graceful` stops new requests; `spring.lifecycle.timeout-per-shutdown-phase` bounds the wait. Setting only the first means an unbounded drain.

## Exposure, least privilege first

| Endpoint | Safe to expose unauthenticated | Notes |
| --- | --- | --- |
| `health` | Yes, and required for probes | Hide details in production |
| `info` | Yes, after restricting the contributors | Add only non-sensitive build metadata |
| `prometheus` | Only on a scrape-authenticated network | Full metric surface including configuration tags |
| `metrics` | No | Meter names and values can leak business and infrastructure detail |
| `loggers` | No | Lets a caller change levels at runtime, including enabling DEBUG |
| `env` | No | Configuration values and origin chain |
| `configprops` | No | Every bound object, including masked secrets and their shape |
| `heapdump` | Never | A memory dump is a full data export |
| `threaddump` | No | Stack traces reveal internals and can be a denial-of-service vector |
| `conditions` | No | The full auto-configuration report, including what is missing |
| `shutdown` | Never | An unauthenticated remote shutdown |
| `scheduledtasks`, `flyway`, `liquibase`, `sessions`, `caches`, `startup` | No, or internal only | Operational detail with no external use |

```yaml
management:
  server:
    port: 9090
  endpoints:
    web:
      exposure:
        include: health,info,prometheus
  endpoint:
    health:
      probes:
        enabled: true
      show-details: never
  info:
    env:
      enabled: true
      keys: [git.commit.id, app.release]
```

`management.info.env.keys` restricts which property keys the `info` endpoint reports. Without it, `info` reflects every property, including anything a starter added.

## Probes

| Group | Question | Allowed dependencies | Failure effect |
| --- | --- | --- | --- |
| `liveness` | Is this process wedged and in need of a restart? | Nothing external | The process is killed and restarted |
| `readiness` | Should this instance receive traffic now? | Database, cache, broker, warmup state | Removed from the load balancer |
| `startup` | Has a slow-starting process finished booting? | Nothing external | Liveness is deferred until it passes |

```yaml
management:
  endpoint:
    health:
      group:
        liveness:
          include: livenessState
        readiness:
          include: readinessState, db, ledgerJournal
        startup:
          include: livenessState, readinessState
```

| Mistake | Consequence | Fix |
| --- | --- | --- |
| Liveness includes `db` | A database blip restarts the whole fleet | Liveness includes `livenessState` only |
| Readiness includes every indicator | One optional dependency removes every replica from rotation | List only what the request path needs |
| No startup group for a slow starter | Liveness fails during boot and the container is killed repeatedly | Declare `startup` and point liveness at it during boot |
| Probes hitting a secured path | The orchestrator gets 401 and the pod never becomes ready | Permit the probe paths explicitly, in an earlier-ordered chain |

## Custom health indicators

```java
@Component("ledgerJournal")
public class JournalHealthIndicator implements HealthIndicator {

    private static final Duration TIMEOUT = Duration.ofSeconds(2);

    private final JournalClient client;

    public JournalHealthIndicator(JournalClient client) {
        this.client = client;
    }

    @Override
    public Health health() {
        try {
            // The dependency call is itself bounded; this indicator never blocks.
            long lagMillis = client.lagWithin(TIMEOUT);
            if (lagMillis > Duration.ofMinutes(2).toMillis()) {
                return Health.status("DEGRADED").withDetail("lagSeconds", lagMillis / 1000).build();
            }
            return Health.up().withDetail("lagSeconds", lagMillis / 1000).build();
        } catch (JournalUnavailableException ex) {
            return Health.status("DEGRADED").withDetail("reason", ex.getClass().getSimpleName()).build();
        }
    }
}
```

| Rule | Reason |
| --- | --- |
| Bound the dependency call with an explicit timeout | `AbstractHealthIndicator` has no timeout of its own, so a hanging call hangs the health endpoint |
| Return a named status, not `DOWN`, for a degradable condition | A custom status is visible in the body and does not fail groups that do not include it |
| Report the exception class, never the message | A JDBC message can contain a connection string with a password |
| No context creation or query per call | The health endpoint is polled constantly |

Status order decides the aggregate: `DOWN`, then `OUT_OF_SERVICE`, then `UP`, then `UNKNOWN`, unless `management.endpoint.health.status.order` changes it. A `DOWN` anywhere in a group makes the group `DOWN` and the endpoint returns `503`. A custom status such as `DEGRADED` keeps its own HTTP mapping, which is `200` unless you add one.

## Graceful shutdown

```yaml
server:
  shutdown: graceful
spring:
  lifecycle:
    timeout-per-shutdown-phase: 30s
```

The ordered drain is: stop accepting requests, let in-flight requests finish, stop schedulers and consumers, flush bounded telemetry, close pools and clients, exit. The orchestrator termination grace period must exceed the measured drain time, or the platform sends `SIGKILL` mid-drain. Readiness flipping first is a platform concern handled by a pre-stop hook, because the JVM starts draining on `SIGTERM`, not on a context event.

## Reference routing

| Task | Load |
| --- | --- |
| Choose an exposure list, separate the management port, secure it, or decide what must never be exposed | [exposure-and-security.md](references/exposure-and-security.md) |
| Configure health groups, write indicators, get probe semantics right, or drain in-flight work on shutdown | [health-and-shutdown.md](references/health-and-shutdown.md) |

## Expected response

- **Exposure decision:** an explicit endpoint list with a reason for each, and the port and auth model that protects it.
- **Probe contract:** the liveness, readiness, and startup groups with their exact indicator lists, and the failure effect of each.
- **Health indicator code:** a bounded, named-status indicator that never leaks an exception message.
- **Shutdown wiring:** both properties set, the measured drain time, and the required termination grace period above it.
- **Risk findings:** anything that would leak configuration, allow a remote shutdown, or crash-loop the fleet on a downstream outage.
- **Verification:** curl or probe commands per endpoint, a liveness-fails-while-readiness-succeeds test, and a shutdown drain test.
