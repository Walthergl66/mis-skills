# HTTP Semantics

Load this when choosing a status code, response header, conditional request, retry policy, or the shape of a long-running operation in a Spring Boot HTTP service.

## Method semantics

| Method | Safe | Idempotent | Request body | Response body | Typical status |
| --- | --- | --- | --- | --- | --- |
| `GET` | yes | yes | no | yes | `200`, `304` |
| `HEAD` | yes | yes | no | no | `200` with headers only |
| `POST` | no | no | yes | yes | `201`, `202`, `200` |
| `PUT` | no | yes | yes, full state | yes | `200`, `204` |
| `PATCH` | no | not guaranteed | yes, partial state | yes | `200`, `204` |
| `DELETE` | no | yes | no | no | `204`, `200` when deleting one of many |
| `OPTIONS` | yes | yes | no | no | `204` plus `Allow` |

Rules: never use `GET` to trigger work; make `PUT` fully replace so retries converge; prefer `PATCH` when the client owns a subset of fields; make `DELETE` return `204` even when the resource is already gone so a retried delete is safe; never accept a body on `GET` or `DELETE`.

## Status selection rules

- `200` for a read that returns a representation, and for a command that finished synchronously and has something useful to return.
- `201` only for creation, always with a `Location` header holding the canonical URI of the new resource, including its type. Prefer `Location: /api/v1/orders/9f1c...` over a templated string the client must build.
- `202` only when the server has accepted the work and deliberately did not finish it. A `202` without a status resource is a broken contract: the client has no place to look.
- `204` for a successful update or delete with no payload. A `204` must have an empty body and no `Content-Type`.
- `400` for a request the server cannot parse or bind: malformed JSON, wrong parameter type, unparseable date, missing required parameter.
- `401` needs a `WWW-Authenticate` header. `403` must not be used for anonymous callers; an anonymous caller asking for a protected resource gets `401`.
- `404` for an unknown route or resource. Do not use `404` to signal a failed `If-Match`; that is `412`.
- `405` for a known path with the wrong method; `Allow` is set automatically by Spring MVC and must not be suppressed.
- `406` when the `Accept` header matches no producible type; the body lists what the server can produce.
- `409` for a conflict with the current state of the resource: unique constraint violation, illegal state transition, or a concurrent modification detected without an ETag. Optionally include the current state so the client can reconcile.
- `412` when `If-Match` or `If-Unmodified-Since` fails. Include the current `ETag` in the response so the client can re-read and retry deliberately.
- `415` for an unsupported `Content-Type`. Do not coerce a form body into JSON.
- `422` for a syntactically valid body that a business rule or a field constraint rejects. Include a per-field `errors` array of `{field, code, message}`.
- `429` for a quota, with `Retry-After` in seconds or as an HTTP date. `Retry-After` is also correct on `503`.
- `500` for an unhandled failure. Log the cause, return a fixed body plus a `traceId`.
- `503` for a known dependency outage or shed load, with `Retry-After` when the client should back off.

Tie-breaker: ask whether the failure is about the payload or about the world. Payload semantics that the server parsed successfully go to `422`. Anything about current server state, including uniqueness and transitions, goes to `409`.

## Response header matrix

| Header | Direction | Required when | Value rule |
| --- | --- | --- | --- |
| `Location` | response | `201`, `202` | absolute or root-relative URI of the created or status resource |
| `ETag` | response | `200`/`204` on a mutable resource, `304` | strong validator, quoted, from a version column or representation hash |
| `If-Match` | request | `PUT`, `PATCH`, `DELETE` on a mutable resource | the `ETag` the client last read, or `*` for create-only-if-absent |
| `If-None-Match` | request | cacheable `GET` | send back the last `ETag`; a match yields `304` |
| `Retry-After` | response | `429`, `503` | delta-seconds or HTTP-date |
| `WWW-Authenticate` | response | `401` | the challenge matching the configured scheme |
| `Idempotency-Key` | request | retry-prone `POST` | client-generated opaque key, unique per logical operation |
| `Deprecation` | response | any deprecated endpoint or version | `@deprecated` token from RFC 9745 |
| `Sunset` | response | a dated removal | HTTP-date from RFC 8594 |
| `Link` | response | deprecation or pagination hint | `rel="deprecation"`, `rel="next"`, `rel="prev"` |
| `Cache-Control` | response | any cacheable or sensitive read | `no-store` for authenticated personal data |

