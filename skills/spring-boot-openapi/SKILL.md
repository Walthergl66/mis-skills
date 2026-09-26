---
name: spring-boot-openapi
description: 'Use when generating, reviewing, gating, or publishing the OpenAPI 3.1 contract of a Spring Boot service with springdoc-openapi, including starter wiring, groups, Swagger UI exposure, @Schema and @Operation quality, @ApiResponse coverage, security scheme documentation, and spec drift detection in CI. Triggers include springdoc-openapi-starter-webmvc-ui, springdoc.api-docs.version, springdoc.group-configs, /v3/api-docs, GroupedOpenApi, OpenApiCustomizer, GlobalOpenApiCustomizer, @SecurityScheme, @ApiResponses, @ParameterObject, and openapi.json diffing. Do not use for endpoint design, DTO field shape, auth implementation, version routing, or contract test authoring. When other skills also apply, reconcile ownership before mutation.'
license: MIT
metadata:
  author: Walthergl66
  version: '1.0.0'
---

# Spring Boot OpenAPI Contract

Generate the document from the running code, then fix the small set of facts the generator cannot infer. An unreviewed generated document is a defect, not documentation.

## When to use

- Adding or changing the springdoc dependency, properties, groups, or UI access rules.
- Reviewing a generated `openapi.json` for schema defects before publishing it.
- Documenting error responses, security schemes, servers, examples, or deprecation on an operation.
- Producing the spec at build time and gating pull requests on contract drift.
- Diagnosing a spec with missing paths, missing `4xx` responses, or `object` schemas with no properties.

## When not to use

- Deciding the endpoints, statuses, or error contract: use `spring-boot-rest-api`.
- Choosing DTO components, records, or field types: use `spring-boot-dto`.
- Configuring the real authentication and authorization rules: use `spring-boot-security`.
- Choosing the version strategy and the removal timeline: use `spring-boot-api-versioning`.
- Writing provider or consumer contract tests: use `spring-boot-integration-testing`.
- Filter, interceptor, and async mechanics: use `spring-boot-mvc`.

## Ownership and sibling boundaries

- Owns the generated document: dependencies, properties, groups, UI exposure, schema annotations, security scheme descriptions, build-time generation, and the drift gate.
- Yields endpoint design, status codes, and the error body to `spring-boot-rest-api`; this skill documents the contract, it does not design it.
- Yields DTO components and mapping to `spring-boot-dto`; a leaking entity schema is a `spring-boot-dto` defect that this skill reports.
- Yields authentication reality to `spring-boot-security`; a `securitySchemes` entry that contradicts the filter chain is a security finding.
- Yields version placement and the removal timeline to `spring-boot-api-versioning`; this skill renders the version in paths and `info.version`.
- Yields contract test code to `spring-boot-integration-testing`; this skill owns the diff command and the gate, not the assertions.
- Yields controller and filter mechanics to `spring-boot-mvc`; springdoc sees only what the request mapping registry exposes.

## Hard rules

1. Generate from the code, then review. Never hand-edit generated output and never commit the spec as the source of truth.
2. The build fails on unintended spec drift against the merge target; a deliberate change is a reviewed diff, not a silenced gate.
3. `application/problem+json` is declared once as a reusable component and referenced by every failure response.
4. A published path lists every status a client can observe, not only the success status.
5. A schema with `type: object` and no properties is a defect: a `Map`, `Object`, or raw type reached the boundary.
6. No internal identifier, entity name, or internal service name appears in the document.
7. The document and the UI are internal surfaces; `/v3/api-docs` is never a public endpoint.
8. Examples are synthetic; never copy a real token, email, or customer id into `@ExampleObject`.

## Setup

```xml
<dependency>
    <groupId>org.springdoc</groupId>
    <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
    <version>2.8.9</version>
</dependency>
```

Use the `-ui` starter only where a human browses the API; where only machines read the document, depend on `springdoc-openapi-starter-webmvc-api` and drop the UI. Pin the version, because the starter is not managed by the Boot BOM.

```yaml
springdoc:
  api-docs:
    enabled: true
    path: /v3/api-docs
    version: openapi_3_1
  swagger-ui:
    enabled: true
    path: /swagger-ui.html
    operationsSorter: alpha
  packages-to-scan: com.example.orders.api
  paths-to-match: /api/**
  paths-to-exclude: /internal/**
  show-actuator: false
  override-with-generic-response: true
  writer-with-order-by-keys: true
```

