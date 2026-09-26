# Test Design for Spring Boot Services

Load this when shaping test classes, naming scenarios, building fixtures, or diagnosing a test that fails only in some orders, on some machines, or after an unrelated change.

## The scenario contract

A test is a single falsifiable sentence about one subject. Write the sentence before the code.

| Defect in the sentence | Symptom in code | Repair |
| --- | --- | --- |
| Two behaviors joined by `and` | One method, two assertions about unrelated outputs | Split into two methods sharing a builder |
| No subject | `testService()` | Name the subject and the outcome |
| No observable outcome | Assertions on fields or logs | Assert the returned value, the thrown failure, or the persisted row |
| Condition hidden in setup | 40 lines in `@BeforeEach` | Move the condition into the scenario, extract a builder |
| Only the happy path | One method per class | Add the rejection, boundary, and duplicate cases |

## Naming

| Element | Convention | Example |
| --- | --- | --- |
| Pure unit class | Subject plus `Test` | `PromoPolicyTest` |
| Container or end to end class | Capability plus `IT` | `CheckoutFlowIT` |
| Method | Present-tense behavior, no `test` prefix | `rejectsExpiredToken()` |
| Parameterized method | Behavior sentence, arguments left to JUnit | `allowsRefundWithinWindow(int days)` |
| Nested class | The varying state, not the varying input value | `WhenSubscriptionIsCancelled` |
| Disabled test | The scenario sentence plus the blocking reason in the annotation | `@Disabled("waiting for settlement provider contract")` |

Never encode the current expected value in the method name. `returnsZeroWhenBalanceIsEmpty()` rots when the balance becomes negative; `returnsZeroForAnEmptyBalance()` survives.

## One behavior, one reason to fail

A test may assert several facts about one outcome. Use `assertAll` or `SoftAssertions` so every fact is reported in one run:

```java
package com.acme.billing.subscription;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.assertj.core.api.SoftAssertions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class CancellationPolicyTest {

    private final CancellationPolicy policy = new CancellationPolicy();

    @Test
    @DisplayName("cancels immediately and schedules the final invoice")
    void cancelsImmediatelyAndSchedulesFinalInvoice() {
        // Given
        var subscription = Subscription.active("S-1", Money.of(1_200L, "EUR"));

        // When
        var result = policy.cancel(subscription, CancelReason.customerRequest());

        // Then
        SoftAssertions.assertSoftly(softly -> {
            softly.assertThat(result.status()).isEqualTo(Status.CANCELLED);
            softly.assertThat(result.effectiveAt()).isEqualTo(subscription.startedAt().plusDays(30));
            softly.assertThat(result.finalInvoice().dueOn())
                    .isAfterOrEqualTo(subscription.startedAt().plusDays(30));
        });
    }

    @Test
    @DisplayName("refuses to cancel an already cancelled subscription")
    void refusesToCancelAnAlreadyCancelledSubscription() {
        var subscription = Subscription.cancelled("S-1", Money.of(0L, "EUR"));

        assertThatThrownBy(() -> policy.cancel(subscription, CancelReason.customerRequest()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("S-1");
    }
}
```

## Fixtures

| Need | Pattern | Avoid |
| --- | --- | --- |
| Required state for one test | Build it in the test body | A `setUp` that hides the subject condition |
| Reusable valid aggregate | An immutable builder returning a new instance per call | A shared mutable static entity |
| Many small variations | A builder with a distinct method per business attribute | A builder taking a bag of nullable fields |
| Time dependent state | A fixed `Clock` plus a helper that derives instants from it | `LocalDateTime.now()` plus offsets in each test |
| Bulk data | A generated list with an explicit size and shape | Loops that produce an unbounded collection |

