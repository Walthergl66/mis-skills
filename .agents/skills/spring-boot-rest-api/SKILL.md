---
name: spring-boot-rest-api
description: 'Use when designing or changing the HTTP contract of a Spring Boot service, including resource and action endpoints, status code selection, ProblemDetail error bodies, pagination envelopes, Idempotency-Key retries, If-Match concurrency, and long-running operation resources. Triggers include @RestController, @RequestMapping, ResponseEntity, @ResponseStatus, @RestControllerAdvice, ProblemDetail, RFC 9457, 201 with Location, 202 Accepted, 204, 409 versus 422, 412 Precondition Failed, 415, 429, ETag, and cursor pagination. Do not use for filter and interceptor mechanics, field validation, DTO shape design, version routing, spec generation, or auth enforcement. When other skills also apply, reconcile ownership before mutation.'
license: MIT
metadata:
  author: Walthergl66
  version: '1.0.0'
---

# Spring Boot REST API Contract

Design the endpoint set as a consumer-visible contract: resources, actions, status codes, one error shape, and a bounded read model. Transport mechanics are a separate concern and belong to `spring-boot-mvc`.

## When to use

- Adding, renaming, or removing an endpoint, path, method, status code, or required header.
- Designing an error contract, a stable machine-readable code, or a `ProblemDetail` extension member.
- Designing list endpoints, page envelopes, cursors, filters, sort allow-lists, `Idempotency-Key` retries, `If-Match` concurrency, or a pollable job resource for long-running work.

## When not to use

- Filter, interceptor, message converter, CORS, or async mechanics: use `spring-boot-mvc`.
- Constraint definitions, groups, or binding failures: use `spring-boot-validation`.
- Choosing DTO fields, records, or entity-to-DTO mapping: use `spring-boot-dto`.
- Deciding whether the URL carries a version prefix and how versions route: use `spring-boot-api-versioning`.
- Generating or reviewing the OpenAPI document: use `spring-boot-openapi`.
- Authentication, authorization, or rate-limit identity: use `spring-boot-security`.
- Writing `MockMvc` or Testcontainers contract tests: use `spring-boot-integration-testing`.

## Ownership and sibling boundaries

- Owns the HTTP contract: resources, actions, status codes, `Location`, `Retry-After`, the error body, page envelopes, idempotency keys, and conditional requests.
- Yields filter, interceptor, and async mechanics to `spring-boot-mvc`; this skill states which headers a handler emits, not which hook emits them.
- Yields constraint annotations and validation groups to `spring-boot-validation`; this skill decides that a failure is `422` with field errors.
- Yields DTO field design and mapping to `spring-boot-dto` and version placement to `spring-boot-api-versioning`; this skill fixes the envelope and assumes the path is decided.
- Yields document generation to `spring-boot-openapi`, identity to `spring-boot-security`; this skill owns the contract and the `401` and `403` bodies.
- Yields controller test mechanics to `spring-boot-integration-testing`; this skill defines the assertions those tests must make.

## Hard rules

1. Never return an `@Entity`, a `Page`, a `Map`, or an exception message as a response body.
2. Every error response has one shape, `application/problem+json`, across the whole service.
3. Every failure a client may act on carries a stable, documented `code` extension member.
4. A `GET` is side-effect free, a `DELETE` is idempotent, a `POST` is neither unless a key makes it so.
5. Every collection response is bounded and carries continuation or total-count information.
6. Error bodies never contain stack traces, SQL, class names, host names, or vendor payloads.

## Status code decision table

| Situation | Status | Required extras | Reject |
| --- | --- | --- | --- |
| Successful read or update with a body | `200` | `ETag` when the representation is cacheable | `200` with a bare `Map` |
| Resource created | `201` | `Location` with the canonical URI | `200` for creation |
| Work accepted, not finished | `202` | `Location` on a status resource | `200` while work is queued |
| Succeeded and nothing to return | `204` | no body at all | `204` with a JSON body |
| Malformed or unparseable request | `400` | `code`, internals-free `detail` | `400` carrying a trace |
| Missing or invalid credentials | `401` | `WWW-Authenticate` | `403` for anonymous callers |
| Authenticated but not permitted | `403` | `code` | `404` used to hide existence |
| Resource or route absent | `404` | `code` | `404` for a failed precondition |
| Duplicate key, illegal transition, blind write | `409` | `code` plus `current` or `allowedTransitions` | `409` for a semantically invalid body |
| Body parses but violates a rule | `422` | `code` plus per-field `errors` | `400` for field violations |
| `If-Match` validator mismatch | `412` | current `ETag` | `409` for ETag mismatch |
| Unsupported `Content-Type` | `415` | producible types in `detail` | coercing the body |
| Quota exceeded | `429` | `Retry-After` | queueing over-limit work |
| Unhandled failure | `500` | `code` and `traceId` only | `500` echoing the message |
| Known dependency outage | `503` | `Retry-After` | `500` for a known outage |

