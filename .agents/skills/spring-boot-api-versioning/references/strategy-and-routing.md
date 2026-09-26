# Strategy and Routing

Load this when choosing a versioning strategy for a Spring Boot HTTP API or implementing the routing for it, including the Spring Framework API versioning support available since 6.1.

## Comparison

| Dimension | No versioning | URI path `/v1` | Media type parameter | Request header |
| --- | --- | --- | --- | --- |
| Visibility in logs | n/a | highest, visible in the path | medium, visible in `Accept` | low, easy to strip at a proxy |
| Cache behaviour | single entry | separate entries per version | separate entries if `Vary: Accept` | unsafe to cache without care |
| Proxy and CDN friendliness | best | best | requires `Vary` handling | requires configuration per hop |
| Client ergonomics | best | best | single URL, negotiated body | single URL, extra header |
| Spring Framework support | none needed | resolver plus path variable | `useMediaTypeParameter` | `useRequestHeader` |
| Version visible in the OpenAPI document | n/a | yes, as separate paths | one path, multiple media types | needs a documented header parameter |
| Failure mode when misconfigured | n/a | clear 404 | confusing content negotiation error | confusing missing-header error |
| Cost per version | one contract | controller, DTOs, document, tests | same, plus negotiation | same, plus client configuration |

Choose URI path versioning unless a cache, an intermediary, or a contractual requirement forbids it. Choose media types when the representation itself is the negotiated contract. Choose headers when the URL is fixed by an existing consumer contract.

## Implementation A: URI path prefix

The simplest and most common approach: a distinct `@RequestMapping` prefix per version. Nothing framework-specific is required.

```java
package com.example.orders.api;

import java.util.List;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/orders")
class OrderControllerV1 {

    private final OrderQueryService queries;
    private final OrderCommandService commands;

    OrderControllerV1(OrderQueryService queries, OrderCommandService commands) {
        this.queries = queries;
        this.commands = commands;
    }

    @GetMapping("/{id}")
    OrderViewV1 get(@PathVariable UUID id) {
        return OrderViewV1.from(queries.find(id));
    }

    @PostMapping
    OrderViewV1 create(@RequestBody CreateOrderRequestV1 request) {
        return OrderViewV1.from(commands.place(request));
    }
}
```

```java
package com.example.orders.api;

import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v2/orders")
class OrderControllerV2 {

    private final OrderQueryService queries;

    OrderControllerV2(OrderQueryService queries) {
        this.queries = queries;
    }

    @GetMapping("/{id}")
    OrderViewV2 get(@PathVariable UUID id) {
        return OrderViewV2.from(queries.find(id));
    }
}
```

Rules: one controller per version keeps each contract readable and lets an old version keep its own DTOs unchanged; shared logic goes into services, never into a common base controller that forces both versions into one signature; a package per version, `api.v1` and `api.v2`, makes the boundary structural.

## Implementation B: one controller, two paths

```java
package com.example.orders.api;

import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
class OrderController {

    private final OrderQueryService queries;

    OrderController(OrderQueryService queries) {
        this.queries = queries;
    }

    @GetMapping("/v1/orders/{id}")
    OrderViewV1 getV1(@PathVariable UUID id) {
        return OrderViewV1.from(queries.find(id));
    }

    @GetMapping("/v2/orders/{id}")
    OrderViewV2 getV2(@PathVariable UUID id) {
        return OrderViewV2.from(queries.find(id));
    }
}
```

Use when the versions differ in a few endpoints only and the team is small. Cost: the class grows with each version, and a reviewer must check which method serves which prefix.

## Implementation C: Spring Framework API versioning

Enabled through `WebMvcConfigurer.configureApiVersioning`, which builds an `ApiVersionStrategy` that resolves, parses, validates, and hints on versions.

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

| Call | Reads the version from | Notes |
| --- | --- | --- |
| `usePathSegment(1)` | `/api/{version}/...` | never returns null, so the index must match the real prefix; declare the segment as a URI variable in the mapping |
| `useRequestHeader("Accept-Version")` | a request header | returns null when absent, so other resolvers and the default can apply |
| `useQueryParam("version")` | a query parameter | easy to leak into logs and caches; use sparingly |
| `useMediaTypeParameter(MediaType.APPLICATION_JSON, "version")` | a parameter of `Accept` or `Content-Type` | combine with `produces` so negotiation still works |
| `useVersionResolver(...)` | a custom `ApiVersionResolver` | for tenant-specific or composite rules |

Other configuration: `setVersionParser` replaces the default `SemanticApiVersionParser`; `setVersionRequired` controls the missing-version behavior; `setDefaultVersion` assigns a version to requests without one; `setDeprecationHandler` installs response hints.

Mapping with versions:

```java
package com.example.orders.api;

import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/{version}/orders")
class VersionedOrderController {

    private final OrderQueryService queries;

    VersionedOrderController(OrderQueryService queries) {
        this.queries = queries;
    }

    @GetMapping(value = "/{id}", version = "1")
    OrderViewV1 getV1(@PathVariable UUID id) {
        return OrderViewV1.from(queries.find(id));
    }

    @GetMapping(value = "/{id}", version = "2+")
    OrderViewV2 getV2(@PathVariable UUID id) {
        return OrderViewV2.from(queries.find(id));
    }
}
```

| `version` value | Matches |
| --- | --- |
| `1` | exactly version `1` |
| `2+` | version `2` and every supported version above it |
| absent | any version, at the lowest priority, so a versioned method always supersedes it |

Selection rules: when several methods could match, the highest version that is less than or equal to the request version wins; a fixed mapping above the request version blocks a baseline match, producing `NotAcceptableApiVersionException` and a `400`; an unsupported version produces `InvalidApiVersionException` and a `400`; a missing required version produces `MissingApiVersionException` and a `400`.

Trade-offs: you get version negotiation, validation, and deprecation hints from the framework, but the path shape is dictated by the resolver index, the two versions of a resource share a controller class, and a path prefix must remain a URI variable in every mapping.

## Client-side versioning

`RestClient`, `WebClient`, and the HTTP Service client support version hints, and `MockMvc` and `WebTestClient` can send them. In tests, assert both versions resolve, and assert that an unsupported version is rejected with a `400` and a stable problem code. A version-aware client must pin its version explicitly; an unpinned client silently follows the default.

## Anti-patterns

| Anti-pattern | Consequence |
| --- | --- |
| Path prefix on some endpoints and a header on others | unexplainable 4xx behaviour, unversionable documentation |
| Version number in the package only, not in the contract | clients cannot select, so the fork is invisible |
| A version per field change | the contract becomes a maintenance trap and consumers stop reading releases |
| `?version=2` query parameter on a cacheable read | cache keys multiply and the parameter pollutes logs |
| Removing a version with no grace period | consumers fail with `404` and no explanation |
| Baseline mapping with no fixed mapping below it | new clients silently hit the legacy shape |
