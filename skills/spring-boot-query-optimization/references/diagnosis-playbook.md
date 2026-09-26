# Diagnosis Playbook

Load this when starting a slow-query or low-throughput investigation, choosing which tool answers which question, or recording the evidence for a fix.

## Step 1: define the symptom

Record, in writing, before touching anything:

| Field | Why it matters |
| --- | --- |
| p50, p95, p99 latency | A mean hides the users who are complaining |
| Throughput, requests or jobs per second | A fix can improve latency and destroy throughput |
| Error rate and timeout rate | A retry storm can look like a latency problem |
| The exact operation | One endpoint, one job, one consumer |
| The window and whether it is new or chronic | A regression has a commit; a chronic issue has a cause |
| Data volume at the time | Volume and skew change the plan |

## Step 2: bound the work

1. Reproduce one request with one input that is representative, not the easiest one.
2. Choose the worst-affected path. Optimizing the median when the p99 is broken wastes the effort.
3. Note what the user experiences: a slow page, a timeout, a queue backlog, or a failed job.

## Step 3: attribute the time

| Span | Typical cause | Tool |
| --- | --- | --- |
| External dependency | Remote call latency or a retry | Distributed tracing |
| Network and serialization | Payload size, TLS, JSON cost | Response size, profiler |
| Connection pool wait | Pool exhaustion caused elsewhere | Hikari metrics, `pg_stat_activity` session count |
| Database execution | Plan, missing index, data volume | `EXPLAIN (ANALYZE, BUFFERS)` |
| Lock wait | Long or badly ordered transactions | `pg_locks`, `pg_stat_activity.wait_event_type` |
| Application CPU | Allocation, algorithm, dirty checking | JVM profiler, Hibernate statistics |

Rule: attribute before optimizing. A pool timeout caused by a 40 second query is not a pool problem.

## Step 4: get the actual statement

| Source | How to enable | Warning |
| --- | --- | --- |
| `pg_stat_statements` | `CREATE EXTENSION` plus `shared_preload_libraries` | Call counts and total time, no parameters |
| `log_min_duration_statement` | `ALTER SYSTEM SET log_min_duration_statement = '200ms'` | Writes every slow statement to the log |
| `auto_explain` | `ALTER SYSTEM SET auto_explain.log_min_duration = '500ms'` plus `log_analyze` | `ANALYZE` runs the statement, so it doubles the cost |
| Hibernate SQL log | `logging.level.org.hibernate.SQL=DEBUG` | Never in production; bound parameters are customer data |
| Statement interceptor | `hibernate.session_factory.statement_inspector` | Application-side counts, useful in a test |

Capture the statement, its parameters, its call count, and its total time. A statement executed ten thousand times at 2 ms is a different problem from one executed once at 2 seconds.

## Step 5: reproduce on production-like data

```sql
INSERT INTO invoice (id, customer_id, status, issued_at, total)
SELECT gen_random_uuid(),
       '00000000-0000-0000-0000-000000000001'::uuid,
       CASE WHEN random() < 0.1 THEN 'OVERDUE' ELSE 'OPEN' END,
       now() - (random() * interval '730 days'),
       round((random() * 5000)::numeric, 2)
  FROM generate_series(1, 5000000);
ANALYZE invoice;
```

- Match row count, not just schema.
- Match the skew. Ten percent overdue in dev and zero percent in production produce different plans.
- Run `ANALYZE` after the load, and keep autovacuum enabled so the numbers stay honest.
- Confirm the plan changed under the larger data. If it did not, the reproduction is still invalid.

## Step 6: change one variable

| Change | Measure | Do not accept |
| --- | --- | --- |
| Add an index | Same workload, same data, plan plus percentiles | A faster `EXPLAIN` alone |
| Change fetch strategy | Statement count and percentiles | A smaller SQL log |
| Add a projection | Allocated bytes and percentiles | Fewer columns in the log |
| Change batch size | Throughput and p99 at 10, 50, 200 | One data point |
| Add a cache | Hit ratio and origin latency | A faster warm path only |
| Reduce pool contention | Pool wait and database CPU | A higher pool size with unchanged throughput |

## Step 7: re-measure identically

1. Same dataset, same statistics state.
2. Same concurrency and arrival pattern.
3. Same warm-up and duration.
4. Same percentiles, reported before and after.
5. Report the plan change as supporting evidence, never as the result.

## Step 8: keep or revert

Revert anything that did not move the metric. A change that improves a microbenchmark and does not move p99 is added cost with no benefit.

## Locking evidence

```sql
SELECT a.pid,
       a.state,
       a.wait_event_type,
       a.query_start,
       a.state_change,
       left(a.query, 120) AS query
  FROM pg_stat_activity a
 WHERE a.datname = current_database()
   AND a.pid <> pg_backend_pid()
 ORDER BY a.query_start;
```

```sql
SELECT blocked.pid AS blocked_pid,
       blocking.pid AS blocking_pid,
       left(blocked.query, 80) AS blocked_query,
       left(blocking.query, 80) AS blocking_query
  FROM pg_stat_activity blocked
  JOIN pg_stat_activity blocking
    ON blocking.pid = ANY(pg_blocking_pids(blocked.pid));
```

An `ACCESS EXCLUSIVE` lock held by a migration blocks every concurrent query and then blocks everything queued behind it. Set `lock_timeout` in any statement that takes a strong lock.

## Pool evidence

| Metric | Healthy | Investigate when |
| --- | --- | --- |
| Pending threads | 0 | Any sustained value above zero |
| Idle connections | Close to working set | Far above the working set |
| Usage timeout | Never | Any occurrence |
| Mean acquisition time | Single-digit ms | Close to `connection-timeout` |
| Database sessions | Below the budget | At `max_connections` |

Pool wait above zero with low database CPU means the queries themselves are slow. Fix the query before touching the pool size.

## Evidence template

```text
Symptom:     p50 / p95 / p99, throughput, errors, window, operation
Workload:    concurrency, duration, data volume, warm-up
Attribution: application CPU | pool wait | DB execution | lock wait | network | external
Evidence:    statement text, call count, total time, plan, row counts
Diagnosis:   the single dominant bottleneck and the measurement that identified it
Ruled out:   the alternatives considered and the evidence that eliminated them
Change:      one intervention and its mechanism
Result:      same metrics after, on the same workload and data
Guard:       test, statistic, or assertion that catches a regression
```

## N+1 in tests

Turn a diagnosis into a build failure.

```java
@Test
void pageOfInvoicesIssuesOneStatement() {
    statistics.clear();
    statistics.setStatisticsEnabled(true);

    invoiceRepository.findPageByCustomerId(customerId, PageRequest.of(0, 50));

    assertThat(statistics.getQueryExecutionCount()).isLessThanOrEqualTo(2);
}
```

The threshold is the statement count of the correct implementation plus a small allowance. Set it from the fixed query, not from the current number, or the test ratifies the bug.
