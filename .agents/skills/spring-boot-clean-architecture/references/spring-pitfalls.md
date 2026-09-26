# Spring Pitfalls And Remedies

Load this when a concrete Spring mechanism is already breaking the dependency rule and you need the violation, the reason Spring allows it, and the smallest remedy.

## Why Spring hides the violation

`@ComponentScan` starts at the `@SpringBootApplication` package and registers every `@Component`, `@Service`, `@Repository`, and `@RestController` beneath it. The container draws no ring lines, so an adapter bean and a domain bean are indistinguishable at runtime: layering survives only as a package convention plus a test.

| Mechanism | How it erodes the rule | Guard |
| --- | --- | --- |
| Root `@ComponentScan` | Wires adapters into the same context as use cases | Narrow scanning with explicit `@Import` per adapter |
| `@Entity` on the business class | Domain imports `jakarta.persistence` and inherits the schema | Separate row entity plus a mapper |
| Spring Data repository in the domain | Domain imports `org.springframework.data` | Plain interface in the domain, implemented in the adapter |
| Constructor injection everywhere | Inner code receives adapter classes | Inject ports into use cases, adapter classes only into `config` |
| `@Transactional` on domain methods | Domain tests need a context, transactions leak inward | Annotate only use case entry points |
| `open-in-view` default of true | Lazy load fires during serialization, hiding the leak | Set `spring.jpa.open-in-view: false` |
| `@Configuration` growing | `config` becomes a second domain | Keep `config` free of business decisions |

## Pitfall 1: the annotated service is the domain

```java
package com.example.ordering.service;

import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OrderService {

    private final EntityManager entityManager;

    public OrderService(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    @Transactional
    public void cancel(UUID orderId) {
        OrderRow row = entityManager.find(OrderRow.class, orderId);
        if (row.getStatus() == OrderRowStatus.PLACED) {
            row.setStatus(OrderRowStatus.CANCELLED);
        } else {
            throw new IllegalStateException("cannot cancel");
        }
    }
}
```

What is wrong: the class mixes business rules with persistence mechanics; the rule is enforced by an unnamed exception; the status enum is a persistence enum, so a column rename breaks behaviour; no unit test runs without an `EntityManager`.

Remedy in two moves. First the rule moves into the aggregate:

```java
package com.example.ordering.domain;

public final class Order {
    private final OrderId id;
    private OrderStatus status;

    private Order(OrderId id, OrderStatus status) {
        this.id = id;
        this.status = status;
    }

    public static Order restore(OrderId id, OrderStatus status) {
        return new Order(id, status);
    }

    public void cancel() {
        if (status != OrderStatus.PLACED) {
            throw new OrderCannotBeCancelledException(id, status);
        }
        status = OrderStatus.CANCELLED;
    }

    public OrderId id() {
        return id;
    }

    public OrderStatus status() {
        return status;
    }
}
```

Then the use case owns the transaction and talks to a port:

```java
package com.example.ordering.application;

import com.example.ordering.domain.Order;
import com.example.ordering.domain.OrderRepository;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CancelOrderService {

    private final OrderRepository orders;

    public CancelOrderService(OrderRepository orders) {
        this.orders = orders;
    }

    @Transactional
    public void cancel(UUID orderId) {
        Order order = orders.findById(orderId)
                .orElseThrow(() -> new OrderNotFoundException(orderId));
        order.cancel();
        orders.save(order);
    }
}
```

## Pitfall 2: the port is a framework type

| Symptom | Remedy |
| --- | --- |
| Domain interface extends `JpaRepository` | Declare `OrderRepository` with only the methods the domain calls |
| Domain interface exposes `Page`, `Sort`, `Specification` | Expose intent such as `search(OrderSearch)`; build the `Page` in the adapter |
| Domain interface returns `Optional<OrderRow>` | Return the domain type; mapping happens inside the adapter |
| A method named `saveAndFlush` | Expose `save`; flush control belongs to the transaction manager |

```java
package com.example.ordering.domain;

import java.util.Optional;
import java.util.UUID;

public interface OrderRepository {

    void save(Order order);

    Optional<Order> findById(UUID id);
}
```

The adapter then owns every Spring Data concern:

```java
package com.example.ordering.adapter.out.persistence;

import com.example.ordering.domain.Order;
import com.example.ordering.domain.OrderRepository;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Repository;

@Repository
class JpaOrderRepository implements OrderRepository {

    private final SpringOrderRepository rows;

    JpaOrderRepository(SpringOrderRepository rows) {
        this.rows = rows;
    }

    @Override
    public void save(Order order) {
        rows.save(OrderRowMapper.toRow(order));
    }

    @Override
    public Optional<Order> findById(UUID id) {
        return rows.findById(id).map(OrderRowMapper::toDomain);
    }
}
```

## Pitfall 3: scanning defeats the rings

A wide `@ComponentScan` over `domain`, `application`, `adapter`, and `vendor` registers every bean and destroys the only runtime signal that rings exist.

| Fix | Mechanism |
| --- | --- |
| Remove the wide scan | Keep the `@SpringBootApplication` class at the package root and accept default scanning |
| Bound the JPA infrastructure | `@EnableJpaRepositories(basePackages = "com.example.ordering.adapter.out.persistence")` and `@EntityScan(basePackages = "com.example.ordering.adapter.out.persistence")` |
| Import adapters explicitly | `@Import({OrderController.class, PersistenceAdapters.class})` from a single `config` class |
| Keep the defaults only when safe | No class outside the adapter package carries `@Entity` or extends a Spring Data interface |
| Leave `open-in-view` on | A lazy load during serialization hides a missing mapper | Set the property to `false` and map explicitly |

## Pitfall 4: the transaction is in the wrong place

| Placement | Verdict | Effect |
| --- | --- | --- |
| On the controller | Wrong | The transaction spans JSON serialization and view resolution |
| On every service method | Wrong | Nested proxies with no semantic meaning |
| On the aggregate method | Wrong | The domain needs a proxy, so its unit test needs a context |
| On the use case entry point | Correct | One clear commit point per business operation |
| Nowhere, using `TransactionTemplate` | Correct | Explicit and visible for orchestration-only code |

When a broker publish must be atomic with a write, append the intent to an outbox table inside the transaction and publish after commit:

```java
@Transactional
public void place(PlaceOrderCommand command) {
    Order order = Order.place(command.orderId(), command.customerId(), command.lines());
    orders.save(order);
    outbox.append(OutboxMessage.forAggregate(order.id(), "OrderPlaced"));
}
```

A relay process reads unpublished rows after commit; nothing inside the transaction talks to a broker.

## Diagnostic checklist

1. `grep -rl "jakarta.persistence\|org.springframework" --include=*.java <domain-dir>` returns nothing.
2. `grep -rn "JpaRepository\|CrudRepository" --include=*.java <domain-dir>` returns nothing.
3. `grep -rn "@Transactional" --include=*.java <domain-dir> <adapter-dir>` returns nothing.
4. `grep -rn "OrderRow\|JpaOrderRepository" --include=*.java <application-dir>` returns nothing.
5. The ArchUnit test from `references/layer-mapping.md` passes on a clean checkout, and `open-in-view` is `false` in every profile.