## Resources, subresources, and actions

| Need | Shape | Status |
| --- | --- | --- |
| Create or replace a collection member | `POST /orders` | `201` + `Location` |
| Partial field update | `PATCH /orders/{id}` with a patch DTO | `200` or `204` |
| Full replacement, client owns identity | `PUT /orders/{id}` with `If-Match` | `200` or `204` |
| Child that exists only inside a parent | `POST /orders/{id}/shipments` | `201` + `Location` |
| State transition with preconditions and side effects | `POST /orders/{id}/cancellation` | `200`, or `202` + status resource |
| Relationship replacement | `PUT /orders/{id}/lines` with the full set | `204` |

Rules: plural lowercase collections; identifiers in the path, never as query parameters; an action segment names a real state change; never model a transition with preconditions as `PATCH` with `{"status": ...}`; never accept a body on `GET` or `DELETE`.

## One error contract

Extend `ResponseEntityExceptionHandler` and stamp one stable `code` on every `4xx` in a single override instead of a dozen handlers.

```java
package com.example.orders.api;

import java.net.URI;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@RestControllerAdvice
class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception ex, Object body, HttpHeaders headers,
                                                             HttpStatusCode status, WebRequest request) {
        if (status.is4xxClientError()) {
            ProblemDetail problem = ProblemDetail.forStatus(status);
            problem.setType(URI.create("https://errors.example.com/" + status.value()));
            problem.setInstance(URI.create(((HttpServletRequest) request.getNativeRequest()).getRequestURI()));
            problem.setProperty("code", ErrorCodes.forStatus(status.value()));
            problem.setProperty("traceId", TraceContext.currentId());
            return super.handleExceptionInternal(ex, problem, headers, status, request);
        }
        return super.handleExceptionInternal(ex, body, headers, status, request);
    }
}
```

`ErrorCodes` and `TraceContext` are project types holding the published code registry and the correlation id. `type` is a stable dereferenceable URI, never `about:blank`; the unknown-failure handler logs the cause and returns a fixed `500` body; leave `spring.mvc.problemdetails.enabled` on so framework failures render as `ProblemDetail` too.

## Bounded reads

Return a page DTO record, never `Page<T>`. The cursor is opaque base64url over the keyset tuple, a cursor the server did not issue is `400`, `hasMore` comes from fetching `limit + 1` rows, the sort is always `(created_at, id)` descending, and filters, sorts, and projections are allow-listed so a client field name never reaches a query builder. Never expose raw offsets: `page=10000` degrades linearly.

## Retry safety and concurrency

| Concern | Mechanism | Failure status |
| --- | --- | --- |
| Duplicate `POST` after a timeout | `Idempotency-Key`, stored fingerprint and result replay | replayed response, or `409` on fingerprint mismatch |
| Lost update on a mutable resource | strong `ETag` plus `If-Match` | `412` |
| Client hammering a limit | `429` plus `Retry-After` | `429` |

Idempotency rules: require the key on charge, refund, and order-placement `POST`s; insert the key row before doing the work so a concurrent duplicate loses the race; replay the stored response verbatim; return `409` with `code=IDEMPOTENCY_KEY_REUSED` when the same key carries a different payload; retain records for the whole retry window. ETag rules: compute from a `version` column or a representation hash, quote it, return it on every `200` and `204`, and treat a mismatch as `412`, never `409`.

Load [references/http-semantics.md](references/http-semantics.md) for the header matrix, the conditional-request flow, the idempotency protocol, long-running operations, and anti-patterns, and [references/error-contract.md](references/error-contract.md) for the code registry, advice layering, field errors, and the disclosure limits.

## Reference routing

| Task | Load |
| --- | --- |
| Pick a status, header, conditional request, idempotency key, or long-running operation shape | [http-semantics.md](references/http-semantics.md) |
| Design the `ProblemDetail` body, stable error codes, advice layering, and disclosure limits | [error-contract.md](references/error-contract.md) |

## Expected response

- **Endpoint set:** method, path, purpose, and the resource or action classification.
- **Status table:** chosen status per operation with the required `Location`, `ETag`, `Retry-After`, or `WWW-Authenticate` headers.
- **Error contract:** `type` URI, `code` value, extension members, and the failure `Content-Type`.
- **Concurrency and retry:** idempotency key policy, ETag source, and the `409`, `412`, or `429` triggers.
- **Bounded reads:** page envelope fields, cursor semantics, allow-listed filters and sorts, and the maximum size.
- **Disclosure review:** fields excluded from every error and response, plus the `traceId` correlation path.
