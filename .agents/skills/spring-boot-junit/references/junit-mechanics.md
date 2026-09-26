# JUnit 5 Mechanics

Load this when implementing parameterization, nested classes, extensions, assumptions, tags, custom runners, or surefire and failsafe configuration for a Spring Boot service.

## Version baseline

| Component | Baseline | Consequence |
| --- | --- | --- |
| JUnit Jupiter | 5.11 or newer via the starter | `assertThrowsExactly` and the parallel resource lock configuration are available |
| AssertJ | 3.25 or newer via the starter | `SoftAssertions.assertSoftly` and recursive comparison are available |
| Surefire and Failsafe | 3.2 or newer | Tag filtering, `systemPropertyVariables`, and `*IT` execution bound to `verify` |

`@MockBean` is not a JUnit concern; the replacement mapping for Mockito lives in `spring-boot-mockito`.

## Parameterized sources

| Annotation | Signature shape | Use |
| --- | --- | --- |
| `@ValueSource` | `strings`, `ints`, `longs`, `doubles`, `booleans`, `chars`, `classes`, `uris` | One dimension, one type, literals only |
| `@NullSource`, `@EmptySource`, `@NullAndEmptySource` | Composable with any other source | Absence is part of the contract |
| `@CsvSource` | Comma separated rows, optional `delimiter`, `nullValues`, `useHeadersInDisplayName` | Small tuples that read as a table |
| `@CsvFileSource` | `value` classpath CSV, `delimiter` | A large stable matrix shared by several tests |
| `@MethodSource` | A factory returning `Stream`, `Collection`, `Iterator`, or array of `Arguments` | Cases built in code, or a builder |
| `@EnumSource` | `value`, `names`, `mode` of `INCLUDE`, `EXCLUDE`, `MATCH_ALL` | Exhaustive enum coverage |
| `@ArgumentsSource` | A class implementing `ArgumentsProvider` | Logic that would bloat a method source |

```java
package com.acme.billing.junit;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.stream.Stream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;

class MoneyRoundingMechanicsTest {

    @ParameterizedTest(name = "[{index}] splits {0} minor units across {1} shares")
    @MethodSource("shareTotals")
    void splitsWithoutLosingMinorUnits(long totalCents, int shares) {
        var parts = Money.of(totalCents, "EUR").allocate(shares);

        assertThat(parts).hasSize(shares);
        assertThat(parts.stream().mapToLong(Long::longValue).sum()).isEqualTo(totalCents);
    }

    static Stream<Arguments> shareTotals() {
        return Stream.of(Arguments.of(1L, 2), Arguments.of(101L, 4), Arguments.of(10_000L, 3));
    }

    @ParameterizedTest
    @CsvSource(value = {"0|0", "1|1", "2|2", "3|3", "12,5|13"}, delimiter = '|')
    void roundsToMinorUnits(String amount, String expected) {
        assertThat(Money.parse(amount, "EUR").toPlainString()).isEqualTo(expected);
    }

    @ParameterizedTest
    @EnumSource(value = Currency.class, names = {"XXX", "ZZZ"}, mode = EnumSource.Mode.EXCLUDE)
    void rejectsUnknownCurrency(Currency currency) {
        assertThat(Currency.SUPPORTED).doesNotContain(currency);
    }
}
```

Mechanics rules:

- A `@MethodSource` factory is `static` unless the class declares `@TestInstance(PER_CLASS)`; the factory runs before the test instance exists.
- A `@MethodSource` factory is evaluated once per test method, so it must be a pure function with no shared mutable state.
- Add `name` to any `@ParameterizedTest` whose `toString` values are not readable in the report; the default renders raw objects.
- Never parameterize over mocks. A mocked argument that needs per-case setup belongs in a `@Nested` class with a real fake.
- More than roughly four columns in a `@CsvSource` row is a signal to build a domain object in a `@MethodSource` or `ArgumentsProvider`.

## Nested classes

```java
package com.acme.billing.subscription;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class SubscriptionLifecycleTest {

    private final LifecycleClock clock = new LifecycleClock();
    private final SubscriptionEngine engine = new SubscriptionEngine(clock);

    @Test
    @DisplayName("activates a pending subscription at the start instant")
    void activatesPendingSubscription() {
        engine.accept(Subscription.pending("S-1", clock.instant()));

        assertThat(engine.stateOf("S-1")).isEqualTo(State.ACTIVE);
    }

    @Nested
    @DisplayName("when a subscription is active")
    class WhenActive {

        @Test
        @DisplayName("suspends on a missed payment")
        void suspendsOnMissedPayment() {
            engine.accept(Subscription.pending("S-2", clock.instant()));
            clock.advance(Duration.ofDays(32));

            engine.onPaymentWindowClosed("S-2");

            assertThat(engine.stateOf("S-2")).isEqualTo(State.SUSPENDED);
        }

        @Test
        @DisplayName("refuses to resume a suspended subscription directly")
        void refusesToResumeSuspendedSubscription() {
            engine.accept(Subscription.suspended("S-3", clock.instant()));

            assertThatThrownBy(() -> engine.resume("S-3"))
                    .isInstanceOf(IllegalStateException.class);
        }
    }
}
```

