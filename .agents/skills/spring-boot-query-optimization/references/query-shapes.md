# Query Shapes

Load this when fixing a specific query shape: an N+1, a deep offset, an expensive count, a chatty write loop, a projection that loads entities, or a predicate the index cannot serve.

## N+1 shapes

| Shape | Evidence | Fix |
| --- | --- | --- |
| Lazy collection touched while serializing | One statement per parent, `getCollectionFetchCount` equal to the row count | Entity graph on the query, or a DTO projected inside the transaction |
| Lazy many-to-one touched per row | One statement per row with the same foreign key | Join fetch, or include the field in the projection |
| `equals` or `hashCode` dereferences an association | Statement only inside a collection or map operation | Remove the association from `hashCode` |
| Repository call inside a loop in the assembler | One statement per collected element | Load the whole set once, or use a single projection query |
| Bidirectional graph serialization | Statements grow with depth | Bound the DTO explicitly; an entity is not a response type |
| `save` or `delete` inside a loop | Statement count equals the collection size | `saveAll` with batching, or a set-based native statement |

```java
// Wrong: one query for the page, one per row for the customer name.
return invoices.stream()
        .map(invoice -> new InvoiceRow(invoice.getId(), invoice.getCustomer().getName(), invoice.getTotal()))
        .toList();

// Right: one query, no entity, no lazy proxy.
@Query("""
        select new com.example.app.InvoiceRow(i.id, i.customer.name, i.total)
          from Invoice i
         where i.customer.id = :customerId
         order by i.issuedAt desc
        """)
List<InvoiceRow> findRows(@Param("customerId") UUID customerId);
```

## Pagination

```sql
-- Offset: cost grows with depth, and the heap is visited for skipped rows.
SELECT id, total
  FROM invoice
 WHERE customer_id = :customerId
 ORDER BY created_at DESC, id DESC
 LIMIT 50 OFFSET 500000;

-- Keyset: constant cost, stable under concurrent inserts.
SELECT id, total
  FROM invoice
 WHERE customer_id = :customerId
   AND (created_at, id) < (:cursorCreatedAt, :cursorId)
 ORDER BY created_at DESC, id DESC
 LIMIT 50;
```

| Requirement | Offset | Keyset |
| --- | --- | --- |
| Jump to page number | Supported | Not without walking or a stored cursor |
| Next and previous | Simple | Previous needs the reverse comparison and a saved cursor |
| Stable under inserts | No | Yes |
| Small bounded set | Fine | Fine, and no benefit |
| Sort column is not unique | Broken, rows duplicate across pages | Requires the tiebreaker in the cursor |
| Index | Leading filter column, then sort columns | Identical |

Keyset rules:

1. The cursor must carry every column in the `ORDER BY`, including the tiebreaker. Ordering by a non-unique column alone is not a stable cursor.
2. A row comparison tuple requires PostgreSQL 8.2 or later row-wise comparison, which is what makes `AND (created_at, id) < (:a, :b)` valid and indexable.
3. Mixed sort directions need the comparison written per column or via a normalized expression, which usually defeats the index. Keep every page in one direction.
4. Encode the cursor as an opaque, tamper-evident string. Never accept raw column values from the client.

```java
public record InvoiceCursor(Instant createdAt, UUID id) {

    public static InvoiceCursor decode(String opaque) {
        String[] parts = opaque.split("\\.", 2);
        return new InvoiceCursor(Instant.parse(parts[0]), UUID.fromString(parts[1]));
    }

    public String encode() {
        return createdAt.toString() + "." + id;
    }
}
```

## Counts

| Need | Wrong | Right |
| --- | --- | --- |
| Total count for pagination | `SELECT count(*)` on every request | Approximate count from statistics, or cache it with a short TTL |
| Existence check | `count(*) > 0` | `SELECT 1 ... LIMIT 1` |
| Per-page count | Count inside a loop | One grouped aggregate, or a projection |
| Dashboard totals | Recomputed per request | Materialized view or incremental aggregate, refreshed on a schedule |

