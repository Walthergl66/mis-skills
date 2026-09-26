---
name: spring-boot-mockito
description: 'Use when designing or reviewing test doubles in a Spring Boot 3.5 project, covering migration of the deprecated @MockBean and @SpyBean to @MockitoBean and @MockitoSpyBean, choosing between a mock, a fake, a stub, and a real object, stubbing with when versus doReturn, argument matchers and captors, verification scope, strict stubs and the UnnecessaryStubbingException, lenient stubs, static mocking of Clock or UUID, and final class support. Triggers include Mockito.mock, MockitoExtension, @InjectMocks, @MockitoSettings, MockReset, ArgumentCaptor, doThrow, verifyNoMoreInteractions, PotentialStubbingProblem, and mockito-inline removal. Do not use for JUnit class structure, container backed dependencies, or test layer selection. When other skills also apply, reconcile ownership before mutation.'
license: MIT
metadata:
  author: Walthergl66
  version: '1.0.0'
---

# Test Doubles with Mockito and Spring Test Overrides

Own the decision of what to fake in a test and the mechanics of doing it. A double is legitimate only at a boundary the test cannot reach cheaply; used as a default it deletes the behavior the test was written to prove.

## When to use

- Migrating `@MockBean` and `@SpyBean` to `@MockitoBean` and `@MockitoSpyBean`.
- Deciding whether a dependency should be a mock, a hand-written fake, or the real implementation.
- Stubbing return values, throwing, capturing arguments, or verifying interactions.
- Handling a spy, a final class, a static factory, or a private constructor.
- Fighting `UnnecessaryStubbingException`, `PotentialStubbingProblem`, or over-strict verification.
- Reducing a test that mocks the persistence layer or the type under test.

## When not to use

- Test class layout, naming, parameterization, and tags belong to `spring-boot-junit`.
- A real database, broker, or cache in a test belongs to `spring-boot-testcontainers`.
- Port and adapter design for replaceable dependencies belongs to `spring-boot-hexagonal-architecture`.
- Which layer a test belongs to and how the context is configured belongs to `spring-boot-integration-testing`.
- HTTP contract shape and error payloads belong to `spring-boot-rest-api`.

## Ownership and sibling boundaries

This skill owns double selection, stubbing, verification, and Spring test override wiring.

- `spring-boot-junit` owns the surrounding test structure; hand it method names, nesting, and lifecycle questions.
- `spring-boot-testcontainers` owns real dependencies; hand it any case where a mock stands in for SQL, an offset, or a serialization format.
- `spring-boot-hexagonal-architecture` owns where the seam lives; hand it any question about which port a double implements.
- `spring-boot-integration-testing` owns the layer; hand it any question about whether a slice test even needs a double.

## Hard rules

1. A mock is honest only at a boundary you do not own: a vendor SDK, an HTTP client, a broker client. Everywhere else, prefer a fake or the real object.
2. Never mock the type under test, its own repository, or a value object. A test that mocks the query it is testing proves nothing.
3. Never mock `List`, `Map`, `String`, or any JDK type. Use `List.of` or a builder.
4. `@MockBean` and `@SpyBean` are deprecated in Boot 3.4 and removed in Boot 4. Use `@MockitoBean` and `@MockitoSpyBean`.
5. Constructor injection removes the need for a double in a pure unit test. If `@InjectMocks` is required to wire a unit test, the design is fighting you.
6. Strict stubs are the default. Fix the test that stubs a call the subject no longer makes instead of reaching for `lenient()`.
7. Verify through the returned value, the thrown failure, or the captured argument. `verifyNoMoreInteractions` is a smell, not a safety net.
8. Static mocking is a last resort for a clock or an identifier. If a `Clock` or an id generator can be injected, inject it; a static mock is thread-bound.
9. Keep a fake next to the interface it implements, in one file, with no Spring annotations.
10. A spy wraps a real object and therefore runs real code. Use it to verify a boundary call on an object you already trust.

## Mock, fake, real, or slice

