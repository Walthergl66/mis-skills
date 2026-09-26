---
name: spring-boot-validation
description: 'Use when applying Jakarta Bean Validation in a Spring Boot service, designing constraint groups for create and update flows, writing ConstraintValidator implementations, validating cross-field rules, nested objects, collections, and map keys, validating @ConfigurationProperties at startup, or normalizing violations into one stable API error contract. Triggers include @Valid, @Validated, ValidationGroups, @GroupSequence, ConstraintValidator, jakarta.validation.constraints, MethodArgumentNotValidException, HandlerMethodValidationException, BindValidationException, and messages.properties. Do not use for DTO field design or persistence constraint enforcement. When other skills also apply, reconcile ownership before mutation.'
license: MIT
metadata:
  author: Walthergl66
  version: '1.0.0'
---

# Jakarta Bean Validation in Spring Boot

Validation is one mechanism with four entry points, and the failure mode of picking the wrong one is silence: a constraint that is never evaluated, or one evaluated with the wrong group, produces an unguarded write. State the entry point for every constraint, then normalize every violation into one error contract.

## When to use

- A request body, form, or query parameter is untrusted, or create and update flows need different rules for the same type.
- A built-in constraint cannot express the rule: a format, a range policy, a cross-field invariant, or a nested, collection, or map element.
- Configuration must fail fast when a value is missing or out of range, and violations must reach the client as a stable, machine-readable error body.

## When not to use

- The error body shape, status policy, and RFC 9457 contract belong to `spring-boot-rest-api`, and field naming and record shape to `spring-boot-dto`.
- Property binding and precedence belong to `spring-boot-core`, entity mapping and database constraints to `spring-boot-data-jpa`.
- Trust decisions belong to `spring-boot-security`.

## Ownership and sibling boundaries

This skill owns constraint declarations, group design, custom validators, and the normalization of violations.

- `spring-boot-rest-api` owns the final error contract. Hand it the normalized violations, not the framework exception.
- `spring-boot-dto` owns the record. Hand it the fields and their optionality; attach constraints to the fields it defines.
- `spring-boot-core` owns binding and profiles. Hand it the properties record; keep its constraints here.
- `spring-boot-data-jpa` owns persistence-level constraints, and `spring-boot-security` owns trust. Hand them column and foreign-key rules, and identity claims; a constraint never replaces an authorization rule.

## Where validation runs

| Entry point | Applies to | Trigger | Failure exception |
| --- | --- | --- | --- |
| `@Valid` on a method parameter | `@RequestBody`, `@ModelAttribute`, and constructor binding of those arguments | During argument resolution, before the method body | `MethodArgumentNotValidException` |
| `@Validated` on a controller class | Constraints on `@RequestParam`, `@PathVariable`, `@RequestHeader` | MVC method validation, before the method body | `HandlerMethodValidationException` |
| `@Validated` on a service class | Method parameter and return constraints on proxied beans | AOP proxy | `ConstraintViolationException` |
| `@Validated` on a properties record | The bound configuration object | Context refresh | `BindValidationException` |

| Hard rule | Reason |
| --- | --- |
| Add `spring-boot-starter-validation` explicitly | The web starter does not include it since Boot 2.3, so constraints compile away to nothing |
| One style per parameter | A parameter must not carry `@Valid` and its own constraint annotations at the same time |
| Validate at the edge, then trust the value internally; never trust a constraint on an entity to protect an API | A validated type is not revalidated when it crosses into a service, and an entity is loaded, not created |
| A custom validator returns `true` for `null` | Presence is the job of `@NotNull` |

## Constraint groups

```java
public record UpdateOrderRequest(
        @NotBlank(groups = OnCreate.class) @Size(max = 64) String reference,
        @NotNull(groups = { OnCreate.class, OnUpdate.class }) OrderStatus status,
        @Email String contactEmail) {

    public interface OnCreate {}

    public interface OnUpdate {}
}
```

```java
@RestController
@RequestMapping("/api/orders")
class OrderController {

    @PutMapping("/{id}")
    @Validated(OnUpdate.class)
    void update(@PathVariable UUID id, @Valid @RequestBody UpdateOrderRequest request) {
        service.update(id, request);
    }
}
```

