# Transactions, Locking, and Pool Sizing

Load this when choosing an isolation level, taking row locks, implementing a work queue, breaking deadlocks, or sizing and tuning HikariCP.

## MVCC in one paragraph

Every row version carries an `xmin` and an `xmax`. Readers never block writers and writers never block readers, because a reader follows the version chain to the row visible in its snapshot and ignores versions created after the snapshot. The costs are dead tuples that must be cleaned later, and long-running transactions that prevent that cleanup, which is why an idle-in-transaction session is a production incident.

## Isolation levels

| Level | Snapshot timing | Blocks | Prevents | Still possible | Postgres anomaly code |
| --- | --- | --- | --- | --- | --- |
| `READ COMMITTED` (default) | New snapshot per statement | Writers block writers on the same row | Dirty reads | Non-repeatable reads, phantoms, write skew | `40001` under `SERIALIZABLE` only |
| `REPEATABLE READ` | Fixed at the first statement in the transaction | Writers block writers | Dirty and non-repeatable reads | Write skew, serialization failure | `40001` |
| `SERIALIZABLE` | Fixed at the first statement, with predicate locks | Writers block writers | All anomalies | Serialization failure | `40001` |
| `READ UNCOMMITTED` | Behaves as `READ COMMITTED` | Same as above | Nothing extra | Everything | Same as above |

Rules:

1. Keep `READ COMMITTED` unless a specific anomaly is being prevented. It is the default because the alternatives trade throughput and retry complexity for correctness that locking usually provides more cheaply.
2. In `REPEATABLE READ` and `SERIALIZABLE`, catch `40001` and `40P01` together and retry the whole transaction. A retry that only handles deadlock is a retry that will lose work under `SERIALIZABLE`.
3. Every retried transaction must be idempotent. Use an idempotency key, `INSERT ... ON CONFLICT DO NOTHING`, or a state check.
4. Never rely on `SERIALIZABLE` to protect an invariant that a `CHECK`, unique index, or foreign key can protect declaratively.
5. Set a `statement_timeout` and an `idle_in_transaction_session_timeout` per runtime role. A transaction that never commits blocks vacuum for the whole cluster.

```sql
ALTER ROLE app_runtime SET statement_timeout = '5s';
ALTER ROLE app_runtime SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE app_runtime SET lock_timeout = '2s';
```

## Row locking

```sql
-- Exclusive claim; a second transaction waits.
SELECT id FROM job WHERE status = 'READY' ORDER BY next_run_at FOR UPDATE LIMIT 1;

-- Non-blocking exclusive claim; claim a different row instead of waiting.
SELECT id FROM job WHERE status = 'READY' ORDER BY next_run_at FOR UPDATE SKIP LOCKED LIMIT 1;

-- Fail fast rather than block a caller with no timeout.
SELECT id FROM job WHERE id = :id FOR UPDATE NOWAIT;

-- Lock only one side of a join, so the joined rows stay updatable.
SELECT o.id FROM orders o
  JOIN shipment s ON s.order_id = o.id
 WHERE s.id = :shipmentId
 FOR UPDATE OF o;
```

| Clause | Behavior | Use |
| --- | --- | --- |
| `FOR UPDATE` | Blocks until the row is unlocked, then locks it | Single-writer invariants on a small row set |
| `FOR NO KEY UPDATE` | Lock without blocking a foreign key reference | Read-modify-write that keeps referential integrity cheap |
| `FOR SHARE` | Blocks writers, allows other readers | Enforce read consistency while others read |
| `SKIP LOCKED` | Silently skips locked rows | Work queues, parallel workers, claim loops |
| `NOWAIT` | Errors immediately if the row is locked | User-facing flows that must not queue |
| `OF alias` | Restricts locking to the listed tables | Joins where only one side is mutated |
| `pg_advisory_xact_lock(key)` | Application-level mutex keyed by bigint | Cross-table coordination with no row to lock |

Lock modes escalate, so a transaction that takes shared locks and then requests an exclusive lock on the same row can deadlock with itself. Acquire the strongest lock you need the first time.

## The `SKIP LOCKED` queue

```sql
-- Claim up to 10 jobs, ordered by due time, never blocking another worker.
UPDATE job
   SET status      = 'CLAIMED',
       claimed_at  = now(),
       claimed_by  = :workerId
 WHERE id IN (
        SELECT id
          FROM job
         WHERE status = 'READY'
           AND next_run_at <= now()
         ORDER BY next_run_at
         FOR UPDATE SKIP LOCKED
         LIMIT 10
 )
RETURNING id;
```

Queue rules:

1. `SKIP LOCKED` converts lock contention into fair work distribution. The cost is starvation, so a claimed job needs a visibility timeout that returns it to `READY`.
2. Do not run `SKIP LOCKED` inside a long transaction. The claim is only durable when the transaction commits.
3. Keep the partial index that makes the claim cheap: `CREATE INDEX ON job (next_run_at) WHERE status = 'READY'`.
4. Do not skip locking for ordered business processing. `SKIP LOCKED` reorders work; use it only where reordering is acceptable.
5. A `claim_timeout` sweep must be a separate scheduled job with its own transaction, never a side effect of the claim query.

