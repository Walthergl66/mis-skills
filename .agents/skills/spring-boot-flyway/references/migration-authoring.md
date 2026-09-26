# Migration Authoring

Load this when naming, writing, baselining, validating, repairing, or seeding a Flyway migration, and when deciding where migrations run.

## File naming

```
V<version>__<description>.sql
R__<description>.sql
U<version>__<description>.sql
```

- Version format: `yyyyMMddHHmmss` in UTC, 14 digits, separated by underscores when it exceeds three groups, for example `V2026_09_25_101500__add_invoice_due_at.sql`.
- Description: lowercase words separated by underscores, describing the change, not the ticket.
- Exactly two underscores between version and description. One underscore is a parse error, not a warning.
- Migration locations: `classpath:db/migration` for packaged artifacts, `filesystem:db/migration` for an external runner.

| Rule | Why |
| --- | --- |
| Timestamps, not integers | Teams merge branches; `V3` from two branches becomes `V3` and `V3.1`, which changes meaning |
| UTC, not local time | A laptop in another timezone must not generate a colliding version |
| One logical change per file | A failed migration retries as a unit; two changes means one blocks the other |
| Never rename an applied file | The version is a primary key in the history table |
| Never edit an applied file | The stored checksum will mismatch and block every subsequent deploy |

## Choosing the kind

| Need | Kind | Reason |
| --- | --- | --- |
| Add a column, create a table, add a constraint | `V` | Must run exactly once, in a known order |
| Backfill or correct data | `V` | Ordering against schema changes must be deterministic |
| Create or update a view | `R` | Must be re-synced whenever the definition changes |
| Create or update a function or trigger | `R` | Same reason; a `V` would freeze the old definition forever |
| Grant or revoke a privilege | `R` | Must track the current desired state |
| Reverse a migration in dev or test | `U` | Explicit, operator-driven reversal |
| Seed reference data needed by the app | `V` | Part of the ordered schema history |
| Post-migration assertion or notification | Callback | Cannot be expressed as SQL |

Repeatable migrations run after all pending versioned migrations, in alphabetical order, and only when their checksum differs from the stored one. Anything that must interleave with a versioned migration belongs in a `V` file.

## Adopt an existing database

An existing database has a schema and no history table. Version three is the safe path.

1. Confirm the existing schema matches a known commit in Git.
2. Write `V1__baseline_existing_schema.sql` that reproduces the current schema, or capture the existing schema with `pg_dump --schema-only`.
3. Create the history table by hand with `baseline` and `baselineVersion: 0`:

```sql
CREATE TABLE IF NOT EXISTS flyway_schema_history (
    installed_rank INT NOT NULL,
    version        VARCHAR(50),
    description    VARCHAR(200) NOT NULL,
    type           VARCHAR(20) NOT NULL,
    script         VARCHAR(1000) NOT NULL,
    checksum       INTEGER,
    installed_by   VARCHAR(100) NOT NULL,
    installed_on   TIMESTAMP NOT NULL DEFAULT now(),
    execution_time INTEGER NOT NULL,
    success        BOOLEAN NOT NULL
);
```

4. Set `spring.flyway.baseline-on-migrate: true` and `spring.flyway.baseline-version: 0`, then let the first real migration be a `V` with a timestamp greater than 0.
5. Validate in a restored copy of production, not on a hand-built approximation.

Never baseline a database whose schema you have not compared against the migration history. Baseline asserts "everything up to version N is true"; a wrong baseline silently skips every migration that would have fixed a difference.

## Validate before deploy

```bash
mvn -q flyway:validate -Dflyway.url=jdbc:postgresql://db:5432/app -Dflyway.user=migrator
mvn -q flyway:info     -Dflyway.url=jdbc:postgresql://db:5432/app -Dflyway.user=migrator
mvn -q flyway:migrate  -Dflyway.url=jdbc:postgresql://db:5432/app -Dflyway.user=migrator
```

| Command | Answers | Run it |
| --- | --- | --- |
| `validate` | Does the local history match the database | In CI before every deploy |
| `info` | What is applied, pending, or resolved | When a deploy is stuck |
| `migrate` | Apply everything pending | Only in the migration step |
| `repair` | Rewrite history metadata | Only for the three listed cases |
| `undo` | Reverse one versioned migration | Dev and test only |
| `clean` | Drop everything | Never; keep `clean-disabled: true` |

