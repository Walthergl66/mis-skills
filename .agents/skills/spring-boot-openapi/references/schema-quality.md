# Schema Quality

Load this when reviewing a generated OpenAPI document for defects, writing `@Schema` and `@Operation` annotations, or repairing a schema that a code generator produced from a leaky signature.

## Annotation map

| Target | Annotation | Use for |
| --- | --- | --- |
| DTO record | `@Schema` | `description`, `example`, `requiredMode`, `accessMode`, `minimum`, `maximum`, `pattern`, `type` override |
| DTO type | `@Schema(name = ...)` | a stable public name that is not the Java class name |
| DTO component | `@ArraySchema` | bounded collection with `minItems` and `maxItems` |
| Controller method | `@Operation` | `summary`, `description`, `operationId`, `deprecated` |
| Controller class | `@Tag` | grouping and section title in the UI |
| Method parameter | `@Parameter` | header and query documentation, `example` |
| Parameter object | `@ParameterObject` | a record of query parameters flattened into the operation |
| Response | `@ApiResponses` and `@ApiResponse` | every observable status, not only success |
| Request body | `@RequestBody(description = ..., content = @Content(...))` | media types and an example payload |
| Type or method | `@Hidden` | exclude internals from the document |
| Type or method | `@SecurityRequirement` | the scheme the operation requires |
| Configuration type | `@SecurityScheme` | the declared auth contract |

```java
package com.example.orders.api;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@Schema(name = "OrderLine", description = "One requested line of an order")
public record OrderLineRequest(

        @Schema(description = "Catalog SKU", example = "SKU-4471", requiredMode = Schema.RequiredMode.REQUIRED)
        @NotBlank
        @Size(max = 32)
        String sku,

        @Schema(description = "Units ordered", example = "3",
                minimum = "1", maximum = "999", requiredMode = Schema.RequiredMode.REQUIRED)
        @Min(1)
        @Max(999)
        int quantity,

        @Schema(description = "Unit price in minor units, sent only by privileged callers",
                nullable = true, accessMode = Schema.AccessMode.READ_ONLY)
        Long unitPriceMinor) {
}

@Schema(name = "CreateOrderRequest", description = "Payload to place an order")
public record CreateOrderRequest(

        @Schema(description = "Client reference, unique per customer",
                example = "checkout-88213", requiredMode = Schema.RequiredMode.REQUIRED)
        @NotBlank
        String clientReference,

        @Schema(description = "Requested delivery date", example = "2026-03-14")
        Instant deliverAt,

        @ArraySchema(schema = @Schema(implementation = OrderLineRequest.class),
                minItems = 1, maxItems = 100)
        @NotNull
        List<@NotNull OrderLineRequest> lines) {
}
```

`requiredMode` exists because Java nullability and required-ness are different concepts: a nullable field can still be required, meaning the key must be present with an explicit null. Prefer omission over an explicit null for optional fields.

## Example recipes

```java
package com.example.orders.api;

import java.util.UUID;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import org.springframework.web.bind.annotation.RequestBody;

@Operation(
        operationId = "placeOrder",
        summary = "Place an order",
        description = "Creates an order. Send the same Idempotency-Key when retrying a timed-out request.")
@ApiResponses({
        @ApiResponse(responseCode = "201", description = "Order created; see the Location header"),
        @ApiResponse(responseCode = "202", description = "Order accepted for asynchronous fulfilment; see the Location header"),
        @ApiResponse(responseCode = "409", description = "Duplicate client reference, or the order can no longer transition")
})
OrderView place(
        @RequestBody(
                description = "Order to place",
                content = @io.swagger.v3.oas.annotations.media.Content(
                        mediaType = "application/json",
                        schema = @Schema(implementation = CreateOrderRequest.class),
                        examples = @ExampleObject(name = "singleLine",
                                summary = "One line with a client reference",
                                value = """
                                        {
                                          "clientReference": "checkout-88213",
                                          "lines": [{ "sku": "SKU-4471", "quantity": 3 }]
                                        }""")))
        @jakarta.validation.Valid CreateOrderRequest request) {
    return commands.place(request);
}
```

