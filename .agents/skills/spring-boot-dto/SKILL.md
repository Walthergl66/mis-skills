---
name: spring-boot-dto
description: 'Use when designing or changing the request and response model of a Spring Boot service, covering Java records for DTOs, immutability and defensive copying, mapping between DTO and domain or persistence models, separate create and update DTOs, over-posting prevention, read models versus command payloads, and DTO field evolution. Triggers include @RequestBody record, CreateOrderRequest, OrderView, MapStruct @Mapper, List.copyOf, clone for byte arrays, @JsonIgnoreProperties, and a DTO leaking an @Entity from a controller. Do not use for status code and error contract design, Bean Validation engine configuration, ORM entity mapping, generated spec review, or version routing. When other skills also apply, reconcile ownership before mutation.'
license: MIT
metadata:
  author: Walthergl66
  version: '1.0.0'
---

# Spring Boot DTO Design

Model the transport as an allow-listed, immutable value that exists only at the boundary. The moment a JPA entity or a domain aggregate enters a controller signature, the database becomes the public contract.

## When to use

- Adding or reshaping a `@RequestBody` record, a response record, or a page envelope, and deciding where transport-to-domain mapping happens.
- Fixing an entity, a lazy proxy, or a `byte[]` leaking into a response.
- Splitting one request DTO into create, update, and action payloads to stop over-posting, or deciding whether a payload is a command or a read model.
- Placing `jakarta.validation` constraints on a record, or choosing create versus update validation groups.

## When not to use

- Status codes, headers, the error body, and endpoint shape: use `spring-boot-rest-api`.
- Constraint semantics, custom validators, and binding failures: use `spring-boot-validation`.
- Aggregates, value objects, and invariants to `spring-boot-ddd`; entity mapping, `Specification`, and fetch plans to `spring-boot-data-jpa`.
- The generated OpenAPI document and its schema quality: use `spring-boot-openapi`.
- Versioned DTO policy and removal dates: use `spring-boot-api-versioning`.

## Ownership and sibling boundaries

- Owns DTO and payload design: components, immutability, normalization, mapping strategy, allow-list shape, and the command versus read split.
- Yields the endpoint envelope, statuses, and the error body to `spring-boot-rest-api`; this skill owns the fields inside the body, not the HTTP semantics.
- Yields constraint semantics, message interpolation, and binding failures to `spring-boot-validation`; this skill places constraints on records and selects the groups.
- Yields domain invariants and aggregate behavior to `spring-boot-ddd`; a DTO states what the client must send, it never enforces a domain rule.
- Yields entity and query mapping to `spring-boot-data-jpa`; when a projection query is the cheaper mapping, this skill decides the shape and that skill owns the fetch plan.
- Yields document rendering to `spring-boot-openapi` and versioned policy to `spring-boot-api-versioning`; this skill classifies a field change as additive or breaking.

## Hard rules

1. Transport types are records: no setters, no inheritance, no persistence annotations.
2. Never return an `@Entity`, a `Page`, a projection interface, or a domain aggregate from a controller.
3. Map explicitly; no reflection-based blind copy between a body and an entity.
4. Collections, maps, and byte arrays are copied inbound and outbound; a DTO holds no mutable structure owned by someone else.
5. Create, update, and action payloads are separate types, never one reused payload.
6. Allow-list what a client may set; a deny-list loses the race against the next schema change.
7. Normalization happens in the compact constructor, before validation runs.

## Records with normalization

```java
package com.example.orders.api;

import java.util.List;
import java.util.Locale;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateOrderRequest(
        @NotBlank @Email @Size(max = 254) String email,
        @NotBlank @Size(max = 64) String clientReference,
        @Valid @NotNull @Size(min = 1, max = 100) List<@Valid OrderLineRequest> lines) {

    public CreateOrderRequest {
        email = email == null ? null : email.strip().toLowerCase(Locale.ROOT);
        clientReference = clientReference == null ? null : clientReference.strip();
        lines = lines == null ? null : List.copyOf(lines);
    }
}
```

The compact constructor is the only place normalization belongs, and it runs before validation so `@NotBlank` sees the stripped value. Use `toLowerCase(Locale.ROOT)` so the payload never depends on the server locale. `List.copyOf` makes the record genuinely immutable and rejects a null element at construction, turning a later mapper `NullPointerException` into an immediate rejection; never catch that and drop the element, because it hides a malformed request.