| Decision | Rule |
| --- | --- |
| Group by state or by varying condition | `@Nested` on the state, parameterization on the value |
| Nesting depth | One level; two levels needs a design review |
| Inner class modifier | Never `static`; a nested class needs the outer instance |
| Shared setup | A field on the outer class, never a shared mutable fixture across inner classes |
| Explosion signal | More than three nested groups or more than fifteen methods means the subject has more than one responsibility |

## Extensions

| Extension point | Use |
| --- | --- |
| `BeforeAllCallback` and `AfterAllCallback` | One-time resource acquisition per class |
| `BeforeEachCallback` and `AfterEachCallback` | Per-test setup and guaranteed cleanup |
| `TestWatcher` | Report a failure with extra context; never throw from the watcher |
| `ParameterResolver` | Supply a parameter the JUnit built-in resolvers cannot |
| `InvocationInterceptor` | Retry, timing, or wrapping; keep it free of assertions |
| `ExecutionCondition` | Skip a class or method from an external condition |

Write a custom extension only when the same cross-cutting concern appears in at least three test classes. Before writing one, check the built-ins: `@BeforeAll` for resources, `@RegisterExtension` for anything with a lifecycle, and an ordinary field for state.

## Assumptions and disabling

| Need | Mechanism | Report effect |
| --- | --- | --- |
| A prerequisite the environment may not have | `Assumptions.assumeTrue(condition, "reason")` | Reported as skipped, not failed |
| A whole class gated on a property | `@EnabledIfSystemProperty(named = "e2e", matches = "true")` | Class is skipped at discovery |
| A test that documents a known defect | `@Disabled("issue reference and exit condition")` | Skipped, and the reason is in the report |
| A conditional block inside a test | `Assumptions.assumingThat(condition, () -> ...)` | Only the guarded assertions are conditional |
| An expected timeout | `@Timeout(value = 2, unit = TimeUnit.SECONDS)` | Fails the test with the stack trace |

Never use an assumption to hide a real failure. `assumeTrue(rowsExist())` before asserting the result converts a data bug into a green build.

## Tags and suite execution

```properties
# src/test/resources/junit-platform.properties
junit.jupiter.testinstance.lifecycle.default=per_method
junit.jupiter.execution.parallel.enabled=true
junit.jupiter.execution.parallel.mode.default=concurrent
junit.jupiter.execution.parallel.mode.classes.default=concurrent
junit.jupiter.execution.parallel.config.strategy=fixed
junit.jupiter.execution.parallel.config.fixed.parallelism=4
junit.jupiter.execution.parallel.resources.default=postgresql
junit.jupiter.execution.parallel.config.fixed.max-pool-size=8
```

Declare each concurrency key once; a duplicated key silently keeps the last value. A shared resource named in `junit.jupiter.execution.parallel.resources.<name>` is locked for any test annotated with `@ResourceLock("<name>")`, which is how parallel container suites stay isolated.

```xml
<plugin>
  <groupId>org.apache.maven.plugins</groupId>
  <artifactId>maven-surefire-plugin</artifactId>
  <configuration>
    <excludedGroups>slow,container,e2e</excludedGroups>
    <systemPropertyVariables>
      <spring.profiles.active>test</spring.profiles.active>
    </systemPropertyVariables>
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

| Command | Runs |
| --- | --- |
| `mvn test` | Surefire only: untagged unit and slice tests |
| `mvn test -Dgroups=slow` | Adds the `slow` tag |
| `mvn verify` | Surefire, then failsafe for `*IT` |
| `mvn verify -DexcludedGroups=container` | Holds back container suites locally |

## Handoff

Layer selection and context configuration belong to `spring-boot-integration-testing`; doubles and their extension behavior belong to `spring-boot-mockito`; real dependency containers and their resource locks belong to `spring-boot-testcontainers`; suite gating in the pipeline belongs to `spring-boot-ci-cd`. Scenario shape and fixture discipline are in [test-design.md](test-design.md).
