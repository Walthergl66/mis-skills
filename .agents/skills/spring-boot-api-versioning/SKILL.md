---
name: spring-boot-api-versioning
description: 'Use when choosing or implementing an API versioning strategy in Spring Boot, classifying a change as additive or breaking, signaling deprecation and sunset, routing several versions at once, or planning client migration and removal. Triggers include URI path /v1, media type versioning, an Accept-Version header, WebMvcConfigurer configureApiVersioning, ApiVersionConfigurer, usePathSegment, useRequestHeader, @RequestMapping version, ApiVersionStrategy, Deprecation and Sunset headers, RFC 9745, and Link rel deprecation. Do not use for endpoint and error contract design, DTO field evolution mechanics, generated spec review, or request mapping and filter mechanics. When other skills also apply, reconcile ownership before mutation.'
license: MIT
metadata:
  author: Walthergl66
  version: '1.0.0'
---

# Spring Boot API Versioning

Version only when a published contract must break while old clients keep working. Most internal APIs never need a version, and every version is a promise to maintain two contracts.

## When to use

- Deciding whether a service needs versions at all, and which strategy to adopt.
- Implementing version routing with path segments, headers, media types, or Spring API versioning.
- Classifying a proposed change as additive or breaking.
- Adding deprecation and sunset signaling to a version or an endpoint.
- Planning client migration, the overlap window, and the removal of a retired version.

## When not to use

- Endpoint design, statuses, and the error body: use `spring-boot-rest-api`.
- DTO field evolution mechanics and over-posting control: use `spring-boot-dto`.
- Version rendering in the generated document: use `spring-boot-openapi`.
- Request mapping, filters, and interceptors: use `spring-boot-mvc`.
- Identity, scopes, and authorization: use `spring-boot-security`.

## Ownership and sibling boundaries

- Owns the strategy decision, the routing configuration, the change classification policy, the deprecation and sunset timeline, and the removal sequence.
- Yields endpoint shapes, statuses, and the problem contract to `spring-boot-rest-api`; this skill decides which version serves them, never what they are.
- Yields DTO field mechanics to `spring-boot-dto`; this skill consumes its additive versus breaking classification and decides what to do with a breaking one.
- Yields document generation to `spring-boot-openapi`; this skill requires one document per version with its own `info.version`.
- Yields filter and interceptor mechanics to `spring-boot-mvc`; this skill configures `ApiVersionConfigurer` and the version condition on mappings.
- Yields metric storage and dashboards to `spring-boot-observability`; this skill requires per-version usage as removal evidence.

## Hard rules

1. No breaking change to a published contract without a new version and a migration path.
2. Additive is the default; reach for a version only after listing the additive options and why each fails.
3. A version is a compatibility promise with an end date, never an indefinite fork.
4. Remove a version only on evidence of zero traffic for a stated window, never on a calendar reminder.
5. Deprecation is announced in the response, in the document, and in the changelog; a `@Deprecated` annotation reaches nobody.
6. Never change the meaning of an existing field, status, or error code in place.
7. The resolved version must be visible in logs, metrics, and traces from the first release that supports versions.

## Strategy decision table

| Situation | Strategy | Rationale |
| --- | --- | --- |
| Internal service, one team, consumers deploy with the provider | no versioning | additive discipline suffices; a version multiplies work |
| Public API, few consumers, uncoordinated deploys | URI path `/v1` | visible in logs, trivially routed, documented per version |
| Public API behind caches needing per-version entries | media type `application/vnd.acme.order+json;version=2` | one path, the representation is the negotiated contract |
| URL fixed by an existing consumer contract or proxy policy | header `Accept-Version` | version is request metadata |
| Long-lived enterprise integrations | header or media type | per-client negotiation suits contractual agreements |
| GraphQL or event consumers | field or schema versioning | the transport already carries the version boundary |

Rules: pick one strategy per service and never mix path and header versions for the same API; document the choice once, because mixed strategies make failures unexplainable; a path prefix is a routing concern, so `spring-boot-rest-api` writes paths assuming it exists.

## Spring implementation

```java
package com.example.orders.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ApiVersionConfigurer;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration(proxyBeanMethods = false)
class ApiVersionConfiguration implements WebMvcConfigurer {

    @Override
    public void configureApiVersioning(ApiVersionConfigurer configurer) {
        configurer.usePathSegment(1);
        configurer.setVersionRequired(true);
        configurer.addSupportedVersions("1", "2");
        configurer.detectSupportedVersions(false);
    }
}
```

