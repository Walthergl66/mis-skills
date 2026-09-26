# Fetching and Caching

Load this when choosing a fetch strategy, proving or eliminating an N+1, or deciding whether the query plan cache and the second-level cache belong in the application.

## Fetch strategy table

| Need | Mechanism | Statements emitted | Cost |
| --- | --- | --- | --- |
| One parent, its children, one query | `@EntityGraph` or join fetch | 1 | Row duplication; needs a `Set` or distinct mapping |
| One parent, several scalar associations | Multiple join fetches | 1 | Cartesian product risk with two collections |
| Two eager collections | Impossible with `List` | n/a | `MultipleBagFetchException`; use `Set` or separate queries |
| List read for display | Interface projection | 1 | No entity, no dirty checking, no proxies |
| Aggregate read | Constructor expression | 1 | Same, and strongly typed |
| Large table scan | `StatelessSession` | n | No first-level cache; manual lifecycle |
| Read-only reference data | Second-level cache | 1 | Invalidation and staleness cost |
| Identical query shape, many executions | Query plan cache | same | Caches the parsed HQL only, not results |

## Proving an N+1

Turn on statistics and read the counters, not the log.

```yaml
spring:
  jpa:
    properties:
      hibernate:
        generate_statistics: true
```

| Counter | Meaning | N+1 signal |
| --- | --- | --- |
| `SessionFactory.getEntityInsertCount` | Rows inserted | A number far above the requested entities |
| `SessionFactory.getEntityUpdateCount` | Rows updated | One per dirty entity; a spike on a read path is a bug |
| `SessionFactory.getEntityLoadCount` | Entities loaded | 1 plus one per row when a lazy collection was touched |
| `SessionFactory.getQueryExecutionCount` | Statements executed | 101 for a page of 100 proves N+1 |
| `Statistics.getEntityFetchCount` | Associations fetched lazily | Roughly equals the parent count for a classic N+1 |
| `Statistics.getCollectionFetchCount` | Collections fetched | One per parent, the collection version of N+1 |
| `Statistics.getQueryExecutionMaxTime` | Slowest single statement | Locates the dominant statement, not the total cost |

```java
@Component
@RequiredArgsConstructor
public class LoadProbe {

    private final SessionFactory sessionFactory;
    private final InvoiceRepository repository;

    public void run() {
        Statistics statistics = sessionFactory.getStatistics();
        statistics.setStatisticsEnabled(true);
        statistics.clear();
        repository.findByCustomerId(UUID.randomUUID());
        System.out.println("statements=" + statistics.getQueryExecutionCount()
                + " loads=" + statistics.getEntityLoadCount()
                + " collectionFetches=" + statistics.getCollectionFetchCount()
                + " maxStatementMillis=" + statistics.getQueryExecutionMaxTime());
    }
}
```

Statistics are diagnostic only. They must be off in production because each event is instrumented.

Second proof, in the SQL log: group identical statement shapes and count them per request.

```yaml
logging:
  level:
    org.hibernate.SQL: DEBUG
    org.hibernate.orm.jdbc.bind: TRACE
```

If a request emits the same `select ... from invoice_line where invoice_id = ?` fifty times, the count alone is the proof. Never run this in production; a bound-parameter trace logs customer data.

## Fixing an N+1

| Cause | Fix | Notes |
| --- | --- | --- |
| Lazy collection touched in a loop | `@EntityGraph` on the repository method | Produces one join, but duplicates parent rows |
| Lazy `@ManyToOne` touched per row | Join fetch, or a projection that includes the needed field | A projection is usually better for display |
| `equals`/`hashCode` dereferences a lazy association | Remove the association from `hashCode` | This one hides in a `Set` or a `Map` key |
| Serialization of a lazy graph after the session closed | Project the response DTO inside the transaction | Never solve it with `open-in-view: true` |
| Recursive graph traversal | Bound the depth explicitly | Bidirectional entities serialize forever without a DTO |
| DTO assembly loop calling a repository | Load once, assemble in memory, or use a single projection query | A read model is the correct long-term fix |

```java
public interface InvoiceSummary {
    UUID getId();
    Instant getIssuedAt();
    BigDecimal getTotal();
    String getCustomerName();
}

public interface InvoiceRepository extends JpaRepository<Invoice, UUID> {

    @Query("""
            select new com.example.app.InvoiceView(i.id, i.issuedAt, i.total, i.customer.name)
              from Invoice i
             where i.customer.id = :customerId
             order by i.issuedAt desc
            """)
    List<InvoiceView> findViewsByCustomer(@Param("customerId") UUID customerId);
}
```