| Dependency | Choice | Why |
| --- | --- | --- |
| Aggregate, value object, domain policy | Real object, constructed directly | No behavior to simulate and the state is the contract |
| Application owned port with real logic | Hand-written fake implementing the port | Faster, clearer failures, no stub bookkeeping |
| Repository whose query is the behavior | Real repository on a container | The query, mapping, and constraints are what must be proven |
| Repository used only to satisfy a call | Fake repository with a seeded map | A mock forces argument matching for data you already have |
| Outbound HTTP client | Mock with a stubbed response, or a stub server | Response shape and status mapping are the boundary contract |
| Vendor SDK client | Mock | You do not own the implementation |
| Message broker or scheduler | Fake port, or a real container for offsets and redelivery | Delivery semantics are not mockable |
| Whole application context | Slice test, not a set of mocks | A slice proves the layer and its own wiring only |

## Wiring doubles into a Spring test

```java
package com.acme.billing.checkout;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@SpringBootTest
class CheckoutFlowTest {

    @MockitoBean
    private PaymentGateway gateway;

    @Autowired
    private CheckoutService checkout;

    @Test
    void capturesTheAuthorizedAmount() {
        given(gateway.authorize(any(AuthorizationRequest.class))).willReturn(Authorization.approved(9_900L));

        var receipt = checkout.place(new CheckoutRequest(9_900L, "card"));

        assertThat(receipt.status()).isEqualTo(ReceiptStatus.AUTHORIZED);
        verify(gateway).authorize(any(AuthorizationRequest.class));
    }
}
```

`@MockitoBean` defaults to `MockReset.AFTER` per test method and requires Boot 3.4 or newer. It resolves what to mock from the field declaration, so an interface field with several candidate beans needs `name` or an explicit `classes` attribute. Use `enforceOverride = false` only when a bean legitimately must stay replaceable, never to silence a context failure.

## when versus doReturn

| Situation | Mechanism | Reason |
| --- | --- | --- |
| Plain mock | `given(x.f(y)).willReturn(z)` or `when(x.f(y)).thenReturn(z)` | Reads top down and never calls the real method |
| Spy or partially mocked type | `doReturn(z).when(spy).f(y)` | `when(spy.f(y))` executes the real method while building the stub |
| Void method | `doThrow(e).when(spy).send(msg)` | `when` cannot stub a void return |
| Value that depends on the argument | `thenAnswer(invocation -> ...)` | A fixed value cannot express a rule |

## Verification rules

| Rule | Detail |
| --- | --- |
| Matchers are all or nothing | Once one argument uses a matcher, wrap every argument in one |
| `any()` matches null | Use `isNull()` or `eq(null)` when null is a meaningful case |
| Captor with repeated calls | `verify(x, times(2)).f(captor.capture())`, then assert `captor.getAllValues()` with AssertJ |
| `verifyNoMoreInteractions` | Omit unless the test already asserts the full outcome; it breaks on harmless logging |
| Verifying private methods | Never. Extract a collaborator and verify that |

Static mocking uses `try (var clock = mockStatic(Clock.class))` and is active only on the thread that created it, so it breaks concurrent execution and must never hide a missing injection point. Mockito 5 ships the inline mock maker by default: remove `mockito-inline` and any `MockMaker` resource file.

## Fakes over mocks

| Property | Fake | Mock |
| --- | --- | --- |
| Scope | Replaces a whole port | Replaces one call site |
| Setup | Default behavior in real code, overridden per test | One stub per path the subject takes |
| Failure message | A stack trace inside the fake | A `WrongTypeOfReturnValue` or an unexpected call |
| Survival under refactoring | High | Drops every time the collaborator signature changes |
| Spring on the classpath | Must not need any | Not applicable |

A fake next to the interface it implements, in one file, with no annotations, usually costs less than the stub bookkeeping it removes.

## Reference routing

| Task | Load |
| --- | --- |
| Choose between a mock, a fake, a real object, and a slice, or remove an over-mocked test | [mocking-strategy.md](references/mocking-strategy.md) |
| Implement `@MockitoBean` wiring, matchers, captors, verification, spies, or static mocking | [mockito-mechanics.md](references/mockito-mechanics.md) |

## Expected response

- **Double decision:** for each collaborator, the chosen kind and the reason a mock, a fake, or the real object is honest there.
- **Override wiring:** the `@MockitoBean` or `@MockitoSpyBean` fields, reset policy, and why no legacy `@MockBean` remains.
- **Stubs and verification:** the stubbed surface, the assertion path, and any interaction removed as noise.
- **Strictness:** every `lenient()` use justified, plus any unused stub or matcher mismatch to fix rather than silence.
- **Escape hatches and coverage gap:** static mocks, deep stubs, or captors with their cost, and the behavior a double cannot prove.
