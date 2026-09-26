# Error Contract

Load this when designing the failure body for a Spring Boot HTTP service: the `ProblemDetail` shape, the stable machine-readable code registry, advice layering, and the disclosure limits that keep internals out of the response.

## The body

Spring Framework 6 renders unhandled MVC failures as `application/problem+json` through `ProblemDetail`. Keep that shape and add only what a client can act on.

| Member | Source | Rule |
| --- | --- | --- |
| `type` | application | stable, dereferenceable documentation URI; never `about:blank` in a published API |
| `title` | status | short, status-level, identical for every `409` |
| `status` | status | integer, matches the HTTP status exactly |
| `detail` | application | one sentence specific to this occurrence, free of internals |
| `instance` | request | the request URI that failed |
| extension members | application | only stable codes, field errors, current state, and correlation |

```json
{
  "type": "https://errors.example.com/validation-failed",
  "title": "Validation Failed",
  "status": 422,
  "detail": "3 fields were rejected.",
  "instance": "/api/v1/orders",
  "code": "VALIDATION_FAILED",
  "errors": [
    { "field": "lines[0].quantity", "code": "MIN", "message": "must be greater than 0" }
  ],
  "traceId": "0af7651916cd43dd8448eb211c80319c"
}
```

## Code registry

`code` is the contract clients branch on. It must be uppercase, underscore-separated, stable, and never reused for a different meaning. Human text goes in `title` and `detail`, which clients must never parse.

| `code` | Status | Meaning | Client action |
| --- | --- | --- | --- |
| `VALIDATION_FAILED` | `422` | payload violates field or business rules | fix the listed fields |
| `MALFORMED_REQUEST` | `400` | body or parameter cannot be parsed | fix the encoding |
| `UNSUPPORTED_MEDIA_TYPE` | `415` | `Content-Type` not supported | retry with a supported type |
| `NOT_ACCEPTABLE` | `406` | no producible representation | change `Accept` |
| `RESOURCE_NOT_FOUND` | `404` | unknown route or resource | stop retrying |
| `METHOD_NOT_ALLOWED` | `405` | wrong method on a known path | use `Allow` |
| `AUTHENTICATION_REQUIRED` | `401` | no or invalid credentials | obtain a token |
| `ACCESS_DENIED` | `403` | authenticated but not permitted | request access |
| `DUPLICATE_RESOURCE` | `409` | unique constraint already holds a row | read the existing resource |
| `ILLEGAL_STATE_TRANSITION` | `409` | current state forbids the operation | read `current` and follow the allowed transitions |
| `IDEMPOTENCY_KEY_REUSED` | `409` | same key, different payload | generate a new key |
| `PRECONDITION_FAILED` | `412` | `If-Match` validator mismatch | re-read and retry |
| `RATE_LIMITED` | `429` | quota exceeded | honour `Retry-After` |
| `DEPENDENCY_UNAVAILABLE` | `503` | known outage, retry later | back off and retry |
| `INTERNAL_ERROR` | `500` | unhandled failure | report the `traceId` |

Rules: never remove a code while any client can still receive it; retire a code by mapping it to a replacement and announcing that in `detail`; add a code only when a client is expected to branch on it, otherwise the `status` plus `type` is enough.

## Advice layering

Order matters: the most specific advice wins, so register domain advice before the framework base class and keep the base class as the single fallback.

```java
package com.example.orders.api;

import java.net.URI;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = OrderController.class)
class OrderErrorHandler {

    @ExceptionHandler(OrderNotFoundException.class)
    ProblemDetail onNotFound(OrderNotFoundException ex) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.NOT_FOUND);
        problem.setType(URI.create("https://errors.example.com/order-not-found"));
        problem.setProperty("code", "RESOURCE_NOT_FOUND");
        return problem;
    }

    @ExceptionHandler(IllegalOrderTransitionException.class)
    ProblemDetail onTransition(IllegalOrderTransitionException ex) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.CONFLICT);
        problem.setType(URI.create("https://errors.example.com/illegal-order-transition"));
        problem.setProperty("code", "ILLEGAL_STATE_TRANSITION");
        problem.setProperty("current", ex.currentState());
        problem.setProperty("allowedTransitions", List.copyOf(ex.allowedStates()));
        return problem;
    }
}
```

Layering rules:

