# Test Data, Transactions, and Contracts

Load this when building test data, relying on `@Transactional` rollback, seeding with `@Sql`, or writing endpoint contract expectations.

## Test data rules

| Rule | Reason |
| --- | --- |
| Build data inside the test, through a builder | A shared fixture hides the condition that the test is about |
| A builder method is a business term | `pendingFor("C-1")` survives a schema rename; `set(1, 2, 3)` does not |
| No static mutable collections in fixtures | Parallel classes and order independence break |
| No fixed natural keys across classes | A unique index collision between two classes is a random failure |
| No production seed data by accident | Reference rows must be explicit and minimal |
| Truncate instead of delete when the volume is large | `deleteAll()` in a loop is slow; the trade-off is that truncate cannot run inside the test transaction |

```java
package com.acme.billing.order;

import static java.nio.charset.StandardCharsets.UTF_8;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

public final class OrderFixture {

    private static final Instant START = Instant.parse("2026-03-01T09:00:00Z");

    private OrderFixture() {}

    public static Clock clock() {
        return Clock.fixed(START, ZoneOffset.UTC);
    }

    public static Order.OrderBuilder pendingFor(String customerId) {
        return Order.builder()
                .id(UUID.nameUUIDFromBytes(("order:" + customerId).getBytes(UTF_8)))
                .customerId(customerId)
                .status(OrderStatus.PENDING)
                .totalCents(12_000L)
                .placedAt(START);
    }

    public static Order.OrderBuilder paidFor(String customerId) {
        return pendingFor(customerId).status(OrderStatus.PAID).paidAt(START.plusSeconds(600));
    }
}
```

A deterministic identifier derived from the business key makes a fixture reproducible and still unique per class when the key is namespaced.

## The `@Transactional` test model

`@DataJpaTest` and `@SpringBootTest` are transactional by default and roll back after each method. `@Transactional` on a test is a test tool, not a production shortcut.

| Effect | Rolled back | Survives the test |
| --- | --- | --- |
| Repository writes on the test thread | Yes | No |
| Service methods called on the test thread | Yes | No |
| `@Async` methods and executor tasks | No | Yes |
| Work on a second `DataSource` or transaction manager | No | Yes |
| An inner `REQUIRES_NEW` transaction with its own connection | No | Yes |
| A publish to a broker, a file write, or an HTTP call | No | Yes |
| A `TRUNCATE` inside an `@Sql` script | No | Yes |

```java
package com.acme.billing.order;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@Tag("container")
class OrderServiceCommitIT {

    @Autowired
    private OrderService service;

    @Autowired
    private OrderRepository repository;

    @Autowired
    private OrderIndexer indexer;

    @AfterEach
    void cleanUp() {
        // Async work committed on its own connection, so the rollback cannot remove it.
        repository.deleteByCustomerId("C-async");
    }

    @Test
    @Transactional
    void rollsBackTheWriteOnRejection() {
        var order = OrderFixture.pendingFor("C-rollback").totalCents(-1L).build();

        assertThatThrownBy(() -> service.place(order)).isInstanceOf(IllegalArgumentException.class);
        assertThat(repository.findByCustomerId("C-rollback")).isEmpty();
    }

    @Test
    @Transactional
    void asyncWorkSurvivesTheTestRollback() throws InterruptedException {
        var done = new CountDownLatch(1);

        indexer.index(OrderFixture.paidFor("C-async").build(), done::countDown);

        assertThat(done.await(5, TimeUnit.SECONDS)).isTrue();
    }
}
```

Rules that follow from the table:

- A test that proves rollback is not a test of production transaction behavior. It proves that the test transaction is clean.
- For every `@Transactional` test, decide whether the claim needs the production method to open its own transaction. If it does, drop `@Transactional`, read the row back in a later transaction, and clean up explicitly, because nothing rolls back for you.
- Async or reactive paths need a terminal-state await plus a dedicated cleanup, because nothing rolls them back.
- Assert with a committed read in a second transaction or a second connection when the claim is about commit visibility.

## Seeding with `@Sql` and scripts

| Mechanism | Use | Trap |
| --- | --- | --- |
| `@Sql` inline or from a file | Small, stable reference data or a cleanup step | Runs before the test by default; ordering with `@Sql` on the class and the method matters |
| `@Sql` with `transactionMode = INFERRED` | Joins the test transaction when one exists | A `TRUNCATE` still commits independently |
| `spring.sql.init` scripts | Application startup data | Runs on every context start, so it belongs in a dev or test profile only |
| `withInitScript` on a container | Fresh container reference data | Runs only on an empty data directory |
| A builder in the test | Anything the test reasons about | Preferred for domain state |

```java
package com.acme.billing.order;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.jdbc.Sql;
import org.springframework.test.context.jdbc.Sql.ExecutionPhase;
import org.springframework.test.context.jdbc.SqlMergeMode;

@DataJpaTest
@Import(OrderRepository.class)
@Sql(scripts = "/db/cleanup-orders.sql", executionPhase = ExecutionPhase.AFTER_TEST_METHOD)
@SqlMergeMode(SqlMergeMode.MergeMode.MERGE)
class OrderRepositoryIT {

    @Autowired
    private OrderRepository repository;

    @Test
    void appliesTheCommittedOrder() {
        var saved = repository.save(OrderFixture.paidFor("C-1").build());

        assertThat(repository.findByCustomerId("C-1")).contains(saved);
    }
}
```

The cleanup script must be written as deletes in reverse dependency order, not as `TRUNCATE`, when the test relies on rollback.

## Contract tests

| Contract layer | Owner | Test |
| --- | --- | --- |
| HTTP request and response shape | `spring-boot-rest-api` | A `@WebMvcTest` and one real port test per endpoint family |
| Error payload and status mapping | `spring-boot-rest-api` | A parameterized test over the failure catalog |
| Persistence mapping | `spring-boot-data-jpa` | A `@DataJpaTest` round trip per aggregate |
| Outbound request shape | `spring-boot-mockito` for the double, this skill for the layer | A `@RestClientTest` with a recorded request assertion |
| Event payload | The producing service | A serialization round trip plus a consumer side test |

```java
package com.acme.billing.order;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class CheckoutErrorContractTest {

    @ParameterizedTest(name = "{0} maps to {1} with code {2}")
    @CsvSource({
            "ORDER_NOT_FOUND,      404, order_not_found",
            "CUSTOMER_BLOCKED,     409, customer_blocked",
            "LIMIT_EXCEEDED,       422, limit_exceeded",
            "PAYMENT_DECLINED,     402, payment_declined",
    })
    void mapsEachFailureToItsContract(String failure, int status, String code) {
        var mapping = CheckoutErrorCatalog.mappingFor(FailureCatalog.valueOf(failure));

        assertThat(mapping.status()).isEqualTo(status);
        assertThat(mapping.code()).isEqualTo(code);
    }
}
```

Contract expectations live in one place so a change to the catalog breaks one test, not forty. Assert the fields a client depends on and the absence of internal fields; do not assert on a full serialized body with a brittle string.

## Handoff

Layer selection and client choice are in [test-layers.md](test-layers.md). Fixture and double design belongs to `spring-boot-mockito`; container seeding and migration timing to `spring-boot-testcontainers`; transaction semantics in production code to `spring-boot-data-jpa`; migration content to `spring-boot-flyway`; endpoint and error payload contracts to `spring-boot-rest-api`.
