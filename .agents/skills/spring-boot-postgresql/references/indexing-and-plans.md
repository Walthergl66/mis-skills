# Indexing and Plan Reading

Load this when choosing an index type, reading `EXPLAIN (ANALYZE, BUFFERS)` output, or deciding whether a plan is actually the problem.

## Index selection

| Access pattern | Index type | Definition shape | Cost paid on writes |
| --- | --- | --- | --- |
| Equality then range on the same table | btree | `(tenant_id, status, created_at)` | One entry per row per index |
| Equality on several columns then sort | btree | `(a, b, c)` with `a = ? AND b = ? ORDER BY c` | Full index size |
| Sort or range only | btree | `(created_at DESC)` | Full index size |
| Membership list | btree | `(status)` or GIN on `status` | btree is cheaper below roughly a thousand distinct values |
| `jsonb` containment | GIN `jsonb_ops` | `USING gin (payload)` | Large, slow writes |
| `jsonb @>` only | GIN `jsonb_path_ops` | `USING gin (payload jsonb_path_ops)` | Roughly half the size, faster reads, fewer operators |
| `jsonb` with leading scalar equality | btree_gin | `USING gin (tenant_id, payload)` | Less than separate btree plus GIN |
| `ILIKE '%x%'`, `similarity` | GIN or GiST trigram | `USING gin (name gin_trgm_ops)` | Very large; only on the searched column |
| Append-only, naturally ordered, huge | BRIN | `USING brin (created_at) WITH (pages_per_range = 32)` | Negligible |
| Hot subset of a large table | Partial btree | `... WHERE deleted_at IS NULL` | Only for the retained rows |
| Business uniqueness on a condition | Partial unique | `CREATE UNIQUE INDEX ... WHERE status = 'ACTIVE'` | Enforces an invariant the schema must hold |
| Normalized or computed value | Expression | `((lower(email)))` | Only for rows matching the predicate |
| Wide read that never touches the heap | btree with `INCLUDE` | `... (status) INCLUDE (total, issued_at)` | Extra storage and write cost |
| Geospatial | GiST or SP-GiST | PostGIS operator classes | Depends on the geometry type |

## Hard rules

1. Composite index column order is equality columns first, then one range or sort column. A column to the left of a range column cannot be used for a second range.
2. A btree index serves equality, `IN`, range, and order, in that order of usefulness. Nothing else.
3. BRIN loses selectivity as soon as the column is updated, because physical order stops matching logical order.
4. Partial indexes are only used when the query predicate implies the index predicate. Write the predicate literally.
5. An expression index is used only when the query uses the identical expression. A cast, a different collation, or a `lower()` on one side only will not match.
6. Do not index a low-cardinality boolean or status column alone on a large table. Combine it with a high-cardinality column in a composite index.
7. Every index duplicates write amplification, `VACUUM` work, cache pressure, and lock duration. Delete indexes that no plan uses.
8. Unique indexes created concurrently avoid write blocking; ordinary `CREATE INDEX` takes a share lock that blocks writes.

## Getting a usable plan

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS)
SELECT o.id, o.total
  FROM orders o
 WHERE o.tenant_id = '7f1c...'
   AND o.status = 'OPEN'
 ORDER BY o.created_at DESC
 LIMIT 50;