| Layer | Owns | Placement |
| --- | --- | --- |
| Service exception | the typed failure and its data | domain and application packages, no HTTP types |
| Controller-scoped advice | mapping for one controller family | `@RestControllerAdvice(assignableTypes = ...)` |
| Global advice extending `ResponseEntityExceptionHandler` | framework failures, `4xx` body shape, `500` fallback | one bean for the service |
| Filter-level handling | failures before the dispatcher, such as body-size or TLS | `spring-boot-mvc` owns the hook |

Rules: throw typed exceptions from services and translate them in advice; never throw `ResponseStatusException` from a service; never build a `ProblemDetail` in a repository; the `500` fallback must not distinguish failure classes; do not add a second `@ExceptionHandler` for a subclass of an already handled type and expect a different result.

## Framework failure mapping

`ResponseEntityExceptionHandler` already maps the common MVC failures. Normalize them instead of writing new handlers.

| Exception | Default status | Override to | `code` |
| --- | --- | --- | --- |
| `MethodArgumentNotValidException` | `400` | `422` | `VALIDATION_FAILED` |
| `HandlerMethodValidationException` | `400` | `422` | `VALIDATION_FAILED` |
| `ConstraintViolationException` | `500` | `422` | `VALIDATION_FAILED` |
| `HttpMessageNotReadableException` | `400` | `400` | `MALFORMED_REQUEST` |
| `HttpRequestMethodNotSupportedException` | `405` | `405` | `METHOD_NOT_ALLOWED` |
| `HttpMediaTypeNotSupportedException` | `415` | `415` | `UNSUPPORTED_MEDIA_TYPE` |
| `HttpMediaTypeNotAcceptableException` | `406` | `406` | `NOT_ACCEPTABLE` |
| `NoResourceFoundException` | `404` | `404` | `RESOURCE_NOT_FOUND` |
| `MissingServletRequestParameterException` | `400` | `400` | `MALFORMED_REQUEST` |

Use `handleExceptionInternal` in the base class to stamp `type`, `instance`, and `code` on every `4xx` in one place instead of overriding a dozen handlers.

## Field errors

- Emit `{field, code, message, rejectedValue}` only when the rejected value is safe to echo; omit it for credentials, tokens, and personal data.
- Use dotted or bracketed paths that match the request body exactly, for example `lines[0].quantity`.
- Report every violation in one response; a client fixing fields one round trip at a time is a defect.
- Use the Bean Validation constraint name as `code` (`Size.min`, `NotBlank`) so the client can map to its own field metadata.
- Cap the list; if the count exceeds the cap, add `errorsTruncated: true` and a total count.

## What must never appear

| Never | Why | Instead |
| --- | --- | --- |
| Stack trace or exception class name | reveals internals and dependency versions | `traceId` |
| SQL, JPQL, or table names | reveals schema and enables blind injection probing | `traceId` |
| `ex.getMessage()` from a driver or HTTP client | contains host names, ports, tokens | a fixed sentence per `code` |
| `Caused by` chain | same as above | server log only |
| Server file paths, bean names, profiles | aids lateral attacks | nothing |
| Downstream response body or status | exposes a vendor contract and its secrets | a coarse `DEPENDENCY_UNAVAILABLE` |
| Request headers, cookies, or the raw body | credential leakage via error echo | field names only |
| Environment values or feature flags | configuration disclosure | nothing |
| Full user record or email addresses | personal data in logs and traces | opaque `traceId` |

Also: never disable `server.error.include-*` flags in a way that reintroduces these, and never let a `@ControllerAdvice` serialize an exception object directly.

## Correlation and logging

- Generate or accept one correlation id per request, place it in the MDC, echo it as `traceId`, and keep it out of the `detail` text.
- Log the exception once, at the layer that owns the classification, with the correlation id and the stable `code`.
- Keep the client-facing `code` identical to the log field so an operator can search one value.
- Rate-limit log volume for expected `4xx` classes such as `VALIDATION_FAILED`; log `5xx` always.
- Count outcomes by `code` in metrics, not by exception type, so the metric matches the published contract.

## Review checklist

- Every documented failure has exactly one `code`, one status, and one `type` URI.
- No `4xx` and no `5xx` body contains a stack trace, SQL, or a vendor message.
- The same failure produces the same shape whether it is thrown in a controller, a service, or a filter.
- Field errors use request-body paths and are returned in one response.
- `traceId` is present on every error and is searchable in the log of the failing request.
- `spring.mvc.problemdetails.enabled` is left enabled so unhandled framework failures still render as `ProblemDetail`.
- Deleted or renamed codes have a migration note in the API changelog.
