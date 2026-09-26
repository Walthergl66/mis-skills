---
name: spring-boot-testcontainers
description: 'Use when a Spring Boot 3.5 test must run against a real PostgreSQL, MySQL, MariaDB, Redis, Kafka, or LocalStack dependency, covering declaration of @Testcontainers with @Container, wiring @ServiceConnection, falling back to @DynamicPropertySource, writing a reusable singleton container, pinning an image tag and distribution, seeding and running migrations on start, teardown, parallel execution with JUnit resource locks, and controlling container cost and flakiness in CI. Triggers include postgres:16-alpine, withReuse, withInitScript, PostgreSQLContainer, GenericContainer, org.testcontainers.kafka.KafkaContainer, DynamicPropertyRegistry, TestcontainersLifecycleApplicationContextInitializer, and TESTCONTAINERS_REUSE_ENABLE. Do not use for pure JUnit mechanics, mock design, or endpoint and slice test selection. When other skills also apply, reconcile ownership before mutation.'
license: MIT
metadata:
  author: Walthergl66
  version: '1.0.0'
---

# Testcontainers for Spring Boot Tests

Own the real dependencies a test needs and their lifecycle. A containerized test is an infrastructure test: it is slower, it is order and resource sensitive, and it is the only test that can prove SQL, transactions, and protocol semantics.

## When to use

- A test needs a real database, cache, broker, or cloud emulator instead of a double.
- Wiring `@ServiceConnection` or `@DynamicPropertySource` into a Spring test.
- Choosing an image tag, a distribution, and a version that matches production, or deciding whether to reuse locally.
- Seeding data, running migrations on container start, isolating parallel classes, or diagnosing a slow or flaky dependency test.

## When not to use

- JUnit structure, parameterization, extensions, and tags belong to `spring-boot-junit`.
- Mock, spy, and fake design belong to `spring-boot-mockito`.
- Which layer a test belongs to belongs to `spring-boot-integration-testing`.
- Migration authoring and schema history rules belong to `spring-boot-flyway`.
- Pipeline runtime, caching, and stage gating belong to `spring-boot-ci-cd`.

## Ownership and sibling boundaries

This skill owns container provisioning, connection injection, image pinning, seeding, isolation, and teardown.

- `spring-boot-integration-testing` owns the decision to run a real dependency test. Hand it the layer question, keep the infrastructure.
- `spring-boot-junit` owns the surrounding JUnit mechanics. Hand it any non-container lifecycle or assertion design.
- `spring-boot-flyway` owns the migration scripts. Hand it the schema and history contract; this skill owns only when migrations execute.
- `spring-boot-ci-cd` owns pipeline budget. Hand it the per-run container count and image pull cost.

## Hard rules

1. Pin the image tag, the distribution, and the production major version. Never use `latest`, `postgres`, or an unpinned Kafka tag; an unpinned tag turns a green build red without a code change, and behavior proven on 15 is not evidence about 16.
2. Prefer `@ServiceConnection` over `@DynamicPropertySource`: the framework resolves the URL, driver, and credentials and fails loudly. Use dynamic properties only when no `ConnectionDetails` contributor exists, and only with an explicit registry add per property.
3. A container is started once per class at most. Never one per test method, and never one per test.
4. Reuse is a local convenience: a reused container keeps its volume and skips init scripts, so use per-class containers in CI.
5. `withInitScript` runs only on an empty data directory. It seeds a fresh container; it is neither a migration nor a cleanup mechanism.
6. Migrations run on the real engine through the production tool with `clean-disabled` on; hand the script content to `spring-boot-flyway`.
7. Isolate parallel classes with `@ResourceLock` plus `junit.jupiter.execution.parallel.resources`; a shared resource without a lock produces duplicate key failures.
8. Keep Ryuk enabled, tag every container test `container` to keep it out of the per-commit suite, and fix the image instead of disabling startup checks.

## Image tag and distribution

