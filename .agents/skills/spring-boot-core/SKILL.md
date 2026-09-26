---
name: spring-boot-core
description: 'Use when picking Spring Boot starters, writing or repairing auto-configuration, binding and validating ConfigurationProperties records, activating profiles, diagnosing why a property is not applied, or choosing between a starter, an auto-configuration, and hand-wired beans. Triggers include @SpringBootApplication, @AutoConfiguration, @ConditionalOnClass, @ConditionalOnMissingBean, @EnableConfigurationProperties, spring.config.import, application-prod.yaml, property precedence, actuator env and configprops, DevTools, and virtual threads. Do not use for request handling, persistence wiring, or security wiring. When other skills also apply, reconcile ownership before mutation.'
license: MIT
metadata:
  author: Walthergl66
  version: '1.0.0'
---

# Spring Boot Core, Auto-Configuration, and Configuration

Own the composition root: which starter enters the build, which auto-configuration produces a bean, and which value the `Environment` finally returns. Get those three wrong and every downstream symptom looks like a framework bug.

## When to use

- Choosing between adding a starter, writing an `@AutoConfiguration`, and declaring a bean by hand.
- A bean is missing at startup, or an auto-configuration backs off unexpectedly.
- Binding `@ConfigurationProperties` with a record, nested records, collections, maps, or `Duration`, or a property that resolves to the wrong value.
- Profile activation, profile-specific files, `spring.config.import`, and SDK, pool, or `spring.threads.virtual.enabled` wiring.

## When not to use

- Request handling, filters, interceptors, and async responses belong to `spring-boot-mvc`.
- Repository, entity mapping, and transaction wiring belong to `spring-boot-data-jpa`.
- Filter chains, authentication, and authorization belong to `spring-boot-security`.
- Build pipelines, image layers, and secret injection belong to `spring-boot-ci-cd`.
- Test layer selection and slice mechanics belong to `spring-boot-integration-testing`, and the mechanics inside a test class to `spring-boot-junit`.

## Ownership and sibling boundaries

This skill owns the composition root, starter selection, auto-configuration, and property resolution.

- `spring-boot-mvc` owns everything after `DispatcherServlet` takes the request. Hand it controller mapping and converters.
- `spring-boot-data-jpa` owns repository and transaction beans. Hand it entity, query, and fetch-plan questions.
- `spring-boot-security` owns `SecurityFilterChain` beans; `spring-boot-ci-cd` owns build and deploy. Hand them filter ordering, packaging, secret injection, and environment wiring.
- `spring-boot-integration-testing` owns test layer selection and context configuration; `spring-boot-junit` owns the mechanics inside a test class. Hand them slice annotations, test properties, and JUnit usage.

## Hard rules

1. **A starter is a dependency decision, an auto-configuration is a bean decision, a `@Bean` is a wiring decision.** Pick the narrowest one that solves the requirement.
2. **Never `@ComponentScan` a third-party package.** Use its starter, or import its auto-configuration.
3. **Every auto-configuration registers in the `AutoConfiguration.imports` file and every bean method is guarded:** `@ConditionalOnClass` on the class, `@ConditionalOnMissingBean` on the bean. `spring.factories` no longer registers auto-configuration in Boot 3.
4. **User configuration is parsed before auto-configuration**, so `@ConditionalOnMissingBean` sees your beans. Declare `after` for every auto-configuration whose beans you want to override, and `before` for the ones you build on.
5. **Bind with a record, validate with `@Validated`, fail at startup.** Never use `@Value` for a grouped property set, and never put a secret in `application.yaml`.

## Starter, auto-configuration, or hand-wired bean

| Situation | Choice | Why |
| --- | --- | --- |
| Library on a public repo, reused by many services | Starter plus auto-configuration | Consumers get a property surface and opt-out conditions for free |
| One application, one integration | `@Bean` in your own `@Configuration` | Zero metadata to maintain, no condition guessing, easiest to debug |
| Optional integration toggled by a property | Auto-configuration with `@ConditionalOnProperty` | Back-off and documentation belong next to the client code |
| Replacing a default bean of a starter | `@ConditionalOnMissingBean` auto-configuration | Back-off is the supported override mechanism |
| Feature needs the web stack | `@ConditionalOnWebApplication(type = SERVLET)` | Prevents the client from starting in a non-web context |

