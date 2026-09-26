# Spring Boot Routing

The 26 Spring Boot skills overlap by design. Use this file to pick the primary owner when a request names a framework symptom instead of a decision.

## Rule of precedence

Inside a Spring Boot request, decide in this order. The first question that fits owns the primary slot.

1. **Structure**: what lives where, and which layer or module owns a decision. `clean-architecture`, `hexagonal-architecture`, `ddd`, `modular-monolith`.
2. **Contract**: what crosses the wire and what the domain guarantees. `rest-api`, `dto`, `api-versioning`, `openapi`, `ddd`.
3. **Mechanism**: which framework or library primitive carries the behavior. `core`, `mvc`, `data-jpa`, `hibernate`, `security`, `validation`.
4. **Data**: what the database and the schema do. `postgresql`, `flyway`, `query-optimization`.
5. **Proof**: how the behavior is demonstrated. `junit`, `mockito`, `testcontainers`, `integration-testing`.
6. **Operation**: how it runs, is observed, and is released. `docker`, `observability`, `logging`, `actuator`, `ci-cd`.

Rule 1 wins over 3. A request that says "add a cache to the repository" is a structure question before it is a Hibernate question.

## Symptom to owner

| The request sounds like | Primary | Supporting |
| --- | --- | --- |
| "Where does this class belong", "domain knows about JPA" | `clean-architecture` | `ddd` or `hexagonal-architecture` |
| "Wrap the Stripe client", "two payment providers", "test without the SDK" | `hexagonal-architecture` | `mockito` |
| "Is this an aggregate", "anemic model", "who enforces the invariant" | `ddd` | `clean-architecture` |
| "Modules import each other", "split the service", "Modulith verification" | `modular-monolith` | `clean-architecture` |
| "My property is not applied", "auto-config", "starter or bean" | `core` | `validation` for property constraints |
| "Filter or interceptor", "exception mapping", "415", "SSE" | `mvc` | `rest-api` for the response contract |
| "N+1", "repository design", "transaction boundary", "pagination" | `data-jpa` | `query-optimization` |
| "401 or 403", "JWT validation", "method security", "CSRF" | `security` | `rest-api` for error bodies |
| "Validation groups", "custom constraint", "field errors" | `validation` | `dto` for the payload shape |
| "Index not used", "EXPLAIN", "jsonb", "isolation" | `postgresql` | `query-optimization` |
| "Mapping and fetch behavior", "second-level cache", "batch inserts" | `hibernate` | `data-jpa` |
| "Write a migration", "checksum mismatch", "zero downtime rename" | `flyway` | `postgresql` for column and index choices |
| "Endpoint got slow" | `query-optimization` | `postgresql` or `hibernate` once the cause is known |
| "Which status code", "error body", "idempotency" | `rest-api` | `dto`, `openapi` |
| "Spec is wrong", "springdoc", "document the API" | `openapi` | `dto` for schemas |
| "Entity leaks from the controller", "over-posting" | `dto` | `rest-api` |
| "Version the API", "breaking change" | `api-versioning` | `rest-api` |
| "Tests are a mess", "which test layer" | `integration-testing` | `junit` |
| "Too many mocks", "`@MockBean` deprecation" | `mockito` | `junit` |
| "Test needs a real database" | `testcontainers` | `flyway` for schema setup |
| "Build the image", "image too big" | `docker` | `ci-cd` |
| "Add metrics and traces", "why is latency spiking" | `observability` | `query-optimization` for the query cause |
| "Logs unreadable", "too many logs", "correlate a request" | `logging` | `observability` |
| "Expose health", "readiness probe", "shutdown" | `actuator` | `docker` for the runtime |
| "Pipeline fails", "deploy", "rollback" | `ci-cd` | `flyway` when a migration blocks the rollout |

## Frequently paired sequences

Order matters: structure before mechanism, contract before test.

| Goal | Sequence |
| --- | --- |
| New service | `modular-monolith` for boundaries, then `clean-architecture` for internals, then `rest-api` for the first contract, then `integration-testing` for the first proof |
| New endpoint | `rest-api` for the contract, `dto` for the payload, `validation` for constraints, `integration-testing` for the slice test, `openapi` last so the spec matches |
| Bug from a failing test | `integration-testing` to reproduce at the right layer, then the owning skill for the fix, `junit` only if the test itself is the defect |
| Latency incident | `observability` to find the constrained resource, then `query-optimization` or `mvc` or `docker` for the fix, then `logging` if the evidence was missing |
| Data model change | `flyway` for the migration, `postgresql` for the index and column choice, `data-jpa` for the mapping, `ddd` only if the aggregate itself changed |
| Security hardening | `security-requirement-extraction` for the requirements, `security` for the controls, `rest-api` for the error bodies, `integration-testing` for the abuse tests |
| Release | `ci-cd` for the pipeline, `flyway` for the migration step, `docker` for the artifact, `actuator` for the health gate, `observability` for post-release verification |

## Handoff boundaries

These boundaries are already encoded in each skill. Restate them only when a request crosses them.

- `clean-architecture` decides whether application code may depend on HTTP or persistence types; `mvc` and `data-jpa` decide how that code is wired at runtime.
- `ddd` decides the aggregate and its invariants; `data-jpa` and `hibernate` decide how it is stored and fetched.
- `rest-api` owns the response body and status; `dto` owns the record shape inside it; `validation` owns the constraints on the input.
- `security` owns enforcement; `actuator` owns what management endpoints are exposed and how they are secured at the port level.
- `observability` owns metric and trace signal design; `logging` owns the format and the context those signals are correlated through.
- `query-optimization` owns the measurement and the fix sequence; `postgresql` and `hibernate` own the specific SQL and ORM mechanisms it selects.
- `integration-testing` owns which layer proves the behavior; `junit`, `mockito`, and `testcontainers` own the mechanics of that layer.

## Multi-skill requests

A request may legitimately need three skills. It must not need five. When it does, the request is missing a decision, and the right move is to ask which behavior the user actually wants to protect.
