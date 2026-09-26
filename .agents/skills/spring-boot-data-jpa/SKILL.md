---
name: spring-boot-data-jpa
description: 'Use when designing Spring Data JPA repository interfaces, mapping entities and associations, placing @Transactional boundaries, eliminating N+1 selects, adding interface or DTO projections, applying @EntityGraph or join fetch, paginating with Pageable or keyset cursors, locking rows with @Lock or @Version, auditing created and modified fields, or choosing JPA versus JdbcClient versus jOOQ for a read or write. Triggers include JpaRepository, CrudRepository, EntityManager, LazyInitializationException, MultipleBagFetchException, OptimisticLockingFailureException, @Modifying, PageRequest, Slice, open-in-view, and N plus 1. Do not use for SQL dialect tuning, migration files, or slow query diagnosis. When other skills also apply, reconcile ownership before mutation.'
license: MIT
metadata:
  author: Walthergl66
  version: '1.0.0'
---

# Spring Data JPA Repositories, Transactions, and Fetching

Design the repository around the aggregate the application mutates, not around tables. Then place exactly one transaction boundary, one fetch plan, and one pagination strategy per use case. Every default Spring Data offers is correct for a sample application and wrong for a busy one unless you choose it deliberately.

## When to use

- Deciding repository interfaces, method names, and what belongs in `JpaRepository` inheritance.
- A `LazyInitializationException`, an N+1 query log, or a page whose count explodes on deep offsets.
- Choosing join fetch, `@EntityGraph`, a JPA fetch graph, or a projection.
- Placing `@Transactional`, choosing propagation, or debugging a rollback that did not happen.
- Updating rows in bulk with `@Modifying`, or a lost update under concurrency.
- Auditing creation and modification metadata.
- Deciding whether a read or write belongs in JPA, `JdbcClient`, or jOOQ.

## When not to use

- Index design, dialect features, JSON columns, and server tuning belong to `spring-boot-postgresql`.
- Second-level cache, batch fetching, and statement inspection belong to `spring-boot-hibernate`.
- Reading `pg_stat_statements` and fixing a measured slow query belongs to `spring-boot-query-optimization`.
- Migration files and schema history belong to `spring-boot-flyway`.
- Aggregate boundaries and invariant placement belong to `spring-boot-ddd`.
- Repository placement inside the layer tree belongs to `spring-boot-clean-architecture`.

## Ownership and sibling boundaries

This skill owns repository design, transaction demarcation, fetch plans, projections, pagination, and locking at the repository level.

- `spring-boot-postgresql` owns SQL dialect and schema capabilities. Hand it DDL types, indexes, and vendor features.
- `spring-boot-hibernate` owns engine internals. Hand it batch size, fetch modes, and second-level cache.
- `spring-boot-query-optimization` owns diagnosis of slow statements. Hand it the plan, the timings, and the parameters.
- `spring-boot-flyway` owns migration authoring and execution. Hand it every schema change you need.
- `spring-boot-ddd` owns the model. Hand it entity identity, aggregate rules, and lifecycle meaning.
- `spring-boot-clean-architecture` owns layering. Hand it where the repository interface and the JPA implementation live.

## Hard rules

1. **One repository per aggregate root, not per entity or table.** A child entity is loaded through its root.
2. **Never expose `JpaRepository` to the application layer.** Application code depends on a narrow interface that lists the operations it needs.
3. **`open-in-view` is off.** Set `spring.jpa.open-in-view: false` so a lazy load cannot fire during serialization.
4. **One transaction boundary per use case**, on the public entry point an outside caller invokes. Not on every method.
5. **Self-invocation bypasses the proxy.** An internal call never passes through the transactional or `@Validated` proxy, so the annotation is silently inert.
6. **No lazy loading in a read-only query that will be mapped to a response.** Choose the fetch plan or a projection.
7. **Never return an entity to the transport layer.** Map to a record inside the transaction.
8. **Bound every query result.** `Pageable` with a hard maximum, or a keyset cursor for large sequential scans.

```yaml
spring:
  jpa:
    open-in-view: false
    properties:
      hibernate:
        default_batch_fetch_size: 32
```

