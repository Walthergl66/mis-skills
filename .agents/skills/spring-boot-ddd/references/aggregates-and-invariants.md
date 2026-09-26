# Aggregates And Invariants

Load this when setting aggregate boundaries, deciding where a transaction must stop, or moving a rule from a service into the aggregate that owns the data it needs.

## Finding the boundary

Ask which rules must hold at the same instant, in the same transaction, on data that must be consistent together. Everything reachable from that set of rules belongs to one boundary.

```text
Order aggregate                          Customer aggregate
├── id: OrderId                          ├── id: CustomerId
├── status: OrderStatus                  ├── tier: CustomerTier
├── lines: List<OrderLine>               └── creditLimit: Money
├── placedAt: Instant
└── version: long

Invoices are a separate aggregate: an invoice may be raised after an order
ships, and no rule requires both to change together.
```

## Boundary decision table

| Question | If yes | If no |
| --- | --- | --- |
| Must these facts be valid at the same instant, in one commit? | same aggregate | separate aggregates |
| Does loading one always require loading the other? | same aggregate | separate aggregates |
| Can the second change without the first? | separate aggregates | consider merging |
| Does the rule need a natural key rather than a foreign key? | model it as a value object, not an entity | entity with a reference |
| Is the row count growing without a rule to protect? | probably not an aggregate, just data | model it |

## The aggregate root

```java
package com.example.ordering.domain;

import com.example.pricing.domain.Money;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public final class Order {
    private final OrderId id;
    private final CustomerId customerId;
    private final List<OrderLine> lines = new ArrayList<>();
    private final Instant placedAt;
    private OrderStatus status;
    private long version;

    private Order(OrderId id, CustomerId customerId, Instant placedAt) {
        this.id = id;
        this.customerId = customerId;
        this.placedAt = placedAt;
        this.status = OrderStatus.PLACED;
    }

    public static Order place(OrderId id, CustomerId customerId, List<OrderLine> lines, Instant placedAt) {
        if (lines.isEmpty()) {
            throw new IllegalArgumentException("an order needs at least one line");
        }
        Order order = new Order(id, customerId, placedAt);
        lines.forEach(order::addLine);
        return order;
    }

    public static Order restore(OrderId id, CustomerId customerId, List<OrderLine> lines,
                                Instant placedAt, OrderStatus status, long version) {
        Order order = new Order(id, customerId, placedAt);
        lines.forEach(order::addLine);
        order.status = status;
        order.version = version;
        return order;
    }

    public void cancel() {
        if (status == OrderStatus.SHIPPED || status == OrderStatus.CANCELLED) {
            throw new OrderCannotBeCancelledException(id, status);
        }
        status = OrderStatus.CANCELLED;
    }

    public Money total() {
        Money sum = Money.zero("EUR");
        for (OrderLine line : lines) {
            sum = sum.plus(line.lineTotal());
        }
        return sum;
    }

    private void addLine(OrderLine line) {
        if (status != OrderStatus.PLACED) {
            throw new OrderIsNotEditableException(id, status);
        }
        lines.add(line);
    }

    public OrderId id() {
        return id;
    }

    public CustomerId customerId() {
        return customerId;
    }

    public OrderStatus status() {
        return status;
    }

    public List<OrderLine> lines() {
        return List.copyOf(lines);
    }

    public long version() {
        return version;
    }
}
```

Rules visible in the code: there is no setter, so a caller cannot put the aggregate into an invalid state; `restore` skips the placement rules because the stored state was already valid; and `cancel` is the only way the status becomes `CANCELLED`.

## One aggregate per transaction

```java
package com.example.ordering.application;

import com.example.ordering.domain.Order;
import com.example.ordering.domain.OrderRepository;
import com.example.pricing.domain.Money;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SettleOrderService {
    private final OrderRepository orders;
    private final PricingService pricing;

    public SettleOrderService(OrderRepository orders, PricingService pricing) {
        this.orders = orders;
        this.pricing = pricing;
    }

    @Transactional
    public SettlementResult settle(UUID orderId) {
        Order order = orders.findById(new OrderId(orderId))
                .orElseThrow(() -> new OrderNotFoundException(orderId));
        Money due = pricing.price(order);
        orders.save(order);
        return new SettlementResult(orderId, due, order.status().name());
    }
}
```

The transaction loads one aggregate, computes, and saves. If settling must also write an `Invoice` row, that is a second aggregate in one commit: either a deliberate cross-aggregate transaction with a documented reason, or a domain event plus an outbox and eventual consistency. Decide, do not drift.

## Invariants and where they are checked

| Layer | What it guarantees | Testability |
| --- | --- | --- |
| Aggregate method | the business rule holds for every state the aggregate can reach | plain unit test, no context |
| Value object constructor | the value is well formed, always | plain unit test |
| Request record validation | the transport payload is well formed | slice test |
| Database constraint | the data survives a bug that bypasses the model | integration test only |
| Read projection | nothing; it may be stale | query test |

A rule checked only by a database constraint is a rule with no test and no error message. Keep the constraint as a last line of defence and the aggregate as the real check.

## Optimistic locking inside the boundary

```sql
ALTER TABLE orders ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
```

With `@Version` on the aggregate, a lost update throws `OptimisticLockingFailureException` at flush time. Catch it in the use case and translate it to a conflict response. Never retry the whole use case blindly, because the aggregate may have been invalidated by the concurrent change.

## Anti-patterns

| Anti-pattern | Symptom | Fix |
| --- | --- | --- |
| Setter on the aggregate | a caller can set an invalid status | replace with an intent-named method |
| Aggregate holding an `EntityManager` | the model runs a query inside a getter | pass the data in, or accept a specification object |
| Aggregate referencing another aggregate object | accidental lazy loading, infinite graphs | reference by id |
| One aggregate per table | a table is not a boundary | group by the rules that must hold together |
| Bidirectional associations everywhere | cascade surprises on delete | unidirectional from root to child |
| `equals` on all fields of an entity | a collection loses the entity when a field changes | identity equality for entities, value equality for value objects |
| Repository returning rows | rules must be re-checked by every caller | repository returns the aggregate |