`ETag` rules: quote the value; use a strong validator for `If-Match`; never reuse a weak `W/` validator for concurrency; recompute on every read; when the value is a database `version` column, wrap it as `"<version>"` and return it on every `200` and `204`. `ShallowEtagHeaderFilter` produces a body hash for whole responses; it is a caching aid, not a concurrency control, because it changes whenever the representation changes for any reason.

## Conditional request flow

```java
package com.example.orders.api;

import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;

final class ConditionalReads {

    private ConditionalReads() {
    }

    static boolean unchanged(WebRequest request, String etag) {
        return request instanceof ServletWebRequest servletRequest && servletRequest.checkNotModified(etag);
    }
}
```

Rules: `checkNotModified` returns `true` when the request already holds the validator, in which case the handler returns without writing a body so the container emits `304`; if a controller cannot use `WebRequest`, compare the `If-Match` value against the current ETag in the service and throw a precondition-failed error instead; `If-Match: *` means the resource must exist, which is the cheap create-if-absent guard for `PUT`.

## Idempotency-Key protocol

1. Client generates an opaque key per logical operation, for example a UUIDv4, and reuses it for every retry of that operation.
2. Server requires the header on charge, refund, payout, order placement, and any `POST` that sends mail, charges a card, or writes to an external system.
3. Server computes a fingerprint of the request: method, path, and a canonical hash of the body.
4. Server inserts `(key, fingerprint, status, response, created_at)` before doing the work. A duplicate insert loses the race.
5. Duplicate key with the same fingerprint: replay the stored status and body, and echo the key in the response.
6. Duplicate key with a different fingerprint: return `409` with `code=IDEMPOTENCY_KEY_REUSED`; never execute the second payload.
7. Keep the record for at least the maximum client retry window, typically 24 hours, then delete.
8. Key in flight: return `409` with `Retry-After`, or block briefly and replay. Never process concurrently.

```java
package com.example.orders.api;

import java.util.Optional;
import java.util.UUID;

record IdempotencyRecord(String key, String fingerprint, int status, String body, boolean inFlight) {

    static Optional<IdempotencyRecord> reuse(IdempotencyStore store, String key, String fingerprint) {
        return store.find(key).filter(record -> record.fingerprint().equals(fingerprint));
    }
}
```

`IdempotencyStore` is a project port; implement it with a unique index on the key so the database, not the application, enforces single execution.

## Long-running operations

- `POST` the intent, answer `202` with `Location` on the job resource.
- `GET` the job resource for progress; return `200` with `state`, `progressPercent`, and `updatedAt`.
- Terminal success: add `result` linking to the created resource and stop changing the body.
- Terminal failure: keep `state=FAILED` and a coarse `reason` code. The human-readable cause stays server-side behind the `traceId`.
- Reuse the same key semantics: a retried submit returns the same job id, never a second job.
- Bound the job: expiry timestamp, maximum attempts, and a cancel endpoint with its own state transition.

## Anti-patterns

| Anti-pattern | Why it fails | Do instead |
| --- | --- | --- |
| `200` for creation | clients cannot discover the new resource or its id | `201` plus `Location` |
| `200` with an empty body and no `Location` for a queued job | client has nothing to poll | `202` plus a job resource |
| `500` with `ex.getMessage()` | leaks SQL, class names, and vendor detail | fixed body plus `traceId` |
| `204` with a JSON body | breaks client parsers | send the body with `200` |
| Deep `PATCH` merge of a whole object | silent mass assignment and unbounded fan-out | explicit patch DTO per operation |
| `Map` request or response bodies | no schema, no validation, no generated client | typed DTO record |
| Unbounded list endpoint | memory and latency blowup | `limit` with a documented maximum |
| `page` offset exposed to clients | `OFFSET 100000` degrades and skips rows | keyset cursor |
| Catch-all `@ExceptionHandler(Exception.class)` returning `400` | hides server faults as client faults | one `500` fallback for everything else |