`usePathSegment(1)` reads `/api/{version}/...`; index `0` is for `/{version}/...`. `useRequestHeader("Accept-Version")`, `useQueryParam("version")`, and `useMediaTypeParameter(MediaType.APPLICATION_JSON, "version")` cover the other strategies, and a path-segment resolver never returns null so other resolvers never apply. `setVersionRequired(true)` turns a missing version into a `400` with `MissingApiVersionException`; `setDefaultVersion` makes it optional and flips that flag automatically. `detectSupportedVersions(false)` plus `addSupportedVersions` moves ownership of the supported set from mappings to configuration.

Versions are declared on mappings, with a fixed version, a baseline version that also matches everything above it, and no value meaning any version at the lowest priority:

```java
@RestController
@RequestMapping("/api/{version}/orders")
class OrderController {

    @GetMapping(value = "/{id}", version = "1")
    OrderViewV1 getV1(@PathVariable UUID id) {
        return legacyQueries.find(id);
    }

    @GetMapping(value = "/{id}", version = "2+")
    OrderViewV2 getV2(@PathVariable UUID id) {
        return queries.find(id);
    }
}
```

When several methods could match, the highest version less than or equal to the request version wins; a fixed mapping above the request version blocks a baseline match and produces `NotAcceptableApiVersionException`, an unsupported version produces `InvalidApiVersionException`, and both are `400` responses whose bodies belong to `spring-boot-rest-api`. For two versions of one resource, a controller per version with a package per version is often clearer than framework negotiation, because each contract stays readable.

## Deprecation signaling

| Header | Specification | Value |
| --- | --- | --- |
| `Deprecation` | RFC 9745 | `@<unix-seconds>` for when it was deprecated, or `true` |
| `Sunset` | RFC 8594 | HTTP-date for when it stops being served |
| `Link` | RFC 9745 and RFC 8594 | `<url>; rel="deprecation"` and `<url>; rel="sunset"` |

Send them on every response from the deprecated version, errors included, and link the migration guide. With Spring API versioning enabled, install `StandardApiVersionDeprecationHandler` through `ApiVersionConfigurer.setDeprecationHandler` so `Deprecation`, `Sunset`, and `Link` come from centrally declared version metadata instead of path-matching filter code. A removed version returns `410 Gone`, or a problem body with `code=API_VERSION_REMOVED`, never a bare `404`, so a late caller learns why.

## Migration and removal

1. Measure usage per version from day one: a tag for the resolved version on the access log, a counter metric, and a trace attribute.
2. Announce the deprecation in the release that starts serving the headers, in the document, and in the changelog.
3. Publish the migration guide with real before and after payloads and a field mapping table.
4. Contact remaining consumers directly when usage is low and concentrated.
5. Hold the old version for a stated window: two or three releases or a fixed date, whichever is later.
6. Remove only when the usage metric is zero for the whole window and the last consumer has migrated.
7. Delete only the transport layer of that version; keep the shared service, DTO, and document changes that the new version still needs.
8. Keep a tombstone for a grace period, then return `404` and remove it.
9. Record the removal date, the evidence, and the guide in the changelog.

If traffic is non-zero at the removal date, extend the window and publish the new date rather than breaking consumers. Never reuse a retired version number for different content.

Load [references/strategy-and-routing.md](references/strategy-and-routing.md) for the full comparison, every routing implementation including separate controllers, and the anti-patterns, and [references/deprecation-and-migration.md](references/deprecation-and-migration.md) for the change classification table, header code, usage analysis, and the removal checklist.

## Reference routing

| Task | Load |
| --- | --- |
| Choose a strategy or implement routing with separate controllers, `ApiVersionConfigurer`, or `version` on mappings | [strategy-and-routing.md](references/strategy-and-routing.md) |
| Classify a change, emit `Deprecation` and `Sunset`, analyze usage, or execute the removal sequence | [deprecation-and-migration.md](references/deprecation-and-migration.md) |

## Expected response

- **Strategy:** the chosen approach and the consumer or infrastructure constraint that forced it, or the argument for no versioning.
- **Routing:** the exact configuration or mapping code, the version carrier, and the default and required-version behavior.
- **Classification:** the change labeled additive or breaking, judged from the client, with the additive options considered and rejected.
- **Deprecation:** headers emitted, the deprecation and sunset dates, the migration guide link, and the changelog entry.
- **Evidence:** the per-version usage metric, the observation window, and the threshold authorizing removal.
- **Removal:** the grace-period behavior after removal and what stays until the last consumer migrates.
- **Handoffs:** which sibling owns the endpoint shape, the DTO mechanics, and the document for each version.