## Repository shape per aggregate

```java
package com.acme.billing.order;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OrderRepository extends JpaRepository<Order, UUID> {

    Optional<Order> findByReference(String reference);

    List<Order> findByCustomerIdAndStatusOrderByPlacedAtDesc(UUID customerId, OrderStatus status);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Order o set o.status = :status, o.updatedAt = :updatedAt where o.id = :id")
    int updateStatus(@Param("id") UUID id, @Param("status") OrderStatus status, @Param("updatedAt") Instant updatedAt);
}
```

| Rule | Reason |
| --- | --- |
| Derive method names from business vocabulary | A repository that leaks column names becomes a schema mirror |
| Custom JPQL only when derivation cannot express the query | A JPQL string loses compile-time checking and entity-graph control |
| Return `Optional` for one, `List` for many, `Page` or `Slice` for bounded lists | The return type documents the cardinality contract |
| Never `findAll()` without a bound in a request path | An unbounded read is an outage waiting for enough data |
| Never a `Map` or `List<Object[]>` across a layer boundary | Map it to a record inside the persistence adapter |

## Where the transaction boundary belongs

```java
package com.acme.billing.order;

import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OrderApplicationService {

    private final OrderRepository orders;

    OrderApplicationService(OrderRepository orders) {
        this.orders = orders;
    }

    @Transactional
    public OrderPlaced place(PlaceOrderCommand command) {
        return placeInTransaction(command);
    }

    private OrderPlaced placeInTransaction(PlaceOrderCommand command) {
        // A private call is still the same transaction because the public entry point owns it.
        return orders.save(Order.from(command)).place();
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public void recordAuditAsync(UUID orderId) {
        // A deliberate independent commit; use sparingly and only for a different durability requirement.
        orders.findById(orderId).ifPresent(order -> order.markAudited());
    }
}
```

| Propagation | Effect | Use when |
| --- | --- | --- |
| `REQUIRED` (default) | Join the current transaction, or start one | The normal case |
| `REQUIRES_NEW` | Suspend the current one and commit independently | The write must survive a rollback of the caller |
| `SUPPORTS` | Join if present, otherwise run non-transactionally | Read-only helpers |
| `MANDATORY` | Fail unless a transaction exists | Code that must never run alone |
| `NESTED` | Savepoint inside the current transaction | Partial rollback on a shared connection, driver dependent |
| `NOT_SUPPORTED` | Suspend the current transaction | Long non-transactional work |

| Rule | Reason |
| --- | --- |
| Put `@Transactional(readOnly = true)` on query entry points | Skips dirty checking and hints a read replica. |
| Keep HTTP calls, file IO, and message publishing out of the transaction | The connection is held for the whole external round trip. |
| Publish domain events after commit | An in-transaction publish is lost on rollback. |
| Re-throw or translate checked exceptions | A swallowed exception commits partial work. |
| Expect a proxy, not a `new` | A manually constructed object has no transactional behavior. |

Self-invocation remedies, in order of preference: move the method to a second bean, inject the proxy with `@Lazy`, or use `TransactionTemplate` for an explicit programmatic boundary. Never rely on the annotation on an internal call.

## N+1 and the four fixes

| Fix | How | Cost and trap |
| --- | --- | --- |
| Join fetch in JPQL | `select distinct o from Order o left join fetch o.lines` | Duplicates rows; two collection fetches raise `MultipleBagFetchException`; ignores `Pageable` for the second collection |
| `@EntityGraph` on the method | `@EntityGraph(attributePaths = "lines")` | Keeps derivation; only one graph per query; a collection fetch plus paging still degrades to in-memory paging |
| JPA fetch graph | `EntityGraph` plus `query.setHint` | Full control, typed, verbose; must be applied per query |
| Projection | Interface or record projection | Best for reads: only the selected columns, no entity in the persistence context, read-only |

