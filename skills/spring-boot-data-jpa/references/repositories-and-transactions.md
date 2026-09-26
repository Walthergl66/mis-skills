# Repositories and Transactions

Load this when designing Spring Data repository interfaces, deciding what the application layer may call, placing the transaction boundary, or debugging a transaction that did not start, did not roll back, or started twice.

## Interface design

| Decision | Rule | Reason |
| --- | --- | --- |
| Scope | One interface per aggregate root | A child entity is reachable through its root; per-entity repositories invite illegal writes |
| Exposure | Declare a narrow port and implement it with a Spring Data interface | Keeps `JpaRepository` and `Specification` out of the application layer |
| Derivation | Business vocabulary, not column names | `findByCustomerIdAndStatus` survives a schema rename |
| Extending `JpaRepository` | Only in the persistence adapter | It exposes `save`, `deleteAll`, and `flush` to anything that can see it |
| Custom queries | JPQL for cases derivation cannot express, `countQuery` when the derived count is wrong | HQL is a string, so it needs a test |
| Native SQL | Last resort, behind a named adapter | Dialect specific, no fetch graph, no compile-time check |
| Return types | `Optional`, `List`, `Page`, `Slice`, or a projection | The signature states the cardinality contract |
| Deletes | Derived delete methods, or `deleteById` inside a transaction | `deleteAll` in a request path is a data incident |

```java
package com.acme.billing.order.persistence;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface JpaOrderRepository extends JpaRepository<OrderEntity, UUID> {

    Optional<OrderEntity> findByReference(String reference);

    boolean existsByReference(String reference);

    @Query("""
            select new com.acme.billing.order.OrderSummary(o.reference, o.status, o.total)
            from OrderEntity o
            where o.customerId = :customerId
            """)
    List<OrderSummary> findSummaries(@Param("customerId") UUID customerId);

    @Query(value = """
            select count(*) from orders o
            where o.customer_id = :customerId and o.status = :status
            """, nativeQuery = true)
    long countByCustomerAndStatus(@Param("customerId") UUID customerId, @Param("status") String status);
}
```

## Specification for dynamic filters

```java
package com.acme.billing.order.persistence;

import jakarta.persistence.criteria.Predicate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.domain.Specification;

public final class OrderSpecifications {

    private OrderSpecifications() {
    }

    public static Specification<OrderEntity> forCustomer(UUID customerId) {
        return (root, query, builder) -> builder.equal(root.get("customerId"), customerId);
    }

    public static Specification<OrderEntity> withStatus(List<String> statuses) {
        return (root, query, builder) -> {
            if (statuses == null || statuses.isEmpty()) {
                return builder.conjunction();
            }
            List<Predicate> predicates = new ArrayList<>();
            statuses.forEach(status -> predicates.add(builder.equal(root.get("status"), status)));
            return builder.or(predicates.toArray(Predicate[]::new));
        };
    }
}
```

| Rule | Reason |
| --- | --- |
| Specifications compose with `Specification.allOf` or `Specification.anyOf` | Chaining by hand nests boolean flags |
| Never build a `Specification` from raw user strings | Use typed parameters; the criteria API is not an escape hatch for SQL injection |
| `JpaSpecificationExecutor` belongs to the adapter | It exposes `EntityManager` semantics to callers |
| Every specification must be satisfied by an index | A criteria query that cannot be planned is a table scan |

## Transaction boundary rules

1. `@Transactional` goes on the public method an outside caller invokes, not on every method that touches a repository.
2. Default propagation `REQUIRED` is correct unless a specific durability requirement needs another value.
3. `readOnly = true` on query entry points skips dirty checking and enables read routing.
4. A rollback happens on unchecked exceptions by default. A checked exception commits unless `rollbackFor` names it.
5. External calls, file IO, and broker round trips do not belong inside the transaction; the connection and row locks are held for the whole round trip.
6. Domain events are published after commit, from an outbox row written in the same transaction.
7. Self-invocation bypasses the proxy, so the inner annotation does nothing.

| Symptom | Cause | Remedy |
| --- | --- | --- |
| No transaction where one is expected | Self-invocation, a `new` instance, or a non-proxied final class | Move the call to another bean, or use `TransactionTemplate` |
| `UnexpectedRollbackException` after a caught exception | Inner marked rollback-only, outer still tries to commit | Let the exception propagate, or isolate the inner work with `REQUIRES_NEW` |
| Commit happened although a write failed | Checked exception swallowed, or `rollbackFor` missing | Rethrow, or name the exception class |
| Lazy load outside the transaction | Entity returned past the boundary | Map to a record inside the transaction |
| Connection pool exhausted under load | A transaction spans a slow external call | Shorten the transaction, or move the call out |
| Deadlock on a batch job | Several aggregates locked in inconsistent order | Sort by id before locking, and retry |

## Self-invocation, worked out

```java
package com.acme.billing.order;

import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class OrderService {

    private final OrderRepository orders;
    private final TransactionTemplate transactions;

    OrderService(OrderRepository orders, TransactionTemplate transactions) {
        this.orders = orders;
        this.transactions = transactions;
    }

    // Correct: the caller crosses the proxy, so the boundary exists.
    @Transactional
    public OrderPlaced place(PlaceOrderCommand command) {
        return orders.save(Order.from(command)).place();
    }

    // Programmatic boundary for the case a second bean would only exist to host.
    public void archive(UUID orderId) {
        transactions.executeWithoutResult(status -> orders.findById(orderId).ifPresent(order -> order.archive()));
    }
}
```

`TransactionTemplate` is auto-configured by `TransactionAutoConfiguration`; inject it directly instead of constructing one. It also makes the boundary visible in the code, which is the point.

## Bulk updates

| Rule | Reason |
| --- | --- |
| `@Modifying` methods must run inside a transaction | A bulk statement outside a transaction is committed by the driver in its own way |
| Return `int` or `void`, never the managed entity | The entity was never loaded, so there is nothing to return |
| `flushAutomatically = true` when pending changes must reach the database first | Otherwise the update runs against stale state |
| `clearAutomatically = true` when the same entities are also loaded in the persistence context | Otherwise the context keeps a stale copy that later overwrites the update |
| Set audit columns inside the update statement | Lifecycle listeners do not fire for bulk statements |
| Verify with a statement log, not with a unit test | A bulk update passing in a test can still update zero rows in production |

## Auditing

```java
package com.acme.billing.config;

import java.util.Optional;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.domain.AuditorAware;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

@Configuration
@EnableJpaAuditing(auditorAwareRef = "auditorAware")
public class JpaAuditingConfig {

    @Bean
    AuditorAware<String> auditorAware(CurrentUser currentUser) {
        return () -> Optional.ofNullable(currentUser.id()).or(() -> Optional.of("system"));
    }
}
```

| Rule | Reason |
| --- | --- |
| Resolve the auditor from the security context, not from a thread local of your own | The security context is request-scoped and already correct |
| Keep auditing fields on a mapped superclass | Consistency across aggregates without repeating annotations |
| Treat audit columns as database columns too | Migration and constraints must know about them |
| Do not audit inside bulk updates | Listeners are skipped; set the column in SQL |
