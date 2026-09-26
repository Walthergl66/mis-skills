# Mockito Mechanics

Load this when wiring a double into a Spring test, stubbing a call, capturing arguments, verifying an interaction, mocking a static or final type, or diagnosing a strictness failure.

## Dependency baseline

| Dependency | Coordinate | Note |
| --- | --- | --- |
| Spring Boot test | `spring-boot-starter-test` | Brings `mockito-core`, `mockito-junit-jupiter`, and `spring-test` |
| Mockito | `org.mockito:mockito-core:5.x` | The inline mock maker is the default; `mockito-inline` is no longer needed and must be removed |
| Spring override annotations | `org.springframework.test.context.bean.override.mockito` | `@MockitoBean`, `@MockitoSpyBean`, available in Boot 3.4 or newer |
| JUnit integration | `org.mockito.junit.jupiter.MockitoExtension` | Strict stubs by default |

Remove `mockito-inline` and any `MockMaker` resource file when upgrading. On Mockito 5, final classes, final methods, and static methods are mockable out of the box.

## Pure unit wiring without Spring

Prefer constructor wiring over `@InjectMocks`. Field injection by type is ambiguous the moment a class has two collaborators of the same interface, and it silently leaves a field null. `Mockito.mock(X.class)` in a test body, or a hand written fake passed to the constructor, keeps the wiring visible in the test.

## Spring override wiring

```java
package com.acme.billing.checkout;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import com.acme.billing.fraud.FraudGateway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockReset;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@SpringBootTest
class FraudScoringFlowTest {

    @MockitoBean
    private FraudGateway fraudGateway;

    @Autowired
    private FraudScoringService scoring;

    @Test
    void blocksAnOrderAboveTheScoreThreshold() {
        given(fraudGateway.score(any())).willReturn(new Score(0.98d));

        var decision = scoring.evaluate("O-1", 40_000L);

        assertThat(decision.approved()).isFalse();
        verify(fraudGateway, times(1)).score(any());
    }

    @Test
    void doesNotCallTheGatewayForATrivialAmount() {
        var decision = scoring.evaluate("O-2", 100L);

        assertThat(decision.approved()).isTrue();
        verify(fraudGateway, never()).score(any());
    }

    @Test
    @MockitoBean(reset = MockReset.NONE)
    void keepsTheStubbedScoreAcrossMethods() {
        given(fraudGateway.score(any())).willReturn(new Score(0.10d));

        assertThat(scoring.evaluate("O-3", 40_000L).approved()).isTrue();
    }
}
```

| Attribute | Meaning |
| --- | --- |
| `reset` | `AFTER` by default, so stubs and invocations clear between methods; `BEFORE`, `NONE`, or `WITH` to keep state |
| `enforceOverride` | `true` by default, so a declared bean that is not replaced fails the context |
| `name` | Qualifies by bean name when the type is ambiguous |
| `classes` | Explicit type list when the field type is an interface with multiple candidates |

`@MockitoSpyBean` wraps the real, fully initialized bean. Reset defaults to `AFTER` as well; a spy with `reset = MockReset.NONE` accumulates interactions across the whole class and turns verification into archaeology.

## Argument matchers

| Rule | Detail |
| --- | --- |
| All or nothing | One matcher in an argument list forces a matcher on every argument |
| `any()` matches null | Use `isNull()`, `eq(null)`, or a captor for a meaningful null case |
| `anyString()` does not match null in Mockito 2 or newer | Use `any()` when null is a valid input |
| `any(Class)` is a type check only | It says nothing about the value; combine with `argThat` |
| Prefer a captor to a complex matcher | Captors produce a readable failure listing every captured value |

## Argument captors

```java
package com.acme.billing.checkout;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class CaptureMechanicsTest {

    @Test
    void sendsOneNotificationPerOrderLine() {
        var gateway = mock(NotificationGateway.class);
        var dispatcher = new LineDispatcher(gateway);

        dispatcher.dispatch(OrderPlaced.of("O-1", 3));

        var captor = ArgumentCaptor.forClass(LineNotification.class);
        verify(gateway, times(3)).send(captor.capture());
        assertThat(captor.getAllValues())
                .extracting(LineNotification::lineId)
                .containsExactlyInAnyOrder("O-1#L1", "O-1#L2", "O-1#L3");
    }
}
```

Use `@Captor` with `MockitoExtension` when the captor is used in several methods; use `ArgumentCaptor.forClass` locally when it is used once. Never assert inside the captor argument; capture first, assert after.

## Verification

| Method | Use | Avoid |
| --- | --- | --- |
| `verify(x).f(y)` | A boundary call that is the contract | Verifying internal steps |
| `verify(x, times(n))` | The exact number of side effects is the behavior | `times(1)` as a default reflex |
| `verify(x, never())` | Proving a short circuit or a guard | Proving a whole absence of behavior |
| `verifyNoInteractions(x)` | The collaborator must not be touched at all | When the subject logs or reads metrics |
| `verifyNoMoreInteractions(x)` | Rare, when the test already asserts the outcome | As a blanket rule; it breaks on harmless additions |
| `InOrder` | A sequence is genuinely the contract | Implementation ordering that could change freely |
| `verify(x, timeout(200))` | A bounded wait on an asynchronous call | Unbounded waits or sleeps |

## Strictness failures

| Failure | Meaning | Correct repair |
| --- | --- | --- |
| `UnnecessaryStubbingException` | A stub was never used | Delete the stub, or remove the code path that no longer calls the collaborator |
| `PotentialStubbingProblem` | A call was made with arguments that do not match any stub | Widen with a matcher or add the missing case; do not add `lenient()` to silence it |
| `WrongTypeOfReturnValue` | A stub returns the wrong type | Fix the stub, not the production signature |
| `NullInsteadOfMock` from `@InjectMocks` | Constructor injection did not match | Wire with the constructor explicitly |
| `MockitoHint` about final class on Mockito 4 or older | Inline mock maker disabled | Upgrade to Mockito 5 and remove the `MockMaker` resource file |

```java
package com.acme.billing.checkout;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.mockito.junit.jupiter.MockitoExtension;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@Tag("slow")
class LenientGlobalStubTest {

    // Class wide leniency is acceptable only for an integration style test whose stubs are
    // driven by the fixture, never for a unit test that should state its expectations.
}
```

Preferred alternatives to class wide leniency: `lenient().when(...)` on the single stub that legitimately varies, or moving the fixture-driven behavior into a real fake.

## Static, constructor, and final types

| Mechanism | Scope | Cost |
| --- | --- | --- |
| `try (var m = mockStatic(Clock.class))` | Current thread only | Breaks parallel execution and hides a missing injection point |
| `try (var m = mockConstruction(VendorClient.class))` | Current thread only | Only when a third-party type is constructed inline in the subject |
| `spy` on a final class | Instance | The inline mock maker supports it; the real method still runs |
| Constructor injection | Explicit | Always preferred over static mocking |

Mockito 5 makes final classes, final methods, and static methods mockable with the default inline mock maker, so `mockito-inline` and a `MockMaker` resource file must be removed rather than relied upon.

## Handoff

The choice between a mock, a fake, a real object, and a slice is in [mocking-strategy.md](mocking-strategy.md). Test class structure and lifecycle belong to `spring-boot-junit`. Slice and context configuration belong to `spring-boot-integration-testing`. Real database, broker, and cache dependencies belong to `spring-boot-testcontainers`.