| Cause | Symptom | Fix |
| --- | --- | --- |
| Accessing a lazy association while serializing | `LazyInitializationException` once `open-in-view` is off | Fetch plan or projection |
| Iterating a `List<Order>` and touching `order.getCustomer()` | One query per row in the log | `@EntityGraph` on the query |
| Collection fetch plus `Pageable` | In-memory pagination, wrong counts | Fetch the collection separately or project it |
| `@ElementCollection` or a `@OneToMany` bag | `MultipleBagFetchException` | Convert one side to a `Set` or fetch separately |

## Pagination, locking, and bulk updates

| Need | Mechanism | Trap |
| --- | --- | --- |
| Small navigable lists with totals | `Pageable` plus `Page<T>` | `OFFSET` cost grows with the offset, and a count query runs on every page |
| No totals needed | `Slice<T>` | Still offset-based, still deep-offset cost |
| Large sequential scans | Keyset cursor with `ScrollPosition` and `Window<T>` | Sort columns must be non-nullable; a stable total order is mandatory |
| Concurrency control on one row | `@Version` for optimistic locking | Throws `OptimisticLockingFailureException`; the caller must retry |
| Exclusive row access | `@Lock(LockModeType.PESSIMISTIC_WRITE)` | Holds a database lock for the transaction duration; can deadlock |
| Bulk status or flag change | `@Modifying` with a JPQL update | Bypasses the persistence context and skips entity callbacks |
| Repeatable count | `countQuery` on a `@Query` | The count must not join the fetched collection |

## JPA, JdbcClient, or jOOQ

| Criterion | JPA | `JdbcClient` | jOOQ |
| --- | --- | --- | --- |
| Write with invariants and generated identifiers | Best | Acceptable, hand-mapped | Acceptable, hand-mapped |
| Read of a few rows with a known shape | Viable, but hydrate entities | Best, one query, no proxies | Best |
| Read-heavy reporting and joins | Costly | Good | Best, type-safe and composable |
| Change detection and dirty checking | Automatic | Manual SQL | Manual SQL |
| Query correctness at compile time | No, JPQL and HQL are strings | No, SQL strings | Yes, generated schema classes |
| Batch loading without N+1 | Needs an explicit plan | Impossible to forget | Impossible to forget |
| Cost to add to a service | Already present | Small, one starter | Build-time codegen and a schema dependency |

Rule: keep writes and anything with invariants in JPA, push wide read-only joins to `JdbcClient` or jOOQ, and never mix the two inside a single transaction for the same row set.

## Auditing

```java
package com.acme.billing.order;

import java.time.Instant;
import jakarta.persistence.Column;
import jakarta.persistence.EntityListeners;
import org.springframework.data.annotation.CreatedBy;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedBy;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

@EntityListeners(AuditingEntityListener.class)
public abstract class AuditedEntity {

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @CreatedBy
    @Column(name = "created_by", updatable = false)
    private String createdBy;

    @LastModifiedBy
    @Column(name = "updated_by")
    private String updatedBy;
}
```

Enable with `@EnableJpaAuditing` and provide an `AuditorAware<String>`; use `setDateTimeProvider` only if the clock must be controlled. A `@Modifying` bulk update bypasses these listeners, so set the audit column inside the update statement.

## Reference routing

| Task | Load |
| --- | --- |
| Design repository interfaces, place transaction boundaries, or debug self-invocation and rollback | [repositories-and-transactions.md](references/repositories-and-transactions.md) |
| Fix N+1, choose a projection, paginate with a cursor, or apply locking and bulk updates | [fetching-and-pagination.md](references/fetching-and-pagination.md) |

## Expected response

- **Repository design:** one interface per aggregate, the exact method set the application needs, and what is deliberately not exposed.
- **Transaction boundary:** the public entry point that owns it, propagation chosen, and what must stay outside.
- **Fetch plan:** the fix for each N+1 path, with the chosen mechanism and its known trap.
- **Result bound:** page size limit, count or no count, and keyset versus offset with the reason.
- **Concurrency:** optimistic or pessimistic, retry expectation, and deadlock exposure.
- **Engine choice:** JPA, `JdbcClient`, or jOOQ per read and write, with the specific trade-off.
- **Verification:** a test that counts executed statements, plus a plan check on a production-sized dataset.
