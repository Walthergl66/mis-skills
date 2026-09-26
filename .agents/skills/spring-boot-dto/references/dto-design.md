# DTO Design

Load this when writing a request or response record, deciding where the transport model is built, choosing a mapping strategy, or stopping an entity, `Page`, or lazy graph from crossing the controller boundary.

## Transport type rules

| Rule | Reason |
| --- | --- |
| Use a `record` | immutable by construction, no setters, no no-arg constructor for Jackson |
| No `jakarta.persistence` annotations | a transport type must not carry a persistence mapping |
| No inheritance between DTOs | field sets diverge per operation; shared fields become a false contract |
| No `Map` components | no schema, no validation, no generated client |
| No `Object` or `JsonNode` | same failure, plus no type safety inside the mapper |
| No mutable setters for partial update | a `PATCH` needs an explicit notion of absent versus null |
| Nested records are fine, cycles are not | a bidirectional association serialized to JSON can loop forever |

`record` and Jackson work together because Boot 2.12 and later register parameter-name metadata, and Java records expose their component names for deserialization. Never add `@JsonProperty` names that differ from the component names unless the published contract requires a legacy name; if it does, record the mapping decision next to the record.

## Normalization

Normalize in the compact constructor so every consumer of the record sees the same value.

```java
package com.example.orders.api;

import java.util.Locale;
import java.util.Set;

public record CustomerRequest(String email, String displayName, Set<String> roles) {

    public CustomerRequest {
        email = email == null ? null : email.strip().toLowerCase(Locale.ROOT);
        displayName = displayName == null ? null : displayName.strip();
        roles = roles == null ? null : Set.copyOf(roles);
    }
}
```

| Normalization | Rule |
| --- | --- |
| `strip()` strings | do it before `@NotBlank` and `@Size` run, which the compact constructor guarantees |
| Locale-sensitive case folding | use `toLowerCase(Locale.ROOT)`; the default locale makes the payload depend on the server locale |
| Identifier casing | normalize when the identifier is genuinely case-insensitive, otherwise reject instead of rewriting |
| Enum parsing | bind the enum and let Jackson fail on unknown values, or accept a `String` and parse explicitly with a typed error |
| Absent versus null | a missing key leaves the component `null`; decide explicitly whether that means "unchanged" for a patch |

Never normalize a value into something the caller did not send and cannot see, for example rewriting a timezone into the server default. Normalize representation, not meaning.

## Immutability

| Structure | On construction | On access |
| --- | --- | --- |
| `List` | `List.copyOf` | safe, already unmodifiable |
| `Set` | `Set.copyOf` | safe |
| `Map` | `Map.copyOf` | safe |
| `byte[]` | `content.clone()` | override the accessor to return a clone |
| `char[]` | `chars.clone()` | never expose it; expose a `String` instead |
| nested record | the nested record copies its own structures | each record defends itself |

Notes: `List.copyOf` rejects a null element, which converts a mapper `NullPointerException` into an immediate construction failure; never catch that exception and drop the element, because it hides a malformed request. `Set.copyOf` instead drops duplicates silently, so a payload where duplicates are meaningful must be a `List`.

## Mapping strategies

### Static factory on the DTO

```java
package com.example.orders.api;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record OrderView(UUID id, String clientReference, String status, long totalMinor, List<OrderLineView> lines) {

    public static OrderView from(Order order) {
        long total = order.lines().stream().mapToLong(OrderLine::subtotalMinor).sum();
        return new OrderView(
                order.id(),
                order.clientReference(),
                order.status().name(),
                total,
                order.lines().stream().map(OrderLineView::from).toList());
    }
}
```

Use when the mapping is small and the source is one type. Cost: the DTO now depends on the domain type, so a DTO cannot be reused for a second source without a second factory. Accept that only inside the boundary package.

### Generated mapper

```java
package com.example.orders.api;

import java.util.List;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.ReportingPolicy;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface OrderMapper {

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "status", ignore = true)
    @Mapping(target = "version", ignore = true)
    @Mapping(target = "createdAt", ignore = true)
    Order toEntity(CreateOrderRequest request);

    List<OrderLine> toLines(List<OrderLineRequest> requests);

    OrderLineView toView(OrderLine line);
}
```

