---
name: spring-boot-core
description: 'Use when picking Spring Boot starters, writing or repairing auto-configuration, binding and validating ConfigurationProperties records, activating profiles, diagnosing why a property is not applied, or choosing between a starter, an auto-configuration, and hand-wired beans. Triggers include @SpringBootApplication, @AutoConfiguration, @ConditionalOnClass, @ConditionalOnMissingBean, @EnableConfigurationProperties, spring.config.import, application-prod.yaml, property precedence, actuator env and configprops, DevTools, and virtual threads. Do not use for request handling, persistence wiring, or security wiring. When other skills also apply, reconcile ownership before mutation.'
license: MIT
metadata:
  author: Walthergl66
  version: '1.0.0'
---

# Spring Boot Core, Auto-Configuration, and Configuration

Own the composition root: which starter enters the build, which auto-configuration produces a bean, and which property value the `Environment` finally returns. Get these three wrong and every downstream symptom looks like a bug in the framework, so decide them explicitly instead of by trial and error.

## When to use

- Choosing between adding a starter, writing an `@AutoConfiguration`, and declaring a bean by hand.
- A bean is missing at startup, or an auto-configuration backs off unexpectedly.
- Binding `@ConfigurationProperties` with a record, nested records, collections, maps, or `Duration`.
- A property resolves to the wrong value and the override order is unclear.
- Profile activation, profile-specific files, or `spring.config.import` behavior.
- Wiring third-party SDK clients, connection pools, or feature flags at startup.
- Deciding whether to enable `spring.threads.virtual.enabled`.

## When not to use

- Request handling, filters, interceptors, and async responses belong to `spring-boot-mvc`.
- Repository, entity mapping, and transaction wiring belong to `spring-boot-data-jpa`.
- Filter chains, authentication, and authorization belong to `spring-boot-security`.
- Constraint annotations on request and configuration payloads belong to `spring-boot-validation`.
- Build pipelines, image layers, and secret injection belong to `spring-boot-ci-cd`.
- Slice test mechanics and test context configuration belong to `spring-boot-junit`.

## Ownership and sibling boundaries

This skill owns the composition root, starter selection, auto-configuration, and property resolution.

- `spring-boot-mvc` owns everything after `DispatcherServlet` takes the request. Hand it controller mapping, converters, and async.
- `spring-boot-data-jpa` owns repository and transaction beans. Hand it entity, query, and fetch-plan questions.
- `spring-boot-security` owns `SecurityFilterChain` beans. Hand it filter ordering and authorization rules.
- `spring-boot-validation` owns constraint semantics on bound properties. Hand it group design and error shape.
- `spring-boot-ci-cd` owns build and deploy pipelines. Hand it packaging, secret injection, and environment wiring.
- `spring-boot-junit` owns test slices and context configuration. Hand it slice annotations and test properties.

## Hard rules

1. **A starter is a dependency decision, an auto-configuration is a bean decision, a `@Bean` is a wiring decision.** Pick the narrowest one that solves the requirement.
2. **Never `@ComponentScan` a third-party package.** Use its starter, or import its auto-configuration.
3. **Every auto-configuration registers in `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`.** `spring.factories` no longer registers auto-configuration in Boot 3.
4. **Every bean method is guarded.** `@ConditionalOnClass` on the class, `@ConditionalOnMissingBean` on the bean.
5. **User configuration is parsed before auto-configuration**, so `@ConditionalOnMissingBean` sees your beans. A bean defined inside another auto-configuration that is ordered later will not be seen.
6. **Bind with a record, validate with `@Validated`, fail at startup.** A silently missing property is an outage in one environment and a mystery in another.
7. **Never use `@Value` for a grouped property set.** Use `@ConfigurationProperties`; `@Value` cannot validate and cannot nest.
8. **Never put a secret in `application.yaml`.** Bind an environment variable or secret reference.

## Starter, auto-configuration, or hand-wired bean

| Situation | Choice | Why |
| --- | --- | --- |
| Library published on a public repo, reused by many services | Starter plus auto-configuration | Consumers get a property surface and opt-out conditions for free |
| One application, one integration | `@Bean` in your own `@Configuration` | Zero metadata to maintain, no condition guessing, easiest to debug |
| Vendor SDK with a single client object | Hand-wired `@Bean` | Auto-configuration earns its cost only when there is real conditional variation |
| Optional integration toggled by a property | Auto-configuration with `@ConditionalOnProperty` | Back-off and documentation belong next to the code that owns the client |
| Replacing a default bean of a starter | `@ConditionalOnMissingBean` auto-configuration | Back-off is the supported override mechanism |
| Feature needs the web stack | `@ConditionalOnWebApplication(type = SERVLET)` | Prevents the client from starting in a non-web context |

## The auto-configuration contract

```java
package com.acme.billing.autoconfigure;

import javax.sql.DataSource;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.JdbcTemplateAutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.JdbcTemplate;

@AutoConfiguration(after = JdbcTemplateAutoConfiguration.class)
@ConditionalOnClass(JdbcTemplate.class)
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@EnableConfigurationProperties(LedgerProperties.class)
public class LedgerAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean(LedgerClient.class)
    LedgerClient ledgerClient(LedgerProperties properties, DataSource dataSource) {
        return new LedgerClient(new JdbcTemplate(dataSource), properties);
    }
}
```

```text
META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
com.acme.billing.autoconfigure.LedgerAutoConfiguration
```

