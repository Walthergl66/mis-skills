# Zero-Downtime Expand and Contract

Load this when changing a table that live traffic depends on: renaming a column, changing a type, splitting a table, adding a not-null column, or moving a large amount of data.

## The overlap rule

During a rollout the previous application version and the new one run against the same database. Every schema state must be valid for both. A migration that is correct only for the new code is not correct; it is a race that usually resolves at 3 a.m.

| Phase | Schema change | Old code | New code | Duration |
| --- | --- | --- | --- | --- |
| 1 Expand | Add the new column, nullable, with no constraint | Works | Not deployed | One deploy |
| 2 Deploy | No change | Works | Reads both, writes both | One deploy |
| 3 Backfill | Batched `UPDATE` | Works | Works | Hours to days |
| 4 Verify | Read-only checks that the backfill is complete | Works | Works | Minutes |
| 5 Constrain | `NOT NULL` validated, then the old column stops being written | Not deployed | Works | One deploy |
| 6 Contract | Drop the old column | Not deployed | Works | One deploy |

Never compress phases 1 and 2. The gap between them is the whole mechanism.

## Worked example: rename `invoice.due_date` to `due_at`

The old column is `date`, the new one must be `timestamptz` at UTC midnight. Old code reads `due_date`; new code reads `due_at`.

### Phase 1: expand

```sql
-- V2026_09_25_101500__add_invoice_due_at.sql
ALTER TABLE invoice ADD COLUMN due_at timestamptz;
```

No constraint, no index, no backfill. This takes a short `ACCESS EXCLUSIVE` lock; on PostgreSQL 16 adding a nullable column without a default is a catalog-only change and does not rewrite the table.

### Phase 2: deploy dual-write code

```java
public void recordDueDate(Invoice invoice, LocalDate dueDate) {
    invoice.setDueDate(dueDate);
    // Old column is still read by the previous release, so keep writing it.
    invoice.setDueAt(dueDate == null ? null : dueDate.atStartOfDay(ZoneOffset.UTC).toInstant());
}
```

The new release must tolerate `due_at` being null, because the backfill has not run yet. Read paths use `coalesce(due_at, due_date::timestamptz)`. Do not use a database default for this: a default only covers rows written after the column existed, and it hides the backfill from your verification query.

### Phase 3: backfill in batches

```sql
-- V2026_09_25_140000__backfill_invoice_due_at.sql
UPDATE invoice
   SET due_at = due_date::timestamptz
 WHERE id IN (
       SELECT id FROM invoice
        WHERE due_at IS NULL
          AND due_date IS NOT NULL
        ORDER BY id
        LIMIT 5000
   );
```

Run it as a scheduled job, not as one migration, once the table exceeds a few million rows. Rules:

1. Each batch is its own short transaction, so locks and WAL volume stay bounded.
2. Batch by primary key with `ORDER BY id`, so the job makes forward progress and is resumable.
3. Sleep between batches to leave headroom for real traffic. A backfill that saturates IO is an outage with a progress bar.
4. Log rows updated per batch. An unlogged backfill cannot be verified.
5. Be ready to throttle or stop it. The job must be killable without leaving inconsistent state.

### Phase 4: verify

```sql
SELECT count(*) FROM invoice WHERE due_at IS NULL AND due_date IS NOT NULL;
```

Only when that returns 0 may phase 5 start. Add the verification query to the deploy checklist, not to a ticket comment.

### Phase 5: enforce the constraint

```sql
-- V2026_09_26_090000__require_invoice_due_at.sql
ALTER TABLE invoice ALTER COLUMN due_at SET NOT NULL;
CREATE INDEX CONCURRENTLY invoice_due_at_idx ON invoice (due_at);
```

`SET NOT NULL` scans the table and holds `ACCESS EXCLUSIVE`. Either set `lock_timeout` so it fails fast, or use the validated constraint form, which trusts the existing data and skips the scan:

```sql
ALTER TABLE invoice
    ADD CONSTRAINT invoice_due_at_not_null CHECK (due_at IS NOT NULL) NOT VALID;
ALTER TABLE invoice VALIDATE CONSTRAINT invoice_due_at_not_null;
ALTER TABLE invoice ALTER COLUMN due_at SET NOT NULL;
DROP CONSTRAINT invoice_due_at_not_null;
```

`CREATE INDEX CONCURRENTLY` cannot run inside a transaction; put it in its own migration with `-- flyway:executeInTransaction=false`.

### Phase 6: contract

```sql
-- V2026_10_03_090000__drop_invoice_due_date.sql
ALTER TABLE invoice DROP COLUMN due_date;
```

Only after every running instance is on the new code. Verify with the instance version, not with the deployment timestamp.

## Type change without a table rewrite

| Change | Expand-and-contract route | Direct route |
| --- | --- | --- |
| `int` to `bigint` | Add a new column, dual-write, backfill, swap | `ALTER TABLE ... ALTER COLUMN ... TYPE bigint` rewrites the table and holds an exclusive lock |
| `text` to `varchar(n)` | Add the constrained column, swap | Rewrites the table; fails on existing long values |
| `timestamp` to `timestamptz` | New column, because old values have no zone and must be interpreted | In-place conversion assumes a zone that was never stored |
| Narrowing a type | Never in place | Data loss; requires a verified pre-cleanup |
| Widening a varchar | Usually in place is safe for `varchar` without a length change | Verify no dependent index or constraint blocks it |

Widening `numeric(19,4)` to `numeric(23,4)` is treated as a table rewrite unless proven otherwise. Test the exact statement on a restored copy with `EXPLAIN`-equivalent timing, or go through expand-and-contract so the lock is never held long.

## Split a table

1. Create the new table with the final shape and its own primary key and constraints.
2. Add a trigger that writes to both tables on `INSERT`, `UPDATE`, and `DELETE`, so the old table stays authoritative.
3. Backfill the new table in batches.
4. Verify row counts and a checksum per business invariant.
5. Deploy reads against the new table only after verification passes, keeping dual-write active.
6. Stop the trigger only after every writer is confirmed on the new table.
7. Drop the old table in a later release.

## Rollback limits

| Change | Reversible? | Honest rollback |
| --- | --- | --- |
| Added nullable column | Yes | `DROP COLUMN`, or leave it; it is inert |
| Added index | Yes | `DROP INDEX`; if built concurrently and failed, drop the invalid index first |
| Backfill of derived data | Yes | Re-derive from the old column, or accept the new value if it is authoritative |
| Dropped column | No | Restore from backup, or replay from a logical export. This is why contract is last |
| Renamed via a new column | Yes, until the old column is dropped | Point the code back at the old column |
| Added a not-null constraint | Yes | `DROP CONSTRAINT` or `ALTER COLUMN ... DROP NOT NULL` |
| Changed a type in place | No | Restore from backup |

## Rollout checklist

1. Every phase is a separate migration file with a timestamp that reflects its position.
2. The expand migration is additive and reversible.
3. The dual-write code is deployed and confirmed live before any backfill starts.
4. The backfill is batched, resumable, throttleable, and observable.
5. Verification is a query whose result is checked and recorded.
6. Every strong-lock statement sets `lock_timeout`.
7. Every `CONCURRENTLY` statement is in a non-transactional migration.
8. The contract migration is gated on a confirmed application version, not on elapsed time.
9. The rollback column in the release notes states the truth for each phase.
