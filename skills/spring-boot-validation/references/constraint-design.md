# Constraint Design

Load this when choosing a built-in constraint, designing validation groups, writing a custom `ConstraintValidator`, expressing a cross-field rule, or validating nested objects, collections, and map entries.

## Built-in constraints

| Constraint | Validates | Use for | Trap |
| --- | --- | --- | --- |
| `@NotNull` | Not null | Mandatory references | Says nothing about emptiness |
| `@NotEmpty` | Not null and size greater than zero | Strings, collections, maps, arrays | Accepts `" "`, so use `@NotBlank` for user text |
| `@NotBlank` | Not null and at least one non-whitespace character | Text input | The default choice for user-entered text |
| `@Size(min, max)` | Length or size | Bounded strings, collections, maps | Combine with `@NotNull` or `@NotEmpty` for presence |
| `@Min`, `@Max`, `@Positive`, `@PositiveOrZero`, `@Negative` | Numeric bounds | Quantities, amounts, offsets | Bounds on the wrong type silently do nothing |
| `@DecimalMin`, `@DecimalMax` | Numeric bounds for `BigDecimal` and `Double` | Money and rates | Use for money; do not store money in `double` |
| `@Pattern` | Regular expression | Formats with a simple shape | Catastrophic backtracking on a crafted input; anchor it |
| `@Email` | Loosely shaped address | Contact fields | Not a deliverability check |
| `@Past`, `@Future` | Relative to the clock | Birth dates, future effective dates | The clock is not injectable unless you configure a provider |
| `@PastOrPresent`, `@FutureOrPresent` | Relative to the clock | Business dates that may be today | Same as above |
| `@Digits(integer, fraction)` | Numeric precision | Amounts and rates | The right constraint for money with a scale |
| `@Valid` | Cascade into another type | Nested objects, elements, map values | Cascades forever unless depth is bounded |
| `@AssertTrue` | A boolean property or method | Derived consistency | The property path leaks into the error contract |
| `@AssertFalse` | A boolean property or method | Derived consistency | Same as above |
| `@URL` | URL shape | Callback endpoints | Not a reachability check |
| `@UUID` | RFC 4122 identifier | Identifiers | Not a check that the row exists |

Rules that apply to all of them:

1. A constraint without `groups` belongs to `Default` and never runs when a named group is validated.
2. Constraints are annotations, not behavior. They do nothing until a validator runs them.
3. `@NotNull` plus `@Size` is `@NotEmpty`; writing both is noise.
4. Prefer a type-level constraint such as `@Digits` over a `@Pattern` for numerics.
5. Never use `@ScriptAssert`: it requires a script engine, and the JDK no longer ships one.
6. Custom constraints need `message`, `groups`, and `payload` attributes, even when unused.

## Groups

| Design | Rules | Verdict |
| --- | --- | --- |
| One type, one flow, no groups | All constraints in `Default` | Best case |
| One type, two flows, a few differences | `OnCreate` and `OnUpdate`, class-level `@Validated` on the handler methods | Acceptable |
| One type, many flows, many differences | A dozen groups | Split the type; the differences are a modelling signal |
| Ordered validation, for example default checks then a re-check after normalization | `@GroupSequence` | Use only when a later group depends on an earlier one |
| Per-field groups scattered across the type | `groups` on individual fields | Hard to read; prefer whole-type groups |

```java
package com.acme.billing.customer;

import jakarta.validation.GroupSequence;
import jakarta.validation.groups.Default;

// StrongPassword and AddressComplete are group interfaces nested in the validated type.
@GroupSequence({ Default.class, StrongPassword.class, AddressComplete.class })
public interface CustomerValidation {
}
```

| Trap | Symptom | Fix |
| --- | --- | --- |
| `groups = OnCreate.class` on a field, and the update handler validates `OnUpdate` | The field is never checked on update | List every group that must run, or restructure |
| Class-level `@Validated(OnUpdate.class)` with method-level `@Validated(OnCreate.class)` | Easy to misread which method uses which group | Keep the class annotation as the default and the method annotation as the exception |
| Group interfaces in a shared constants class | No visible link to the type they belong to | Nest them inside the annotated type |
| Group sequence that does not include `Default` | The basic constraints are skipped | Always start a sequence with `Default` |

## Custom constraint checklist