Rules: one `operationId` per operation and keep it stable, because generated client method names come from it; put business rules in `description`, not in `summary`; use text blocks for examples so the JSON stays valid and reviewable; examples must be synthetic.

## Defect catalogue

| Defect | Symptom in the document | Root cause | Fix |
| --- | --- | --- | --- |
| Free-form object | `type: object` with no `properties` | `Map`, `Object`, `JsonNode`, or a raw type in the signature | add a typed record; if the shape is genuinely dynamic, declare `type: object` with `additionalProperties` and a `description` saying so |
| Entity leak | `properties` include `hibernate`, `version`, internal relations | an `@Entity` returned from a controller | map to a DTO; the boundary is a `spring-boot-dto` defect |
| Pagination internals | a `pageable` sub-object with `sort`, `page`, `offset` | `Page<T>` or `Pageable` in a signature | return a page DTO record |
| Erasured generic | `oneOf` over every generic instantiation | raw `ApiResponse` return type | parameterize the wrapper in the signature |
| Missing failures | only `200` and `default` | no `@ApiResponse` and no advice-derived response | declare the problem response once and reference it |
| Unbounded collection | array with no `maxItems` | no constraint and no `@ArraySchema` | add `@Size` and `@ArraySchema(maxItems = ...)` |
| Opaque enum | `enum` with internal state names | an internal status enum used publicly | define a public enum, or document the field as an open string |
| Duplicate schema names | `CreateOrderDto` and `CreateOrderRequest` | two near-identical records | collapse to one |
| Secret-shaped field | `token`, `passwordHash`, `apiKey` in a schema | internal DTO reused as a request or response | remove the field from the transport model |
| No pagination metadata | a bare array response | missing page DTO | return `items`, `nextCursor`, `hasMore` |
| Missing request header | no `Idempotency-Key` or `If-Match` parameter | headers are not in the signature | add the header parameter and `@Parameter` documentation |
| Wrong `Content-Type` | success documented as `text/plain` | missing `produces`, or a `String` return type | set `produces = "application/json"` and return a typed body |

## Repair order

1. Fix the Java signature first. A leaked entity, a raw `Map`, or an unparameterized generic cannot be repaired by annotation.
2. Then set the name and the description so the public vocabulary is right.
3. Then add examples that show a valid payload and one representative failure.
4. Then add the missing responses, including `4xx` and `5xx`.
5. Then verify with a strict validator, which fails on unresolvable `$ref` and on missing `operationId`.

```bash
npx --yes @redocly/cli@latest lint target/openapi.json
```

## Enum and optionality rules

- An enum in the schema is a closed set as far as a generated client with strict parsing is concerned. Adding a constant is a breaking change for that client; see `spring-boot-api-versioning` before adding one.
- For a field that must accept unknown values, type it as a string and document the known values in the description. Do not publish an enum and then violate it.
- Prefer omitting an optional field over sending an explicit `null`; it keeps the schema smaller and makes absence unambiguous.
- Do not model tri-state behaviour with three magic enum values when an absent field already means one state.

## Review checklist

- Every path in the document maps to an endpoint a client is meant to call.
- No schema exposes entity internals, lazy relations, or a persistence `version` unless it is a documented concurrency validator.
- Every operation documents every observable status, with the problem schema referenced rather than inlined.
- Request headers that change behavior, `Idempotency-Key` and `If-Match` among them, appear as parameters.
- Collections declare a maximum; filters, sorts, and projections are allow-listed in the description.
- Examples contain no real identifiers, tokens, addresses, or customer data.
- `operationId` values are unique and stable, and match the names in published client SDKs.
- Security requirements on operations match the authorities the filter chain actually enforces.
