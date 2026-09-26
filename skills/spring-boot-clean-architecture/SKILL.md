---
name: spring-boot-clean-architecture
description: 'Use when enforcing the dependency rule in a Spring Boot service, choosing which layer a class belongs in, or reviewing whether JPA, Spring, or HTTP types leak into business rules. Triggers include layering, dependency rule, domain application adapter, service depends on repository, business logic in controller, keep JPA out of the domain, is Clean Architecture worth it, layered vs annotated Spring service, entity is also a database row, where does this class go, or unit test without a Spring context. Do not use for aggregate and invariant design, port interface definition, module boundary verification, DTO shape, or repository and mapping mechanics. When other skills also apply, reconcile ownership before mutation.'
license: MIT
metadata:
  author: Walthergl66
  version: '1.0.0'
---

# Clean Architecture In Spring Boot

Place every class on exactly one side of the dependency rule and keep framework types out of the innermost ring. Spring makes the rule easy to violate silently because component scanning wires everything into one container, so the rule must be enforced by package layout and architecture tests rather than by discipline. When the domain is trivial, say so and ship the layered version instead of a rewrite.

## When to use

- Deciding whether a class belongs in `domain`, `application`, `adapter`, or `config`.
- Business rules currently import `jakarta.persistence`, `org.springframework`, or `jakarta.servlet` types.
- A `@Service` calls business logic on a `@Entity`, or a `@RestController` contains arithmetic or branching.
- A JPQL string, `EntityManager`, or `@Query` is needed to run a use case.
- A migration is needed from a flat annotated service layout, without a rewrite.
- The question is whether Clean Architecture is worth the cost, or which subset of it pays.

## When not to use

- Aggregate boundaries, entity identity, and invariant enforcement belong to `spring-boot-ddd`.
- Port interfaces, driven adapters, and composition roots belong to `spring-boot-hexagonal-architecture`.
- Package cycle detection and inter-module rules belong to `spring-boot-modular-monolith`.
- Request and response payload shape belongs to `spring-boot-dto`.
- Repository interfaces, queries, mapping, and migrations belong to `spring-boot-data-jpa`.
- Hibernate fetch strategies, batch sizing, and dialect tuning belong to `spring-boot-hibernate`.

## Ownership and sibling boundaries

This skill owns ring placement, the dependency rule, transaction boundary intent, and the judgement of whether the layering pays.

- `spring-boot-ddd` owns the model inside the domain ring. Hand it aggregate, identity, and invariant questions.
- `spring-boot-hexagonal-architecture` owns port and adapter mechanics. Hand it any question about where an interface is declared and how implementations are bound.
- `spring-boot-modular-monolith` owns module boundaries and cycle verification. Hand it package visibility and top-level module layout.
- `spring-boot-dto` owns the record shape crossing the adapter boundary. Hand it validation, naming, and serialization concerns.
- `spring-boot-data-jpa` owns Spring Data repositories, projections, and query tuning. Hand it entity mapping, JPQL, and index-level detail.

## Map the rings onto packages

| Ring | Package | May import | Must never import |
| --- | --- | --- | --- |
| Entities | `domain` | `java.*` | Spring, JPA, Jakarta EE, SQL, vendor SDKs |
| Use cases | `application` | `domain`, `java.*` | `adapter.*`, `jakarta.persistence`, `jakarta.servlet` |
| Interface adapters | `adapter.in.web`, `adapter.out.persistence` | `application`, `domain`, Spring, JPA | nothing in `domain` it does not own |
| Frameworks and drivers | `config`, `adapter.out.vendor` | everything | business decisions |

```text
com.example.ordering
├── domain/      Order  Money  OrderRepository             ring 1, zero framework imports
├── application/ PlaceOrderUseCase  PlaceOrderCommand      ring 2, transaction intent
├── adapter/
│   ├── in/web/      @RestController plus request records ring 3
│   └── out/persistence/  JPA row, mapper, repository impl ring 3
└── config/      PersistenceConfig                         ring 4, names every concrete
```

## Hard rules

