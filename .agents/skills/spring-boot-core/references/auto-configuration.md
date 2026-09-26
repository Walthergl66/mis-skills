# Auto-Configuration

Load this when deciding between a starter, a custom auto-configuration, and a hand-wired bean, or when an auto-configuration fails to contribute, backs off, or breaks an application that already declared its own bean.

## Decision table

| Signal | Starter | Auto-configuration | Hand-wired `@Bean` |
| --- | --- | --- | --- |
| Consumed by more than one application | Yes | Yes | No |
| Needs a property surface with validation | Yes | Yes | Acceptable for one app |
| Must back off when the user declares the bean | No | Yes, `@ConditionalOnMissingBean` | N/A |
| Optional dependency the application may not have | No | Yes, `@ConditionalOnClass` | Forces the dependency into the build |
| Behavior varies by servlet versus reactive stack | No | Yes, `@ConditionalOnWebApplication` | Two configurations to maintain by hand |
| Single vendor client in a single service | No | Usually not | Yes, cheapest and clearest |
| Library that must support Spring Boot 2 and 3 | No | Requires a separate module per line | Yes |

A hand-wired client is often the better answer than a custom auto-configuration:

- One application means one set of property names to support, document, and deprecate.
- There is no condition to get wrong, so the bean either exists or the context fails loudly.
- The reader can follow one wiring path from `@Configuration` to the client constructor.
- An auto-configuration in the same repository as the service is a library surface with support obligations and no current consumer.

Write an auto-configuration when at least one of these is true: the bean must disappear when an optional class is absent, the application can override the default, several applications consume the integration, or the bean must exist in only some web stacks or profiles.

## Full example

```java
package com.acme.billing.autoconfigure;

import javax.sql.DataSource;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.jdbc.JdbcTemplateAutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.JdbcTemplate;

@AutoConfiguration(after = JdbcTemplateAutoConfiguration.class)
@ConditionalOnClass(JdbcTemplate.class)
@EnableConfigurationProperties(LedgerProperties.class)
public class LedgerAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean(LedgerClient.class)
    @ConditionalOnProperty(prefix = "acme.ledger", name = "enabled", havingValue = "true", matchIfMissing = true)
    LedgerClient ledgerClient(LedgerProperties properties, DataSource dataSource) {
        return new LedgerClient(new JdbcTemplate(dataSource), properties);
    }
}
```

```text
src/main/resources/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
com.acme.billing.autoconfigure.LedgerAutoConfiguration
```

Add property metadata so the IDE and the `configprops` endpoint describe the surface:

```json
{
  "properties": [
    {
      "name": "acme.ledger.enabled",
      "type": "java.lang.Boolean",
      "description": "Whether the ledger client is created.",
      "defaultValue": true
    },
    {
      "name": "acme.ledger.url",
      "type": "java.lang.String",
      "description": "Base URL of the ledger service."
    }
  ]
}
```

## Condition catalog

| Annotation | Matches when | Typical use |
| --- | --- | --- |
| `@ConditionalOnClass` | The class is on the classpath | Optional dependency guard |
| `@ConditionalOnMissingClass` | The class is absent | Replacement of a legacy integration |
| `@ConditionalOnBean` | A bean definition of the type exists | Add behavior on top of another auto-configuration |
| `@ConditionalOnMissingBean` | No bean definition of the type or name exists | Back-off, the user override mechanism |
| `@ConditionalOnProperty` | Property value equals `havingValue` | Feature toggle and opt-in integrations |
| `@ConditionalOnSingleCandidate` | Exactly one candidate or a marked primary | Add a cross-cutting bean to one implementation |
| `@ConditionalOnResource` | Classpath resource exists | Files, templates, migrations on the classpath |
| `@ConditionalOnWebApplication` | Servlet or reactive application context | HTTP-only integrations |
| `@ConditionalOnExpression` | SpEL evaluates to true | Last resort, use only for expressions no other condition covers |
| `@ConditionalOnVirtualThreads` | Java 21 and `spring.threads.virtual.enabled=true` | Per-request executor swap |

Rules that decide whether a condition behaves:

