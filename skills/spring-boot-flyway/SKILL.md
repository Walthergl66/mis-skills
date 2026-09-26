---
name: spring-boot-flyway
description: 'Use when authoring, ordering, baselining, repairing, or validating Flyway 11 migrations for a Spring Boot 3.5 application on PostgreSQL 16. Triggers include V-prefixed versioned migrations, R repeatable migrations, U undo migrations, checksum mismatch, validate failed, detected applied migration not resolved locally, baseline on an existing database, out of order, schema history table, expand and contract column renames, seed data, and running migrations as a pipeline step. Do not use for choosing column types or indexes, for entity mapping changes, for pipeline stage ordering, or for provisioning test databases. When other skills also apply, reconcile ownership before mutation.'
license: MIT
metadata:
  author: Walthergl66
  version: '1.0.0'
---

# Flyway Migration Authoring and Deployment

A migration is a committed, ordered, permanent fact about the schema. Write it so an operator can run it on a restored copy, understand it without the application, and reverse it when reversal is honestly possible.

## When to use

- Naming or authoring a versioned, repeatable, or undo migration, or handling a checksum mismatch or a database with a schema but no history.
- Planning a zero-downtime expand-and-contract change with dual write, backfill, and cleanup.
- Deciding between startup migration and a pipeline step, or seeding reference data and protecting migration-only credentials.

## When not to use

- Choosing column types, index types, or query plans: hand off to `spring-boot-postgresql`.
- Updating entity mappings for the new column: hand off to `spring-boot-hibernate`.
- Pipeline stage ordering, gates, and promotion: hand off to `spring-boot-ci-cd`.
- Provisioning a throwaway test database: hand off to `spring-boot-testcontainers` or `spring-boot-integration-testing`.

## Ownership and sibling boundaries

This skill owns migration files, naming, ordering, baselines, repeatables, callbacks, repair, validation, and the expand-and-contract sequence.

- Column type and index choices belong to `spring-boot-postgresql`; this skill only records them as DDL.
- ORM mapping changes belong to `spring-boot-hibernate`; a mapping change and a migration ship together with separate owners.
- `spring-boot-ci-cd` owns pipeline stage ordering and gates; `spring-boot-testcontainers` owns ephemeral test databases; `spring-boot-postgresql` owns runtime connection configuration.

## Hard rules

1. One logical change per file, named for the change, with a UTC timestamp version.
2. Never edit or rename a migration that has run in a shared environment. Add a new one.
3. Every migration is reversible, or its irreversibility is stated in the same commit.
4. Test against the previous production schema with representative data, never an empty database.
5. Set `ddl-auto: none`. Two tools must never own the same schema.
6. No migration may depend on wall-clock time, random data, or a network call, and none may contain a secret.

## Name and classify the migration

| Kind | File name | Re-runs | Use for | Never use for |
| --- | --- | --- | --- | --- |
| Versioned | `V2026_09_25_101500__add_invoice_due_at.sql` | Once, in version order | DDL, backfills, and data fixes that must happen exactly once | Anything whose order depends on wall-clock time |
| Repeatable | `R__invoice_reports.sql` | When its checksum changes | Views, functions, grants, and anything re-synced to a definition | Ordered DDL that must interleave with versioned migrations |
| Undo, or callback | `U2026_09_25_101500__name.sql`, or a Java callback class | Only on an explicit `undo` or matching event | Reversing a migration in dev or test, or a post-migration assertion | Production rollback, or anything that can be plain SQL |

1. Use a UTC timestamp, 14 digits, never a bare `V1` or `V2`; teams merge branches and collide. Name for the change, not the ticket.
2. Repeatable migrations run after all pending versioned ones, so a backfill in `R__` loses its place in the order.
3. Locations: `classpath:db/migration` packaged, `filesystem:db/migration` external.

## Configuration

```yaml
spring:
  jpa:
    hibernate:
      ddl-auto: none
  flyway:
    locations: classpath:db/migration
    baseline-on-migrate: true
    baseline-version: 0
    validate-on-migrate: true
    out-of-order: false
    clean-disabled: true
```

