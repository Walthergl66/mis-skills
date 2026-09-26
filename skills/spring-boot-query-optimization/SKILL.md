---
name: spring-boot-query-optimization
description: 'Use when diagnosing or remediating slow queries, latency percentile regressions, or low throughput in a Spring Boot 3.5 application with PostgreSQL 16. Triggers include p99 latency, slow endpoint, slow SQL log, N+1 detection, connection pool wait time, keyset versus offset pagination, projection read paths, batch size tuning, SELECT count cost, cache layers, and proving a fix with before and after measurements. Do not use for SQL dialect or index theory, for entity mapping and fetch mechanics, for repository and pagination API design, or for metrics and tracing infrastructure. When other skills also apply, reconcile ownership before mutation.'
license: MIT
metadata:
  author: Walthergl66
  version: '1.0.0'
---

# Query and Latency Optimization

A slow query is a symptom with a location. Find the layer first, prove it with a measurement, change one thing, and measure the same workload again. Anything else is guessing with a schema change attached.

## When to use

- A p95 or p99 latency regression that traces to database work.
- Detection of N+1 query patterns through statistics or SQL log analysis.
- Offset pagination that degrades at depth, or a `SELECT count(*)` on a hot path.
- Connection pool wait time, throughput ceilings, or lock contention symptoms.
- Choosing between a projection read path, batching, or a cache layer.
- Turning a change that felt faster into a change that is proven faster.

## When not to use

- SQL dialect, index type theory, and plan node interpretation: hand off to `spring-boot-postgresql`.
- Entity mappings, associations, fetch annotations, and dirty checking: hand off to `spring-boot-hibernate`.
- Repository interfaces, Specifications, and the pagination contract: hand off to `spring-boot-data-jpa`.
- Metric, trace, and dashboard infrastructure: hand off to `spring-boot-observability`.

## Ownership and sibling boundaries

This skill owns the diagnosis order, the layered bottleneck model, the remediation of query shape, and the proof that a change worked.

- Once the bottleneck is the database, index and plan decisions belong to `spring-boot-postgresql`.
- Once the bottleneck is the ORM, mapping and fetch decisions belong to `spring-boot-hibernate`.
- `spring-boot-data-jpa` owns the repository and pagination API; this skill owns the shape of the query it produces.
- `spring-boot-observability` owns metric emission; this skill defines which metric decides the question.
- `spring-boot-postgresql` owns pool sizing; this skill measures pool wait and contention as evidence.

## The diagnosis order

Never skip a step. Each one invalidates the conclusions of the previous.

1. **Define the symptom numerically.** p50, p95, p99, throughput, error rate, and the exact window. "It feels slow" is not a symptom.
2. **Bound the work.** One request, one operation, or one job. Which one is worse, and for whom?
3. **Attribute the time.** Break the request into spans: application CPU, pool wait, database execution, lock wait, network, external dependency.
4. **Get the actual statement.** Not the HQL, not the repository method name. The SQL with its bound parameters and its plan.
5. **Reproduce on production-like data.** Row counts, cardinality, and cache state change the plan.
6. **Change one variable.** One index, one query shape, one batch size.
7. **Re-measure the same workload.** Same data, same concurrency, same duration.
8. **Keep or revert.** A change without before-and-after numbers under the same workload is unproven.

## Layered bottleneck table

| Layer | Signal | Confirm with | Usual fix |
| --- | --- | --- | --- |
| External dependency | Span dominated by a remote call | Distributed trace | Timeout, cache, bulkhead, or remove the call |
| Network | Latency scales with payload size, not with server time | Response size, RTT | Projection, compression, pagination |
| Connection pool | `connection-timeout` firing, or Hikari pending threads above zero | Pool metrics plus database session count | Fix the slow query first, then resize |
| Lock wait | `pg_locks` waiters, or `pg_stat_activity` with `wait_event_type = 'Lock'` | Lock query | Shorter transactions, consistent lock order |
| Database CPU | High `pg_stat_database` CPU, high buffer reads, active sessions at the limit | Database metrics | Index, better plan, less work per row |
| Database I/O | High `pg_stat_database.blks_read`, low cache hit ratio | Database metrics | Index, working set, more buffer cache |
| ORM overhead | Many statements, low database time each, high statement count | Hibernate statistics | Fetch strategy, projection, batching |
| Application CPU | High CPU with low database time | Profiler | Algorithm, allocation, serialization |

Order matters: a pool timeout above a slow query is a symptom, not a cause. Raising the pool size of an application whose pool timeouts are caused by a 40 second query converts a slow endpoint into a database outage.

## The dev trap