1. Annotation with `@Retention(RUNTIME)`, `@Documented`, and a `@Target` that includes `FIELD`, `PARAMETER`, `RECORD_COMPONENT`, and `TYPE_USE`.
2. `message` defaulting to a message-bundle key, `groups`, and `payload` attributes.
3. Validator implementing `ConstraintValidator<Annotation, T>`, public, with a public no-argument constructor.
4. `isValid` returning `true` for `null` and for empty input, so presence stays with `@NotNull` and `@NotBlank`.
5. Regex compiled once in a static field, and written without nested quantifiers.
6. A unit test with a valid value, an invalid value, `null`, and `""`.
7. An entry in `messages.properties` for the key, or a documented decision to accept the default text.

```java
package com.acme.billing.shared;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

public class MaxAgeValidator implements ConstraintValidator<MaxAge, Instant> {

    private static final long DEFAULT_YEARS = 120;

    @Override
    public boolean isValid(Instant value, ConstraintValidatorContext context) {
        if (value == null) {
            return true;
        }
        long years = ChronoUnit.YEARS.between(value, Instant.now(Clock.systemUTC()));
        if (years > DEFAULT_YEARS) {
            context.disableDefaultConstraintViolation();
            context.buildConstraintViolationWithTemplate("{acme.validation.max-age}")
                    .addConstraintViolation();
            return false;
        }
        return true;
    }
}
```

## Cross-field rules

| Approach | Mechanism | Property path in the error | Verdict |
| --- | --- | --- | --- |
| Class-level constraint | `@Target(TYPE)` plus a validator over the whole object | Whatever `addPropertyNode` names, or empty for the object | Preferred for anything the client sees |
| `@AssertTrue` on a derived accessor | Boolean method or property | The synthetic property name | Cheap, but the name is published |
| Two independent `@NotNull` fields plus a service check | None | None | A client sees no rule at all |
| Custom type with a validating constructor | Bean Validation on the type | Depends on the field it is assigned to | Good when the value object is the rule |

Rule: a cross-field invariant that a client can violate must be reported as a field error, not as a 500 from the service.

## Containers and nested types

```java
package com.acme.billing.order.web;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Positive;

public record SubmitOrderRequest(
        @NotBlank String customerReference,
        @NotEmpty List<@Positive Integer> quantities,
        @Valid @NotEmpty Map<@NotBlank String, @Valid Allocation> allocations) {

    public record Allocation(@NotBlank String sku, @Positive BigDecimal amount) {}
}
```

| Rule | Reason |
| --- | --- |
| Container element constraints need `TYPE_USE` on the constraint | Without it the annotation cannot sit inside the type argument |
| `@Valid` on a `List<X>` validates the elements, not the list | Presence still needs `@NotEmpty` |
| `Map<@NotBlank String, X>` validates keys | This is the supported way to reject blank keys |
| `Map<String, Object>` receives no element validation | Free-form maps need a programmatic pass or a typed wrapper |
| Bounded nesting | Every level is a cascade; deep graphs multiply error payloads |
| Unwrap types such as `Optional` are not cascaded | Validate the contained value, not the wrapper |

## Configuration properties

```java
package com.acme.billing.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.hibernate.validator.constraints.time.DurationMin;

@Validated
@ConfigurationProperties(prefix = "acme.mail")
public record MailProperties(
        @NotBlank String fromAddress,
        @NotNull @DurationMin(millis = 100) Duration connectTimeout,
        @Valid @NotNull Relay relay) {

    public record Relay(@Min(1) @Max(5) int maxAttempts, @NotBlank String host) {}
}
```

| Rule | Reason |
| --- | --- |
| `@Validated` on the properties type | Without it, the constraints are inert |
| `@Valid` on every nested properties record | A nested record has its own rules |
| Failure aborts the refresh with `BindValidationException` | Intended: a misconfigured instance must not serve traffic |
| The message names the property path | `acme.mail.relay.maxAttempts` is the key operators need |

## Test strategy

1. One test per constraint for the invalid value, using the smallest possible fixture.
2. One test per group proving the constraint runs in that group and not in the others.
3. One cascade test with a nested violation at depth two, asserting the path.
4. One properties test asserting the context fails to start on a bad value.
5. One contract test on the error body, because the message text is not the contract, the field and code are.