## Configuration properties that fail fast

```java
package com.acme.billing.config;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

@Validated
@ConfigurationProperties("acme.ledger")
public record LedgerProperties(
        @NotBlank String url,
        @NotNull @Positive Duration connectTimeout,
        @DefaultValue("3s") Duration readTimeout,
        @NotNull Pool pool,
        @DefaultValue("EUR,USD") List<String> allowedCurrencies) {

    public record Pool(@Min(1) @Max(64) int size, Duration idleTimeout) {}
}
```

```yaml
acme:
  ledger:
    url: ${LEDGER_URL}
    connect-timeout: 2s
    pool:
      size: 16
    allowed-currencies: [EUR, USD, CHF]
```

## Property precedence, lowest to highest

| Rank | Source | Notes |
| --- | --- | --- |
| 1 | Default properties from `SpringApplication.setDefaultProperties` | Lowest |
| 2 | `@PropertySource` on configuration classes | Added at refresh, too late for `spring.main.*` and logging |
| 3 | Packaged `application.yaml` | Inside the jar |
| 4 | Packaged `application-{profile}.yaml` | Profile files beat their non-profile twin |
| 5 | External `config/application.yaml` and `./application.yaml` | Outside the jar |
| 6 | External `application-{profile}.yaml` | Highest config-data source |
| 7 | `random.*` | `RandomValuePropertySource` |
| 8 | OS environment variables | `LEDGER_URL` maps to `ledger.url` |
| 9 | System properties | `-Dledger.url=` |
| 10 | JNDI, `ServletContext` and `ServletConfig` init parameters | Servlet deployments |
| 11 | `SPRING_APPLICATION_JSON` | JSON document, nulls do not override |
| 12 | Command line arguments | `--acme.ledger.url=` wins over every file |
| 13 | Test properties, `@DynamicPropertySource`, `@TestPropertySource` | Test scope only |

In one directory `.properties` beats `.yaml`. Profiles are last-wins across several active profiles. `spring.config.name`, `spring.config.location`, and `spring.config.additional-location` are read before config data loads, so they must come from the environment or the command line.

## Bean condition evaluation order

```text
SpringApplication.run
  -> component scan and @Import register user @Configuration classes
  -> ConfigurationClassParser evaluates @Conditional in registration order
  -> bean definitions of surviving classes are registered (user beans first)
  -> @AutoConfigureOrder, @AutoConfigureAfter, @AutoConfigureBefore sort auto-configurations
  -> @Bean methods execute; @ConditionalOnMissingBean sees definitions registered so far
  -> post-processors run: @ConfigurationProperties binding, auto-proxy, @Validated
```

`@ConditionalOnMissingBean` is only as reliable as the ordering around it. Declare `after` for every auto-configuration whose beans you may want to override, and `before` for the ones you build on.

## Profiles and configuration trees

| Need | Mechanism | Trap |
| --- | --- | --- |
| Different values per environment | `application-{profile}.yaml` activated by `spring.profiles.active` | A profile file present but not activated is silently ignored |
| Multi-document file with profiles | `spring.config.activate.on-profile` in a YAML document | `on-profile` is document-level, not key-level |
| External override | `spring.config.import: optional:file:./secrets.yaml` | Imported values beat the importing file; missing files need `optional:` |
| Include a whole directory | `spring.config.import: "optional:file:./config/*/"` | Wildcards work only for external directories, one `*` at the end |
| Feature toggle | `app.features.new-checkout=false` read from a properties record | Do not scatter `@Value` reads across the code base |

## Virtual threads

```yaml
spring:
  threads:
    virtual:
      enabled: true
  main:
    keep-alive: true
```

| Effect | Consequence |
| --- | --- |
| Tomcat and Jetty run requests on virtual threads | `server.tomcat.threads.*` pool sizing no longer bounds concurrency |
| `applicationTaskExecutor` becomes a virtual-thread `SimpleAsyncTaskExecutor` | `spring.task.execution.pool.*` has no effect |
| `applicationTaskScheduler` becomes a virtual-thread `SimpleAsyncTaskScheduler` | Scheduler threads are daemons, hence `spring.main.keep-alive=true` |
| Blocking inside `synchronized` pins the carrier thread on Java 21 | Avoid long blocking in synchronized blocks, detect with JFR or `jcmd` |
| Memory per concurrent request still exists | Bound work with the datasource pool, semaphores, and queue limits |

Enable virtual threads on an explicit request, verify throughput and tail latency with a load test, and keep a platform-thread fallback note in the runbook.

## Reference routing

| Task | Load |
| --- | --- |
| Choose between starter, auto-configuration, and hand-wired bean, or write a full auto-configuration | [auto-configuration.md](references/auto-configuration.md) |
| Bind properties with records, nest groups, validate, resolve precedence, or activate profiles | [configuration-properties.md](references/configuration-properties.md) |

## Expected response

- **Composition choice:** starter, auto-configuration, or hand-wired bean, with the condition that decides it.
- **Conditions and order:** which `@ConditionalOn*` guards apply and the `after` and `before` relations required.
- **Property surface:** the properties record, required versus defaulted keys, and the fail-fast validation rules.
- **Precedence reasoning:** which source wins for a contested property and why.
- **Startup impact:** what changes on the context, what backs off, and what the operator must set per environment.
- **Verification:** a context runner test or startup check that proves the bean exists, the property binds, and the app fails fast on a bad value.