Rules: `unmappedTargetPolicy = ReportingPolicy.ERROR` turns a silent field loss into a compile error; list every server-owned target explicitly with `ignore = true` so the allow-list is visible in code; a read-side method whose names already match needs no annotation; keep mappers in the boundary package; never let a generated mapper reach into a lazy relation, because generation will happily call the getter and issue the query.

### Explicit mapper component

```java
package com.example.orders.api;

import java.util.List;

import org.springframework.stereotype.Component;

@Component
class OrderMapper {

    private final ProductCatalog catalog;

    OrderMapper(ProductCatalog catalog) {
        this.catalog = catalog;
    }

    OrderView toView(Order order) {
        return new OrderView(
                order.id(),
                order.clientReference(),
                order.status().name(),
                order.lines().stream().map(this::toView).toList());
    }

    private OrderLineView toView(OrderLine line) {
        Product product = catalog.findBySku(line.sku());
        return new OrderLineView(line.sku(), line.quantity(), product.displayName(), product.imageUrl());
    }
}
```

Use when the mapping needs a lookup, a condition, or several sources. Cost: one more class, but every rule is greppable, reviewable, and unit-testable without a Spring context.

### Selection

| Signal | Strategy |
| --- | --- |
| One source, a handful of fields, no logic | static factory |
| Many DTOs with repeated field-by-field copies | generated mapper with `ERROR` policy |
| Lookup, condition, composition, or two-way mapping | explicit mapper component |
| Read model produced by a projection query | no mapper at all: let `spring-boot-data-jpa` project into the record |
| Pure re-export of the same shape | still a separate type; identity mapping hides the boundary |

## Entity leakage defects

| Defect | Symptom | Repair |
| --- | --- | --- |
| `@Entity` returned from a controller | `LazyInitializationException`, N+1, schema leak | map to a record; if a relation is needed, join-fetch it or project it |
| `Page<Order>` returned | a huge unstable schema and unbounded payload | return a page DTO record |
| Projection interface returned | proxy object, partial initialisation, no stable schema | return a record built from the projection |
| `byte[]` field on a JPA entity | mutable array shared with the persistence context | clone in the DTO accessor |
| `@JsonIgnore` on entity fields | hides the leak, keeps the coupling | remove the entity from the boundary |
| `Map` built from an entity inside the controller | logic in the transport layer | move the projection into the mapper |
| Domain event payload serialized directly | internal model published | map to a DTO first |

A quick smell test: if a controller signature mentions `jakarta.persistence`, `Page`, `Pageable`, `Slice`, `Optional` of an entity, or a domain aggregate, the boundary is broken.

## Record to entity mapping rules

1. Server-owned fields are never set from the body: `id`, `version`, `status`, audit fields, computed totals, and owner ids.
2. Copy collections rather than assigning the incoming reference, so a later mutation of the record cannot reach the entity.
3. Instantiate the entity through its own factory or constructor, not through a no-arg constructor plus setters, so invariants hold.
4. Keep the transaction boundary in the service, not in the mapper.
5. Return the mapped view, not the entity, from every service method that a controller calls.

## Testing rules

- Unit-test the compact constructor: normalization, blank handling, null handling, and collection immutability.
- Unit-test the mapper by asserting the allow-list, not by asserting every field: assert that a server-owned field is unchanged after mapping.
- Assert that a record returned by the accessor is not the same instance as the input array or list, so the immutability contract is enforced by a test.
- Verify the JSON shape with one serialization test per published DTO, so a Jackson configuration change cannot silently rename a field.
- Do not assert private mapper internals; assert the produced record.

## Review checklist

- Every controller signature uses records, page DTOs, and problem types only.
- No transport type carries a persistence or domain framework annotation.
- Every collection, map, and byte array crossing the boundary is copied.
- Server-owned fields are explicitly ignored in every mapping, in code.
- Create, update, and action payloads are separate types.
- Normalization happens in the compact constructor, before validation.
- A `byte[]` accessor returns a clone.
- No DTO component exists only to carry an internal identifier with no external meaning.
