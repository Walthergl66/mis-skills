---
name: spring-boot-hibernate
description: 'Use when mapping, tuning, or debugging Hibernate ORM 6.6 engine behavior in a Spring Boot 3.5 application, covering entity mappings, associations, FetchType, entity graphs, batch inserts, identifier generation, dirty checking, the query plan cache, second level cache, Criteria API, native query integration, statistics, and hbm2ddl configuration. Triggers include N+1, LazyInitializationException, MultipleBagFetchException, StaleObjectStateException, NonUniqueResultException, hibernate.jdbc.batch_size, StatelessSession, generate_statistics, open-in-view, and unexpected cascades. Do not use for SQL dialect or index design, for repository and pagination API design, for authoring migration files, or for end to end latency remediation. When other skills also apply, reconcile ownership before mutation.'
license: MIT
metadata:
  author: Walthergl66
  version: '1.0.0'
---

# Hibernate ORM Mapping and Runtime Behavior

Hibernate is a state machine with a SQL generator attached. Most production surprises come from ignoring the state machine, not from a missing annotation. Decide mapping deliberately, keep the persistence context small, and let the schema live in migrations.

## When to use

- Choosing between `@EmbeddedId` and a surrogate key, or between `@ElementCollection` and a JSONB column.
- Fixing `LazyInitializationException`, `MultipleBagFetchException`, or a cascade that writes rows nobody expected.
- Setting up batch inserts, ordered updates, and the identifier strategy that unblocks batching.
- Proving or eliminating an N+1 with Hibernate statistics, understanding the four entity states and dirty checking cost, and deciding whether a `StatelessSession` or the caches help.

## When not to use

- SQL dialect, index selection, or plan analysis: hand off to `spring-boot-postgresql`.
- Repository interfaces, Specifications, or pagination API design: hand off to `spring-boot-data-jpa`.
- Migration files, baselines, or schema history: hand off to `spring-boot-flyway`.
- End-to-end latency, caching layers, and throughput remediation: hand off to `spring-boot-query-optimization`.

## Ownership and sibling boundaries

This skill owns entity mappings, association shape, entity state, fetch strategies, batching, identifier generation, and ORM-level caching.

- Index and dialect decisions that follow from a mapping go to `spring-boot-postgresql`.
- `spring-boot-data-jpa` owns the repository abstraction, Specifications, and the pagination contract.
- `spring-boot-flyway` owns the DDL; this skill never creates it, and `spring-boot-query-optimization` owns symptom-level latency work while this skill owns the engine-level cause.

## Never let Hibernate own the production schema

```yaml
spring:
  jpa:
    open-in-view: false
    hibernate:
      ddl-auto: none
    properties:
      hibernate:
        jdbc:
          batch_size: 50
        order_inserts: true
        order_updates: true
```

`update` and `create-drop` mutate a live schema with no review, no history, and no rollback. `open-in-view: true` holds a connection and a persistence context for the whole HTTP response, including serialization. `generate_statistics` is a diagnostic switch with measurable overhead. Only a disposable environment, such as a test container, may let an ORM write DDL; the schema itself belongs to `spring-boot-flyway`.

## Mapping decisions

| Decision | Choose | Reject | Reason |
| --- | --- | --- | --- |
| Table primary key | Surrogate `bigint` identity, exposed `uuid` separately | Composite natural key as `@EmbeddedId` | A stable surrogate keeps foreign keys narrow and lets the business key change later |
| Child collection, fixed attributes | `@ElementCollection` in a real child table | A `jsonb` array | Needs indexes, constraints, and joins |
| Child collection, free-form attributes | `jsonb` with `@JdbcTypeCode(SqlTypes.JSON)` | `@ElementCollection` | Cheaper to store, impossible to constrain relationally |
| Required association | Nullable-checked FK with `FetchType.LAZY` | `FetchType.EAGER` | Eager multiplies the cost of every query that touches the parent |
| Bidirectional association | Exactly one owning side; the other is `mappedBy` and read-only | Two write sides | Two owners produce two rows for one intent |
| Enumeration | `@Enumerated(EnumType.STRING)` on a constrained column | `ORDINAL` | Ordinal values corrupt silently on reordering |

```java
// The owning side holds the foreign key; Invoice.lines is mappedBy "invoice".
@ManyToOne(fetch = FetchType.LAZY, optional = false)
@JoinColumn(name = "invoice_id", nullable = false)
private Invoice invoice;
```

`mappedBy` names the field on the owning side, not the column, and it does not create a foreign key. The non-owning side is never written: a bidirectional one-to-many without `orphanRemoval` and a child-side setter is a data-loss pattern, and `CascadeType.REMOVE` loads every child into memory before deleting it. Two eager `List` collections raise `MultipleBagFetchException`; use `Set` or fetch them separately. `Optional` is not supported for a `@ManyToOne`, so use a nullable column and a null check.