| Decision | Rule | Reason |
| --- | --- | --- |
| Tag | `postgres:16.4-alpine3.20` for a pinned need, `postgres:16-alpine` for a moving patch line | A moving patch line still tracks security updates; a full pin needs a deliberate bump job |
| Distribution | `alpine` for a fast, small image; the default Debian-based tag for extension availability | Same server version and same SQL semantics; the differences are libc dependent tooling, collation behavior in edge cases, and which extension builds exist |
| Extension heavy images | The default distribution, for example `postgis/postgis:16-3.4` | Extensions such as PostGIS publish glibc builds, so an alpine image cannot load them |
| Kafka | `org.testcontainers.kafka.KafkaContainer` with a pinned `confluentinc/cp-kafka` tag for Testcontainers 1.20 or newer | KRaft mode; the ZooKeeper based container is the legacy choice |

```java
package com.acme.billing.support;

import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Testcontainers(disabledWithoutDocker = true)
public abstract class PostgresContainerSupport {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>(DockerImageName.parse("postgres:16-alpine"))
                    .withDatabaseName("billing")
                    .withUsername("billing")
                    .withPassword("billing")
                    .withInitScript("db/seed-reference-data.sql");
}
```

`disabledWithoutDocker` makes the class skip instead of erroring on a machine without a daemon, so a developer without Docker still runs the unit suite.

## The three wiring mechanisms

| Mechanism | Use | Cost |
| --- | --- | --- |
| `@ServiceConnection` | PostgreSQL, MySQL, MariaDB, MongoDB, Kafka, and any `ConnectionDetails` contributor | None; the recommended path |
| `@DynamicPropertySource` | Redis, or a dependency with no contributor | Every property must be registered by hand |

```java
package com.acme.billing.support;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Testcontainers(disabledWithoutDocker = true)
abstract class RedisContainerSupport {

    @Container
    static final GenericContainer<?> REDIS =
            new GenericContainer<>(DockerImageName.parse("redis:7.4-alpine")).withExposedPorts(6379);

    @DynamicPropertySource
    static void redisProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.data.redis.host", REDIS::getHost);
        registry.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
    }
}
```

A Kafka dependency uses `org.testcontainers.kafka.KafkaContainer` in KRaft mode with `@ServiceConnection`; the full declaration is in [container-patterns.md](container-patterns.md).

## Isolation, parallelism, and cleanup

| Concern | Mechanism | Trap |
| --- | --- | --- |
| Parallel classes | `@ResourceLock("postgresql")` and `junit.jupiter.execution.parallel.resources.postgresql=postgresql` | Parallel methods inside one class still share the container and the schema |
| Transactional rollback | `@Transactional` on the test, owned by the integration testing skill | `@Async` work and second connections are not rolled back |
| Per class isolation | A new container per class, or a unique database or schema per class | A shared container with a fixed schema leaks rows between classes |
| Teardown | Ryuk reaper, or an explicit `close()` on programmatically started containers | Disabling Ryuk leaves volumes and ports occupied |
| Startup time | `waitingFor` on a real readiness signal, not a bare port | A port can listen before the service can serve |

## Cost model

| Scenario | Containers per run | Recommendation |
| --- | --- | --- |
| Unit and slice tests | 0 | Per commit |
| Repository classes sharing one container with a fresh schema each | 1 | The default for repository suites |
| Local iteration | 1 reused | `withReuse(true)` locally only |

Report container time as a pipeline fact, not a test failure. If the suite grew past its budget, the correct move is fewer, larger classes per container with a fresh schema each, not a higher parallelism factor than the CI runner can hold.

## Reference routing

| Task | Load |
| --- | --- |
| Declare a container, wire `@ServiceConnection` or dynamic properties, build the singleton base, seed, or start programmatically | [container-patterns.md](references/container-patterns.md) |
| Tag, parallelize, budget CI time, triage a flaky dependency, or tear down cleanly | [cost-and-reliability.md](references/cost-and-reliability.md) |

## Expected response

- **Dependency and image:** each dependency, the exact pinned tag and distribution, and the production version it must match.
- **Injection mechanism:** `@ServiceConnection`, `@DynamicPropertySource`, or `jdbc:tc:`, with the reason a contributor is or is not available.
- **Lifecycle:** container scope, reuse decision and its local versus CI caveat, seed script behavior, and migration execution.
- **Isolation:** schema or database per class, rollback strategy, resource locks, and the parallel configuration.
- **Cost and residual risk:** containers per run, expected wall clock, the change made to stay in budget, and what only a production-like environment can prove.
