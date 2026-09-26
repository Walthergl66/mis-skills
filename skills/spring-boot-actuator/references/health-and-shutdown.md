# Health, Probes, and Shutdown

Load this when configuring health groups, writing a custom indicator, getting liveness and readiness semantics right, or draining in-flight work when the process is asked to stop.

## The three questions

| Group | Question | May depend on a downstream service | If it fails |
| --- | --- | --- | --- |
| `liveness` | Is this JVM wedged beyond recovery? | No | Kill and restart the container |
| `readiness` | Should this instance receive traffic right now? | Yes, but only the ones the request path needs | Remove from the load balancer, keep running |
| `startup` | Has a slow-starting process finished booting? | No | Defer the liveness failure until it passes |

`liveness` is the one people get wrong. A liveness check that includes the database converts a database slowdown into a fleet-wide restart storm, and the restarts add load to an already struggling database.

## Group configuration

```yaml
management:
  endpoint:
    health:
      probes:
        enabled: true
        add-additional-paths: true
      group:
        liveness:
          include: livenessState, diskSpace
        readiness:
          include: readinessState, db, redis, ledgerJournal
        startup:
          include: livenessState, readinessState
```

| Setting | Effect | Note |
| --- | --- | --- |
| `probes.enabled` | Publishes `livenessState` and `readinessState` and enables the two groups | Required before the groups exist at all |
| `probes.add-additional-paths` | Also serves `/health/liveness` on the main port | Useful when the platform cannot reach the management port |
| `group.<name>.include` | The indicators in that group | An empty include means the built-in group membership |
| `group.<name>.additional-path` | A second URL serving the group | For platforms that need a distinct path per probe |
| `group.<name>.show-details` | Per-group detail visibility | A safer place to allow details than the global setting |

`diskSpace` is an acceptable liveness addition: a genuinely full disk cannot be recovered by a request and indicates a real process problem. A database round trip is not.

## Indicator semantics

| Status | Overall effect | Use for |
| --- | --- | --- |
| `UP` | Healthy | Normal operation |
| `DOWN` | The endpoint returns `503` | The process cannot serve and a restart helps |
| `OUT_OF_SERVICE` | The endpoint returns `503` | Deliberate removal, such as draining or a maintenance window |
| `UNKNOWN` | Treated as `UP` by default ordering | A check that could not run and is not evidence of failure |
| A custom status such as `DEGRADED` | Contributes only if the group includes it | A dependency is slow but requests still succeed |

A custom status is the correct choice for a degradation. A `DEGRADED` status on an indicator that the readiness group does not include changes nothing; the same condition reported as `DOWN` on an indicator the group does include removes the instance from rotation and may restart it.

`management.endpoint.health.status.order` sets which status wins: the default is `down, out-of-service, up, unknown`, so a single `DOWN` anywhere in a group makes the whole group `DOWN`.

## Writing an indicator

```java
package com.acme.billing.health;

import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.boot.actuate.health.AbstractHealthIndicator;
import org.springframework.boot.actuate.health.Health;
import org.springframework.stereotype.Component;

@Component("ledgerJournal")
public class JournalHealthIndicator extends AbstractHealthIndicator {

    private static final Duration TIMEOUT = Duration.ofSeconds(2);
    private static final long LAG_WARN_MILLIS = Duration.ofMinutes(2).toMillis();

    private final JournalClient client;

    public JournalHealthIndicator(JournalClient client) {
        super("Ledger journal health check failed");
        this.client = client;
    }

    @Override
    protected void doHealthCheck(Health.Builder builder) {
        try {
            long lagMillis = client.lagWithin(TIMEOUT);
            if (lagMillis > LAG_WARN_MILLIS) {
                builder.status("DEGRADED").withDetail("lagSeconds", lagMillis / 1000);
            } else {
                builder.up().withDetail("lagSeconds", lagMillis / 1000);
            }
        } catch (Exception ex) {
            // Report the class name only: a driver message can contain a connection string.
            builder.status("DEGRADED").withDetail("reason", ex.getClass().getSimpleName());
        }
    }

    @Override
    protected Duration getTimeout() {
        return TIMEOUT;
    }
}
```

For an indicator whose dependency does not itself take a timeout, bound it explicitly:

```java
package com.acme.billing.health;

import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.stereotype.Component;

@Component("replicationLag")
public class ReplicationLagHealthIndicator implements HealthIndicator {

    private static final Duration TIMEOUT = Duration.ofSeconds(2);

    private final ReplicationProbe probe;

    public ReplicationLagHealthIndicator(ReplicationProbe probe) {
        this.probe = probe;
    }

    @Override
    public Health health() {
        try {
            long lagSeconds = probe.lagSeconds()
                    .get(TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
            return lagSeconds > 30
                    ? Health.status("DEGRADED").withDetail("lagSeconds", lagSeconds).build()
                    : Health.up().withDetail("lagSeconds", lagSeconds).build();
        } catch (TimeoutException ex) {
            return Health.status("DEGRADED").withDetail("reason", "timeout").build();
        } catch (ExecutionException ex) {
            return Health.status("DEGRADED")
                    .withDetail("reason", ex.getCause().getClass().getSimpleName())
                    .build();
        }
    }
}
```

