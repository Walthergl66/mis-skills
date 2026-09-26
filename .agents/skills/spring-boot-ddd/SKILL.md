---
name: spring-boot-ddd
description: 'Use when modelling bounded contexts, aggregates, entity identity, value objects, invariants, domain services, domain events, and repository semantics in a Spring Boot service. Triggers include bounded context, aggregate, aggregate root, invariant, value object, anemic domain model, domain service, domain event, repository returns rows, two writes one transaction, Specification, set based authorization, ApplicationEventPublisher for domain events, and modelling a messy legacy domain. Do not use for JPA mapping, query tuning, module boundary verification, layer placement, or broker delivery guarantees. When other skills also apply, reconcile ownership before mutation.'
license: MIT
metadata:
  author: Walthergl66
  version: '1.0.0'
---

# Domain Driven Design In Spring Boot

Choose aggregate boundaries, enforce invariants inside them, and make identity and value equality explicit instead of leaving them to a JPA schema. Spring Data and Hibernate make the row the default model, which is the single most common cause of an anemic domain; the countermeasure is a deliberate decision about what the aggregate guarantees, not an extra layer of annotations.

## When to use

- Deciding what belongs in one aggregate, where a transaction boundary must stop, or whether the aggregate is too large to load in one query.
- A `@Entity` is mutated from a service with no rule protecting valid state, or valid state is protected only by a database constraint nobody can unit test.
- Value equality is wrong, so two identical concepts compare unequal in a test.
- A class has only getters and setters, with the logic in a service, or valid state is protected by scattered `if` statements.
- Deciding whether logic needs a domain service, a factory, or a specification.
- Choosing between a domain event, a Spring application event, and a broker message.
- Two models of one concept exist because two bounded contexts each need their own.

## When not to use

- Entity mapping, fetch strategies, and query tuning belong to `spring-boot-data-jpa` and `spring-boot-hibernate`.
- Package cycles and inter-module rules belong to `spring-boot-modular-monolith`.
- Where packages and ports go belongs to `spring-boot-clean-architecture` and `spring-boot-hexagonal-architecture`.
- Broker transport, retries, and dead letters belong to `spring-boot-observability`; the modelling decision about publishing stays here.

## Ownership and sibling boundaries

This skill owns bounded contexts, aggregate boundaries, identity, value objects, invariants, domain services, domain events, and repository contract semantics.

- `spring-boot-data-jpa` owns how an aggregate is stored. Hand it the mapping, the queries, and the indexes.
- `spring-boot-hibernate` owns fetch strategies, Session behavior, and dialect implementation. Hand it anything about `Session` and `LazyInitializationException`; the choice of what to load belongs to `spring-boot-data-jpa`.
- `spring-boot-modular-monolith` owns module enforcement. Hand it package visibility and the verification test.
- `spring-boot-clean-architecture` owns ring placement. Hand it which package a domain class goes in.
- `spring-boot-observability` owns telemetry only. Hand it metrics and traces; reliable event delivery remains a design decision here and an operational one there.

## Aggregate boundary rules

| Rule | Statement |
| --- | --- |
| One transaction, one aggregate | A transaction loads one aggregate root and saves it. Two aggregates in one commit is a deliberate exception, never a default. |
| Invariants live inside | The aggregate root is the only place allowed to change its own state; other objects in the boundary are reachable through it. |
| Identity is stable | The identity comes from the domain, is immutable, and is not a database surrogate exposed to callers. |
| Reference by id | Other aggregates are referenced by identifier, never by object graph traversal. |
| Small boundaries | A boundary needing a cross-join to load eagerly is too large; split it. |
Two aggregates in one transaction is a legal design choice, not a mistake, but it must be deliberate, documented, and paid for in coupling. A transaction that waits on IO holds its connection and its locks for the same time: `spring.threads.virtual.enabled=true` raises how many blocking calls can wait at once, but shortens neither.

## Entity versus value object

```java
package com.example.pricing.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Currency;

public record Money(BigDecimal amount, Currency currency) {
    public Money {
        if (amount.signum() < 0) {
            throw new IllegalArgumentException("amount must not be negative");
        }
        amount = amount.setScale(currency.getDefaultFractionDigits(), RoundingMode.HALF_EVEN);
    }
}
```