## The auto-configuration contract

```java
@AutoConfiguration(after = JdbcTemplateAutoConfiguration.class)
@ConditionalOnClass(JdbcTemplate.class)
@EnableConfigurationProperties(LedgerProperties.class)
public class LedgerAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean(LedgerClient.class)
    LedgerClient ledgerClient(LedgerProperties properties, DataSource dataSource) {
        return new LedgerClient(new JdbcTemplate(dataSource), properties);
    }
}
```

`META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` holds one fully qualified class name per line, here `com.acme.billing.autoconfigure.LedgerAutoConfiguration`.

## Configuration properties that fail fast

```java
@Validated
@ConfigurationProperties("acme.ledger")
public record LedgerProperties(
        @NotBlank String url,
        @NotNull @DurationMin(millis = 100) Duration connectTimeout,
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
```

## Property precedence, lowest to highest

| Rank | Source | Notes |
| --- | --- | --- |
| 1 | `SpringApplication.setDefaultProperties` | Lowest; then `@PropertySource` |
| 2 | Packaged and external `application.yaml`, then the profile files | External beats packaged, and a profile file beats its non-profile twin |
| 5 | `random.*`, then OS environment variables | `LEDGER_URL` maps to `ledger.url` |
| 7 | System properties | `-Dledger.url=` |
| 7 | JNDI, `ServletContext` and `ServletConfig` init parameters, then `SPRING_APPLICATION_JSON` | Servlet deployments; JSON nulls do not override |
| 8 | Command line arguments | `--acme.ledger.url=` wins over every file |
| 9 | Test properties, `@DynamicPropertySource`, `@TestPropertySource` | Test scope only |

In one directory `.properties` beats `.yaml`, and profiles are last-wins across several active profiles. `spring.config.name`, `spring.config.location`, and `spring.config.additional-location` are read before config data loads, so they must come from the environment or the command line. Bean conditions are evaluated in this order: component scan and `@Import` register user configuration, then `@AutoConfigureOrder`, `@AutoConfigureAfter`, and `@AutoConfigureBefore` sort auto-configurations, then bean definitions register, then post-processors run.

## Profiles and configuration trees

| Need | Mechanism | Trap |
| --- | --- | --- |
| Different values per environment | `application-{profile}.yaml` activated by `spring.profiles.active` | A profile file present but not activated is silently ignored |
| External override | `spring.config.import: optional:file:./secrets.yaml` | Imported values beat the importing file, and a missing file needs `optional:` |
| Include a whole directory | `spring.config.import: "optional:file:./config/*/"` | Wildcards work only for external directories, one `*` at the end |

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
| Tomcat and Jetty run requests on virtual threads | `server.tomcat.threads.*` no longer bounds concurrency |
| `applicationTaskExecutor` and `applicationTaskScheduler` become `SimpleAsyncTaskExecutor` and `SimpleAsyncTaskScheduler` on virtual threads | `spring.task.execution.pool.*` has no effect, and scheduler threads are daemons, hence `keep-alive` |
| Blocking inside `synchronized` pins the carrier thread on Java 21, and memory per request still exists | Avoid long blocking there, detect it with JFR or `jcmd`, and bound work with the datasource pool, semaphores, and queue limits |

Enable virtual threads on an explicit request, verify throughput and tail latency with a load test, and keep a platform-thread fallback note in the runbook.

## Reference routing

- Choose between starter, auto-configuration, and hand-wired bean, or write a full auto-configuration: [auto-configuration.md](references/auto-configuration.md)
- Bind properties with records, nest groups, validate, resolve precedence, or activate profiles: [configuration-properties.md](references/configuration-properties.md)

## Expected response

- **Composition choice:** starter, auto-configuration, or hand-wired bean, with the condition that decides it.
- **Conditions and order:** which `@ConditionalOn*` guards apply and the `after` and `before` relations required.
- **Property surface and precedence:** the record, required versus defaulted keys, the fail-fast rules, and which source wins for a contested property.
- **Verification:** a context runner test that proves the bean exists, the property binds, and startup fails fast on a bad value.
