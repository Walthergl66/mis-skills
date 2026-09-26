# Fetching, Projections, Pagination, and Locking

Load this when a query issues more statements than expected, a lazy load fails, a page slows down as it deepens, or two writers overwrite each other.

## Diagnose the statement count

1. Log SQL with the statement inspector that includes the identifier of the entity or query, not just the statement text.
2. Assert statement counts in a test around the service, not around the repository. A repository test hides the loop that triggers the extra selects.
3. Count statements for a list of ten and for a list of one hundred. A linear increase means a per-row access on an association.
4. Read the plan for the actual query, not for a guess. Hand the slow plan to `spring-boot-query-optimization`.

```yaml
spring:
  jpa:
    properties:
      hibernate:
        format_sql: true
        generate_statistics: true
```

## The four fixes

| Mechanism | Query | Entity in context | Notes |
| --- | --- | --- | --- |
| Join fetch | `select distinct o from Order o left join fetch o.lines where o.customer.id = :id` | Yes, managed | Two collection fetches in one query raise `MultipleBagFetchException` |
| `@EntityGraph` | `@EntityGraph(attributePaths = { "lines", "customer" }) List<Order> findByCustomerId(UUID id)` | Yes, managed | Works with derived queries; a collection fetch still disables SQL pagination |
| JPA fetch graph | `EntityGraph<Order> graph = em.createEntityGraph(Order.class); graph.addAttributeNodes("lines"); em.createQuery(...).setHint("jakarta.persistence.fetchgraph", graph)` | Yes, managed | Full control per query; verbose and easy to get wrong under refactoring |
| Projection | `List<OrderSummary> findByCustomerId(UUID customerId)` with an interface or record projection | No | Read-only, no proxies, only the selected columns, safest for read paths |

```java
package com.acme.billing.order;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OrderQueryRepository extends JpaRepository<Order, UUID> {

    // An interface projection needs aliased columns, not a constructor expression.
    @Query("select l.sku as sku, l.quantity as quantity, l.unitPrice as unitPrice "
            + "from Order o join o.lines l where o.id = :id")
    List<OrderLineView> findLines(@Param("id") UUID id);

    interface OrderLineView {

        String getSku();

        int getQuantity();

        BigDecimal getUnitPrice();
    }
}
```

| Projection type | Use when | Cost |
| --- | --- | --- |
| Interface projection | The shape is small and stable | Extra query per projection interface when several are combined |
| Record projection through a constructor expression | The shape is stable and you want a real value object | Query string must match the constructor exactly |
| `Map<String, Object>` | Nothing. Avoid | Untyped, unchecked keys, refactoring hazards |
| `Tuple` | Native or JdbcTemplate queries only | Untyped, and it does not cross the adapter boundary |

## Pagination

| Approach | Query cost | Totals | Use when |
| --- | --- | --- | --- |
| `Pageable` offset | Grows linearly with the page number because the database skips rows | Yes, plus a count query | Small, shallow, randomly navigable lists |
| `Slice` offset | Same offset cost | No count query | Sequential browsing where the total is not shown |
| Keyset cursor | Constant cost per page | No | Exports, feeds, infinite scroll, large sequential scans |
| `Window<T>` with `ScrollPosition` | Constant cost per window | No | Bounded consumption in batches, with a stable order |

```java
package com.acme.billing.order;

import java.util.UUID;
import org.springframework.data.domain.KeysetScrollPosition;
import org.springframework.data.domain.ScrollPosition;
import org.springframework.data.domain.Window;
import org.springframework.data.domain.WindowIterator;
import org.springframework.data.repository.Repository;

public interface OrderFeedRepository extends Repository<Order, UUID> {

    // The limit is the method name and the position is the last parameter, so the sort must be stable.
    Window<Order> findFirst500ByStatusOrderByIdAsc(OrderStatus status, KeysetScrollPosition position);
}

WindowIterator<Order> orders = WindowIterator
        .of(position -> feed.findFirst500ByStatusOrderByIdAsc(OrderStatus.OPEN, position))
        .startingAt(ScrollPosition.keyset());
```

The same signature accepts `ScrollPosition` instead of `KeysetScrollPosition` to scroll by offset, and `Window#positionAt(int)` yields the position of the last consumed row. Keyset filtering requires the sorted properties to be returned by the query and mapped in the result, so a projection must include every sort column.

Keyset rules:

1. Add the primary key as the final sort column. Without it, rows with equal sort values are skipped or repeated.
2. Sort columns must be non-nullable, otherwise the comparison drops rows.
3. Index the sort columns in the same order, with the keyset column last. Hand the index to `spring-boot-postgresql`.
4. Keyset cannot jump to an arbitrary page number. Offer a cursor parameter and a "first page" entry point.
5. The cursor value is part of the API contract. Validate it, and reject a malformed cursor with a 400 rather than silently starting over.

Deep-offset symptom table:

| Symptom | Cause | Fix |
| --- | --- | --- |
| Page 500 is ten times slower than page 1 | The database reads and discards 50,000 rows | Keyset cursor, or an index-only plan |
| `Slice` still slow at depth | `Slice` avoids the count but not the offset | Keyset cursor |
| Count query slower than the page query | `count(*)` over a joined collection | Explicit `countQuery` over the base table only |
| Results duplicated on page 2 | Non-deterministic sort without a tiebreaker | Add the primary key to the sort |

## Locking and lost updates

| Mechanism | Detects | Cost | Use when |
| --- | --- | --- | --- |
| `@Version` optimistic | Throws `ObjectOptimisticLockingFailureException` on stale state | No lock held; the caller retries | Concurrent edits to the same aggregate, the default choice |
| `@Lock(PESSIMISTIC_READ)` | Shared row lock | Held for the transaction | Stable read set that must not change mid-transaction |
| `@Lock(PESSIMISTIC_WRITE)` | Exclusive row lock | Held for the transaction, deadlock risk | Stock decrement, unique resource claim, invariant enforced by the database |
| Serializable isolation | Database-wide ordering | Throughput cost, retry required | Rare, with an explicit retry budget |

```java
package com.acme.billing.stock;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

public interface StockRepository extends JpaRepository<StockLevel, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from StockLevel s where s.sku = :sku")
    Optional<StockLevel> findForUpdate(@Param("sku") String sku);
}
```

| Rule | Reason |
| --- | --- |
| Always retry `OptimisticLockingFailureException` | Losing the race is expected, not exceptional |
| Sort ids before locking in a batch | Consistent lock order prevents deadlocks |
| Keep the pessimistic transaction short | A lock held across a remote call blocks every other writer |
| Do not lock for reads that tolerate staleness | Reads do not need `PESSIMISTIC_READ` by default |
| Set a lock timeout when a fast failure is preferred | Waiting forever on a lock turns into an outage |

## Verification checklist

1. A test asserting the statement count for a realistic list size.
2. A test asserting the SQL limit and offset, or the cursor predicate, for a deep page.
3. A concurrency test for the locking choice: two threads, one row, a deterministic assertion.
4. A test proving no managed entity escapes the transactional boundary.
5. A plan check with `EXPLAIN` on a production-sized table, handed to `spring-boot-query-optimization`.
