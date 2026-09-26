# Extraction to Services

Load this when deciding whether a module should become its own service, or when planning the migration of an existing module.

## The gate

Score the module against the signals. One yes is a reason to continue; all no means keep the module in the monolith.

| Signal | Question | Evidence that counts |
| --- | --- | --- |
| Deployment | must this ship on its own schedule | a release rule, a compliance deadline |
| Ownership | does another team own it end to end | an on-call rota, a roadmap, code ownership |
| Scaling | is the load profile different | a measured p95 on one endpoint, a queue depth |
| Data | does it own data no other module writes | exclusive tables or a dedicated schema |
| Failure | must its unavailability not affect the rest | an SLO that only this module can break |
| Latency | is its work blocking for others | synchronous latency on a hot path |
| Code size | is the file count a problem on its own | none, size alone is not a signal |

## Hard prerequisites

| Prerequisite | Why | Check |
| --- | --- | --- |
| Owns its own tables | a shared table makes the split a data migration | no other module reads or writes its tables |
| Reaches peers only through named interfaces or events | in-process calls become network calls | `ApplicationModules.verify()` passes with no exception |
| Owns its schema history | migrations must run against one database | the Flyway migrations live with the module |
| An independent deploy artifact | a shared jar ties the release cycles | the module builds and starts alone |
| No shared entity classes | a shared JPA type cannot cross a process boundary | no `@Entity` import from another module |
| Runs on its own | a shared scheduler or cache is a hidden dependency | its own profile and configuration |

## Migration sequence

1. Establish the boundary. Apply `@ApplicationModule` with an explicit `allowedDependencies` list, then make `ApplicationModules.verify()` pass. Freeze the list; every later widening is a reviewed decision.
2. Remove the shared state. Give the module its own tables, move the Flyway migrations with them, and delete every query that reads another module's tables.
3. Make the calls remote-ready. Replace direct calls with named interfaces. Keep them synchronous if the caller needs the result; use a module event where it does not.
4. Introduce the transport. For asynchronous work, add the outbox table and a relay. For synchronous work, add a client adapter behind the same named interface so no caller code changes.
5. Extract the process. Move the module into its own Maven module with its own entry point, schema, and deployment configuration. Run it in parallel with the monolith code that still calls it in-process.
6. Cut over. Route traffic to the new service, keep the rollback path until the dashboards are green, then remove the in-process implementation.
7. Re-verify. Run `ApplicationModules.verify()` on what remains and regenerate the module diagrams.

```text
monolith:  orders ----X----> inventory (table read)
after 1-2: orders --api--> inventory   (no table read)
after 3:   orders --api--> inventory   (same interface, still in-process)
after 5:   orders --api--> inventory   (same interface, now HTTP or events)
after 7:   orders -X-> inventory       (no in-process edge left in the monolith)
```

The interface is written once at step 3 and does not change at step 5. That is why the boundary comes before the process split: extracting first means rewriting every caller twice.

## Splitting a shared table

```sql
-- in the monolith, both modules still read the customer name
ALTER TABLE orders ADD COLUMN customer_id UUID;
UPDATE orders o SET customer_id = c.id FROM customer c WHERE c.email = o.customer_email;

-- in the new service
CREATE TABLE customer (
    id    UUID PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name  TEXT NOT NULL
);

-- in the monolith, one release after every reader moved
ALTER TABLE orders DROP COLUMN customer_name;
```

Backfill, deploy the reader, then drop the column. Reversing that order breaks the monolith; never drop a column in the release that switches traffic.

## Contract stability

| Change | Compatible | Action |
| --- | --- | --- |
| Add a field to a response record with a default | yes | ship it |
| Add a new method to a named interface | for callers only | ship it, implement in the adapter |
| Add a required parameter | no | new method, deprecate the old one |
| Rename a field | no | new field, keep the old one for one release |
| Change a semantic, not a shape | no | never, whatever the compiler says |

Expose the contract as records or interfaces owned by the caller side of the boundary, never as the service's own JPA entities. Sharing the entity type couples the two schemas to the same Java class name.

## Configuration after the split

```yaml
spring:
  application:
    name: inventory-service
  datasource:
    url: jdbc:postgresql://inventory-db:5432/inventory
  modulith:
    runtime:
      verification-enabled: true
      flyway-enabled: true
management:
  endpoints:
    web:
      exposure:
        include: health,info,modulith
```

The new service owns its datasource, its migrations, and its Actuator endpoints; the `modulith` endpoint comes from the `spring-modulith-actuator` artifact. `flyway-enabled` runs migrations from module-specific sub-folders in module dependency order, so a test applies only the migrations of the modules it boots. `verification-enabled` checks the module arrangement at startup, so a broken boundary fails the deployment instead of the first request. Pointing the datasource at the monolith database keeps the split reversible, which is useful during the parallel run and unacceptable as a final state.

## Cost of getting it wrong

| Mistake | Consequence | Prevention |
| --- | --- | --- |
| Splitting a cohesive module | a distributed monolith with network latency on every call | require at least one measured signal |
| Sharing a database between the service and the monolith | the split is reversible only by hand | exclusive tables per module |
| Extracting before the boundary exists | every call site is rewritten during the move | verification passing first |
| A synchronous call where no result is needed | latency multiplied across the fleet | a module event plus an idempotent consumer |
| Bidirectional synchronous calls | latency risk and a cycle across processes | one direction plus an event |
| Splitting for team reasons only | coordination cost with no isolation | name the operational benefit |

## Rollback

Keep the in-process path until the new service has handled production traffic through one full business cycle. Rollback must be a configuration change, not a redeployment. Once the shared tables are gone, rollback becomes a data decision, so do not drop them in the same release that moves traffic.

## Extraction checklist

- [ ] The gate names a signal, a metric, and an owner.
- [ ] `ApplicationModules.verify()` passes and the `allowedDependencies` list is frozen.
- [ ] No module reads or writes another module's tables.
- [ ] Every cross-module call goes through a named interface or an event.
- [ ] The extracted service has its own schema, migrations, and datasource.
- [ ] The contract carries no JPA types.
- [ ] The parallel run is observable and the rollback path is a config change.
