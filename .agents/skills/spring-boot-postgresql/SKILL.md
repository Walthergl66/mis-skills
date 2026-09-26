---
name: spring-boot-postgresql
description: 'Use when designing, tuning, or debugging PostgreSQL 16 in a Spring Boot 3.5 application, covering column types, native SQL, index selection, EXPLAIN ANALYZE plan reading, MVCC and isolation levels, row locking, jsonb, arrays, CTEs, window functions, partitioning, sequences and identity columns, extensions, and HikariCP plus pgjdbc pool configuration. Triggers include Seq Scan, index not used, GIN index, jsonb_path_ops, BRIN index, Rows Removed by Filter, deadlock, lock wait, SKIP LOCKED, READ COMMITTED, autovacuum, bloat, maximumPoolSize, connection leak, and slow SQL. Do not use for ORM entity mapping or fetch strategies, for repository and pagination API design, for authoring migration files, or for end to end latency remediation. When other skills also apply, reconcile ownership before mutation.'
license: MIT
metadata:
  author: Walthergl66
  version: '1.0.0'
---

# PostgreSQL for Spring Boot

Treat PostgreSQL as a system with its own cost model, not as a store for Java objects. Type, index, isolation, and pool choices are correctness and latency decisions the application inherits whether it asked for them or not.

## When to use

- Choosing column types, constraints, or index types for mapped entities.
- Reading `EXPLAIN (ANALYZE, BUFFERS)` output and deciding why a plan is wrong.
- Diagnosing deadlocks, lock waits, bloat, stale statistics, or long-running transactions.
- Choosing an isolation level, a `FOR UPDATE` strategy, or a `SKIP LOCKED` work queue.
- Configuring HikariCP and pgjdbc: pool size, timeouts, leak detection, statement timeouts.
- Writing native SQL with CTEs, window functions, `jsonb` operators, or set-based DML.

## When not to use

- Entity mappings, associations, fetch strategies, or batching: hand off to `spring-boot-hibernate`.
- Repository interfaces, Specifications, or pagination API design: hand off to `spring-boot-data-jpa`.
- End-to-end slow-request work across cache, network, and application CPU: hand off to `spring-boot-query-optimization`.
- Versioned migration files, baselines, checksums, or repair: hand off to `spring-boot-flyway`.

## Ownership and sibling boundaries

This skill owns PostgreSQL types, SQL text, index selection, plan interpretation, isolation, locking, and pool configuration.

- Index and plan decisions are made here; `spring-boot-query-optimization` owns the end-to-end symptom and the before-and-after proof.
- `spring-boot-hibernate` owns the mappings and fetch mechanics that emit the SQL inspected here.
- `spring-boot-flyway` owns the migration file that creates the types and indexes chosen here.
- `spring-boot-query-optimization` shares pool sizing with this skill: size is decided here, wait measurement is owned there.

## Hard rules

1. Never let Hibernate create a production schema. `ddl-auto` stays `none` outside local profiles; `spring-boot-flyway` owns DDL.
2. Capture evidence before changing anything: `pg_stat_statements`, `log_min_duration_statement`, and a real plan on production-like data.
3. Reproduce on production-like row counts. A sequential scan over a 12-row dev table is not a finding.
4. Add an index only from an observed predicate, join, or ordering. Every index is paid on every write and every vacuum.
5. Enforce integrity with primary key, foreign key, unique, and `CHECK`; bound every query; set `statement_timeout` per role; and never hold a connection across a remote call.

## Choose the right SQL layer

| Need | Use | Reason |
| --- | --- | --- |
| Simple predicate on mapped columns | JPQL or a derived method | The SQL stays reviewable through the mapping |
| Open-ended predicate set | Criteria API | Only when the predicate count is genuinely dynamic |
| `jsonb`, `DISTINCT ON`, `LATERAL`, `generate_series` | Native SQL | No ORM abstraction models these |
| Bulk DML or idempotent write | Native SQL | Set-based statements avoid per-row round trips and locks |
| Queue claim or row lock | Native SQL | Locking semantics are a database concern |
| Read-only report or aggregate | Projection, `JdbcTemplate`, or a view | Keeps the portability cost honest |

```java
@Query(value = "SELECT * FROM job WHERE status = 'READY' AND next_run_at <= now() "
             + "ORDER BY next_run_at FOR UPDATE SKIP LOCKED LIMIT :batch", nativeQuery = true)
List<Job> claimReadyBatch(@Param("batch") int batch);
```

## Map types deliberately

| PostgreSQL | Java | Hard rule |
| --- | --- | --- |
| `uuid` | `UUID` | Default in the database, or UUIDv7 when the application generates ids |
| `timestamptz` | `Instant` | Store instants in UTC; avoid zone-less `timestamp` entirely |
| `numeric(19,4)` | `BigDecimal` | Never `double` for money; set scale in the column, not only in Java |
| `jsonb` | `JsonNode` with `@JdbcTypeCode(SqlTypes.JSON)` | Declare the column `jsonb` and verify the emitted DDL |
| `text[]` | `String[]` with `@JdbcTypeCode(SqlTypes.ARRAY)` | Use a child table when an element needs an index or a foreign key |
| `CREATE TYPE ... AS ENUM`, `ltree`, `tsvector` | enum or text plus server operators | Extension types are for what SQL cannot express; never replace a foreign key with JSON |


