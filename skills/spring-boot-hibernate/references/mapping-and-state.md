# Mapping and Entity State

Load this when choosing identifiers, association shape, cascade rules, inheritance, or when debugging dirty checking, proxies, and version conflicts.

## Identifier decisions

| Option | Use when | Cost |
| --- | --- | --- |
| Surrogate `bigint` identity plus a separate exposed `uuid` | Default for almost every table | Two columns to keep consistent; batch inserts impossible with `IDENTITY` |
| `bigserial` surrogate | Legacy schema or single-writer OLTP | Same as identity, legacy semantics |
| `uuid` generated in the database | Distributed writes, no coordination needed | 16-byte key, random pages unless v7 |
| `@EmbeddedId` composite | The business key is genuinely the identity and never changes | Every foreign key becomes a multi-column join; awkward cascades |
| Natural `@NaturalId` | Business lookup needs a stable alternate key | Additional index, still a surrogate underneath |

Rules:

1. Never derive `equals` and `hashCode` from a generated identifier on a detached entity you intend to reattach.
2. Never derive `hashCode` from a mutable field. Use a constant or the immutable identifier.
3. `@Version` is what makes optimistic locking work. Add it to any aggregate whose invariants must not be lost to a concurrent write.
4. A composite identifier used with `@EmbeddedId` requires `Serializable` on the id class and `equals`/`hashCode` on it.
5. Prefer a surrogate key for the table and a unique constraint on the business key. It keeps foreign keys stable when the business rule evolves.

## Association decision table

| Relationship | Mapping | Fetch | Notes |
| --- | --- | --- | --- |
| Many rows to one required parent | `@ManyToOne(optional = false)` with `nullable = false` FK | `LAZY` | The workhorse; always a nullable-checked column |
| Many rows to one optional parent | `@ManyToOne` with a nullable FK | `LAZY` | Nullability must be checked; `Optional` is not supported |
| Parent to children, child owns the FK | `@OneToMany(mappedBy = "parent")` | `LAZY` | Separate query per parent; the expensive side |
| Child to exactly one parent, no extra columns | `@OneToOne` with `@MapsId` on the child | `LAZY` | Shared primary key, tight lifecycle |
| Child to exactly one parent, extra columns | `@OneToOne` with a unique FK on the child | `LAZY` | Use when the association has its own attributes |
| One-to-one, optional both ways | Avoid | | Model it as a nullable association from the child |
| Element collection, fixed attributes | `@ElementCollection` | `LAZY` | Real child table with FK to the owner |
| Free-form attributes, whole-document read | `jsonb` column | n/a | No relational integrity |
| Ordered children with a business sequence | `@OrderBy` on a persisted column | `LAZY` | In-memory `sort` on every load is a bug |

## Cascade rules

| Cascade | Meaning | Use |
| --- | --- | --- |
| `PERSIST` | Saving the parent saves the child | Only for a child with no independent lifecycle |
| `MERGE` | Merging cascades | Rarely intended; it propagates merge into the whole graph |
| `REMOVE` | Deleting the parent deletes the child | Dangerous on a large aggregate; prefer soft delete or explicit cascade delete |
| `REFRESH` | Reload overwrites in-memory state | Almost never wanted |
| `ALL` | Everything above | Only with `orphanRemoval` and an owned child |

Rules:

1. `CascadeType.ALL` on a bidirectional one-to-many is a data-loss pattern without `orphanRemoval` and a child-side setter that nulls the reference.
2. `CascadeType.REMOVE` loads every child into memory before deleting it. On a large aggregate this is a heap exhaustion incident.
3. `cascade = {PERSIST, MERGE}` with explicit delete of each child is often safer and just as fast, because it is set-based.
4. Never cascade across a `MANY_TO_MANY` you do not fully own. Deleting one side then silently deleting the join rows of another module is a data-loss bug.

```java
@OneToMany(mappedBy = "invoice", cascade = CascadeType.ALL, orphanRemoval = true)
private List<InvoiceLine> lines = new ArrayList<>();

public void removeLine(InvoiceLine line) {
    lines.remove(line);
    line.detach();
}
```

## State transitions and what triggers them