## Four states and the cost of dirty checking

| State | Meaning | Typical trigger |
| --- | --- | --- |
| Transient | In memory, no identity, not in the session | `new Invoice()` |
| Managed or persistent | Has identity and is attached to the session | After `save`, `persist`, `find`, or a query |
| Removed | Scheduled for deletion at flush | After `delete` |
| Detached | Had identity, is no longer attached | After the session closed, or `detach` |

Hibernate proves managed state by snapshotting every loaded entity at load time and comparing that snapshot at flush. A 40-column entity loaded 500 times costs 20000 column comparisons per flush, which is why a fat entity used only as a read model is a performance bug with no visible cause.

| Symptom | Cause | Fix |
| --- | --- | --- |
| `LazyInitializationException` | Association touched after the session closed | Fetch it in the query, or map a projection; never reach for `open-in-view` |
| `StaleObjectStateException` | Optimistic lock, another writer won | Re-read and retry the whole use case, never only the write |
| `NonUniqueResultException` | `getSingleResult` matched many rows | Add the missing predicate, and make uniqueness a database constraint |

## Batch the writes

| Rule | Setting | Reason |
| --- | --- | --- |
| Insert in batches | `hibernate.jdbc.batch_size` plus `order_inserts` and `order_updates` | One round trip per batch, and grouped values stop thrashing the same index buffer |
| Never combine with `IDENTITY` | `GenerationType.SEQUENCE` with `allocationSize` | PostgreSQL returns the identity key immediately, so Hibernate must execute each insert; a sequence pre-allocates and keeps batching |
| Batch at the boundary | `flush` then `clear` per page | A context that grows to 100000 entities is a slow-arriving out-of-memory error |

```java
@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "order_event_seq")
@SequenceGenerator(name = "order_event_seq", sequenceName = "order_event_id_seq", allocationSize = 50)
```

## Fetch deliberately and prove the alternative

| Need | Mechanism | Cost |
| --- | --- | --- |
| One extra association | `@EntityGraph` on the repository method | One join, possible row duplication |
| Only some columns | Interface projection or constructor expression | No entity, no dirty checking, no proxies |
| Repeated query shape, or a large read | Query plan cache, or `StatelessSession` in an explicit transaction | The plan cache holds parsed HQL only; a stateless session has no cache, no dirty checking, no cascade |

N+1 is confirmed by counters, not suspicion: `getQueryExecutionCount` of 101 for a page of 100 is proof, `getCollectionFetchCount` near the parent count is the collection form, and `getEntityFetchCount` near the row count is the association form. Turn the threshold into a test so the shape cannot regress.

```java
statistics.setStatisticsEnabled(true);
statistics.clear();
repository.findPageByCustomerId(customerId, PageRequest.of(0, 50));
assertThat(statistics.getQueryExecutionCount()).isLessThanOrEqualTo(2);
```

## The second-level cache is usually wrong

Invalidation becomes application work on every write path, a per-instance cache is not a shared cache, and a shared one adds a network hop to the read. Above all it hides a missing index that resurfaces on the first cold miss. Enable it only for small, slow-changing reference data with an explicit eviction trigger, never for money or compliance data. The plan cache is separate and safe: it caches parsing, not results.

## Criteria API, stateless sessions, and Hibernate 6

| Situation | Tool | Limit |
| --- | --- | --- |
| Fixed named filter combinations | Derived method or `@Query` | None |
| Caller-supplied filters that vary per screen | Criteria API inside the repository | Verbose, and unchecked at compile time |

| Hibernate 6 change | Consequence |
| --- | --- |
| Bootstrapping reworked around `jakarta.persistence.SessionFactory` | Do not copy Hibernate 5 examples |
| Native placeholders are position sensitive, `?1` style | Prefer named parameters in native queries |
| `Instant` and `LocalDateTime` mapped explicitly, `@Type` replaced `@TypeDef` | A `LocalDateTime` no longer silently becomes a zone-aware column, and user types must be re-checked |

## Reference routing

| Task | Load |
| --- | --- |
| Choose identifiers, associations, cascades, inheritance, or entity state | [mapping-and-state.md](references/mapping-and-state.md) |
| Choose a fetch strategy, prove an N+1, or decide on caching | [fetching-and-caching.md](references/fetching-and-caching.md) |

## Expected response

- **Diagnosis:** the engine-level cause, named as a state, association, fetch, or batching problem, with the evidence that proves it.
- **Change:** the annotation, configuration property, or query change, spelled out.
- **Semantics preserved:** identity, cascade, and transaction behavior that must not change.
- **SQL impact and verification:** the statements before and after, the round trips removed, statistics or SQL log evidence, an integration test against real PostgreSQL, and percentiles under a production-like workload.