```java
package com.acme.billing.subscription;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

public final class Subscriptions {

    private Subscriptions() {}

    public static final Instant START = Instant.parse("2026-01-15T08:00:00Z");

    public static Clock clock() {
        return Clock.fixed(START, ZoneOffset.UTC);
    }

    public static Subscription active(String id, Money monthly) {
        return Subscription.builder()
                .id(id)
                .status(Status.ACTIVE)
                .plan(Plan.monthly(monthly))
                .startedAt(START)
                .build();
    }

    public static Subscription pastDue(String id, Money monthly, int daysLate) {
        return active(id, monthly).toBuilder()
                .status(Status.PAST_DUE)
                .lastPaymentAt(START.minusSeconds(daysLate * 86_400L))
                .build();
    }
}
```

A builder method is a business term. `withPastDue(45)` reads as a domain statement; `set(3, 45, true)` reads as a database row.

## Deterministic time

| Rule | Implementation |
| --- | --- |
| The subject never reads a static clock | Constructor injects `java.time.Clock` |
| Tests pin the clock | `Clock.fixed(START, ZoneOffset.UTC)` or a mutable test double advanced explicitly |
| The subject needs the zone | Inject `ZoneId` separately, or use a fixed zone in the test `Clock` |
| Business windows cross midnight | Assert with `ZoneId.of("Europe/Madrid")` in the test so the boundary is explicit |
| A test needs a sequence of times | A `MutableClock` test double with `advance(Duration)`, not a real clock |

```java
package com.acme.billing.support;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;

public final class MutableClock extends Clock {

    private Instant now;
    private final ZoneId zone;

    public MutableClock(Instant start, ZoneId zone) {
        this.now = start;
        this.zone = zone;
    }

    public void advance(Duration amount) {
        now = now.plus(amount);
    }

    @Override
    public ZoneId getZone() {
        return zone;
    }

    @Override
    public Clock withZone(ZoneId targetZone) {
        return new MutableClock(now, targetZone);
    }

    @Override
    public Instant instant() {
        return now;
    }
}
```

## Anti-flake rules

| Symptom | Root cause | Fix |
| --- | --- | --- |
| Passes alone, fails in the suite | Shared static state, a shared database, a cached singleton, or a leaked thread | Isolate the resource; route the dependency to a container per class |
| Fails on a loaded CI machine | Fixed timeout, sleep, or busy wait | Bounded await with a generous but finite deadline and a diagnostic message |
| Fails only on a second run | Leftover data or a reused container | Deterministic cleanup or a fresh schema per class |
| Fails at 23:59 or 00:01 | A date boundary derived from the wall clock | Pin the clock |
| Order dependent | A previous test mutated a shared fixture | No shared mutable state; rebuild per test |
| Intermittent duplicate key | A random fixture colliding with a unique index | Seed identifiers per test and namespace per class |
| Passes on a laptop, times out in CI | A cold container or a cold class load | Warm once per class, not per method, and tag the suite |

## What not to assert

- Do not assert on log lines, `System.out`, or exception stack traces. Assert on the failure type and the message fragment that carries the contract.
- Do not assert on private methods, field order, or collection implementation classes.
- Do not assert on a framework object that is a detail of the wiring, such as a bean definition, unless wiring is the subject.
- Do not assert that nothing was logged. That couples the test to the logging configuration.

## Coverage that matters

| Behavior class | Required cases |
| --- | --- |
| Arithmetic or rounding | Boundary at zero, at the limit, one below, one above, and a multi-item total |
| Validation | Missing field, wrong type, empty collection, oversize input |
| State machine | Every legal transition plus the illegal transition that must fail |
| Idempotency | The same request twice yields one effect |
| Concurrency | Two callers, one winner, one rejected or retried, proven with a latch rather than timing |
| Failure of a dependency | Timeout, error, and empty result are distinct outcomes |
| Time window | Inside, exactly at, and outside the boundary instant |

## Handoff

Reference the sibling skills for the decisions this document deliberately excludes: which layer a test belongs to is owned by `spring-boot-integration-testing`; the design of a double is owned by `spring-boot-mockito`; provisioning a real database or broker is owned by `spring-boot-testcontainers`; the JUnit API surface behind these patterns is in [junit-mechanics.md](junit-mechanics.md).
