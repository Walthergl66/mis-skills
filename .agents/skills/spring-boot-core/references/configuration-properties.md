# Configuration Properties

Load this when binding configuration into typed objects, validating configuration at startup, resolving a property to the wrong value, or designing a property surface for an application or a library.

## Binding rules

| Rule | Behavior | Consequence |
| --- | --- | --- |
| Records use constructor binding | All components are bound in the declaration order through one constructor | No component may be initialized inline, or it hides a missing property |
| `@DefaultValue` supplies a fallback | Works for scalars, enums, and comma-separated collections | A missing optional key no longer needs null handling |
| `Duration` and `DataSize` bind from strings | `2s`, `500ms`, `10MB`, `1GiB` | Never model a duration as a `long` |
| Enums bind case-insensitively on the name | `ACCEPTED` also binds from `accepted` | Renaming an enum constant is a breaking configuration change |
| Nested objects bind by nesting the prefix | `acme.ledger.pool.size` maps to the `Pool` component | A nested record is a separate object, not a flattened list |
| Collections need a definite strategy | Index, or comma-separated value for simple types | A `List<Map<String, String>>` is ambiguous and must use indexed keys |
| Maps bind by bracket or dotted key | `acme.ledger.headers[trace]=on` | Use indexed `List<Map<...>>` for ordered key-value data |
| Unknown keys are ignored by default | `ignoreUnknownFields` defaults to `true` | Set it to `false` for application properties that must not silently drift |
| `Duration` without a unit fails | `read-timeout=3` cannot be bound | Always write the unit in every file |

## A complete properties record

```java
package com.acme.billing.config;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;

@Validated
@ConfigurationProperties(prefix = "acme.ledger", ignoreUnknownFields = false)
public record LedgerProperties(
        @NotBlank String url,
        @NotNull @Positive Duration connectTimeout,
        @NotNull @Positive Duration readTimeout,
        @DefaultValue("16") @Min(1) @Max(64) int poolSize,
        @NotEmpty @Pattern(regexp = "[A-Z]{3}") List<String> allowedCurrencies,
        @Valid @NotNull Retry retry,
        @DefaultValue Map<String, String> headers) {

    public record Retry(
            @Min(0) @Max(5) int maxAttempts,
            @NotNull @Positive Duration backoff) {}
}
```

```yaml
acme:
  ledger:
    url: ${LEDGER_URL}
    connect-timeout: 2s
    read-timeout: 5s
    pool-size: 16
    allowed-currencies: [EUR, USD]
    retry:
      max-attempts: 3
      backoff: 250ms
    headers:
      trace: "on"
```

Enable it explicitly when it is not reached by a starter:

```java
@ApplicationBootConfiguration
@EnableConfigurationProperties(LedgerProperties.class)
public class BillingApplication {

    public static void main(String[] args) {
        SpringApplication.run(BillingApplication.class, args);
    }
}
```

## Validation rules

1. `@Validated` on the type is what activates validation for a properties bean. Without it the constraints are metadata and nothing is checked.
2. Constraints on record components apply to the field, the accessor, and the constructor parameter, so binding-time validation reports the offending property path.
3. `@Valid` on a nested record is required. `@NotNull` alone proves presence, not the nested rules.
4. Cross-field rules need a class-level constraint on the properties record, because there is no single field to hang them on.
5. Validation failure aborts startup with `ConfigurationPropertiesBindException` caused by `BindValidationException`. That is the intended behavior, not a bug to work around.
6. `ignoreUnknownFields = false` turns a typo into a startup failure. Use it for your own application, and leave it on for libraries that must survive unrelated keys.

| Trap | Symptom | Fix |
| --- | --- | --- |
| `@Value` for a grouped key set | No validation, no metadata, `NullPointerException` at first use | One properties record |
| Field defaults on a record component | A missing property silently keeps the initial value and the default is invisible | `@DefaultValue` only |
| `@Value("${ledger.url}")` with no default | `IllegalArgumentException` at context start with an unhelpful message | Required property plus a documented key |
| Missing unit on a duration | `BindException: Failed to bind properties` | Always include the unit |
| Profile file not activated | Value from the base file is used and nothing is logged | Print active profiles at startup and assert them in a test |
| Property in `application.yaml` with a profile document header | The whole file is skipped for other profiles | Use `spring.config.activate.on-profile` per document |

## Where a property value comes from

| Layer | Precedence | Notes |
| --- | --- | --- |
| `SpringApplication.setDefaultProperties` | Lowest | Test and library defaults |
| `@PropertySource` | 2 | Resolved at refresh, too late for `spring.main.*` and logging |
| Packaged `application.yaml` | 3 | Compiled into the jar |
| Packaged `application-{profile}.yaml` | 4 | Beats the packaged base file |
| External `config/application.yaml`, `./application.yaml` | 5 | Working-directory and `/config` search locations |
| External `application-{profile}.yaml` | 6 | Highest config-data source |
| `random.*` | 7 | `RandomValuePropertySource`, for secrets and ids |
| Environment variables | 8 | `ACME_LEDGER_URL` binds to `acme.ledger.url` |
| System properties | 9 | `-Dacme.ledger.url=` |
| JNDI and servlet init parameters | 10 | Traditional application servers |
| `SPRING_APPLICATION_JSON` | 11 | JSON document, a `null` does not override a lower source |
| Command line arguments | 12 | `--acme.ledger.url=` wins over every file |
| Test properties and `@DynamicPropertySource` | 13 | Test scope only |

Within a single location, `.properties` beats `.yaml`. With several active profiles, last-wins. With `spring.config.location`, separate files with `,` are processed in order, while `;` groups locations at the same level so profile files in the same group override each other.

## Configuration trees

```yaml
spring:
  config:
    import: "optional:file:./config/ledger/*/,optional:file:./secrets.yaml"
```

- Imported documents are inserted directly below the importing document, so imported values win.
- A missing import location throws `ConfigDataLocationNotFoundException` unless prefixed with `optional:`.
- Wildcards work only for external directories, must contain exactly one `*`, and end with `/` for a directory or a file name for a file.
- A file is imported once even when several documents import it. Use `;` groups when several files must override each other inside the same profile.

## Environment variable names

| Written in YAML | Environment variable |
| --- | --- |
| `acme.ledger.url` | `ACME_LEDGER_URL` |
| `acme.ledger.pool-size` | `ACME_LEDGER_POOLSIZE` |
| `spring.datasource.hikari.maximum-pool-size` | `SPRING_DATASOURCE_HIKARI_MAXIMUMPOOLSIZE` |

Relaxed binding removes separators, so a dashed key loses its dash in the variable name. Choose dashed keys and document the resulting variable name; operators will guess the dashed form and fail.

## Diagnose a property

1. Print the resolved value: read it from the properties bean in a log line or a startup probe, never from `@Value` scattered across classes.
2. Enable the actuator endpoints `env` and `configprops` and read the origin chain. `configprops` shows the bound object, the bound value, and the source.
3. List the active profiles at startup; a profile-scoped file that never activates is indistinguishable from a typo.
4. Reproduce with `ApplicationContextRunner` and `withPropertyValues`, or with `@SpringBootTest(properties = ...)` when the failure needs the full context.
5. Fix the source, not the reader. One reader per property surface, one source of truth per key.