The test for the choice: remove identity and the concept collapses into its attributes, so it is a value object and gets a `record`; keep identity across time and it is an entity with a stable id that equals by id. Two `Money(10.00, EUR)` values are the same money, which is why they may live in a `Set`. `plus` in the reference handles a currency mismatch by throwing.

## Avoid the anemic domain

Anemic means every rule lives in a service while the objects only hold state. The fix is not moving methods for their own sake: it is moving each rule to the place that owns the data the rule needs.

| Rule | Where it belongs |
| --- | --- |
| A shipped order cannot be cancelled | the aggregate, because it needs the status |
| Tax depends on the customer country and the lines | a domain service, because it needs the order and the customer policy |
| Deciding an order is overdue today | a domain service taking a `Clock`, because it needs a parameterised fact |
| A discount applies above a threshold | a value object or the aggregate, because it needs the lines |
| Validating a non-blank reference on a request | the adapter request record, a transport rule |

## When a domain service is justified

```java
package com.example.pricing.domain;

import java.time.Clock;
import java.time.LocalDate;

public final class OrderDueService {
    private final Clock clock;

    public OrderDueService(Clock clock) {
        this.clock = clock;
    }

    public boolean isOverdue(Order order) {
        return !order.status().isTerminal() && order.dueDate().isBefore(LocalDate.now(clock));
    }
}
```

Justified when the rule needs data from more than one aggregate, when it is a calculation with no natural home, or when it must be a single shared policy used by several use cases. Not justified when it only orchestrates a use case: that is an application service. Inject `Clock` rather than calling `LocalDate.now()` so the rule is testable without a fake system clock.

## Domain events, application events, broker messages

| Kind | Meaning | Carrier | Delivery |
| --- | --- | --- | --- |
| Domain event | a fact that already happened, in domain language | a `record` in the domain package | none until someone publishes it |
| Spring application event | the same fact, published inside the process | `ApplicationEventPublisher` | in-process, after commit if transactional |
| Integration message | a fact another service may consume | a payload plus a schema on a broker | out of process, retried, observable |

A domain event is a past-tense fact carrying only values the publisher controls, and must survive Jackson serialisation if it leaves the process. Prefer an outbox table when the publish must be atomic with the write. Delivery mechanics belong to `spring-boot-observability`; the modelling decision stays here.

## Repository contract semantics

- A repository returns aggregates, never rows, and never a `Page<T>` of entities.
- `save` means make this aggregate state durable, not merge arbitrary fields, and the repository lives with the aggregate rather than the table.
- `findById` returns `Optional`, and a missing aggregate is not an error the repository invents. Query intent is expressed in domain terms, as `findOverdue(LocalDate)`, not as a JPQL string.

## What DDD costs

| Situation | Cost of the full approach | Verdict |
| --- | --- | --- |
| Simple CRUD admin over five tables | Aggregate ceremony with no invariant to protect | Use a service and a repository, skip the model |
| Prototype under a fixed date | Rework of an unvalidated model | Model the use cases, not the nouns |
| A genuinely complex rule set | Modelling time paid back on every change | worth it |

Pragmatic middle path: model the aggregates that hold rules, leave reference data as plain rows, and never model a use case that does not exist yet.

## Reference routing

| Task | Load |
| --- | --- |
| Set aggregate boundaries, enforce invariants, decide transaction scope | [aggregates-and-invariants.md](references/aggregates-and-invariants.md) |
| Write entities, value objects, domain services, factories, specifications | [domain-modeling.md](references/domain-modeling.md) |
| Model domain events, map contexts, choose anti-corruption over layering | [events-and-contexts.md](references/events-and-contexts.md) |

## Expected response

- **Context map:** the bounded contexts, the ubiquitous language, and the overlaps.
- **Boundaries:** each aggregate with its invariant, its root, and the transaction that owns it.
- **Identity and values:** which types are entities with stable ids, and which are records compared by value.
- **Logic placement:** per rule, the aggregate, a domain service, or the adapter, with a reason.
- **Storage contract:** what the repository returns, and which invariant the database must still enforce.
- **Events:** each fact worth publishing, in past tense, and whether it needs an outbox table.
- **Cost verdict:** where the modelling pays, and where plain CRUD is the honest answer.
