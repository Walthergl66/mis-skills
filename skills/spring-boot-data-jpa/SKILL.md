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

- Repository interfaces, method names, `JpaRepository` inheritance, and a `LazyInitializationException` or N+1 log.
- The choice between join fetch, `@EntityGraph`, a fetch graph, and a projection, or a page count that explodes on deep offsets.
- Placing `@Transactional`, choosing propagation, auditing metadata, or picking JPA versus `JdbcClient` versus jOOQ per read and write.

## When not to use

- Index design, dialect features, JSON columns, and server tuning belong to `spring-boot-postgresql`.
- Second-level cache, batch fetching, and statement inspection belong to `spring-boot-hibernate`.
- Reading `pg_stat_statements` and fixing a measured slow query belongs to `spring-boot-query-optimization`.
- Migration files belong to `spring-boot-flyway`; aggregate boundaries and repository placement belong to `spring-boot-ddd` and `spring-boot-clean-architecture`.

## Ownership and sibling boundaries

This skill owns repository design, transaction demarcation, fetch plans, pagination, and locking.

- `spring-boot-postgresql` owns SQL dialect and schema capabilities. Hand it DDL types, indexes, and vendor features.
- `spring-boot-hibernate` owns engine internals and `spring-boot-query-optimization` owns slow-statement diagnosis. Hand them batch size, fetch modes, second-level cache, the plan, and the timings.
- `spring-boot-flyway`, `spring-boot-ddd`, and `spring-boot-clean-architecture` own migrations, the model, and layering. Hand them every schema change, entity identity, and interface placement.

## Hard rules

1. **One repository per aggregate root, not per entity or table,** and never expose `JpaRepository` to the application layer: it depends on a narrow interface that lists the operations it needs.
2. **`open-in-view` is off.** Set `spring.jpa.open-in-view: false` so a lazy load cannot fire during serialization.
3. **One transaction boundary per use case**, on the public entry point an outside caller invokes. Not on every method.
4. **Self-invocation bypasses the proxy,** so the annotation is silently inert. **No lazy loading in a query mapped to a response, and never return an entity to the transport layer:** choose the fetch plan, then map to a record inside the transaction.
5. **Bound every query result.** `Pageable` with a hard maximum, or a keyset cursor for large sequential scans.

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
| Derive method names from business vocabulary, and use custom JPQL only when derivation cannot express the query | Column names leak the schema, and a JPQL string loses compile-time checking and entity-graph control |
| Return `Optional` for one, `List` for many, `Page` or `Slice` for bounded lists, never an unbounded `findAll()` | The return type documents the cardinality contract, and an unbounded read is an outage waiting for enough data |
| Never a `Map` or `List<Object[]>` across a layer boundary | Map it to a record inside the persistence adapter |

## Where the transaction boundary belongs

```java
@Service
public class OrderApplicationService {

    private final OrderRepository orders;

    @Transactional
    public OrderPlaced place(PlaceOrderCommand command) {
        return orders.save(Order.from(command)).place();
    }

    // REQUIRES_NEW is a deliberate independent commit, for a different durability requirement only.
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordAuditAsync(UUID orderId) {
        orders.findById(orderId).ifPresent(Order::markAudited);
    }
}
```

| Propagation | Effect | Use when |
| --- | --- | --- |
| `REQUIRED` (default) and `REQUIRES_NEW` | Join the current transaction or start one; suspend the current one and commit independently | The normal case, or a write that must survive a rollback of the caller |
| `MANDATORY`, `NESTED`, `NOT_SUPPORTED` | Fail without a transaction, savepoint, or suspend it | Code that must never run alone, partial rollback, long non-transactional work |

| Rule | Reason |
| --- | --- |
| Put `@Transactional(readOnly = true)` on query entry points | Skips dirty checking and hints a read replica |
| Keep HTTP calls, file IO, and message publishing out of the transaction, and publish events after commit | The connection is held for the whole round trip, and an in-transaction publish is lost on rollback |

Self-invocation remedies, in order of preference: move the method to a second bean, inject the proxy with `@Lazy`, or use `TransactionTemplate`. Never rely on the annotation on an internal call, and never on a manually constructed object.

## N+1 and the four fixes

| Fix | How | Cost and trap |
| --- | --- | --- |
| Join fetch in JPQL | `select distinct o from Order o left join fetch o.lines` | Duplicates rows; two collection fetches raise `MultipleBagFetchException`; ignores `Pageable` |
| `@EntityGraph` on the method | `@EntityGraph(attributePaths = "lines")` | Keeps derivation; only one graph per query; a collection fetch plus paging still degrades to in-memory paging |
| JPA fetch graph | `EntityGraph` plus `query.setHint` | Full control, typed, verbose; must be applied per query |
| Projection | Interface or record projection | Best for reads: only the selected columns, no entity in the persistence context, read-only |

A `LazyInitializationException` once `open-in-view` is off, or one query per row while iterating a `List<Order>` and touching `order.getCustomer()`, both mean the fetch plan is missing. A collection fetch plus `Pageable` degrades to in-memory pagination, so fetch that collection separately.

## Pagination, locking, and bulk updates

| Need | Mechanism | Trap |
| --- | --- | --- |
| Small navigable lists | `Page<T>` for totals, `Slice<T>` without | `OFFSET` cost grows with the offset, and a count query runs on every page |
| Large sequential scans | Keyset cursor with `ScrollPosition` and `Window<T>` | Sort columns must be non-nullable and the total order stable |
| Concurrency on one row | `@Version`, or `@Lock(LockModeType.PESSIMISTIC_WRITE)` | Optimistic throws `OptimisticLockingFailureException` and the caller must retry; pessimistic holds a lock and can deadlock |
| Bulk status change | `@Modifying` with a JPQL update | Bypasses the persistence context, skips entity callbacks and audit listeners |

## JPA, JdbcClient, or jOOQ

| Criterion | JPA | `JdbcClient` | jOOQ |
| --- | --- | --- | --- |
| Writes with invariants, read-heavy joins | Best for writes, costly for joins | Good for reads | Best, type-safe and composable |

Keep writes and invariants in JPA, push wide read-only joins to `JdbcClient` or jOOQ, and never mix the two in one transaction for the same row set.

## Auditing

Annotate the base entity with `@EntityListeners(AuditingEntityListener.class)` and the four fields `@CreatedDate`, `@LastModifiedDate`, `@CreatedBy`, and `@LastModifiedBy`; mark the created fields `updatable = false`, enable it with `@EnableJpaAuditing`, and provide an `AuditorAware<String>`. Use `setDateTimeProvider` only when the clock must be controlled. A `@Modifying` bulk update bypasses these listeners, so set the audit column inside the update statement.

## Reference routing

- Design repository interfaces, place transaction boundaries, or debug self-invocation and rollback: [repositories-and-transactions.md](references/repositories-and-transactions.md)
- Fix N+1, choose a projection, paginate with a cursor, or apply locking and bulk updates: [fetching-and-pagination.md](references/fetching-and-pagination.md)

## Expected response

- **Repository design:** one interface per aggregate, the exact method set the application needs, and what is deliberately not exposed.
- **Transaction boundary:** the public entry point that owns it, propagation chosen, and what must stay outside.
- **Fetch plan:** the fix for each N+1 path, with the mechanism and its known trap.
- **Result bound, concurrency, and engine choice:** page size limit, keyset versus offset, optimistic or pessimistic locking with the retry expectation, JPA versus `JdbcClient` versus jOOQ, and a test that counts executed statements on a production-sized dataset.