| Property | Value | Reason |
| --- | --- | --- |
| `baseline-on-migrate` | `true` for an existing database, `false` for a new one | Without it, adopting an existing schema fails validation |
| `validate-on-migrate` | `true` | Detects a drifted history before anything executes |
| `clean-disabled` | `true` | `clean` drops the entire schema and must not be reachable by accident |
| `baseline-version` | `0` unless adopting at a known point | Recorded as the baseline, so the first real migration must be greater |

## Startup migration or pipeline step

| Option | Use when | Cost |
| --- | --- | --- |
| Separate pipeline step before new pods start | Default for every production environment | Needs a stage and a gate that can fail the deploy |
| Application startup, auto-configured | Local development or a single-instance internal tool | Every replica races, a failure is a crash loop, no ordering gate |

The separate step is preferred because it turns schema change into an explicit, observable, gateable event that happens once. Startup migration turns it into a replica race, a crash loop, and a half-rolled deploy. Either way the migration role must differ from the runtime role.

## Repair, drift, and validation

| Symptom | Cause | Action |
| --- | --- | --- |
| `Migration checksum mismatch` | An applied file was edited | Restore the file from Git; add a new migration for the change |
| `Detected applied migration not resolved locally` | History references a file missing from the artifact | Check out the matching tag; `repair` only after confirming the file exists |
| `Detected resolved migration not applied` | The pipeline skipped the step | Run `migrate`. Never `repair`, which marks it applied without executing it |
| `No schema history table` | Unbaselined existing database | Baseline with the correct version, in a restored copy first |

`repair` only rewrites `flyway_schema_history`; it never executes or undoes anything. It is legitimate for a removed repeatable migration, a deleted but confirmed applied file, or a mis-recorded baseline. Everything else is a forward fix.

## Zero downtime and data movement

Every change is expand, migrate, contract, because the old and new application versions overlap. The old column must stay writable until every running instance is on the new code.

```sql
ALTER TABLE invoice ADD COLUMN due_at timestamptz;

UPDATE invoice SET due_at = due_date::timestamptz
 WHERE id IN (SELECT id FROM invoice WHERE due_at IS NULL ORDER BY id LIMIT 5000);
```

Never compress expand and deploy dual-write into one step; the gap between them is the mechanism. The full playbook, with the not-null constraint, the verification query, and the irreversible drop, is in [references/zero-downtime.md](references/zero-downtime.md).

## Transactional DDL and its limits

PostgreSQL runs DDL in a transaction, so a failing versioned migration rolls back completely. Two things break that rule, and both need their own file with a directive at the top:

```sql
-- flyway:executeInTransaction=false
SET lock_timeout = '3s';
CREATE INDEX CONCURRENTLY invoice_customer_status_idx ON invoice (customer_id, status);
```

| Command | Why it cannot be transactional | Handling |
| --- | --- | --- |
| `CREATE INDEX CONCURRENTLY`, `REINDEX CONCURRENTLY` | Multiple transactions, no partial rollback | `executeInTransaction=false`; drop the invalid index if it fails |

Set `lock_timeout` in every migration that takes a strong lock, so it fails fast instead of blocking every query queued behind it.

## Seed data

| Content | Location | Committed |
| --- | --- | --- |
| Reference data the app needs | `db/migration` with a `V` prefix and `ON CONFLICT` | Yes |
| Demo or sample dataset | `db/devdata`, wired through the local profile location | Yes |
| Test fixtures, and any credential | The test source set, and a secret manager | Never in `db/migration` |

Reference data must be replayable, so write it with a conflict clause: `INSERT INTO country (code, name) VALUES ('ES', 'Spain') ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;`. A migration that inserts a test account or a fake API key ships on every deploy, and the migration-only connection must be a dedicated role whose credentials come from a secret.

## Reference routing

| Task | Load |
| --- | --- |
| Name, author, baseline, repair, validate, or seed a migration | [migration-authoring.md](references/migration-authoring.md) |
| Plan a rename, backfill, dual write, or contract with no downtime | [zero-downtime.md](references/zero-downtime.md) |

## Expected response

- **Change list and SQL:** the ordered migration files with name and kind, and the exact DDL or DML for the target PostgreSQL version.
- **Compatibility:** what the currently deployed code needs during the rollout, and when each side is removed.
- **Locking and runtime impact:** whether it blocks writes, whether it can run in a transaction, and the expected duration on real data volume.
- **Verification and rollback:** how it was tested from the previous schema with real data, and the reverse action or an explicit statement that reversal is impossible.
