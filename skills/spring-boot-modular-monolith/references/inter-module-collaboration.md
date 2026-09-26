# Inter-Module Collaboration

Load this when choosing between a direct call and a module event, reasoning about transaction consequences, or setting up an outbox between modules.

## Choose the mechanism

| Situation | Mechanism | Failure semantics |
| --- | --- | --- |
| The caller needs the result and cannot proceed without it | direct call through a named interface | an exception aborts the caller transaction |
| The caller needs the result but a failure has a fallback | direct call with a caught exception and a default | the caller decides |
| The caller does not need the result and a failure is tolerable | module event | the listener runs after commit and its failure does not roll back |
| The event must be retried until it succeeds | transactional event log with completion registration | the registry retries on the next run |
| The event must leave the deployment | outbox plus a broker | at-least-once, consumer dedupes |

The default is a direct call. Events are the exception, and an event used to avoid a required dependency is a hidden coupling.

## Direct call across a module boundary

```java
package com.example.shop.orders.internal;

import com.example.shop.inventory.api.StockAvailability;
import com.example.shop.orders.domain.CustomerId;
import com.example.shop.orders.domain.Order;
import com.example.shop.orders.domain.OrderRepository;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class OrderManagementService {
    private final OrderRepository orders;
    private final StockAvailability stock;

    OrderManagementService(OrderRepository orders, StockAvailability stock) {
        this.orders = orders;
        this.stock = stock;
    }

    @Transactional
    public UUID place(CustomerId customerId, List<OrderLine> lines) {
        for (OrderLine line : lines) {
            stock.reserve(line.sku(), line.quantity());
        }
        Order order = Order.place(customerId, lines);
        orders.save(order);
        return order.id().value();
    }
}
```

Both calls are in one transaction, so a failed reservation rolls back the order. That is correct when the reservation is part of the same business decision, and wrong when the reservation belongs to a different bounded context with its own lifecycle.

## Module event across a module boundary

```java
package com.example.shop.orders.internal;

import com.example.shop.orders.api.OrderPlaced;
import com.example.shop.orders.domain.CustomerId;
import com.example.shop.orders.domain.Order;
import com.example.shop.orders.domain.OrderRepository;
import java.util.List;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class OrderPlacementService {
    private final OrderRepository orders;
    private final ApplicationEventPublisher events;

    OrderPlacementService(OrderRepository orders, ApplicationEventPublisher events) {
        this.orders = orders;
        this.events = events;
    }

    @Transactional
    public UUID place(CustomerId customerId, List<OrderLine> lines) {
        Order order = Order.place(customerId, lines);
        orders.save(order);
        events.publishEvent(new OrderPlaced(order.id().value(), order.customerId().value()));
        return order.id().value();
    }
}
```

```java
package com.example.shop.inventory.internal;

import com.example.shop.orders.api.OrderPlaced;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Service;

@Service
class StockReservationHandler {
    private final ReservationService reservations;

    StockReservationHandler(ReservationService reservations) {
        this.reservations = reservations;
    }

    @ApplicationModuleListener
    void on(OrderPlaced event) {
        reservations.commitFor(event.orderId());
    }
}
```

`@ApplicationModuleListener` runs the listener after the publishing transaction commits and registers completion, so a failure is retried on a later run instead of being lost. The listener runs in its own transaction; a partial failure there cannot roll back the order, which is the trade for decoupling.

## Transaction consequence table

| Publisher | Listener | Effect of a listener failure |
| --- | --- | --- |
| `@EventListener` | synchronous, same thread | propagates and rolls back the publisher transaction |
| `@TransactionalEventListener`, default `AFTER_COMMIT` | after commit, no rollback possible | recorded, not retried unless the registry is used |
| `@TransactionalEventListener`, `BEFORE_COMMIT` | inside the transaction, before commit | rolls back the publisher |
| `@ApplicationModuleListener` | after commit, transactional, registered | retried, and the gap is recorded for diagnostics |
| Outbox relay | separate process | retried with backoff, dead letter after a limit |

## Transactional event log

```yaml
spring:
  modulith:
    events:
      completion-mode: update
      republish-outstanding-events-on-restart: true
      jdbc:
        schema: modulith
```

The registry needs its own `event_publication` table. Create it with Flyway and use the DDL from the Spring Modulith reference for your database, then point `spring.modulith.events.jdbc.schema` at the schema that holds it. In the default `update` mode completed rows stay in the table, so purge them on a schedule or switch to `completion-mode: delete`. Republishing on restart is off in multi-instance deployments, where one instance may still be processing an event.

| Decision | Consequence |
| --- | --- |
| Keep the default in-memory registry | events are lost on restart, acceptable only for development |
| Use the JDBC or JPA store | events survive a restart and are retried |
| Republish outstanding events on restart | recovers a listener that was broken by a previous deployment |

## Outbox between modules

```sql
CREATE TABLE order_event_outbox (
    id           UUID PRIMARY KEY,
    module       TEXT        NOT NULL,
    event_type   TEXT        NOT NULL,
    payload      JSONB       NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ
);

CREATE INDEX idx_order_event_outbox_pending ON order_event_outbox (created_at)
    WHERE published_at IS NULL;
```

Write the row in the same transaction as the aggregate change, then let a relay publish it. The relay must be idempotent and consumers must deduplicate on `id`, because at-least-once delivery means a duplicate is normal, not exceptional.

## Collaboration review checklist

- [ ] Is every cross-module call either a declared named-interface dependency or a published event?
- [ ] Does a required result come from a direct call rather than an event the caller cannot wait for?
- [ ] Is the failure semantics written down for each collaboration?
- [ ] Does an event listener use `@ApplicationModuleListener` when it must be retried?
- [ ] Is the event log backed by a durable store outside development?
- [ ] Do consumers deduplicate on the event id?
- [ ] Does any module reach into another module database directly?