Open-in-view is a trap, not a fix:

| Setting | Result |
| --- | --- |
| `open-in-view: false` | Lazy access outside a transaction throws immediately, so the bug is found in tests |
| `open-in-view: true` | A connection and a persistence context are held for the whole HTTP response, including serialization |

## Entity graphs

```java
import org.springframework.data.jpa.repository.EntityGraph;

@EntityGraph(attributePaths = {"lines", "customer"})
@Query("select i from Invoice i where i.customer.id = :customerId")
List<Invoice> findWithGraph(@Param("customerId") UUID customerId);
```

| Choice | Behavior |
| --- | --- |
| `FETCH` graph | Every attribute listed is treated as eager; the rest lazy |
| `LOAD` graph | Listed attributes are fetched eagerly; the rest keep their declared fetch type |
| `attributePaths` | Static, declarative, reviewable |
| `EntityGraph` built at runtime | For graphs assembled from caller input, mapped through a fixed allow list |

Rules:

1. Fetch graph plus join fetch on two `List` associations raises `MultipleBagFetchException`. Use `Set` or two queries.
2. A join fetch with a `LIMIT` in JPQL is applied in memory, not in SQL. Use `@EntityGraph` plus a pageable repository method instead, and verify the generated SQL contains `limit`.
3. A graph that fetches a collection while the query paginates the parent causes Hibernate to fetch the whole collection and then page in memory. Confirm with `getQueryExecutionCount`.

## First-level cache behavior

The persistence context is an identity map scoped to the session. Within one transaction, loading the same entity twice returns the same instance and issues one `SELECT`.

| Situation | Behavior |
| --- | --- |
| Same entity loaded twice in one session | One query, one instance |
| Entity re-read expecting fresh data | Stale; the context wins until `clear` or a new session |
| `refresh(entity)` | Forces a re-read from the database |
| Session closed | Everything becomes detached; the cache dies with it |
| Long batch job | The context grows until it is cleared, or the heap dies |

Use `session.clear()` deliberately in batch loops, and prefer a `StatelessSession` when the data is never updated.

## Second-level cache

| Model | Enable the second-level cache |
| --- | --- |
| Write-heavy transactional entity | No |
| Derived or computed value that can be recomputed | Sometimes, with a short TTL |
| Small, slow-changing reference data read on nearly every request | Yes, with explicit invalidation on write |
| Entity with lazy associations whose graph is always loaded | Only if the whole graph can be cached coherently |
| Anything used for money, permissions, or compliance | No, unless a stale read is provably acceptable |

Reasons it is usually wrong for write-heavy models:

1. Invalidation is application work. Every write path must evict, or readers see stale data.
2. It multiplies across replicas. A cache node per instance is not a shared cache, and a shared one adds a network hop to the read path.
3. It hides missing indexes. A slow query that a cache masks will resurface on the first cache miss, at the worst moment.
4. Staleness is a correctness decision, not a performance setting. It must be made explicitly per aggregate.

```yaml
spring:
  jpa:
    properties:
      hibernate:
        cache:
          use_second_level_cache: false
        cache:
          use_query_cache: false
```

If a cache is justified, scope it narrowly, key it explicitly, and define the eviction trigger in the same commit that introduces it.

## Query plan cache

The query plan cache stores the parsed HQL and the generated SQL plan for a query shape. It is keyed by the HQL string, so dynamic string concatenation of predicates produces a cache entry per distinct shape.

| Practice | Plan cache effect |
| --- | --- |
| Derived query method reused | One entry, reused |
| String-concatenated HQL | New entry per shape; unbounded growth |
| Criteria API with the same structure | Reuses a plan when the structure matches |
| Native query with a stable text | Reused |
| Query with `setMaxResults` different per call | Same plan, different bound parameters |

Rules:

1. Never build HQL by concatenating user input. Use a Criteria Specification or a fixed set of named query methods.
2. Bound the plan cache in a service with many one-off query shapes, and watch for `QueryPlanCache` statistics growing without plateau.
3. The plan cache does not cache results. Enabling it is never an answer to a slow query.

## Rule of thumb

Change the query shape before adding any cache. A cache in front of a sequential scan on a 40 million row table is a cache that misses on every cold read, hides the real problem, and adds a coherence obligation to every writer.