## Diagnose a failed validate

| Message fragment | Real cause | Correct action |
| --- | --- | --- |
| `Migration checksum mismatch` | A file was edited after being applied | Restore the file from Git. If the change is genuinely needed, add a new migration |
| `Applied migration not resolved locally` | History references a file missing from the artifact | Check out the matching tag. `repair` only after confirming the file exists elsewhere |
| `Resolved migration not applied to database` | The migration step did not run | Run `migrate`. Never `repair`; `repair` marks it applied without executing it |
| `No schema history table` | Unbaselined existing database | Baseline, or set `baseline-on-migrate` |
| `Out of order` | A version lower than the current one appeared | Fix the version, or accept the risk explicitly and record it |
| `Detected both a versioned and a repeatable migration with the same description` | A file was renamed between kinds | Rename one of them |

`repair` is not a rollback. It rewrites `flyway_schema_history` so that validation passes again. It never changes the database schema. The only legitimate uses:

1. A repeatable migration was removed and its checksum must be forgotten.
2. A versioned migration file was deleted after being applied, and the file is confirmed to have run in every environment.
3. A baseline was recorded at the wrong version and every environment must be realigned.

Anything else, including a checksum mismatch caused by an edit, is fixed by restoring the file.

## Write safe, idempotent DML

```sql
INSERT INTO country (code, name)
VALUES ('ES', 'Spain')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;
```

- A migration that is retried after a partial failure must reach the same end state. `ON CONFLICT` makes the reference-data seed replayable.
- Never write `INSERT` without a conflict clause into a table that application code also writes.
- Batch large updates. One statement that touches 50 million rows holds locks and generates a huge WAL volume.
- Give a backfill a termination condition and a progress report. A backfill that runs for six hours inside a transaction blocks vacuum for the duration.

```sql
UPDATE invoice
   SET status = 'OVERDUE'
 WHERE status = 'OPEN'
   AND due_at < now()
   AND id IN (
       SELECT id FROM invoice
        WHERE status = 'OPEN'
          AND due_at < now()
        ORDER BY id
        LIMIT 5000
   );
```

## Seed and development data

| Content | Location | Prefix | Committed |
| --- | --- | --- | --- |
| Reference data the app needs | `classpath:db/migration` | `V` | Yes |
| Demo or sample dataset | `classpath:db/devdata` | `V` | Yes, but only wired through the dev profile location |
| Test fixtures | Test source set | n/a | Yes, in the test tree, never in `db/migration` |
| Credentials or API keys | Nowhere | n/a | No |

```yaml
spring:
  config:
    activate:
      on-profile: local
  flyway:
    locations: classpath:db/migration,classpath:db/devdata
```

A migration that inserts a test account or a fake API key is a production data leak that ships on every deploy.

## Transactional DDL and files that cannot be transactional

PostgreSQL runs DDL in a transaction, so a failing `V` migration rolls back completely. Two things break that rule.

```sql
-- flyway:executeInTransaction=false
SET lock_timeout = '3s';
CREATE INDEX CONCURRENTLY invoice_customer_status_idx
    ON invoice (customer_id, status);
```

| Command | Why it cannot be transactional | Directive |
| --- | --- | --- |
| `CREATE INDEX CONCURRENTLY` | Multiple transactions, cannot be rolled back partially | `executeInTransaction=false` |
| `REINDEX CONCURRENTLY` | Same | `executeInTransaction=false` |
| `VACUUM` | Cannot run inside a transaction block | `executeInTransaction=false` |
| `ALTER TYPE ... ADD VALUE` on a type in use | New value is not visible to older transactions | `executeInTransaction=false` and a separate deployment |

Set `lock_timeout` at the top of every migration that takes a strong lock. Without it, an `ALTER TABLE` waits behind a long-running query and then blocks every subsequent query while it waits. Failing fast converts an outage into a retry.

## Test the migration

1. Restore the previous production schema and a representative data volume.
2. Run the full pending migration set.
3. Assert the resulting schema matches expectations with `information_schema` queries or a schema diff.
4. Assert application-level invariants on the migrated data, not just the schema.
5. Re-run the whole set a second time to prove nothing breaks on replay.
6. If the migration is part of an expand-and-contract, run it while the previous application version is live.

Testing only against a fresh empty database proves nothing about a migration whose job is to change an existing table.
