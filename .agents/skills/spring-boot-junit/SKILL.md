---
name: spring-boot-junit
description: 'Use when writing, restructuring, naming, or running JUnit 5 tests in a Spring Boot 3.5 project, covering test class and method layout, Given When Then scenarios, one behavior per test, @ParameterizedTest with @CsvSource, @MethodSource and @EnumSource, @Nested grouping, @TestInstance PER_CLASS, @BeforeEach and @BeforeAll lifecycle, custom JUnit extensions, AssertJ and SoftAssertions, Assumptions for environment gated tests, @Tag suites, Clock and seeded Random injection, bounded waiting, and surefire or failsafe execution. Triggers include @Test, @DisplayName, @Disabled, @Timeout, @RegisterExtension, assertThat, assertThatThrownBy, assertAll, junit-platform.properties, mvn test, and mvn verify. Do not use for test double design, container backed dependencies, or application context and slice test selection. When other skills also apply, reconcile ownership before mutation.'
license: MIT
metadata:
  author: Walthergl66
  version: '1.0.0'
---

# JUnit 5 Mechanics for Spring Boot Services

Own the mechanical half of testing: how a test is shaped, named, parameterized, grouped, extended, and executed. A deterministic, isolated, self describing test can fail in a build and tell you what broke. An order dependent, clock dependent test named `test3` cannot.

## When to use

- Adding or reviewing a `@Test` method, a test class, or a suite, and choosing between a plain test, a parameterized test, and a `@Nested` group.
- Replacing a flaky `Thread.sleep`, a hard-coded date, or an order dependent assertion, or configuring surefire and failsafe execution.
- Writing AssertJ assertions, soft assertions, assumptions, or `@Tag` suite boundaries.

## When not to use

- Mock, spy, and stub design belongs to `spring-boot-mockito`.
- Real database, Redis, or broker dependencies belong to `spring-boot-testcontainers`.
- Choosing between a plain test, a slice test, and a full context test belongs to `spring-boot-integration-testing`.
- Pipeline ordering and test stage gating belong to `spring-boot-ci-cd`.
- Constraint semantics on production payloads belong to `spring-boot-validation`.

## Ownership and sibling boundaries

This skill owns JUnit engine mechanics: structure, naming, parameterization, nesting, lifecycle, extensions, assertions, tags, and execution.

- `spring-boot-mockito` owns the doubles used in a test; hand it stubbing, verification, and leniency questions.
- `spring-boot-testcontainers` owns dependency provisioning; hand it `@Container`, `@ServiceConnection`, and image questions.
- `spring-boot-integration-testing` owns which layer a test belongs to; hand it `@WebMvcTest`, `@DataJpaTest`, and `@SpringBootTest` questions.
- `spring-boot-ci-cd` owns when a suite runs in a pipeline; hand it stage gating and report publishing.

## Hard rules

1. One behavior per test method, and the method name is the assertion sentence in the present tense. If the name needs the word `and`, split the test.
2. Never rely on execution order. Do not use `@TestMethodOrder` to make a suite pass; remove the shared state instead.
3. `Thread.sleep` is a defect. Use a bounded await with a diagnostic message or an explicit latch.
4. Never call `Instant.now()`, `LocalDateTime.now()`, `Math.random()`, or `UUID.randomUUID()` inside the unit under test. Inject `Clock` and a seeded `Random`.
5. No shared mutable fixtures. Build state in the test or through an immutable builder that returns a new instance.
6. Assert observable behavior, never log output, private fields, or call order unless the interaction is the contract. Parameterize the input dimension, never the expectation.
7. Keep `@BeforeEach` cheap. If the fixture is the interesting subject, assert on it in its own test.
8. Every test must pass in isolation and in any order. Cleanup of shared state means the layer choice is wrong.
9. Prefer AssertJ `assertThat` over bare JUnit assertions: one entry point, chained failure messages, extraction helpers.
10. Tag anything slower than a few seconds or backed by a container, and keep the untagged suite green per commit.

## Naming and structure

| Element | Rule | Example |
| --- | --- | --- |
| Class name | Subject plus `Test` for a pure unit, `IT` for a container or end to end suite | `PricingServiceTest`, `OrderFlowIT` |
| Method name | Present-tense behavior sentence, no `test` prefix, no `shouldHave` | `appliesCampaignDiscountAboveThreshold()` |
| Comments | `// Given`, `// When`, `// Then` only where a phase starts | see below |
| Display name | Human readable scenario for the report | `applies the campaign discount for orders above the threshold` |
| Nested class | The state or condition under which behaviors differ | `WhenTheClockCrossesTheCampaignWindow` |