| Rule | Reason |
| --- | --- |
| Extend `AbstractHealthIndicator` where possible | It adds a timeout and consistent error handling |
| No database call per probe when a gauge already tracks it | The probe is polled every few seconds by every replica |
| Report the exception class, never the message | Messages leak connection details and occasionally credentials |
| No `@Autowired` constructor cycles | An indicator that pulls in the service under test makes the check circular |
| Cache a warm result | A probe that computes on demand becomes a load problem under polling |

## Probe configuration in an orchestrator

```yaml
livenessProbe:
  httpGet:
    path: /actuator/health/liveness
    port: 9090
  initialDelaySeconds: 20
  periodSeconds: 10
  timeoutSeconds: 2
  failureThreshold: 3
readinessProbe:
  httpGet:
    path: /actuator/health/readiness
    port: 9090
  initialDelaySeconds: 10
  periodSeconds: 5
  timeoutSeconds: 2
  failureThreshold: 2
startupProbe:
  httpGet:
    path: /actuator/health/startup
    port: 9090
  periodSeconds: 5
  failureThreshold: 60
terminationGracePeriodSeconds: 45
```

| Setting | Rule |
| --- | --- |
| `timeoutSeconds` | Larger than the indicator timeout, so a slow answer reads as a failure rather than a truncated request |
| `failureThreshold` on liveness | High enough to avoid a restart on one hiccup; restart is a disruptive action |
| `startupProbe.failureThreshold` | Times period must exceed the worst observed cold start, with margin |
| `terminationGracePeriodSeconds` | Greater than the measured drain time plus the shutdown phase timeout |
| Probe paths on the management port | Keep them out of the application filter chain and the noisy access log |

## Graceful shutdown

```yaml
server:
  shutdown: graceful
spring:
  lifecycle:
    timeout-per-shutdown-phase: 30s
```

Both are required. `server.shutdown=graceful` alone closes the listener and waits forever, and the platform sends `SIGKILL` at the grace deadline. `timeout-per-shutdown-phase` bounds each phase so the process exits on its own terms.

```java
package com.acme.billing.support;

import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.ContextClosedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

@Configuration(proxyBeanMethods = false)
public class LifecycleConfig {

    private static final Logger log = LoggerFactory.getLogger(LifecycleConfig.class);

    @Bean
    ThreadPoolTaskScheduler taskScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(4);
        scheduler.setWaitForTasksToCompleteOnShutdown(true);
        scheduler.setAwaitTerminationSeconds(20);
        scheduler.setThreadNamePrefix("ledger-sched-");
        return scheduler;
    }

    @EventListener(ContextClosedEvent.class)
    void onContextClosed(ContextClosedEvent event) {
        log.info("shutdown requested, readiness will report not-ready and in-flight work will drain");
    }
}
```

| Component | Shutdown behaviour to configure | Property |
| --- | --- | --- |
| HTTP server | Stop accepting, finish in-flight | `server.shutdown=graceful` |
| `ThreadPoolTaskScheduler` | Wait for the running task | `setWaitForTasksToCompleteOnShutdown(true)` plus `setAwaitTerminationSeconds` |
| `ThreadPoolTaskExecutor` | Same | Same setters on the executor |
| DataSource pool | Close after the requests finish | Closed by the context lifecycle after the web server phase |
| Logback async appender | Flush the queue | `stop()` on the context close flushes attached appenders |

Readiness during drain needs an explicit signal, because `graceful` shutdown closes the endpoint before the drain completes. Either a pre-stop hook that marks the instance unready and sleeps, or a small custom indicator that reads a flag set by a `ContextClosedEvent` listener.

```java
package com.acme.billing.health;

import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.context.event.ContextClosedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component("draining")
public class DrainingHealthIndicator implements HealthIndicator {

    private final AtomicBoolean draining = new AtomicBoolean(false);

    @EventListener(ContextClosedEvent.class)
    void onShutdown() {
        draining.set(true);
    }

    @Override
    public Health health() {
        return draining.get()
                ? Health.outOfService().withDetail("reason", "draining").build()
                : Health.up().build();
    }
}
```

Include `draining` in the readiness group and not in liveness. Its purpose is to remove the instance from the load balancer, not to trigger a restart.

## Verify the semantics

```bash
# Liveness stays UP while a dependency is down.
docker run --rm -p 9090:9090 ledger:1.4.2 &
docker stop db
curl -s -o /dev/null -w 'liveness=%{http_code}\n' http://localhost:9090/actuator/health/liveness
curl -s -o /dev/null -w 'readiness=%{http_code}\n' http://localhost:9090/actuator/health/readiness
docker start db

# Shutdown drains and exits before the deadline.
time docker stop --time 45 sigterm-probe
```

```java
package com.acme.billing.health;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.actuate.health.HealthEndpoint;
import org.springframework.boot.actuate.health.Status;

class HealthGroupTest {

    @Test
    void livenessStaysUpWhenTheDatabaseIsDown(TestHealthContext context) {
        Status liveness = context.healthGroup("liveness").getStatus();
        Status readiness = context.healthGroup("readiness").getStatus();
        assertThat(liveness).isEqualTo(Status.UP);
        assertThat(readiness).isEqualTo(Status.DOWN);
    }
}
```

The test that matters is the one asserting liveness stays up while a dependency is down. It is the difference between a degraded service and a fleet-wide restart storm.