| Dev condition | Production reality | How to remove it |
| --- | --- | --- |
| 500 rows in a table | 40 million | Generate production-scale data with `generate_series` and a realistic distribution |
| Everything in `shared_buffers` | Cache hit ratio below 1 | Use a container or a host with less RAM than the working set |
| Local NVMe SSD | Network block storage with IOPS limits | Throttle IO, or accept the number and focus on rows touched |
| One user | Concurrent replicas | Run the load test with the real replica count against a real database |
| Empty tables, no statistics | Statistics collected days after a bulk load | `ANALYZE` after loading, and keep autovacuum enabled |
| No other tenants | One tenant owns most rows | Model the skewed tenant; composite indexes need it |

A fix validated only on dev data is a hypothesis. The plan that is optimal for 500 rows is a sequential scan, and that is the correct plan for 500 rows.

## N+1 detection

| Method | How | Verdict |
| --- | --- | --- |
| Hibernate statistics | `getQueryExecutionCount` and `getCollectionFetchCount` per request | 101 statements for a page of 100 is proof |
| SQL log grouping | Group identical statement shapes within a request window | A statement repeated once per row is proof |
| Query count assertion in a test | Assert a maximum statement count for a known fixture | Turns a regression into a build failure |
| Trace span count | One database span per row | Visible in any APM tool that instruments the datasource |

N+1 is confirmed by count, not by suspicion. Fix it with a join fetch, an entity graph, or a projection, and then assert the statement count in a test. Detection tooling and the count assertions are in [references/diagnosis-playbook.md](references/diagnosis-playbook.md).

## Keyset versus offset pagination

```sql
-- Offset: the database reads and discards every skipped row.
SELECT id, total FROM invoice
 WHERE customer_id = :customerId
 ORDER BY created_at DESC, id DESC
 LIMIT 50 OFFSET 500000;

-- Keyset: the database reads exactly the page and nothing before it.
SELECT id, total FROM invoice
 WHERE customer_id = :customerId
   AND (created_at, id) < (:cursorCreatedAt, :cursorId)
 ORDER BY created_at DESC, id DESC
 LIMIT 50;
```

| Aspect | Offset | Keyset |
| --- | --- | --- |
| Cost of page N | Proportional to N | Constant |
| Index use | Index scan plus heap fetches for skipped rows | Index scan, no skips |
| Page 1 to page 2 jump | Free | Requires a scan or a keyset walk |
| Insert during browsing | Rows shift, items are duplicated or skipped | Stable, no duplicates |
| Random page access | Supported | Not supported without a stored cursor |
| Cursor state | Opaque integer | Must carry the sort key tuple |

Rules:

1. Use offset only when the result set is small, bounded, or genuinely navigable by number.
2. A keyset cursor must include the full sort key, including the tiebreaker column. Ordering by a non-unique column alone is not a stable cursor.
3. A keyset cursor requires a composite index whose leading column matches the filter and whose tail matches the sort order.
4. `OFFSET` on a mutable sort column is a correctness bug as well as a performance bug.

Deep-dive SQL, projection read paths, and batching shapes are in [references/query-shapes.md](references/query-shapes.md).

## Projection read paths

| Read | Tool | Round trips | Entity cost |
| --- | --- | --- | --- |
| Full entity with associations | Repository method with a graph | 1 | Full dirty-checked entities |
| List for display | Interface projection | 1 | None |
| Aggregate | JPQL `count`, `sum`, `avg` | 1 | None |
| Cross-table report | Native SQL to a record | 1 | None |
| Repeated identical read | Application cache with an explicit invalidation | 0 | Depends on hit rate |

A projection removes the entity, the persistence context entry, the dirty-check snapshot, and the lazy proxies. On a list endpoint returning 200 rows of 40 columns, that is the single largest avoidable cost in the read path.

## Rules that hold

1. Change one variable at a time, or the measurement means nothing.
2. Never optimize a query nobody measured. Get the statement count, the total time, and the plan.
3. Prefer removing work over making the same work faster.
4. Batch size is a trade, not a bigger-is-better dial. Measure at 10, 50, and 200.
5. A cache is a correctness decision with a performance benefit. Never the first response to a slow query.
6. Do not change the database schema until the plan says the schema is the constraint.
7. Report p99, not the mean. A mean hides the exact users who are complaining.
8. A fix is unproven without before-and-after percentiles under the same workload, on production-like data.

## Reference routing

| Task | Load |
| --- | --- |
| Run the ordered diagnosis, pick tooling, or record evidence | [diagnosis-playbook.md](references/diagnosis-playbook.md) |
| Fix N+1, pagination, batching, projections, or an index-hostile rewrite | [query-shapes.md](references/query-shapes.md) |

## Expected response

- **Symptom:** the exact percentiles, throughput, and window, plus the operation that is affected.
- **Evidence:** the statement count, the SQL with parameters, the plan, the row counts, and the layer that owns the time.
- **Diagnosis:** the single dominant bottleneck, with the measurement that identified it and the alternatives that were ruled out.
- **Change:** one intervention, spelled out, with the mechanism that connects it to the evidence.
- **Result:** before-and-after percentiles and throughput under the identical workload and data volume.
- **Regression guard:** the test, statistic, or assertion that will catch this returning.