```java
package com.acme.billing.pricing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PricingServiceTest {

    private static final Instant NOW = Instant.parse("2026-03-01T10:15:30Z");
    private final Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);

    @Test
    @DisplayName("applies the campaign discount above the order threshold")
    void appliesCampaignDiscountAboveThreshold() {
        // Given
        var priceList = PriceList.withCampaign("SPRING", 10_000L, 1_500);
        var service = new PricingService(priceList, clock);

        // When
        long payable = service.payable(new Order(12_000L), Tier.SILVER);

        // Then
        assertThat(payable).isEqualTo(10_200L);
    }

    @Test
    @DisplayName("rejects a campaign with a non positive threshold")
    void rejectsCampaignWithNonPositiveThreshold() {
        var service = new PricingService(PriceList.withCampaign("SPRING", -1L, 1_500), clock);
        assertThatThrownBy(() -> service.payable(new Order(12_000L), Tier.SILVER))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("SPRING");
    }
}
```

## Choosing a construct

| Need | Construct | Cost or trap |
| --- | --- | --- |
| One literal dimension over the same type | `@ValueSource` | Values need pairing |
| Small tuples that read as a table | `@CsvSource` | Rows above four columns become unreadable |
| Cases built in code or shared across tests | `@MethodSource` with a `static` factory | Re-evaluated per test method, so it must be pure |
| The whole enum surface is the contract | `@EnumSource` with `Mode.INCLUDE` or `Mode.EXCLUDE` | Worthwhile only when every constant matters |
| Preconditions change, inputs do not | `@Nested` inner class | More than one level, or more than fifteen methods, means the subject has two responsibilities |
| The same cross cutting concern in three or more classes | A custom extension via `@ExtendWith` or `@RegisterExtension` | Must be stateless, thread safe, and free of assertions |
| An absent value, or a prerequisite the environment lacks | `@NullSource`, `@EmptySource`, or `Assumptions.assumeTrue(condition, "reason")` | A failed assumption reports as skipped, so it can hide a real defect |

A `@MethodSource` factory is `static` unless the class is `@TestInstance(PER_CLASS)`. An extension must print a diagnostic on failure, never throw, and never assert production behavior.

## Assertions, assumptions, and determinism

| Need | Use |
| --- | --- |
| One value or a projection | `assertThat(order).extracting(Order::status).isEqualTo(Status.PAID)` |
| A thrown failure | `assertThatThrownBy(...).isInstanceOf(...).hasMessageContaining(...)` |
| Several independent facts about one outcome | `assertAll(...)` or `SoftAssertions.assertSoftly(...)` |
| Current time in the subject | A `Clock` field, pinned with `Clock.fixed` in the test |

Tags used consistently across a service: `slow` above a few seconds, `container` for a real dependency, `e2e` for a booted application, and `flaky` only with a named owner and a removal condition.

## Which runner proves what

Mechanics live here; the boundary decision belongs to `spring-boot-integration-testing`.

| Runner | Proves | Does not prove |
| --- | --- | --- |
| Plain JUnit with direct construction | Pure logic, arithmetic, validation, policy | Any wiring, mapping, or SQL |
| `@WebMvcTest` | Routing, binding, validation, serialization, advice | Service wiring, persistence, query correctness |
| `@DataJpaTest` | Mapping, derived queries, constraints against a database | Controller or security behavior |
| `@SpringBootTest` | The context wires and the request path completes | Behavior under real production load |

## Reference routing

| Task | Load |
| --- | --- |
| Design the class, name, scenario shape, fixture, or a flaky test | [test-design.md](references/test-design.md) |
| Implement parameterization, nesting, extensions, assumptions, tags, or surefire and failsafe execution | [junit-mechanics.md](references/junit-mechanics.md) |

## Expected response

- **Layer and runner:** which test style proves the behavior and what it deliberately leaves unproven.
- **Scenarios:** the behavior statements, each mapped to a method with a present-tense name.
- **Structure and determinism:** nesting, lifecycle callbacks, fixture origin, the isolation argument, and how time, randomness, and concurrency are controlled.
- **Mechanics:** parameterized sources, assertions, assumptions, tags, and the exact surefire or failsafe invocation, plus the residual risk and the sibling skill that owns closing it.
