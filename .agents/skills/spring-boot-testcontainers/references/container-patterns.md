# Container Patterns

Load this when declaring a container, injecting connection details into a Spring test, building a shared container base, seeding data, or controlling startup and teardown.

## Dependency baseline

| Dependency | Coordinate | Note |
| --- | --- | --- |
| Spring Boot testcontainers | `org.springframework.boot:spring-boot-testcontainers` | Required for `@ServiceConnection` |
| Testcontainers JUnit | `org.testcontainers:junit-jupiter:1.20+` | Provides `@Testcontainers` and `@Container` |
| Testcontainers PostgreSQL | `org.testcontainers:postgresql:1.20+` | Ships `PostgreSQLContainer` and the PostgreSQL `ConnectionDetails` contributor |
| Testcontainers Kafka | `org.testcontainers:kafka:1.20+` | `org.testcontainers.kafka.KafkaContainer` in KRaft mode |
| Redis contributor | Third party | Spring Boot has no built in Redis `ConnectionDetails`; use `@DynamicPropertySource` or a community module |

`spring-boot-testcontainers` must be on the test classpath. Without it the `@ServiceConnection` annotation is not processed and the test falls back to a local or embedded datasource without a clear error.

## Declaring a container

```java
package com.acme.billing.support;

import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Testcontainers(disabledWithoutDocker = true)
class OrderRepositoryIT {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>(DockerImageName.parse("postgres:16-alpine"))
                    .withDatabaseName("billing")
                    .withUsername("billing")
                    .withPassword("billing")
                    .withCommand("postgres", "-c", "fsync=off", "-c", "synchronous_commit=off")
                    .withStartupTimeout(Duration.ofSeconds(60));

    @Autowired
    private OrderRepository repository;

    @Test
    void rejectsAnOrderThatViolatesTheUniqueIndex() {
        repository.save(OrderFixture.pending("O-1", 1_000L));

        assertThatThrownBy(() -> repository.saveAndFlush(OrderFixture.pending("O-1", 1_000L)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
```

| Modifier | Meaning | Trap |
| --- | --- | --- |
| `static` on `@Container` | One container for the whole class | An instance field restarts the container per test method |
| `@ServiceConnection` | Contributes `ConnectionDetails` consumed by Boot auto-configuration | Only works for dependencies with a registered contributor |
| `disabledWithoutDocker` | Skips the class when no daemon is reachable | Hides a misconfigured remote Docker host in CI; keep the flag and check the CI log for skips |
| `withCommand` | Server flags, for example disabling fsync for speed | Never carry a test flag that hides a production durability behavior under test |
| `withStartupTimeout` | Explicit bound on a slow or loaded runner | A silent default timeout produces a confusing pull failure |

## Injecting connection details

| Mechanism | Code | Use |
| --- | --- | --- |
| `@ServiceConnection` | Field annotation on the container | PostgreSQL, MySQL, MariaDB, MongoDB, Kafka, and registered contributors |
| `@DynamicPropertySource` | Static method taking `DynamicPropertyRegistry` | Redis and any dependency without a contributor |
| `ConnectionDetails` bean | A `@Bean` of type `JdbcConnectionDetails` | A dependency whose details come from elsewhere, such as a secret |
| `jdbc:tc:` URL | `spring.datasource.url: jdbc:tc:postgresql:16:///billing` | Local scratch runs outside a test class |

```java
package com.acme.billing.support;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Testcontainers(disabledWithoutDocker = true)
class CartCacheIT {

    @Container
    static final GenericContainer<?> REDIS =
            new GenericContainer<>(DockerImageName.parse("redis:7.4-alpine")).withExposedPorts(6379);

    @DynamicPropertySource
    static void redisProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.data.redis.host", REDIS::getHost);
        registry.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
    }

    @Test
    void expiresACartAfterTheConfiguredWindow() {
        assertThat(new CartService(redis).isExpired("cart-1")).isFalse();
    }
}
```

A `@DynamicPropertySource` method must be `static` and must return `void`; it runs before the context is created, so it cannot reference injected fields. Register every property explicitly: a half-registered connection falls back to a default host and fails later with a connection refused error.

## A shared container base

```java
package com.acme.billing.support;

import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest
@ActiveProfiles("test")
public abstract class AbstractPostgresIT {

    @Container
    @ServiceConnection
    protected static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>(DockerImageName.parse("postgres:16-alpine"))
                    .withDatabaseName("billing")
                    .withUsername("billing")
                    .withPassword("billing")
                    .withReuse(true);

    @DynamicPropertySource
    static void isolateSchema(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.hikari.schema", () -> "schema_" + Isolation.id());
    }

    static final class Isolation {
        private Isolation() {}

        static String id() {
            return System.getProperty("test.schema", "shared");
        }
    }
}
```

Rules for a shared base: keep it abstract, keep the container `static`, keep the image constant, and add only the infrastructure a subclass genuinely needs. A base class that also wires a broker, a mail server, and a mock API turns every subclass into a slow test.

## Reuse, seeding, and migrations

| Concern | Mechanism | Behavior to expect |
| --- | --- | --- |
| Local speed | `withReuse(true)` plus `testcontainers.reuse.enable=true` | The container survives the JVM; the flag is ignored without the property |
| Fresh reference data | `withInitScript("db/seed-reference-data.sql")` | Runs only on first initialization of an empty data directory |
| Idempotent seed | An `INSERT ... ON CONFLICT DO NOTHING` script | Safe to re-run on a reused or migrated volume |
| Schema history | Flyway or Liquibase on the real engine | Executes during context startup because the datasource URL is a container |
| Migration safety | `spring.flyway.clean-disabled: true` and `validate-on-migrate` left on | A drifted schema fails the test instead of being silently cleaned |
| Migration content | Owned by `spring-boot-flyway` | This skill owns only the moment of execution |

```java
// src/test/resources/db/seed-reference-data.sql
INSERT INTO currency (code, scale, minor_unit_name)
VALUES ('EUR', 2, 'cent'), ('USD', 2, 'cent'), ('JPY', 0, 'yen')
ON CONFLICT (code) DO NOTHING;
```

## Programmatic lifecycle

Use programmatic start only when the container is not managed by the JUnit extension, for example in an `ApplicationContextInitializer` or a smoke script. Call `Startables.deepStart(containers).join()` to start, and `Startables.deepStop(containers).join()` or a try-with-resources `close()` to stop. Any container started this way needs explicit teardown; nothing reaps it but Ryuk.

## Isolation and parallel execution

```java
package com.acme.billing.support;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.testcontainers.junit.jupiter.Testcontainers;

@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@Testcontainers
@ResourceLock("postgresql")
public @interface ContainerizedPostgresTest {}
```

```properties
# src/test/resources/junit-platform.properties
junit.jupiter.execution.parallel.enabled=true
junit.jupiter.execution.parallel.mode.default=same_thread
junit.jupiter.execution.parallel.mode.classes.default=concurrent
junit.jupiter.execution.parallel.config.strategy=fixed
junit.jupiter.execution.parallel.config.fixed.parallelism=4
junit.jupiter.execution.parallel.resources.postgresql=postgresql
```

Classes run concurrently while methods inside a class stay sequential, and every class annotated with `@ResourceLock("postgresql")` is serialized against the other locked classes. Without the resource declaration, two classes share one container and collide on the same rows.

## Handoff

The tag budget, CI cost, and flaky dependency triage are in [cost-and-reliability.md](cost-and-reliability.md). Migration content belongs to `spring-boot-flyway`. Test layer choice belongs to `spring-boot-integration-testing`, and JUnit mechanics beyond the container annotations belong to `spring-boot-junit`.