```

Rules for capturing the plan:

- Run it with the same parameters as production, not with an invented literal.
- `ANALYZE` executes the statement. Never run it against a mutating statement in production traffic.
- For a mutating statement, wrap in `BEGIN; ... ROLLBACK;` or test on a restored copy.
- `BUFFERS` reveals the real I/O story. Without it, a plan on a warm cache looks free.
- `SETTINGS` shows planner knobs that were overridden, which is often the whole answer.
- `BUFFERS` output is meaningless under a query plan cache warm-up: re-run once before trusting the timings.

## Plan node red flags

| Node text | What it means | Remedy direction |
| --- | --- | --- |
| `Seq Scan` with `Filter:` and large `actual rows` | Full table read, or full index read on a small table | Verify row count first; then check the predicate and missing indexes |
| `Rows Removed by Filter: 400000` | The scan found far more candidate rows than the query needs | Make the predicate selective; fix composite index order |
| `Rows Removed by Join Filter: 90000` | Join produced many rows that a later step discarded | Move the join condition into the `ON` clause so the join order can push it down |
| `Nested Loop` with `loops=15000` | Inner side executed 15000 times | Index the inner join key, or confirm the inner side is a materialized CTE |
| `Nested Loop` over a large `Seq Scan` inner | Quadratic behavior | Rewrite as a hash join by fixing the inner side |
| `Sort Method: external merge  Disk: 120MB` | Sort spilled | Reduce input, add a matching btree, or raise `work_mem` only after measuring |
| `Sort Method: quicksort  Memory: 25kB` | Sort fit in memory | No action |
| `Heap Blocks: exact=9000` on a repeated node | Buffers reread per iteration | Reorder the join or add an index so buffers are reusable |
| `Heap Fetches: 0` | True index-only scan | Confirm the latency win before keeping covering columns |
| `Heap Fetches: 90000` on an index-only scan | Visibility map is stale; the heap is still being read | Accept it, or reduce update frequency on the table |
| `actual rows=1` versus `rows=50000` | Severe misestimate | `ANALYZE`, then extended statistics on the correlated columns |
| `Sort Key: ...` missing but `ORDER BY` present | Plan will not use the index order | A filter on the indexed column, or a type mismatch, is disabling it |
| `Subquery Scan` with `never executed` | Trivial or unused branch | Simplify the query rather than optimizing it |

## Worked plan analysis

Query: recent open orders for one tenant, newest first, 50 rows. Table has 42 million rows.

```text
Limit  (cost=2841.12..2841.14 rows=50 width=64) (actual time=8.913..8.917 rows=50 loops=1)
  ->  Sort  (cost=2841.12..286191.10 rows=19000 width=64)
              (actual time=8.901..246.412 rows=50 loops=1)
        Sort Key: o.created_at DESC
        Sort Method: top-N heapsort  Memory: 32kB
        ->  Index Scan using orders_tenant_created_idx on orders o
                    (cost=0.42..280.55 rows=19000 width=64)
                    (index cond: (o.tenant_id = '7f1c...'::uuid))
                    (filter: (o.status = 'OPEN'::text))
                    (Rows Removed by Filter: 41800)
                    (Buffers: shared hit=1120 read=96)
Planning Time: 0.214 ms
Execution Time: 246.701 ms
```

Read it in order:

1. The `Limit` is real. Postgres is allowed to use top-N heapsort, so it does not need to sort all 19000 matches.
2. `Index Scan using orders_tenant_created_idx` confirms index use. The index is on `(tenant_id, created_at DESC)`.
3. `filter: (o.status = 'OPEN')` is the problem. `status` is not in the index, so every tenant row must be fetched and filtered. `Rows Removed by Filter: 41800` against 50 returned rows is a 836:1 waste ratio.
4. `Sort Method: top-N heapsort Memory: 32kB` proves the sort never spilled. Do not touch `work_mem` for this query.
5. `Buffers: shared hit=1120 read=96` shows the cost is buffer pressure on a hot tenant, not disk I/O. The fix is fewer buffers touched, not faster storage.

Change: add a partial composite index that includes the filter column.

```sql
CREATE INDEX CONCURRENTLY orders_open_recent_idx
    ON orders (tenant_id, created_at DESC)
 INCLUDE (total)
 WHERE status = 'OPEN';
```

Why this is correct: the partial predicate matches the query predicate literally, `tenant_id` is the equality column, `created_at DESC` is the sort column, and `total` is in the covering list so the heap is never visited. The expected new plan is an `Index Only Scan` with `Heap Fetches: 0` after `VACUUM` marks the recently created pages all-visible.

Rejected alternatives:

- Raising `shared_buffers` to avoid the 96 reads. The reads are a symptom of touching 1216 buffers, not a cache size problem.
- `LIMIT` to 500 and filter in Java. That moves the waste into the heap and breaks correctness when the client wants a full page.
- A GIN index on `status`. Status is a handful of distinct values; a btree on a low-cardinality column is not the bottleneck.

## Maintenance after index changes

```sql
VACUUM (ANALYZE) orders;
```

Required after a bulk load or an index build, because the planner chooses on statistics, and statistics collected on an empty or freshly bulk-loaded table are worse than none.

## Rules for keeping an index

1. An index earns its place when a plan uses it for a real predicate, join, or order. Confirm with `pg_stat_user_indexes.idx_scan` over a representative period, not a day.
2. Unused indexes still cost writes, `WAL`, and vacuum. Drop them, but check for a monthly job that only runs on the first of the month.
3. Do not build a functional index before the workload exists. The expression must be in the query.
4. Prefer `CREATE INDEX CONCURRENTLY` on any table serving production traffic. It cannot run inside a transaction block.
5. Keep the primary key index narrow. Every secondary index stores it, so a wide or composite primary key multiplies the size of the whole table.
6. Re-check the plan after `ANALYZE`, after a data volume change of an order of magnitude, and after any statistics change.