| Rule | Reason |
| --- | --- |
| A constraint with no `groups` belongs to `Default` and never runs for a named group | `groups = OnCreate.class` on a field silently disappears from the update flow |
| Order-dependent groups need `@GroupSequence`, and group interfaces stay inside the type they annotate | Without a sequence the provider validates groups in an unspecified order, and hidden coupling turns group sprawl into a modelling failure |

## Custom constraints

```java
@Documented
@Constraint(validatedBy = IbanValidator.class)
@Target({ ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT, ElementType.TYPE_USE })
@Retention(RetentionPolicy.RUNTIME)
public @interface Iban {

    String message() default "{acme.validation.iban}";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}

public class IbanValidator implements ConstraintValidator<Iban, String> {

    private static final Pattern FORMAT = Pattern.compile("[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}");

    // Presence belongs to @NotNull and @NotBlank; this validator owns format only.
    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        return value == null || value.isBlank()
                || FORMAT.matcher(value.replace(" ", "").toUpperCase(Locale.ROOT)).matches();
    }
}
```

| Rule | Reason |
| --- | --- |
| `message` defaults to a bundle key, and `isValid` must be side-effect free and cheap | A hardcoded string cannot be localized, and the validator runs on every pass |
| Add `groups` and `payload`, and target `RECORD_COMPONENT` and `TYPE_USE` | Otherwise it cannot join a group or annotate a record component |

## Cross-field, nested, and container rules

| Rule | Mechanism | Cost |
| --- | --- | --- |
| Two fields must agree | A class-level constraint whose validator reads the object and adds a `PropertyNode` | One extra type, full control of the path |
| One boolean derived from other fields | `@AssertTrue` on an accessor | Cheap, but the synthetic property name leaks into the error contract |
| Nested object | `@Valid` on the property | Cascades, so bound the depth |
| Collection element | `List<@NotNull @Valid OrderLine> lines` | Per-element paths such as `lines[0].sku` |
| Map key | `Map<@NotBlank String, @Valid Allocation> allocations` | Key constraints work because they are container element constraints |
| Legacy `Map<String, Object>` payload, or a database uniqueness rule | Nothing built in | Validate values with a programmatic `Validator`, enforce uniqueness in the schema and translate the violation |

## Programmatic validation and configuration

Inject the application `Validator` and call `validate(target, group)`, because validating without a group checks `Default` only, and building a factory per call is slow and bypasses configuration. A programmatic call is invisible to the MVC error contract: you own the mapping from the violation set to the response, and you must not read `getInvalidValue()` into a response, because it leaks the rejected payload. A `@Validated` record fails at context refresh with `BindValidationException`, so a missing or out-of-range property stops the application instead of failing at first use.

## The validation error contract

1. One shape for every failure: a `ProblemDetail` with an `errors` extension returned as `application/problem+json` with 400.
2. Each entry carries a field path, a message, and a stable code. Never a stack trace, never the entity class, never the rejected value.
3. Sort deterministically, for example by field path, and deduplicate identical field and code pairs produced by a cascade.
4. Map the framework exception types to that one shape: `MethodArgumentNotValidException` for bodies, `HandlerMethodValidationException` for parameters, `BindValidationException` for configuration, `ConstraintViolationException` for service-level.
5. Resolve messages from `messages.properties` under the bean-validation bundle, and pin the rendered body with a contract test, because the default rendering is a framework detail that changes between versions.

## Reference routing

- Choose a built-in constraint, design groups, write a custom validator, or validate a container: [constraint-design.md](references/constraint-design.md)
- Normalize violations into a stable problem body, localize messages, or define the stability rules: [error-contract.md](references/error-contract.md)

## Expected response

- **Entry point:** which mechanism validates each input, in which order, and which exception it raises.
- **Constraint set and cascade:** the built-in constraints, the group assignment, the custom validators, and which nested, collection, and map elements are validated.
- **Error contract and configuration:** the exact body, its stability guarantees, what is deliberately excluded, and the properties constraints with the startup failure they produce.
- **Verification:** positive and negative tests per group, a cascade test, and a contract test on the error body.
