# Testing Through Ports

Load this when replacing a port with a test double, choosing between a fake and a mock, or writing a contract test for an adapter.

## Fake or mock

| Question | If yes |
| --- | --- |
| Does the dependency hold state the test asserts on, such as recorded calls or balances | write a fake |
| Does the dependency make a decision the test must control, such as decline or timeout | write a stub with a settable outcome |
| Is the collaborator a collaborator with no behaviour of its own | a mock with verification is fine |
| Would the test then assert only that a mock was called | the test proves nothing, delete the assertion |
| Is the port used by many tests with the same shape | one shared fake, not a new mock per test |

A fake is a working in-memory implementation. A mock is a generated shell. Reach for the fake first, because a fake cannot drift from the port contract: adding a method to the port breaks its compilation.

## The in-memory adapter

```java
package com.example.ordering.adapter.out.payment;

import com.example.ordering.application.port.PaymentGateway;
import com.example.ordering.domain.Money;
import com.example.ordering.domain.OrderId;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public final class FakePaymentGateway implements PaymentGateway {
    private final List<Money> captured = new ArrayList<>();
    private PaymentOutcome outcome = PaymentOutcome.CAPTURED;

    @Override
    public PaymentOutcome capture(OrderId orderId, Money amount) {
        captured.add(amount);
        return outcome;
    }

    @Override
    public RefundOutcome refund(OrderId orderId, Money amount, String vendorReference) {
        captured.remove(amount);
        return RefundOutcome.REFUNDED;
    }

    public void failWith(PaymentOutcome outcome) {
        this.outcome = outcome;
    }

    public List<Money> captured() {
        return List.copyOf(captured);
    }

    public Money totalCaptured() {
        return captured.stream().reduce(Money.zero("EUR"), Money::plus);
    }
}
```

Keep the fake in `src/test/java` under a package that mirrors the port, not in `main`, unless several modules share it deliberately. A fake in `main` will be discovered by component scanning if it is annotated, and shipped to production.

## Testing a use case with a fake

```java
package com.example.ordering.application;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.ordering.adapter.out.payment.FakePaymentGateway;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class SettleOrderServiceTest {

    private final FakePaymentGateway gateway = new FakePaymentGateway();
    private final SettleOrderService service = new SettleOrderService(
            gateway, new InMemoryOrderRepository());

    @Test
    void capturesTheOrderTotal() {
        var result = service.settle(orderId(), Money.of(new BigDecimal("42.50"), "EUR"));

        assertThat(result.status()).isEqualTo("CAPTURED");
        assertThat(gateway.captured()).hasSize(1);
    }

    @Test
    void reportsDeclineWithoutThrowing() {
        gateway.failWith(PaymentGateway.PaymentOutcome.DECLINED);

        var result = service.settle(orderId(), Money.of(new BigDecimal("42.50"), "EUR"));

        assertThat(result.status()).isEqualTo("DECLINED");
    }
}
```

No `@SpringBootTest`, no `@MockBean`, no database. The constructor of the use case is the whole wiring story, which is the practical test of whether the port boundary is real.

## Repository fakes and the state problem

An in-memory repository is only honest for small aggregates. Rules:

- Store the aggregate object, not a row, so the fake returns the same shape as the real adapter.
- Respect optimistic locking expectations, or tests will pass while production fails on conflict. Throw a `VersionConflictException` when the version differs.
- Make uniqueness constraints explicit, because an in-memory `Map` will silently overwrite a duplicate key that PostgreSQL would reject.
- Keep query methods honest: if the real adapter paginates, the fake must too, or tests will never exercise the empty-page path.

```java
package com.example.ordering.adapter.out.persistence;

import com.example.ordering.domain.Order;
import com.example.ordering.domain.OrderId;
import com.example.ordering.domain.OrderRepository;
import com.example.ordering.domain.VersionConflictException;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

public final class InMemoryOrderRepository implements OrderRepository {
    private final Map<UUID, Order> rows = new HashMap<>();

    @Override
    public void save(Order order) {
        Order existing = rows.get(order.id().value());
        if (existing != null && existing.version() != order.version()) {
            throw new VersionConflictException(order.id());
        }
        rows.put(order.id().value(), order);
    }

    @Override
    public Optional<Order> findById(OrderId id) {
        return Optional.ofNullable(rows.get(id.value()));
    }

    public void clear() {
        rows.clear();
    }
}
```

## Contract tests for real adapters

A port that has two implementations needs one test that both must pass, or the fakes drift and the bug appears only in production.

```java
package com.example.ordering.adapter.out.payment;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.ordering.application.port.PaymentGateway;
import com.example.ordering.domain.Money;
import com.example.ordering.domain.OrderId;
import java.math.BigDecimal;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

class PaymentGatewayContractTest {

    static Stream<PaymentGateway> gateways() {
        return Stream.of(new FakePaymentGateway(), new SandboxPaymentGateway());
    }

    @ParameterizedTest
    @MethodSource("gateways")
    void capturesAnAmountInTheRequestedCurrency(PaymentGateway gateway) {
        PaymentGateway.PaymentOutcome outcome = gateway.capture(
                new OrderId(UUID.randomUUID()), Money.of(new BigDecimal("10.00"), "EUR"));

        assertThat(outcome).isEqualTo(PaymentGateway.PaymentOutcome.CAPTURED);
    }
}
```

The sandbox implementation runs against a vendor test account through a profile, so the same assertions cover both. Keep the contract small: one test per port method, focusing on behaviour the application depends on, not on the vendor response schema.

## Vendor adapter tests

| Test type | What it proves | Needs the network |
| --- | --- | --- |
| Unit test with a stubbed vendor client | the mapping code is correct | no |
| WireMock or MockWebServer test | the request shape the vendor receives is right | no |
| Sandbox contract test | the real vendor accepts the payload | yes, in a nightly job |
| Production smoke check | the deployed credentials still work | yes, rarely |

Stub the vendor client at the lowest level available, so the adapter code under test still runs. A test that mocks the adapter itself proves only that the test file compiles.

## Anti-patterns

| Anti-pattern | Why it fails | Fix |
| --- | --- | --- |
| `@MockBean` for every dependency of a use case | The test asserts on mocks, not on behaviour | one fake per edge, assert on the outcome |
| A fake that returns a JPA entity | the port contract is broken and the test hides it | return the domain type |
| A fake that never fails | the error path is never exercised | a settable outcome per method |
| Mocking a static factory or `UUID.randomUUID` | brittle and hides the real value | inject a `Clock` or an id generator port |
| A `@SpringBootTest` for pure use case logic | slow, and a wiring bug masks a logic bug | plain JUnit with `new` |
| A shared mutable fake across tests | order-dependent failures | one fake per test, or reset in a `BeforeEach` |