## Select indexes from the access path

| Access pattern | Index | Notes |
| --- | --- | --- |
| Equality, range, or sort | btree | Order is equality columns, then one range or sort column |
| `jsonb` containment, `?`, `?&` | GIN default ops, or `jsonb_path_ops` for `@>` only | Large and slow to write; `jsonb_path_ops` is smaller and faster |
| `ILIKE '%term%'` or similarity | GIN on `gin_trgm_ops` | Requires `pg_trgm`; only on the searched column |
| Very large append-only table | BRIN | Tiny; loses selectivity as soon as rows are updated |
| Hot subset | Partial index | The index predicate must match the query predicate literally |
| Computed value, or covering read | Expression index, or btree with `INCLUDE` | The query must use the identical expression; covering pays only with a current visibility map |

Index-only scans are an outcome, not a goal. Expect them on append-only tables and never on a frequently updated status column.

## Read the plan before defending the query

Run `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS)` in the same transaction shape as the real query. `ANALYZE` executes the statement, so never point it at a mutating statement in production traffic.

| Red flag | Meaning | First move |
| --- | --- | --- |
| `Seq Scan` on a large filtered table | No usable index, or the scan genuinely is cheaper | Check the predicate, statistics, and selectivity first |
| `Rows Removed by Filter` far above rows returned | The index is scanning far more than needed | Make the predicate selective, or fix composite index order |
| `Nested Loop` with high `loops` and a large inner side | Repeated inner work per outer row | Index the join key or confirm the inner side is materialized |
| `Sort Method: external merge Disk` | Sort spilled | Reduce the input or add a matching btree before touching `work_mem` |
| `Heap Blocks` high with `loops > 1` | Buffers reread per iteration | Reorder the join; this is not an index-size problem |
| `rows=` off by orders of magnitude, or `Heap Fetches: 0` | Stale statistics, or a genuine index-only scan | `ANALYZE` and extended statistics; confirm the win in percentiles |


## Pick isolation from the anomaly you must prevent

| Level | Prevents | Still possible | Use for |
| --- | --- | --- | --- |
| `READ COMMITTED` (default) | Dirty reads | Non-repeatable reads, phantoms, write skew | Most OLTP work with explicit locks and constraints |
| `REPEATABLE READ` | Dirty and non-repeatable reads | Write skew, serialization failure | Consistent-snapshot reporting; expect `40001` |
| `SERIALIZABLE` | All anomalies | Serialization failure under concurrency | Invariants that cannot be locked cheaply |
| `READ UNCOMMITTED` | Nothing; behaves as `READ COMMITTED` | Everything | Never select it |

The snapshot is taken per statement, so two statements in one transaction can see different data. A retry loop that catches only deadlock `40P01` will not recover from a serialization failure `40001`; treat both as retryable and make the write idempotent.

```sql
SELECT id FROM job WHERE status = 'READY' ORDER BY next_run_at
FOR UPDATE SKIP LOCKED LIMIT 1;
```

Locking rules, `NOWAIT`, advisory locks, deadlock handling, and HikariCP sizing are in [references/transactions-and-pooling.md](references/transactions-and-pooling.md).

## Configure the pool from database capacity

```yaml
spring:
  datasource:
    hikari:
      pool-name: app-cp
      maximum-pool-size: 20
      connection-timeout: 3000
      max-lifetime: 1500000
      leak-detection-threshold: 60000
```

Sizing rule: `maximumPoolSize` per instance times instance count must stay below `max_connections` minus `superuser_reserved_connections` and the headroom reserved for migrations and operators. Start near `2 * CPU cores + effective_spindles` for OLTP, and lower it when pool wait is zero and database CPU is saturated. Set `connection-timeout` below the caller timeout so the pool fails instead of hanging the request, and never set `auto-commit: false` here; Spring controls it per transaction.

## Reference routing

| Task | Load |
| --- | --- |
| Choose column types, write native SQL, use `jsonb`, CTEs, or window functions | [types-and-sql.md](references/types-and-sql.md) |
| Choose an index type or read and challenge an execution plan | [indexing-and-plans.md](references/indexing-and-plans.md) |
| Choose isolation, take locks, break deadlocks, size HikariCP | [transactions-and-pooling.md](references/transactions-and-pooling.md) |

## Expected response

- **Schema and types:** the DDL decision per column, with the reason and the cost it imposes on writes.
- **Evidence:** the actual SQL, the actual plan, row counts, and the environment that produced them.
- **Diagnosis:** the specific red flag, the mechanism behind it, and why the planner chose that plan.
- **Change:** one intervention, with the index or query text spelled out.
- **Verification:** before-and-after latency percentiles plus the plan change, on production-like data.
