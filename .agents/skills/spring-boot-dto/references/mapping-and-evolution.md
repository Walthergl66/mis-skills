# Mapping and Evolution

Load this when splitting command, update, and read payloads, applying allow-lists, choosing a nested or flat payload shape, or deciding whether a field change breaks a published contract.

## Payload taxonomy

| Payload | Direction | Answers | Typical name | Owned rules |
| --- | --- | --- | --- | --- |
| Command | client to server | what the client wants to happen | `CreateOrderRequest`, `CancelOrderRequest` | what the client must send |
| Update | client to server | which mutable fields change | `UpdateOrderRequest` | which fields are writable now |
| Read model | server to client | what the client needs to render or decide | `OrderView`, `OrderSummary` | nothing; it is already valid |
| Action payload | client to server | what this one transition needs | `RefundOrderRequest` | only the fields of that transition |
| Page envelope | server to client | the slice and how to continue | `PageResponse<T>` | bounds and cursor |
| Problem | server to client | what failed and what to do | `ProblemResponse` | stable code registry |

Rules: a command and the matching read model are always separate types; an action payload is not a subset view of the resource, it is a purpose-built request; a list projection gets its own summary type rather than a read model with nulls; the problem type belongs to `spring-boot-rest-api` and is reused, not redefined here.

## Over-posting and allow-lists

Over-posting is a client writing a field the UI never exposed.

```java
package com.example.orders.api;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record CreateOrderRequest(String clientReference, Instant deliverAt, List<@jakarta.validation.Valid OrderLineRequest> lines) {
}

public record UpdateOrderRequest(String shippingNote, List<String> tagNames) {
}

public record CancelOrderRequest(CancelReason reason, String note) {
}

public record OrderView(UUID id, String clientReference, String status, long totalMinor, Instant createdAt) {
}
```

Writable-field matrix, the artifact to keep next to the DTOs:

| Field | Create | Update | Action | Read |
| --- | --- | --- | --- | --- |
| `id` | server | server | server | yes |
| `clientReference` | client | immutable | server | yes |
| `status` | server | server | server only | yes |
| `totalMinor` | server | server | server | yes |
| `shippingNote` | client | client | server | yes |
| `tagNames` | client | client | server | yes |
| `cancelReason` | absent | absent | client | yes |
| `version` | server | precondition | server | yes, as the ETag source |
| `createdAt` | server | server | server | yes |
| `ownerId` | server | server | server | never, unless the caller needs to see the owner |

Rules: a deny-list of forbidden fields fails on the next schema change; an allow-list cannot be bypassed by a field the client invents; a field the client must not set is absent from the request record, not merely undocumented; a field the client may set only under a condition, such as a price override, belongs to a separate privileged payload.

## Flat versus nested

| Shape | Use | Cost |
| --- | --- | --- |
| Flat | a small payload with independent fields, and a stable simple surface | duplicated parent fields, re-validation on the parent in every child |
| Nested | a payload that mirrors a real sub-structure the client already understands | deep partial-update ambiguity, larger breaking surface |
| Hybrid | one nested object plus a few flat control fields | a rule to state: the flat fields are command options, the nested object is the resource patch |

Rules: never mix a nested resource patch with a flat copy of the same fields; a `PATCH` on a nested object must state whether the object is replaced, merged, or cleared, and the simplest correct answer is replacement; array element updates are not partial updates, so replace the array and document the cost; nesting depth beyond two levels usually means the payload is an entity graph in disguise.

## Mapping commands to aggregates

1. Validate transport shape on the record.
2. Translate the record into explicit domain values, for example a `Money` value object, not a raw `long` plus a currency string split across two fields.
3. Call one aggregate factory or transition method.
4. Let the aggregate reject the operation with a typed exception; the DTO never pre-empts a domain rule.
5. Map the resulting aggregate to a read model.

```java
package com.example.orders.api;

import java.util.List;

import org.springframework.stereotype.Service;

@Service
class OrderApplicationService {

    private final OrderRepository orders;
    private final OrderViewMapper views;

    OrderApplicationService(OrderRepository orders, OrderViewMapper views) {
        this.orders = orders;
        this.views = views;
    }

    OrderView place(CreateOrderRequest request) {
        List<OrderLineDraft> lines = request.lines().stream()
                .map(line -> new OrderLineDraft(line.sku(), line.quantity()))
                .toList();
        Order order = Order.place(request.clientReference(), lines);
        return views.toView(orders.save(order));
    }
}
```

Rules: the service receives the DTO, not the entity; translation to domain values is explicit; persistence calls stay behind the repository owned by `spring-boot-data-jpa`; the read model is built after the write, from the saved state, not from the request.

## Evolution rules

| Change | Classification | Notes |
| --- | --- | --- |
| New optional field with a null default | additive | a client that ignores unknown fields is unaffected; a client that rejects unknown fields is not |
| New endpoint | additive | publish it, then deprecate the old behavior if it existed |
| New required field | breaking | old clients cannot produce a valid payload |
| Removing or renaming a field | breaking | state it in the changelog before removing |
| Narrowing a type, such as `String` to enum | breaking | old values stop deserializing |
| Adding an enum value | breaking for strict clients | see `spring-boot-api-versioning` |
| Making an optional field required | breaking | the same field can be required in one version and optional in the next |
| Changing a status code | breaking | clients branch on it |
| Adding a new error `code` | additive for clients, breaking for exhaustiveness matchers | document that clients must ignore unknown codes |
| Changing null from explicit to omitted | breaking for clients that distinguish them | pick one convention and hold it |
| Tightening a constraint, such as `maxLength` from 255 to 64 | breaking | existing payloads start failing |
| Adding an optional request header with a default behavior | additive | the default must preserve the old outcome |

Rules: a change is breaking if a correct client built against the previous contract can start receiving `4xx` or `5xx`, lose a field it reads, or misinterpret a value; compatibility is judged from the client, not from the server; a deprecated field is removed only after telemetry shows it is unused; the version decision itself belongs to `spring-boot-api-versioning`.

## Null and absence convention

| Choice | Rule | Cost |
| --- | --- | --- |
| Omit absent optional fields | server treats absence as the default | client must not send explicit nulls to mean "clear" |
| Send explicit nulls | server distinguishes null from absent | larger payloads, more branches in every mapper |
| Never nullable | every field always present with a default or a sentinel | a sentinel enum value such as `NONE` is a modelling smell |

Pick one convention, write it in the API changelog, and enforce it with one Jackson configuration. A single accidental `spring.jackson.default-property-inclusion` change flips the whole surface and is invisible in code review.

## Evolution workflow

1. Classify the change with the table above, judged from the client side.
2. For an additive change, add the field with a default that reproduces the previous behavior and extend the DTO, the schema, and the tests in one commit.
3. For a breaking change, stop and use `spring-boot-api-versioning`; do not ship a breaking change under the same version.
4. Record the change in the changelog with the classification, the affected field, and the client impact.
5. Add a test that pins the previous behavior for the additive case, so the default is a tested contract rather than an assumption.
6. When removing a deprecated field, confirm zero usage in access logs and metrics before the removal lands.

## Review checklist

- Create, update, action, and read payloads are separate record types.
- Every writable field is present in the allow-list matrix and nowhere else.
- No server-owned field is bindable from any request record.
- Flat and nested fields never describe the same data.
- Partial-update semantics for nested objects and arrays are stated and simple.
- The domain receives translated values, not a DTO instance.
- Every field change is classified additive or breaking, judged from the client.
- The null and absence convention is stated once and enforced by configuration.
