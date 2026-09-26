# springdoc Setup

Load this when wiring springdoc-openapi into a Spring Boot 3 service, splitting documents into groups, deciding who may read the document or the UI, or generating and gating the spec in a build.

## Dependency choice

| Artifact | Use when | Exposes |
| --- | --- | --- |
| `springdoc-openapi-starter-webmvc-api` | only machines read the document | `/v3/api-docs` |
| `springdoc-openapi-starter-webmvc-ui` | humans browse the API | `/v3/api-docs` and Swagger UI |
| `springdoc-openapi-starter-webflux-api` | WebFlux, no UI | `/v3/api-docs` |
| `springdoc-openapi-maven-plugin` | build-time generation for a gate | writes `openapi.json` |

```xml
<dependency>
    <groupId>org.springdoc</groupId>
    <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
    <version>2.8.9</version>
</dependency>
```

Pin the version in the parent POM. The starter is not managed by the Spring Boot BOM, so an unpinned version silently drifts with whatever the last build resolved.

## Core properties

```yaml
springdoc:
  api-docs:
    enabled: true
    path: /v3/api-docs
    version: openapi_3_1
    resolve-schema-properties: false
  swagger-ui:
    enabled: true
    path: /swagger-ui.html
  packages-to-scan: com.example.orders.api
  paths-to-match: /api/**
  paths-to-exclude: /internal/**, /actuator/**
  produces-to-match: application/json
  show-actuator: false
  show-login-endpoint: false
  use-management-port: false
  override-with-generic-response: true
  writer-with-order-by-keys: true
```

| Property | Default | Why set it |
| --- | --- | --- |
| `springdoc.api-docs.version` | `openapi_3_1` | pins the dialect; a rename would otherwise downgrade silently |
| `springdoc.api-docs.enabled` | `true` | set `false` in production unless a spec is published from there |
| `springdoc.packages-to-scan` | all | stops internal controllers leaking into the document |
| `springdoc.paths-to-match` | all | narrows the surface to published paths |
| `springdoc.override-with-generic-response` | `true` | set `false` so per-operation `@ApiResponse` entries survive a generic advice response |
| `springdoc.writer-with-order-by-keys` | `false` | stable key order keeps the document diff readable |
| `springdoc.use-management-port` | `false` | serving the document from the management port keeps it off the public listener |

## Groups

Split by audience so a consumer never sees paths it must not call.

```yaml
springdoc:
  group-configs:
    - group: public
      display-name: Public API
      paths-to-match: /api/v1/**
    - group: internal
      display-name: Internal API
      paths-to-match: /internal/**
      packages-to-scan: com.example.orders.internal
```

```java
package com.example.orders.docs;

import org.springdoc.core.models.GroupedOpenApi;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class ApiGroups {

    @Bean
    GroupedOpenApi partnerApi() {
        return GroupedOpenApi.builder()
                .group("partner")
                .pathsToMatch("/api/v1/partners/**")
                .build();
    }
}
```

Documents are served at `/v3/api-docs/{group}`. Declare groups either as properties or as `GroupedOpenApi` beans, never both for the same group name. The default document at `/v3/api-docs` still exists unless `springdoc.enable-default-api-docs=false`; a default document that contains everything defeats the split.

## Programmatic customisation

| Bean | Applies to | Use for |
| --- | --- | --- |
| `OpenAPI` | every group | `info`, `servers`, global `components`, tags |
| `OpenApiCustomizer` | the default document only | one-off tweaks to a single document |
| `GlobalOpenApiCustomizer` | default document and all groups | headers or schemas that must exist everywhere |
| `OperationCustomizer` | matching operations in the default document | add a header parameter or a shared response |
| `PropertyCustomizer` | schemas of every document | replace repeated literals with a property reference |

```java
package com.example.orders.docs;

import io.swagger.v3.oas.models.parameters.HeaderParameter;
import org.springdoc.core.customizers.GlobalOpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class GlobalHeaderCustomizer {

    @Bean
    GlobalOpenApiCustomizer traceHeader() {
        return openApi -> openApi.getPaths().values().stream()
                .flatMap(pathItem -> pathItem.readOperations().stream())
                .forEach(operation -> operation.addParametersItem(new HeaderParameter()
                        .name("X-Request-Id")
                        .description("Client correlation id, echoed in the error traceId member")
                        .required(false)));
    }
}
```

