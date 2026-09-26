# Validation Error Contract

Load this when turning framework validation failures into a stable response body, localizing messages, or deciding what may appear in a validation error.

## Sources of violations

| Exception | Raised by | Violation source | Property path |
| --- | --- | --- | --- |
| `MethodArgumentNotValidException` | `@Valid` on a body or model attribute | `BindingResult.getFieldErrors()` and `getGlobalErrors()` | Field name, optionally indexed such as `lines[0]` |
| `HandlerMethodValidationException` | `@Validated` on a controller, parameter constraints | `getAllValidationResults()`, then `getResolvableErrors()` | Parameter name, needs `-parameters` |
| `BindValidationException` | `@Validated` on a properties record | Causes carry the field path | Property key such as `acme.mail.relay.host` |
| `ConstraintViolationException` | `@Validated` on a service method | `getConstraintViolations()` | Method parameter path such as `archive.id` |
| `ConstraintViolation` from a programmatic call | Any `Validator` invocation | Returned set, not an exception | Whatever the constraint reports |

Map all five into one shape. A client should not need to know which mechanism produced the failure.

## The contract

```json
{
  "type": "https://api.acme.example/problems/validation-failed",
  "title": "Bad Request",
  "status": 400,
  "detail": "The request payload contains 2 invalid fields",
  "instance": "/api/orders",
  "errors": [
    { "field": "customerReference", "code": "NotBlank", "message": "must not be blank" },
    { "field": "allocations[sku-1].amount", "code": "Positive", "message": "must be greater than 0" }
  ]
}
```

| Element | Guarantee | Change policy |
| --- | --- | --- |
| `type` | Stable URI identifying the failure class | Additive only |
| `title` and `status` | Fixed per class | Changing a status is a breaking change |
| `detail` | Human-readable summary, never a system message | Free text |
| `errors[].field` | Path exactly as the client sent it, indexed for containers | Additive only |
| `errors[].code` | Machine-readable, derived from the constraint, not the message | Additive only |
| `errors[].message` | Localized text, may change with the locale | No contract |
| `instance` | Request path | No contract |

What must never appear: the rejected value, the entity class name, the constraint class, a stack trace, a SQL fragment, or the raw exception message of an unexpected failure.

## Normalizer

```java
package com.acme.billing.web.error;

import java.util.Comparator;
import java.util.List;
import org.springframework.validation.FieldError;

public record ApiError(String field, String code, String message) {

    private static final Comparator<ApiError> ORDER = Comparator.comparing(ApiError::field).thenComparing(ApiError::code);

    public static List<ApiError> fromFieldErrors(List<FieldError> fieldErrors) {
        return fieldErrors.stream()
                .map(error -> new ApiError(error.getField(), codeOf(error), error.getDefaultMessage()))
                .sorted(ORDER)
                .distinct()
                .toList();
    }

    private static String codeOf(FieldError error) {
        String code = error.getCode();
        return code == null ? "Invalid" : code;
    }
}
```

| Rule | Reason |
| --- | --- |
| Sort by field, then code | Two runs over the same payload must produce the same body |
| Deduplicate identical field and code pairs | A cascade can report the same rule twice |
| Keep the field path the client sent | Renaming it in the response makes the error unactionable |
| Derive the code from the constraint, never from the message | Messages are localized and rewritten |

## Advice

```java
package com.acme.billing.web.error;

import java.net.URI;
import java.util.Comparator;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.context.support.DefaultMessageSourceResolvable;
import org.springframework.context.support.MessageSourceResolvable;
import org.springframework.validation.FieldError;
import org.springframework.validation.method.annotation.ParameterValidationResult;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;

@RestControllerAdvice
class ValidationErrorHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ProblemDetail> onInvalidBody(MethodArgumentNotValidException exception) {
        List<FieldError> fieldErrors = exception.getBindingResult().getFieldErrors();
        List<ApiError> errors = ApiError.fromFieldErrors(fieldErrors);
        return response(HttpStatus.BAD_REQUEST, "validation-failed", "The request payload is invalid", errors);
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    ResponseEntity<ProblemDetail> onInvalidParameter(HandlerMethodValidationException exception) {
        List<ApiError> errors = exception.getAllValidationResults().stream()
                .flatMap(result -> result.getResolvableErrors().stream()
                        .map(error -> new ApiError(parameterName(result), codeOf(error), error.getDefaultMessage())))
                .sorted(Comparator.comparing(ApiError::field))
                .toList();
        return response(HttpStatus.BAD_REQUEST, "validation-failed", "A request parameter is invalid", errors);
    }

    private static String codeOf(MessageSourceResolvable error) {
        // The last code is the constraint name, the most specific one.
        String[] codes = error instanceof DefaultMessageSourceResolvable resolvable ? resolvable.getCodes() : null;
        return codes == null || codes.length == 0 ? "Invalid" : codes[codes.length - 1];
    }

    private static String parameterName(ParameterValidationResult result) {
        return result.getMethodParameter().getParameterName() == null
                ? "parameter"
                : result.getMethodParameter().getParameterName();
    }

    private static ResponseEntity<ProblemDetail> response(HttpStatus status, String slug, String detail, List<ApiError> errors) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setType(URI.create("https://api.acme.example/problems/" + slug));
        problem.setProperty("errors", errors);
        return ResponseEntity.status(status).body(problem);
    }
}
```

| Rule | Reason |
| --- | --- |
| Use `@RestControllerAdvice` and return `ResponseEntity<ProblemDetail>` | The body is serialized as `application/problem+json` |
| `setProperty("errors", ...)` for the extension | `ProblemDetail` extensions are the RFC 9457 mechanism for extra members |
| Handler methods for the four validation exceptions, and nothing catch-all | A catch-all hides real failures |
| Return 400 for every validation class | The status is part of the contract |
| Handle configuration and service violations as 500 or a startup failure | They are not client input errors; the instance is broken |

## Messages and localization

```properties
# src/main/resources/UserMessages.properties
acme.validation.iban=must be a valid IBAN
acme.validation.date-range=must be after the start date
acme.validation.max-age=is not a plausible date of birth
```

| Rule | Reason |
| --- | --- |
| Put custom keys in the user messages bundle, `UserMessages.properties`, or configure a bundle name | A key with no entry renders as `{acme.validation.iban}` in the response |
| Built-in constraints read from the standard bundle | Overriding a built-in key changes the default text for every occurrence |
| The message is a presentation detail, never a client contract | Clients switch on `code` |
| Set the locale per request, for example with `LocaleContextHolder` or `Accept-Language` | The resolved text must follow the caller |

## Stability rules

1. New fields may appear in `errors`; clients must ignore unknown entries.
2. A field path never changes meaning. Renaming a request field is an API change and a new error code.
3. The status for a validation class never changes.
4. The set of codes is additive. Removing a code breaks clients that branch on it.
5. The framework default rendering is not the contract. It changes between Spring versions. Pin the shape with a test and generate the body yourself.
6. The same payload validated twice must produce byte-identical bodies, ordering included.

## Verification

1. A contract test asserting the exact JSON for a body violation, a parameter violation, and a nested violation.
2. A test for a cascaded violation at depth two to prove the path.
3. A test with an unknown or missing field to prove the mapping does not throw.
4. A test with a rejected secret-like value to prove the value is not echoed.
5. A test that two runs over the same payload produce the same ordering.
6. A test that a configuration binding failure stops the context, handled at startup rather than per request.