## Deadlocks

A deadlock is not a bug in Postgres. It is the database refusing to guess. The detector fires after `deadlock_timeout` (default 1s) on one participant, and the application must resolve it.

| Cause | Prevention |
| --- | --- |
| Two transactions lock rows in opposite order | Lock in a single documented order, usually primary key ascending |
| Locking a parent row, then a child, while another does the reverse | Fix the order in code and assert it in a test |
| Long transactions holding locks across business logic | Bound the transaction to one use case |
| `SKIP LOCKED` nested with a blocking lock | Do not mix queue claims with row-critical sections |
| A growing table making the scan slow, so locks are held longer | Index the locking predicate |

```java
@Transactional
public void transfer(UUID fromId, UUID toId, BigDecimal amount) {
    List<UUID> ordered = Stream.of(fromId, toId).sorted(Comparator.reverseOrder()).toList();
    List<Account> accounts = accountRepository.lockAllInOrder(ordered);
    if (accounts.size() != 2) {
        throw new AccountNotFoundException(fromId, toId);
    }
    accounts.get(0).debit(amount);
    accounts.get(1).credit(amount);
}
```

The descending sort is the whole point: locking both rows in a deterministic key order removes the only common cause of this deadlock.

The retry wrapper must sit outside the transaction boundary so each attempt gets a new transaction and a new snapshot.

```java
@Query(value = """
        SELECT * FROM account
         WHERE id IN (:first, :second)
         ORDER BY id DESC
         FOR UPDATE
        """, nativeQuery = true)
List<Account> lockAllInOrder(@Param("first") UUID first, @Param("second") UUID second);
```

The repository performs the ordering in SQL, so no caller can forget it.

```java
@Retryable(
        retryFor = {CannotSerializeTransactionException.class, PessimisticLockingFailureException.class},
        maxAttempts = 3,
        backoff = @Backoff(delay = 50, multiplier = 2.0, random = true))
@Transactional
public void transfer(UUID fromId, UUID toId, BigDecimal amount) {
    // invariants and repository calls
}
```

## Connection and transaction hygiene

1. `open-in-view: false` must be set. A view that stays open for the whole request holds a connection and, with a lazy association, a long transaction.
2. Never call an HTTP client, a broker, or a mail sender inside a transaction. The connection is held for the full round trip.
3. Bound the transaction to one use case, not to the request, by default. A read-only use case needs no explicit write transaction.
4. Set a query timeout on every read that scans an unbounded range. `JdbcTemplate.setQueryTimeout` and `@Query(timeout = ...)` both exist.
5. A Hikari `leakDetectionThreshold` logs a stack trace for any connection held longer than the threshold. Run with it enabled in staging, not only in tests.

## HikariCP sizing

Two separate questions, answered in this order.

**Question 1: how many connections can the database serve?**

```
max_connections
  - superuser_reserved_connections        (default 3)
  - headroom for migrations, monitoring, and operators
= connection budget for the application
```

```
application pool budget / maximum instances of the app = maximumPoolSize
```

With `max_connections = 100` and 6 replicas: `100 - 3 - 12 = 85` usable, `85 / 6 = 14` per instance. Round down and leave slack. A pool that exceeds the budget does not add throughput; it converts into connection failures and context switching.

**Question 2: how many connections does one instance need?**

| Observed signal | Interpretation | Action |
| --- | --- | --- |
| `connection-timeout` fired, database CPU is low | Pool too small for burst concurrency | Raise the pool within the budget |
| `connection-timeout` fired, database CPU is saturated | Database is the constraint | Lower the pool, fix the query, add a read replica |
| Pool wait is near zero, database CPU is saturated | Database is the constraint | More connections cannot help |
| Pool wait near zero, application CPU saturated | Application is the constraint | Do not touch the pool; profile the JVM |
| Connections idle in the pool exceed the working set | Wasteful but harmless | Set `minimum-idle` lower than `maximum-pool-size` |
| `idle in transaction` accumulates | A transaction is never finishing | Fix the transaction, not the pool |

A small pool is usually correct. `2 * CPU cores + effective_spindles` is a starting point for OLTP, not a target, and PostgreSQL performs best with a working set that fits in `shared_buffers`.

## Timeouts that must be ordered

| Setting | Rule |
| --- | --- |
| `connection-timeout` | Below the pool wait the caller can tolerate, typically 2 to 3 seconds |
| `statement-timeout` | Above normal p99, below the incident threshold |
| `lock_timeout` | Lower than `statement_timeout`, so lock waits fail before statement cancellation |
| `max-lifetime` | Below the shortest idle connection timeout in the path, including proxies and firewalls |
| `validation-timeout` | Below `connection-timeout` |

```yaml
spring:
  datasource:
    hikari:
      maximum-pool-size: 14
      minimum-idle: 14
      connection-timeout: 2500
      validation-timeout: 1000
      max-lifetime: 1500000
      leak-detection-threshold: 60000
      auto-commit: true
```

`max-lifetime` of 25 minutes is below the 30-minute idle default of most managed proxies and load balancers. Never set `auto-commit: false` here: Spring controls autocommit per transaction, and a pool left in manual commit mode deadlocks the first statement.