`openapi_3_1` is the 2.8.x default; set it explicitly so a rename cannot silently downgrade the document. Set `override-with-generic-response=false` when per-operation `@ApiResponse` entries must survive a generic `@ControllerAdvice` response. Set `writer-with-order-by-keys=true` so key order is stable and the drift diff stays readable.

## Inferred versus declared

| Inferred from the code | Must be declared | Often inferred wrongly |
| --- | --- | --- |
| Paths, methods, parameters | `info`, `servers`, tag descriptions | operation `summary` and business meaning |
| Body schema from the DTO record | `4xx` and `5xx` responses | the error shape and its `code` values |
| `Content-Type` from `consumes` and `produces` | `Idempotency-Key`, `If-Match`, `If-None-Match` | the retry and concurrency contract |
| Bean Validation bounds as schema limits | examples, formats, and units | whether `409` or `422` applies |
| `Page` and `Pageable` structures | security schemes | entity relations and lazy fields |
| Enum constants as the `enum` list | deprecation and sunset metadata | which enum values clients may receive |

Declare the missing half on the operation when the fact is local to it; use a `GlobalOpenApiCustomizer` only for what must exist in every group, and the `OpenAPI` bean for `info`, `servers`, and `components`.

## Schema defects

| Defect | Cause | Fix |
| --- | --- | --- |
| `type: object` with no properties | `Map`, `Object`, `JsonNode`, or a raw type | typed record, or an explicit free-form object with `additionalProperties` and a description |
| Entity fields and relations published | an `@Entity` returned from a controller | map to a DTO; the leak is a `spring-boot-dto` defect |
| `pageable` object with `sort`, `page`, `offset` | `Page<T>` in a signature | return a page DTO record |
| `oneOf` over every generic instantiation | raw generic return type | parameterize the wrapper in the signature |
| Only `200` documented | no `@ApiResponse`, no advice-derived response | declare the problem response once and reference it |
| Unbounded arrays | no constraint, no `@ArraySchema` | `@Size` plus `@ArraySchema(maxItems = ...)` |
| Unbounded enum with internal states | an internal status enum used publicly | a deliberate public enum, or a documented open string |
| Duplicate schema names | two near-identical records | collapse to one record |

Fix the Java signature before reaching for `@Schema`; an annotation cannot repair a leaked entity or a raw `Map`. Use `@Schema` for `description`, `example`, `requiredMode`, `accessMode`, `minimum`, `maximum`, `pattern`, and `type`, never to contradict the Java type.

## Security, groups, and the gate

Declare the scheme the filter chain actually enforces, with the real token URL and real scopes; mark public operations with an empty `@SecurityRequirement`; publish one document per audience through groups rather than one document mixing internal and public paths; read server URLs from configuration. Generate at build time with `springdoc-openapi-maven-plugin` bound to the `generate` goal during the integration-test phase, which writes `target/openapi.json` on `mvn verify`, then diff that artifact against the same document generated on the merge target with the same JDK and profile. Classify each change as additive, breaking, or noise, and fail on undeclared breaking changes.

```bash
mvn -q verify
npx --yes @redocly/cli@latest lint target/openapi.json
```

Load [references/springdoc-setup.md](references/springdoc-setup.md) for the full property set, groups, customizer beans, per-environment access control, and plugin options, and [references/schema-quality.md](references/schema-quality.md) for annotation recipes, the defect catalogue, and the repair order.

## Reference routing

| Task | Load |
| --- | --- |
| Wire the starter, set properties, split groups, control access, generate at build time, or run the drift gate | [springdoc-setup.md](references/springdoc-setup.md) |
| Repair schemas, write `@Schema` and `@Operation`, add examples, or diagnose a defective document | [schema-quality.md](references/schema-quality.md) |

## Expected response

- **Generation setup:** starter artifact, `springdoc.api-docs.version`, group list, and where the document is produced.
- **Inferred versus declared:** facts springdoc derives from code and facts that needed explicit declaration.
- **Schema defects:** each defect with the offending type, the cause, and the concrete fix.
- **Coverage gaps:** operations missing `4xx` or `5xx` responses, security requirements, or concurrency headers.
- **Exposure review:** who can reach the document and the UI per environment, and what that means for gating.
- **Drift gate:** the diff command, what counts as breaking, and the noise excluded from the comparison.
- **Review note:** the parts of the document a human must read before publish.