## Defensive copying

| Structure | On construction | On access |
| --- | --- | --- |
| `List`, `Set`, `Map` | `List.copyOf`, `Set.copyOf`, `Map.copyOf` | already unmodifiable |
| `byte[]` | `content.clone()` | override the accessor to return a clone |
| `char[]` | copy on construction | never expose it, expose a `String` |
| nested record | the nested record copies its own structures | each record defends itself |

## Returning an entity is a defect

```java
// Defect: the persistence model becomes the public contract.
@GetMapping("/{id}")
OrderEntity get(@PathVariable UUID id) {
    return orders.findById(id).orElseThrow();
}
```

| Failure | Mechanism |
| --- | --- |
| `LazyInitializationException` | serialization runs after the session closed, so a lazy relation cannot load |
| N+1 queries | each lazy access emits a query during serialization |
| Over-posting | binding a body straight to the entity sets every writable column |
| Schema leak | the document publishes columns, relations, audit fields, and a `version` |
| Persistence coupling | renaming a column becomes a breaking API change |

Repair by mapping explicitly; `@JsonIgnore` on the entity hides the symptom and keeps the coupling. A controller signature mentioning `jakarta.persistence`, `Page`, `Pageable`, `Slice`, or a domain aggregate means the boundary is broken.

## Three mapping strategies

| Strategy | Use when | Cost |
| --- | --- | --- |
| Static factory `OrderView.from(Order)` | one source, trivial fields | the DTO depends on the domain type |
| Generated mapper, `componentModel = "spring"` | many DTOs with repetitive field copies | annotation processor and generated code |
| Explicit mapper `@Component` | lookups, conditionals, or multi-source composition | one more class, but every rule is greppable and unit-testable |

With a generated mapper set `unmappedTargetPolicy = ReportingPolicy.ERROR` so a renamed domain field fails the build, and list every server-owned target as `ignore = true` so the allow-list is visible in code. Keep mappers in the boundary package, never in the domain, and never let one reach a lazy relation. A read model built by a projection query needs no mapper at all.

## Anti-over-posting

| Risk | Allow-list | Deny-list |
| --- | --- | --- |
| Client sets `status`, `totalMinor`, `ownerId` | impossible, the field does not exist | breaks on the next schema change |
| Audit fields overwritten | impossible | a new audit column silently becomes writable |
| Review cost | one record per operation | every field re-checked on each change |

Keep a writable-field matrix next to the DTOs: create, update, and action per field, plus who owns it. Never bind a body to an entity, and never compensate with entity-level validation.

## Command, read model, or both

| Payload | Direction | Never contains |
| --- | --- | --- |
| Command, for example `CancelOrderRequest` | client to server | anything the server computes or trusts from itself |
| Read model, for example `OrderSummary` | server to client | write-only secrets, unloaded relations, entity internals |

A command and its read model are always separate types even when the names almost match, and a list projection gets its own summary type rather than a read model with nulls. Use validation groups only while create and update rules differ by a rule or two; once they diverge, separate records beat `Default` times `OnCreate` times `OnUpdate`. Constraint semantics belong to `spring-boot-validation`.

Load [references/dto-design.md](references/dto-design.md) for normalization, immutability, mapping code, entity-leak repair, and DTO tests, and [references/mapping-and-evolution.md](references/mapping-and-evolution.md) for the payload taxonomy, the writable-field matrix, nested versus flat shapes, and the evolution table.

## Reference routing

| Task | Load |
| --- | --- |
| Write a record DTO, normalize input, copy collections, choose a mapper, or stop an entity leak | [dto-design.md](references/dto-design.md) |
| Separate command, update, and read payloads, apply allow-lists, choose nested versus flat, or evolve fields | [mapping-and-evolution.md](references/mapping-and-evolution.md) |

## Expected response

- **Payload set:** the exact DTO types, one per operation, with the direction of each.
- **Immutability and mapping:** which collections, maps, and byte arrays are copied, the chosen strategy, the source types, and the policy for anything not copied.
- **Over-posting control:** the allow-listed writable fields per operation and the server-owned fields excluded.
- **Constraints:** the annotations, the groups or separate records used, and the failure status the REST contract maps them to.
- **Leak and evolution check:** entity internals, lazy relations, persistence versions, and secret-shaped fields confirmed absent, plus which changes are additive and which are breaking.