```sql
-- Wrong: a full scan of the table on every page load.
SELECT count(*) FROM invoice WHERE customer_id = :customerId;

-- Right for an existence check.
SELECT 1 FROM invoice WHERE customer_id = :customerId LIMIT 1;

-- Right for a real total, cached with a short TTL and refreshed by a job.
SELECT reltuples::bigint
  FROM pg_class
 WHERE relname = 'invoice';
```

An approximate count from `pg_class.reltuples` is only as fresh as the last `ANALYZE` or `VACUUM`. That is acceptable for a page count and never acceptable for a billing total.

## Chatty write loops

| Pattern | Round trips | Fix |
| --- | --- | --- |
| `save` in a loop | One insert per row | `saveAll` plus `hibernate.jdbc.batch_size` |
| Update then read again | Two statements per row | Read once into a map, write once, do not re-read |
| `INSERT` per row into one table | One per row | Multi-row `INSERT ... VALUES (...), (...)` |
| Conditional update per row | One per row | Set-based `UPDATE ... WHERE` |
| Upsert per row | One per row | One `INSERT ... ON CONFLICT` with many value tuples |

```sql
INSERT INTO order_event (order_id, type, payload)
VALUES (:id1, 'CREATED', :p1),
       (:id2, 'PAID',    :p2),
       (:id3, 'SHIPPED', :p3)
ON CONFLICT (order_id, type) DO NOTHING;
```

Batching is a memory and lock trade. Measure at 10, 50, and 200 rows per batch. Larger is not better once the statement holds more locks for longer.

## Index-hostile rewrites

| Written | Problem | Rewrite |
| --- | --- | --- |
| `WHERE lower(email) = :v` with an index on `email` | Function on the column defeats a plain btree | Index `((lower(email)))` and keep the expression identical |
| `WHERE status <> 'CLOSED'` | Range predicate cannot use a btree for full coverage | Partial index `WHERE status <> 'CLOSED'`, or enumerate the open states |
| `WHERE created_at::date = :day` | Cast on the indexed column | Range predicate `created_at >= :from AND created_at < :to` |
| `WHERE name LIKE '%term%'` | Leading wildcard cannot use a btree | `pg_trgm` GIN index, or a full-text index |
| `WHERE a = 1 OR b = 2` | Often a full scan or a bitmap over both | `UNION ALL` of two indexed branches, or an expression index |
| `ORDER BY random()` | Full sort of the whole table per row | Sample a bounded candidate set first |
| `SELECT *` with a wide row | Heap width, serialization, mapping cost | Projection with only the needed columns |
| `IN (:list)` with thousands of values | Planning time explodes, plan cache fills | Join to a temporary table or `VALUES` list, or chunk it |

```sql
-- Bounded random sample instead of ORDER BY random() over the whole table.
SELECT id
  FROM invoice
 WHERE customer_id = :customerId
 ORDER BY created_at DESC
 LIMIT 100;
```

## Read-path architecture

| Read | Shape | Cost |
| --- | --- | --- |
| Row by primary key | Single-index lookup | Cheapest possible |
| Filtered list | Composite index matching filter then sort | One scan, bounded rows |
| Report across tables | Native SQL to a record | One statement, no entities |
| Dashboard aggregate | Materialized view refreshed on a schedule | Constant query time |
| Repeated identical read | Cache with explicit invalidation | Zero on hit, coherence cost on write |

Rule: choose the cheapest shape that satisfies the freshness requirement, and write that requirement down. "Fresh" is a business decision, not a technical default.

## Verification

For every shape change, record:

1. The statement count before and after.
2. The rows returned, to prove the result is unchanged.
3. The plan before and after.
4. p50, p95, and p99 for the same request on the same data volume.
5. A test that asserts the statement count, so the shape cannot silently regress.