Rules: keep customisation code free of business rules; if a change applies to one operation, annotate that operation instead of writing a customizer that filters by path string.

## Access control

The document is an attack surface: it enumerates paths, parameters, security schemes, and often example values. Treat it as an internal endpoint.

| Environment | `/v3/api-docs` | Swagger UI | Mechanism |
| --- | --- | --- | --- |
| local | enabled | enabled | default |
| CI | enabled during the integration-test phase | disabled | `springdoc.swagger-ui.enabled=false` |
| test | enabled | disabled | property in `application-test.yaml` |
| staging | enabled, authenticated | authenticated | `SecurityFilterChain` rule requiring an internal role |
| production | disabled, or authenticated on the management port | disabled | `springdoc.api-docs.enabled=false` plus `use-management-port` |

```java
package com.example.orders.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

@Configuration(proxyBeanMethods = false)
class DocsSecurityConfiguration {

    @Bean
    SecurityFilterChain docsFilterChain(HttpSecurity http) throws Exception {
        http.securityMatcher("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html")
                .authorizeHttpRequests(requests -> requests
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").hasRole("PLATFORM_READER"))
                .csrf(csrf -> csrf.disable())
                .httpBasic(basic -> {});
        return http.build();
    }
}
```

`csrf.disable()` is acceptable only because this chain has no session and no state-changing endpoint. If a session cookie reaches this chain, CSRF must stay enabled.

## Build-time generation

The Maven plugin starts the application during the integration-test phase, downloads the document, and writes it to disk.

```bash
mvn -q verify
```

```xml
<configuration>
    <apiDocsUrl>http://localhost:8080/v3/api-docs</apiDocsUrl>
    <outputDir>${project.build.directory}</outputDir>
    <outputFileName>openapi.json</outputFileName>
    <failOnError>true</failOnError>
    <attachArtifact>true</attachArtifact>
</configuration>
```

| Option | Default | Use |
| --- | --- | --- |
| `apiDocsUrl` | `http://localhost:8080/v3/api-docs` | point at a group URL such as `/v3/api-docs/public` |
| `outputFileName` | `openapi.json` | one file per group when generating several |
| `failOnError` | `false` | set `true` so a broken document fails the build |
| `attachArtifact` | `false` | set `true` to publish the document from the repository |
| `headers` | empty | supply the auth header when the document is protected |
| `skip` | `false` | never set to `true` in a release profile |

The application must start cleanly for the plugin to fetch the document. A build that depends on a live database, a real identity provider, or an unreachable broker will fail the gate for the wrong reason; give the generation profile a hermetic profile and stubs.

## Drift gate

1. Generate the document on the pull request: `mvn -q verify` then read `target/openapi.json`.
2. Generate the document on the base branch with the same JDK, the same dependency versions, and the same profile.
3. Normalise both: sort `paths`, `components.schemas`, and the `tags` array; drop `info.version`, `servers`, and any environment-dependent value.
4. Diff the normalised documents and classify each change as additive, breaking, or noise.
5. Fail the build on a breaking change that the pull request description does not declare. Accept additive changes with a review note.

```bash
npx --yes @redocly/cli@latest diff \
  target/openapi-base.json target/openapi-head.json \
  --fail-on diff
```

Rules: run the gate on the merge target, not on the last commit; never auto-format the document into the repository as the source of truth, keep the reviewed artifact as build output; record the classified diff in the pull request so a reviewer sees the contract change and not only the code change; a deliberate breaking change is a version decision owned by `spring-boot-api-versioning`, not a rebase.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `/v3/api-docs` returns `404` | `api-docs.enabled=false`, or the path is filtered | check the property and the security chain |
| A controller is missing | not in `packages-to-scan`, or the handler has no mapping springdoc can see | add the package or remove `@Hidden` |
| Schema is `type: object` with no properties | `Map`, `Object`, or a raw type in the signature | introduce a typed record |
| `@ApiResponse` entries disappeared | `override-with-generic-response=true` with a generic advice response | set the property to `false` |
| Only the default document exists | group properties are malformed, or `GroupedOpenApi` beans are not scanned | validate the YAML list shape and the bean package |
