# Container Cost and Reliability

Load this when a container suite is too slow, when it fails intermittently, when it leaves state behind, or when the CI budget must be defended.

## Cost model

Wall clock is dominated by container count, not test count. Ten classes sharing one container pay the start cost once; ten classes each starting a container pay it ten times, and pay it again on every retry.

| Lever | Effect | Cost | Use when |
| --- | --- | --- | --- |
| One container per class | Full isolation | Highest container count | The class mutates shared schema or a global table |
| One container per JVM with a fresh schema per class | Near isolation | One start, N schema creations | The default for repository suites |
| Reused container locally | One start per machine | Stale volume, no re-seeding | Developer iteration only |
| Parallel classes | Lower wall clock | More memory and ports on the runner | The runner has spare CPU and memory |
| Fewer, larger test classes per container | Lower wall clock | Bigger failure blast radius | Classes are logically one capability |
| Pinned image with a warm pull cache | Faster cold start | Cache invalidation on a tag change | Any pipeline with a Docker layer cache |

## Suite configuration

```xml
<plugin>
  <groupId>org.apache.maven.plugins</groupId>
  <artifactId>maven-surefire-plugin</artifactId>
  <configuration>
    <excludedGroups>container,e2e,slow</excludedGroups>
  </configuration>
</plugin>

<plugin>
  <groupId>org.apache.maven.plugins</groupId>
  <artifactId>maven-failsafe-plugin</artifactId>
  <configuration>
    <includes>
      <include>**/*IT.java</include>
    </includes>
    <groups>container</groups>
    <systemPropertyVariables>
      <junit.jupiter.execution.parallel.enabled>true</junit.jupiter.execution.parallel.enabled>
      <junit.jupiter.execution.parallel.mode.classes.default>concurrent</junit.jupiter.execution.parallel.mode.classes.default>
      <junit.jupiter.execution.parallel.config.fixed.parallelism>4</junit.jupiter.execution.parallel.config.fixed.parallelism>
    </systemPropertyVariables>
  </configuration>
  <executions>
    <execution>
      <goals>
        <goal>integration-test</goal>
        <goal>verify</goal>
      </goals>
    </execution>
  </executions>
</plugin>
```

| Command | Purpose |
| --- | --- |
| `mvn test` | Fast suite only; no container starts |
| `mvn verify` | Unit, slice, and container suites |
| `mvn verify -Djunit.jupiter.execution.parallel.config.fixed.parallelism=1` | Serial run to prove a failure is a race, not a defect |
| `mvn verify -Dtestcontainers.reuse.enable=true` | Local reuse of already running containers |

Keep the pipeline split owned by `spring-boot-ci-cd`. This skill supplies the container count, the wall clock, and the tag list as facts.

## Flaky dependency triage

| Symptom | Likely cause | Check | Fix |
| --- | --- | --- | --- |
| Occasional duplicate key failure in parallel | Two classes share one container and one schema | Log the schema or database name per class | Unique schema or database per class, plus `@ResourceLock` |
| Fails on a loaded runner, passes locally | Startup readiness, not correctness | Container log timestamps against the first query | Explicit `waitingFor` on a real readiness signal, and a generous startup timeout |
| Passes alone, fails in the suite | Leftover rows from a previous class | Count rows before and after each class | Deterministic cleanup or per class schema |
| Fails on the second local run | Reused container with old data or old migrations | Inspect the running container directly | Reuse locally only with an idempotent seed, or stop reusing |
| Connection refused after context start | Port bound to a stale mapped port from a previous run | Check for orphaned containers | Let Ryuk reap; never disable it |
| Migration validation error on a reused container | Schema ahead of the migration baseline | Inspect the container schema history | Recreate the container, and never run `clean` on a shared instance |
| Fails only in the last few classes | Runner out of memory or file descriptors | Runner metrics during the run | Lower parallelism, reuse one container, or split the job |
| Green build, different schema than production | Wrong major version or wrong distribution | Compare the image tag with the deployed version | Pin the production major version and distribution |

Triage rule: reproduce a flake in a serial run first. A failure that disappears serially is a race in the test harness, not a bug in the application.

## Cleanup

| Resource | Owner | Rule |
| --- | --- | --- |
| Container and its anonymous volume | Ryuk | Keep it enabled; it reaps on JVM exit and on abnormal termination |
| Reused container | The developer | Document the stop command; it survives the build by design |
| Schema created per class | The test base | Drop on close, or accept the accumulation inside a disposable container |
| Rows written by a non transactional test | The test | Explicit cleanup in a `@AfterEach`, ordered by foreign key |
| Broker topic and consumer group | The test | Unique group per test class so offsets never carry over |
| Port bindings | The runner | Never hard code a port; always use `getMappedPort` |

```java
package com.acme.billing.support;

import org.junit.jupiter.api.AfterEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

abstract class AbstractSchemaIT {

    @Autowired
    private JdbcTemplate jdbc;

    @AfterEach
    void cleanRows() {
        // Deleting child rows before parents keeps this correct without disabling constraints.
        jdbc.update("DELETE FROM order_line");
        jdbc.update("DELETE FROM orders");
    }

    void assertRowCount(String table, long expected) {
        assertThat(jdbc.queryForObject("SELECT count(*) FROM " + table, Long.class)).isEqualTo(expected);
    }
}
```

Never clean with a `TRUNCATE` inside an `@Sql` script when the test is transactional: `TRUNCATE` in PostgreSQL takes an independent lock and commits outside the test transaction, so it destroys the rollback guarantee the test depends on.

## Image and version discipline

| Rule | Reason |
| --- | --- |
| Pin the major version to production | SQL, locking, JSON, and index behavior differ across majors |
| Prefer a moving patch tag over a full pin | Security updates flow automatically; record the resolved digest in the pipeline log |
| Record the resolved image digest | Makes a flaky build reproducible after the fact |
| Never use `latest` or a bare `postgres` | A server upgrade inside a single build is an unreviewable change |
| Keep the distribution constant across environments | Alpine versus Debian changes libc dependent tooling and extension availability |
| Bump the tag in its own change | A tag bump mixed with a feature change hides which one broke the suite |

## Reporting a container suite

Report these as pipeline facts:

- container count, image tags, and resolved digests;
- wall clock for the container suite separately from the unit suite;
- parallelism factor and the runner size it was tuned for;
- reuse enabled locally and disabled in CI;
- every class that relies on transactional rollback, and every one that does not;
- any flaky test with its owner and its removal condition.

A suite is not "done" because it passed once with a warm cache. It is done when a cold, serial, and parallel run all pass on a clean machine.