- Put `@ConditionalOnClass` on the auto-configuration class, never on the `@Bean` method, when the bean method signature mentions the missing type. Otherwise the failure is a `ClassNotFoundException` while the method is parsed, not a clean back-off.
- `@ConditionalOnMissingBean` matches by type when `value` is given, by bean name when `name` is given, and it also fails when any bean definition of that type exists anywhere, including one you defined yourself in another module. Declare `search = SearchStrategy.CURRENT` only when you deliberately want a narrower scope.
- Use `value = { X.class }` rather than the `X` attribute so several types can be listed.
- Prefer `name` over `prefix` plus `name` with a duplicated segment; a typo such as `prefix = "acme.ledger"` and `name = "acme.ledger.enabled"` silently never matches.
- `@ConditionalOnProperty` is evaluated once at startup. A property that changes at runtime through the environment endpoint cannot add or remove a bean.

## Ordering rules

```text
user @Configuration and @Component classes   (always parsed first)
  -> auto-configurations sorted by @AutoConfigureOrder
     -> @AutoConfiguration(before = ..., after = ..., beforeName = ..., afterName = ...)
        -> conditions evaluated, bean methods registered
           -> @ConditionalOnMissingBean decides back-off
```

| Goal | Declaration |
| --- | --- |
| Override a starter default | `@AutoConfiguration(before = YourAutoConfiguration.class)` on the starter side, or `after = DataSourceAutoConfiguration.class` on yours |
| Extend another auto-configuration | `after =` the configuration whose bean you require |
| Require a bean that may be created later | `after =` its configuration, never rely on scan order |
| Contribute a bean only when one type exists | `@ConditionalOnBean(LedgerClient.class)` plus `after =` |

Failures seen in the wild:

| Symptom | Cause | Fix |
| --- | --- | --- |
| User bean and auto-configured bean both present | `@ConditionalOnMissingBean` placed on a configuration that is parsed before the user class | Move the auto-configuration behind `AutoConfiguration.imports` and add `after` |
| `NoClassDefFoundError` for an optional type | `@ConditionalOnClass` used on a `@Bean` method | Move the annotation to the configuration class and keep the parameter list clean |
| Property toggle appears to do nothing | Auto-configuration evaluated before the property source is registered | Verify the property is in a config-data file loaded before the context refresh |
| Bean exists twice after a library upgrade | Removed `@ConditionalOnMissingBean` in a new release | Restore the guard and add a context runner test for both cases |

## Test the contract

```java
package com.acme.billing.autoconfigure;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SimpleDriverDataSource;

import static org.assertj.core.api.Assertions.assertThat;

class LedgerAutoConfigurationTests {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(LedgerAutoConfiguration.class))
            .withBean(JdbcTemplate.class, () -> new JdbcTemplate(new SimpleDriverDataSource()))
            .withPropertyValues("acme.ledger.url=https://ledger.internal");

    @Test
    void backsOffWhenTheApplicationDeclaresTheClient() {
        runner.withUserConfiguration(UserClientConfiguration.class)
                .run(context -> assertThat(context).doesNotHaveBean(LedgerClient.class));
    }

    @Test
    void createsTheClientWithBoundProperties() {
        runner.run(context -> {
            assertThat(context).hasSingleBean(LedgerClient.class);
            assertThat(context.getBean(LedgerProperties.class).url()).isEqualTo("https://ledger.internal");
        });
    }

    @Test
    void staysOffWhenDisabled() {
        runner.withPropertyValues("acme.ledger.enabled=false")
                .run(context -> assertThat(context).doesNotHaveBean(LedgerClient.class));
    }
}
```

Cover three cases minimum: the happy path with properties bound, the back-off path when the application declares its own bean, and the disabled path. Add a case per optional dependency that can be absent.

## Checklist

1. Registration file is `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`, one class per line, no package-private class.
2. `@AutoConfiguration` used, never plain `@Configuration` plus a manual `@Import`, unless the class is genuinely not an auto-configuration.
3. `@ConditionalOnClass` on the class, `@ConditionalOnMissingBean` on every bean method.
4. `after` or `before` declared for every auto-configuration whose beans this one reads or overrides.
5. Properties bound through an `@EnableConfigurationProperties` record with `@Validated` constraints.
6. Metadata file for every property, including defaults and deprecations.
7. No `static` bean methods, no non-final classes, no constructor injection side effects.
8. Context runner tests for create, back-off, and disabled.