| From | Operation | To | SQL |
| --- | --- | --- | --- |
| Transient | `save` or `persist` | Managed | `INSERT` at flush |
| Transient | no operation | Transient | None |
| Managed | field change | Managed, dirty | `UPDATE` at flush |
| Managed | `delete` | Removed | `DELETE` at flush |
| Managed | session close or `clear` | Detached | None |
| Detached | `merge` | Managed | `SELECT` then `INSERT` or `UPDATE` |
| Detached | `update` (removed in 6) | Managed | Legacy API, do not use |

Rules:

1. `save` against a non-zero identifier calls `merge` and therefore issues a `SELECT` first. Use `persist` for a new entity to make the extra query impossible.
2. A change outside a transaction is silently lost when the session closes. Spring Data's `@Modifying` and plain repository methods need an explicit `@Transactional`.
3. `flush` sends SQL without ending the transaction. Use it to force a constraint violation at the point of the mistake, not to improve performance.
4. `saveAll` in a loop is still one statement per row. Use `saveAll` plus batching, or a set-based native statement.

## Dirty checking cost

Hibernate stores a deep snapshot per managed entity at load time and compares it at flush. Cost scales with columns, with entities in the context, and with the number of load operations that leave entities attached.

| Symptom | Mechanism | Fix |
| --- | --- | --- |
| CPU high during flush, no slow SQL | Thousands of managed entities compared per transaction | Projections, `StatelessSession`, or shorter transactions |
| Spurious `UPDATE` with no field changed | Mutable field changed and restored, or a `Timestamp` touched | Mark the field `@Immutable`, or exclude it from the snapshot |
| Session grows without bound in a batch job | Entities never detached | `flush` then `clear` every page |
| Slow reads in a reporting service | Full entities loaded for display only | Interface projection or DTO constructor expression |

## Optimistic locking

```java
@Version
@Column(name = "version", nullable = false)
private long version;
```

| Conflict | Exception | Resolution |
| --- | --- | --- |
| Optimistic lock lost | `ObjectOptimisticLockingFailureException` wrapping `StaleObjectStateException` | Re-read, re-apply the intent, retry the whole use case |
| Pessimistic lock timeout | `PessimisticLockingFailureException` | Retry with jitter, or fail to the caller |
| Serialization failure at the database | `CannotSerializeTransactionException` | Retry; see the PostgreSQL skill |
| Unique violation | `DataIntegrityViolationException` | Treat as a business rejection, not a transient fault |

A retry must re-execute every read inside the new transaction. Retrying only the write replays a decision made against stale data.

## Read-only and immutable mappings

| Option | Effect | Use |
| --- | --- | --- |
| `@Immutable` on the entity | No dirty checking, no `UPDATE` ever emitted | Reference and historical data |
| `@Transactional(readOnly = true)` | Flush mode is manual; a dirty entity throws on flush instead of updating | Every read use case |
| `StatelessSession` | No cache, no dirty checking, no cascade | Bulk export and batch processing |
| Interface projection | No entity instantiated at all | List and report reads |

`StatelessSession` requires an explicit transaction and manual lifecycle management. It will not cascade a save, will not keep a loaded entity, and will not flush automatically.

## Mapping pitfalls with Hibernate 6.6

1. `LocalDateTime` maps to `timestamp without time zone`; `Instant` maps to `timestamp with time zone`. Verify which one your column expects.
2. `@Type` and `@JavaType` replaced the Hibernate 5 `@TypeDef` pattern for most custom types. Re-check every user type.
3. A `byte[]` property defaults to binary; map it explicitly with `@JdbcTypeCode(SqlTypes.VARBINARY)` when the column is text.
4. Enum mapping with `EnumType.STRING` writes the Java constant name. A rename is a breaking data change.
5. `@Column(columnDefinition = ...)` is documentation for schema generation only. With `ddl-auto: none` it changes nothing, so the migration is the real source of truth.
6. Equality of a lazy proxy falls back to the identifier only after initialization in some cases. Never use a mapped association in `equals`.

## Review checklist

1. Every table has a surrogate key and a business-key unique constraint.
2. Every association declares a fetch strategy explicitly; no accidental `EAGER`.
3. Exactly one owning side per bidirectional association, and it is the side with the foreign key.
4. Every aggregate root has `@Version` if concurrent writes are possible.
5. `equals` and `hashCode` use only the identifier.
6. No `@OneToMany` is `EAGER` unless the collection is proven small and always needed.
7. No transaction performs more than one use case, and no remote call is inside one.
8. Integration tests run against real PostgreSQL, not an in-memory substitute that behaves differently on types, constraints, and locks.
