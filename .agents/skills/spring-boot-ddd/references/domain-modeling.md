# Domain Modelling

Load this when writing entities, value objects, domain services, factories, or specifications, or when deciding which of them a rule belongs to.

## Entity or value object

Run the test: does the concept have identity that survives a change of its attributes? Yes means entity. No means value object.

| Concept | Identity | Decision |
| --- | --- | --- |
| `Order` | has an order number that stays the same if the total changes | entity, equality by id |
| `OrderLine` | no identity outside its position in the order | value object, equality by fields |
| `Money` | none | value object |
| `Customer` | has a customer number | entity |
| `Address` | none, it is a set of fields | value object |
| `Email` | none | value object |

## Identity as a value object

```java
package com.example.ordering.domain;

import java.util.UUID;

public record OrderId(UUID value) {

    public OrderId {
        if (value == null) {
            throw new IllegalArgumentException("order id is required");
        }
    }

    public static OrderId newId() {
        return new OrderId(UUID.randomUUID());
    }

    @Override
    public String toString() {
        return "OrderId[" + value + "]";
    }
}
```

A typed id prevents passing a `CustomerId` where an `OrderId` is expected, and it lets the persistence adapter embed the id without the domain knowing about the table. Do not put behaviour in the id; an id that validates the aggregate is an aggregate.

## A complete value object

```java
package com.example.pricing.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Currency;
import java.util.Objects;

public final class Money {
    private final BigDecimal amount;
    private final Currency currency;

    private Money(BigDecimal amount, Currency currency) {
        this.amount = amount.setScale(currency.getDefaultFractionDigits(), RoundingMode.HALF_EVEN);
        this.currency = currency;
    }

    public static Money of(BigDecimal amount, String currencyCode) {
        Objects.requireNonNull(amount, "amount");
        if (amount.signum() < 0) {
            throw new IllegalArgumentException("amount must not be negative");
        }
        return new Money(amount, Currency.getInstance(currencyCode));
    }

    public static Money zero(String currencyCode) {
        return of(BigDecimal.ZERO, currencyCode);
    }

    public Money plus(Money other) {
        if (!currency.equals(other.currency)) {
            throw new IllegalArgumentException("cannot add " + other.currency + " to " + currency);
        }
        return new Money(amount.add(other.amount), currency);
    }

    public Money multipliedBy(BigDecimal factor) {
        return new Money(amount.multiply(factor), currency);
    }

    public BigDecimal amount() {
        return amount;
    }

    public Currency currency() {
        return currency;
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof Money money
                && amount.compareTo(money.amount) == 0
                && currency.equals(money.currency);
    }

    @Override
    public int hashCode() {
        return Objects.hash(amount.stripTrailingZeros(), currency);
    }

    @Override
    public String toString() {
        return amount + " " + currency;
    }
}
```

Prefer `record` unless you need this control. Rounding in the constructor, currency validation, and a deliberate `equals` that ignores scale are all reasons to write the class by hand.

## Specification pattern

```java
package com.example.ordering.domain;

import java.time.LocalDate;
import java.util.List;

public interface OrderSpecification {
    boolean isSatisfiedBy(Order order);

    default List<Order> filter(List<Order> orders) {
        return orders.stream().filter(this::isSatisfiedBy).toList();
    }
}

public record OverdueOrders(LocalDate today) implements OrderSpecification {
    @Override
    public boolean isSatisfiedBy(Order order) {
        return !order.status().isTerminal() && order.dueDate().isBefore(today);
    }
}
```

A domain specification is a named, composable rule. It is not a substitute for a method on the aggregate, and it must not become a home for rules the aggregate already owns.

## Domain service

```java
package com.example.pricing.domain;

import java.util.List;

public final class PricingService {
    private final TaxPolicy taxPolicy;
    private final DiscountPolicy discountPolicy;

    public PricingService(TaxPolicy taxPolicy, DiscountPolicy discountPolicy) {
        this.taxPolicy = taxPolicy;
        this.discountPolicy = discountPolicy;
    }

    public Money price(Order order) {
        Money gross = gross(order);
        Money discounted = discountPolicy.apply(gross, order);
        return taxPolicy.apply(discounted, order);
    }

    private Money gross(Order order) {
        Money total = Money.zero("EUR");
        for (OrderLine line : order.lines()) {
            total = total.plus(line.lineTotal());
        }
        return total;
    }
}
```

A domain service is justified when the rule needs data from more than one aggregate, when the same calculation is shared by several use cases, or when the rule is pure policy with no state of its own. It is not justified as a place to dump orchestration that belongs to a use case.

## Entity factory versus constructor

| Situation | Use |
| --- | --- |
| The caller supplies no state that matters | a static factory such as `Order.place(...)` |
| The aggregate is being loaded from storage | a rehydration factory such as `Order.restore(...)` |
| Construction requires several ordered steps | a private constructor plus a factory that validates first |
| Construction is genuinely just field assignment | a plain constructor is fine |

Keep the constructor private when the invariants are non-trivial. A public constructor is a public invitation to build an invalid object.

## Modelling decision table

| The rule needs... | Put it in | Not in |
| --- | --- | --- |
| only the aggregate own state | the aggregate | a service |
| two aggregates, one decision | a domain service | either aggregate |
| a clock, a calendar, or an external rate | a domain service with that dependency injected | a static call to `LocalDate.now()` |
| a list to filter | a specification, or a method on the aggregate | a repository |
| nothing but the request payload | the adapter request record | the domain |
| an identity to allocate | an id factory or a domain event handler | `UUID.randomUUID()` inline in a service |

## Avoiding the anemic model

The version below is the anti-pattern: a service owns the transaction, the load, and the save, while the aggregate only holds data.

```java
@Service
@Transactional
public class OrderApplicationService {
    private final OrderRepository orders;
    public OrderApplicationService(OrderRepository orders) {
        this.orders = orders;
    }

    public void cancel(UUID orderId) {
        Order order = orders.findById(new OrderId(orderId)).orElseThrow();
        order.cancel();
        orders.save(order);
    }
}
```

The bad version of this is a service that loads the aggregate twice, re-derives nothing, and trusts the caller not to have already cancelled. The fix is the aggregate method plus a single load and save, as in `references/aggregates-and-invariants.md`.