1. **Declare ports inward.** An interface used by `application` is declared in `domain` or `application`, never in the adapter that implements it.
2. **Cross boundaries with plain data.** Rings exchange records and value objects, never `@Entity` instances, `Page<T>` of entities, or `ResponseEntity`.
3. **No framework import in `domain`.** `jakarta.persistence`, `org.springframework.*`, and `jakarta.servlet.*` are forbidden there, including on method signatures.
4. **Controllers adapt, they do not decide.** A controller validates transport input, invokes one use case, and maps the outcome. Zero business branching.
5. **Use cases own transaction intent.** `@Transactional` appears on public use case entry points and nowhere else. One transaction per use case; `REQUIRES_NEW` is for a deliberate independent commit.
6. **The composition root names concretes.** Only `config` and adapter classes reference `JpaOrderRepository` or a vendor SDK type, and an adapter translates and delegates rather than calling a sibling adapter.
7. **Close the session at the edge.** Set `spring.jpa.open-in-view: false` so a lazy load cannot fire during JSON serialization.
8. **Enforce the rule in a test.** An ArchUnit test is the only durable guard; a review comment is not.

```yaml
spring:
  jpa:
    open-in-view: false
    hibernate.ddl-auto: validate
```

## What breaks the rule in Spring

| Violation | Symptom | Remedy |
| --- | --- | --- |
| `@Entity` on the domain class | `domain` imports `jakarta.persistence` and couples rules to the schema | Move the annotated class to `adapter.out.persistence` and add an explicit mapper |
| Spring Data interface declared in `domain` | The port is a framework type the domain must import | Declare a plain interface with `Optional<T> findById(UUID)`; implement it with `JpaOrderRepository` |
| JPQL string inside a use case | The use case depends on entity field names | Expose query intent on the port; implement with `Specification` or a projection in the adapter |
| `@Transactional` on domain methods | Domain unit tests need a Spring context | Move the annotation to the use case; keep domain methods plain Java |
| Component scanning pulls adapters into the domain | One root `@ComponentScan` wires every bean, so rings do not exist at runtime | Keep the application class at the root and narrow scanning with explicit `@Import` per adapter |
| `ApplicationEventPublisher` injected in `domain` | A Spring type decides a business fact | Emit a plain domain event record; the application layer publishes it |
| An entity returned to the controller | A managed instance escapes the transaction | Return a record and map it at the adapter edge |

## Transaction boundary intent

- Annotate the public entry point an outside caller invokes, not every service method; `readOnly = true` on query use cases skips dirty checking.
- Keep the transaction free of outbound HTTP, file IO, and broker round trips; persist the intent and publish after commit.
- Self-invocation bypasses the proxy; for an explicit boundary inject the auto-configured `TransactionTemplate` and call `execute`. For blocking IO, `spring.threads.virtual.enabled=true` is an option: it raises how many calls can wait at once, but not pool size, rate limits, or how long a transaction holds a lock.

```java
package com.example.ordering.application;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PlaceOrderService {
    private final PlaceOrderUseCase useCase;

    public PlaceOrderService(PlaceOrderUseCase useCase) {
        this.useCase = useCase;
    }

    @Transactional
    public OrderPlacedResult place(PlaceOrderCommand command) {
        return useCase.place(command);
    }
}
```

## When it is not worth it

| Situation | Verdict |
| --- | --- |
| A read-only admin CRUD screen with no invariant | Layered only, no domain ring, no ports |
| One vendor API, no replacement planned | Port the vendor edge, keep the rest flat |
| A prototype under a fixed demo date | Ship it, then adopt rings incrementally |

## Adopt incrementally

1. **Freeze.** Add an ArchUnit rule that lists current violations and only logs.
2. **Edge.** Move controllers and request and response records into `adapter.in.web`.
3. **Session.** Set `open-in-view: false` and introduce explicit entity-to-domain mapping.
4. **Boundary.** Declare ports inward; the existing Spring Data interface becomes the implementation.
5. **Intent.** Hoist `@Transactional` to use case entry points.
6. **Domain.** Move real business rules into classes with no framework imports.
7. **Enforce.** Flip the ArchUnit rule from log to failure, then move the next vertical slice. Never branch a long rewrite.

## Reference routing

| Task | Load |
| --- | --- |
| Map a ring to packages, write import rules, add an ArchUnit test | [layer-mapping.md](references/layer-mapping.md) |
| Diagnose a concrete Spring violation and apply its remedy | [spring-pitfalls.md](references/spring-pitfalls.md) |
| Plan an incremental migration or review an existing layout | [adoption-and-review.md](references/adoption-and-review.md) |

## Expected response

- **Verdict:** whether layering is justified, and the lowest ring count that pays.
- **Ring map:** the package tree with one line per package on what may live there.
- **Violations:** each dependency rule break with the file, the outward import, and the concrete remedy.
- **Transaction plan:** the single entry point that owns the boundary and what stays outside it.
- **Sequence and guard:** ordered incremental moves plus the ArchUnit test that fails afterwards.
