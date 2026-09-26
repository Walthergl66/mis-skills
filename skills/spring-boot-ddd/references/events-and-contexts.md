# Events And Contexts

Load this when modelling domain events, mapping bounded contexts, or deciding between anti-corruption and plain layering at a context boundary.

## Bounded context map

A context is a boundary of meaning, not a table. The same word may mean different things in two contexts, and the correct answer is two models, not one shared class.

```text
Sales context            Fulfilment context        Billing context
Order                    Shipment                  Invoice
  placedAt                  dispatchedAt               issuedAt
  lineTotal                 carrier                    taxLine
  status: PLACED            status: IN_TRANSIT          status: ISSUED

Sales ──publishes OrderPlaced──▶ Fulfilment ──publishes ShipmentDispatched──▶ Billing
        (own language)                  (own language)                 (own language)
```

| Relationship | Pattern | What it costs |
| --- | --- | --- |
| Same language, same rules | one model, one module | none |
| Same words, different rules | two models, translated at the boundary | a translation function per direction |
| Upstream authoritative | conformist, the downstream uses the upstream model | coupling to the upstream shape |
| Downstream legacy or hostile | anti-corruption layer with its own language | a permanent adapter to maintain |
| Neither owns the data | customer and supplier with an ACL | an integration, two contracts |
| Shared concepts | shared kernel, published and versioned | the highest coupling, use sparingly |

## Domain event, written well

```java
package com.example.ordering.domain;

import com.example.pricing.domain.Money;
import java.util.UUID;

public record OrderPlaced(UUID orderId, UUID customerId, Money total, int lineCount) {

    public OrderPlaced {
        if (lineCount < 1) {
            throw new IllegalArgumentException("a placed order has at least one line");
        }
    }
}
```

| Rule | Reason |
| --- | --- |
| Past tense, a fact, not a command | `OrderPlaced` is true forever; `PlaceOrder` asks someone to act |
| Only values the publisher controls | the consumer cannot demand a new getter on your aggregate |
| No entity, no lazy proxy | an entity reference breaks serialisation and leaks the schema |
| Immutable record | an event is a historical fact and must not change |
| No behaviour beyond validation | logic in an event hides a domain rule that belongs somewhere reachable |
| Reference by id, include what consumers need to act | consumers must not call back into your database |

## Publishing from the application layer

```java
package com.example.ordering.application;

import com.example.ordering.domain.Order;
import com.example.ordering.domain.OrderPlaced;
import com.example.ordering.domain.OrderRepository;
import java.time.Clock;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PlaceOrderService {
    private final OrderRepository orders;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public PlaceOrderService(OrderRepository orders, ApplicationEventPublisher events, Clock clock) {
        this.orders = orders;
        this.events = events;
        this.clock = clock;
    }

    @Transactional
    public UUID place(PlaceOrderCommand command) {
        Order order = Order.place(command.orderId(), command.customerId(), command.lines(), clock.instant());
        orders.save(order);
        events.publishEvent(new OrderPlaced(order.id().value(), order.customerId().value(),
                order.total(), order.lines().size()));
        return order.id().value();
    }
}
```

The domain emits nothing; the application layer publishes. An in-process listener is a convenience, not a delivery guarantee: the transaction may roll back, the listener runs on the publishing thread unless annotated, and a slow listener blocks the transaction.

## Choosing the transport

| Requirement | Mechanism |
| --- | --- |
| Same process, best effort, no durability needed | `ApplicationEventPublisher` with a `@EventListener` |
| Same process, only after a successful commit | `@TransactionalEventListener`, which defaults to `AFTER_COMMIT` |
| Same process, off the request thread | `@ApplicationModuleListener` from Spring Modulith, or a bounded executor |
| Must survive a restart, other services consume it | outbox table plus a relay publishing to a broker |
| Exactly-once semantics | none exists; make consumers idempotent |

`@TransactionalEventListener` defaults to `AFTER_COMMIT`, which runs the listener outside the committed transaction, so a listener failure cannot undo the write and must not be assumed to be retried. Choosing `BEFORE_COMMIT` puts the listener back inside the transaction, where a thrown exception rolls the write back.

## Outbox for events that must not be lost

```sql
CREATE TABLE event_outbox (
    id           UUID PRIMARY KEY,
    aggregate_id UUID        NOT NULL,
    event_type   TEXT        NOT NULL,
    payload      JSONB       NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ
);

CREATE INDEX idx_event_outbox_unpublished ON event_outbox (created_at)
    WHERE published_at IS NULL;
```

A relay polls the unpublished rows, publishes, then sets `published_at`. Consumers deduplicate on `id`. This is the honest answer to "the broker call must be atomic with the write"; delivery guarantees, retries, and dead letters are operational concerns owned by the platform skill.

## Anti-corruption at a context boundary

An ACL translates between two languages at the edge of your model. It belongs where a foreign or hostile model enters, not between your own layers.

| Boundary | Translate? | Reason |
| --- | --- | --- |
| Your adapter to your own domain | no | the adapter is already inside your boundary |
| Vendor SDK to your domain | yes | the vendor model will change and is not yours |
| Another service to your domain | yes, on ingress | their nouns are not your invariants |
| Your domain to another service | yes, on egress | publish a stable contract, not your entity graph |
| Database row to your domain | yes, by a mapper | the schema is not the model |

## Event review checklist

- [ ] Is the name past tense and does it read as a fact, not a command?
- [ ] Does it contain no entity, no proxy, and no lazy association?
- [ ] Does it carry everything a consumer needs, so the consumer never calls back for a read?
- [ ] Is it immutable, with validation in the canonical constructor?
- [ ] If it leaves the process, can it survive a `GenericEventSerializer` round trip?
- [ ] Is the publish atomic with the write, or is that gap documented?
- [ ] Is the consumer idempotent, keyed on the event id?
- [ ] Is the ubiquitous language of the event owned by exactly one context?
