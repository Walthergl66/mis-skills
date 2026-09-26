---
name: spring-boot-mvc
description: 'Use when tracing a Spring MVC request from DispatcherServlet to a controller, adding a filter or HandlerInterceptor, writing a RestController, mapping exceptions with ControllerAdvice, configuring content negotiation or message converters, serving static resources, or returning Callable, DeferredResult, SseEmitter, and ResponseBodyEmitter results. Triggers include DispatcherServlet, WebMvcConfigurer, addInterceptors, extendMessageConverters, produces, consumes, HttpMessageNotReadableException, MethodArgumentNotValidException, 415 and 406, CORS preflight, WebAsyncManager, and spring.mvc.async.request-timeout. Do not use for HTTP status and error contract design or security enforcement. When other skills also apply, reconcile ownership before mutation.'
license: MIT
metadata:
  author: Walthergl66
  version: '1.0.0'
---

# Spring MVC Request Lifecycle, Filters, and Async

Place each cross-cutting concern in exactly one hook and name the hook in the code. Spring MVC gives six insertion points; picking the wrong one produces work that runs twice, skips the error path, or misses non-controller requests.

## When to use

- A `@RestController` endpoint returns the wrong status, body, or media type.
- Deciding between a servlet `Filter`, a `HandlerInterceptor`, a `@ControllerAdvice`, and an argument resolver.
- A filter, an interceptor, or an exception handler does not run on some requests.
- CORS preflight fails, or a 404 is produced for a static asset.
- Adding `Callable`, `DeferredResult`, `SseEmitter`, or `ResponseBodyEmitter` handling.
- Registering a custom `HttpMessageConverter` or changing Jackson behavior.
- Deciding where virtual threads help and where `DispatcherServlet` still blocks.

## When not to use

- Status codes, problem shapes, and versioning policy belong to `spring-boot-rest-api`.
- Request and response record shape belongs to `spring-boot-dto`.
- Bean Validation constraints on bodies and parameters belong to `spring-boot-validation`.
- Authentication, authorization, and CORS enforcement belong to `spring-boot-security`.
- Controller test slices and MockMvc mechanics belong to `spring-boot-integration-testing`.
- Package and module placement of controllers belongs to `spring-boot-clean-architecture`.

## Ownership and sibling boundaries

This skill owns the dispatch pipeline and the behavior of every hook inside it.

- `spring-boot-rest-api` owns the HTTP contract. Hand it status selection, error bodies, and version negotiation.
- `spring-boot-dto` owns the record shape crossing the boundary. Hand it field naming and serialization intent.
- `spring-boot-validation` owns constraint declarations. Hand it where the annotations go and the violation contract.
- `spring-boot-security` owns the filter chain. Hand it authentication, authorization, and CORS enforcement; place your filter after its chain.
- `spring-boot-integration-testing` owns test mechanics. Hand it `MockMvc`, `WebTestClient`, and slice setup.
- `spring-boot-clean-architecture` owns layering. Hand it the question of where the controller and its DTOs live.

## The pipeline

```text
Tomcat / Jetty connector thread
  -> FilterChainProxy (Spring Security, order 100 by default)
  -> ordered servlet filters: caching, request id, correlation, OncePerRequestFilter
  -> DispatcherServlet.service -> FrameworkServlet.processRequest
     -> doDispatch
        -> getHandler: HandlerMapping (RequestMappingHandlerMapping, ResourceHandlerMapping, ...)
        -> HandlerExecutionChain.applyPreHandle        interceptors.preHandle
        -> HandlerAdapter.handle
           -> argument resolvers                      @PathVariable @RequestParam @RequestBody @Valid @ModelAttribute
           -> @Controller method
           -> return value handlers                   message converter write
        -> interceptors.postHandle
     -> processDispatchResult
        -> ExceptionHandlerExceptionResolver         @ControllerAdvice
        -> DefaultHandlerExceptionResolver            built-in status mapping
  -> filters unwind, response committed
```

## Where each hook belongs

| Hook | Sees | Runs for | Use for | Do not use for |
| --- | --- | --- | --- | --- |
| `Filter` | Raw `HttpServletRequest`, raw response | Every request, including static, error dispatch, async dispatch | Correlation ids, body caching, request logging, security, response wrapping | Anything needing the handler or an argument |
| `OncePerRequestFilter` | Same, once per request, not on async re-dispatch | Default dispatch | Wrapping the request or response | Work that must run on every dispatch including `ASYNC` |
| `HandlerInterceptor` | `HandlerMethod`, `ModelAndView` | Requests with a mapped handler | Handler-shaped pre and post work, short-circuiting, timing a handler | Wrapping the servlet request, work on static resources |
| `HandlerMethodArgumentResolver` | Target parameter and its annotations | Arguments of mapped handlers | Custom argument types, tenant and locale context | Global cross-cutting work, body validation |
| `@Valid` on a parameter | The bound object | Body or model attributes | Constraint checking before the method runs | Business rules, authorization |
| `@ControllerAdvice` | The `Exception` | Only inside MVC dispatch, after the handler failed | Mapping framework exceptions to the error contract | Anything that must run for non-handler requests |
| `HttpMessageConverter` | The serialized form | Only when a body is written or read | Format translation, envelope wrapping | Business behavior, status selection |

Filter or interceptor:

1. Filters run before the handler is known. Interceptors do not. If the decision needs the handler, the method, or the request mapping, it belongs in an interceptor.
2. Filters must be registered explicitly when they are not annotated components: `FilterRegistrationBean` with `setOrder`, or `@Order` on a `@Component` filter.
3. Interceptors are registered only through `WebMvcConfigurer#addInterceptors`, and only for handler mappings you name.
4. `preHandle` returning `false` skips the handler and `postHandle`; `afterCompletion` still runs for interceptors whose `preHandle` already returned `true`.
5. `postHandle` never runs when the handler throws. Put post-handler cleanup in `afterCompletion`.
6. An exception thrown inside a filter never reaches `@ControllerAdvice`. Handle it in the filter or wrap the chain and rethrow.

```java
package com.acme.billing.web;

import java.io.IOException;
import java.util.UUID;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
class RequestIdFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String requestId = request.getHeader("X-Request-Id");
        if (requestId == null || requestId.isBlank()) {
            requestId = UUID.randomUUID().toString();
        }
        MDC.put("requestId", requestId);
        response.setHeader("X-Request-Id", requestId);
        try {
            chain.doFilter(request, response);
        }
        finally {
            MDC.remove("requestId");
        }
    }
}
```

```java
package com.acme.billing.web;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
class WebConfig implements WebMvcConfigurer {

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new HandlerTimingInterceptor()).addPathPatterns("/api/**");
    }
}
```

## Error mapping advice

| Annotation | Effect | Use for |
| --- | --- | --- |
| `@ControllerAdvice` | Applies to every controller, MVC and view | Handlers that return view names |
| `@RestControllerAdvice` | `@ControllerAdvice` plus `@ResponseBody`, so return values are serialized | JSON APIs |
| `@RestControllerAdvice` extending `ResponseEntityExceptionHandler` | Adds handling for every exception the framework maps, in one place | One consistent error body for framework exceptions |

- `@RestControllerAdvice` is the right default for a JSON API. Use `@ControllerAdvice` only for view rendering.
- Narrow the scope with `basePackages` or `assignableTypes`; a global advice that catches `Exception` hides real failures.
- Handle the specific framework exceptions you can describe, plus one final fallback that returns a generic problem with no internal detail. The fallback must not expose exception messages, stack traces, or SQL.
- `ResponseEntityExceptionHandler` requires `spring.mvc.problemdetails.enabled=true` to produce `ProblemDetail` for the exceptions it maps. Validation violations that Spring itself normalizes belong to `spring-boot-validation`.
- Handler-level `@ExceptionHandler` wins over advice. Do not mix the two for the same exception type.

## Content negotiation and converters

| Input | Behavior | Failure |
| --- | --- | --- |
| `Accept` header | Selects the best converter for the declared `produces` types | `HttpMediaTypeNotAcceptableException`, rendered as 406 |
| `produces` on the mapping | Narrows what the handler may return | 406 when the client asks for something else |
| `Content-Type` header and `consumes` | Must match a supported converter | `HttpMediaTypeNotSupportedException`, rendered as 415 |
| Body read failure | JSON or date parse error | `HttpMessageNotReadableException`, rendered as 400 |
| `Accept: application/*+json` | Matches the Jackson converter | Works without a mapping change |

- Boot registers `MappingJackson2HttpMessageConverter` by default. Add a converter with `extendMessageConverters` and place it before the Jackson converter if it must take precedence; never call `configureMessageConverters` to replace the defaults.
- Keep `spring.mvc.contentnegotiation.favor-parameter` at its default of `false`. Allowing `?format=json` lets any client override the negotiated type and defeats caching and CSRF assumptions.
- `ProblemDetail` bodies are `application/problem+json`. Return `ResponseEntity<ProblemDetail>` and the converter does the rest.

## Async and streaming

| Return type | Who completes it | Use for | Cost |
| --- | --- | --- | --- |
| `Callable<T>` | Spring, on the async executor | Short blocking work off the request thread | Occupies a task executor thread for the duration |
| `DeferredResult<T>` | The application, later, from any thread | Long polling, callbacks, fan-out | No thread held, but the container holds the request |
| `SseEmitter` | The application, incrementally | Server-sent event streams | One emitter per client, explicit completion required |
| `ResponseBodyEmitter` | The application, raw bytes | File and chunk streaming | Same lifecycle rules as `SseEmitter` |

```java
package com.acme.billing.web;

import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
class LedgerStreamController {

    private final AtomicLong sequence = new AtomicLong();

    @GetMapping(path = "/api/ledger/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    SseEmitter stream() {
        SseEmitter emitter = new SseEmitter(0L);
        emitter.onTimeout(() -> emitter.complete());
        emitter.onError(throwable -> emitter.complete());
        emitter.onCompletion(() -> sequence.set(0L));
        emitter.send(SseEmitter.event().name("ready").data(Map.of("sequence", sequence.incrementAndGet())));
        return emitter;
    }
}
```

Async hard rules:

1. Register the executor explicitly in `WebMvcConfigurer#configureAsyncSupport` when concurrency matters. Boot wires `applicationTaskExecutor` into MVC async, and that bean becomes a virtual-thread `SimpleAsyncTaskExecutor` when `spring.threads.virtual.enabled=true`, which removes the pool bound.
2. Always handle `onTimeout` and `onError` on an emitter. Without them a disconnected client leaks the emitter and the container thread.
3. Send an initial comment or event immediately so proxies flush headers, and add a heartbeat when proxies have an idle timeout.
4. `spring.mvc.async.request-timeout` applies to `Callable` and `DeferredResult`. Emitters carry their own timeout value.
5. An async dispatch re-enters the filter chain. Use `OncePerRequestFilter`, or check `request.isAsyncStarted()` before running work that must not repeat.
6. Servlet async support must be enabled for the request; the Spring Security filter chain is async-capable by default, and a custom filter registered with `asyncSupported` disabled breaks streaming and `Callable`.

## Virtual threads in MVC

- With `spring.threads.virtual.enabled=true`, Tomcat and Jetty execute controllers on virtual threads, so blocking JDBC or HTTP inside a controller stops being a throughput wall. Pool sizing properties for the container stop applying.
- Pinning still happens on Java 21 when a virtual thread blocks inside a `synchronized` block. Measure with JFR or `jcmd` before claiming a win.
- The datasource pool becomes the real concurrency bound. Size it from measured database capacity, not from request count.
- `SseEmitter` and `DeferredResult` do not hold a thread while idle, so streaming clients cost connection state, not threads.
- Keep a platform-thread deployment documented. Libraries that cache thread-locals per thread, or drivers that synchronize internally, behave differently under carriers.

## Reference routing

| Task | Load |
| --- | --- |
| Trace the pipeline, register a filter or interceptor, wire advice, or debug a hook that does not run | [request-lifecycle.md](references/request-lifecycle.md) |
| Implement async, SSE, streaming, content negotiation, converters, or static resource handling | [async-and-content.md](references/async-and-content.md) |

## Expected response

- **Hook choice:** the exact hook for each concern, with the reason it cannot live one level out or in.
- **Ordering:** filter order, interceptor paths, and advice scope, stated explicitly.
- **Failure paths:** what happens when the handler throws, the dispatch is async, or the client disconnects.
- **Negotiation:** accepted and produced media types, converter precedence, and the resulting 400, 406, and 415 cases.
- **Concurrency:** thread or executor the request occupies, plus the bound that applies after virtual threads are enabled.
- **Verification:** a `MockMvc` or live request that proves the hook runs on the success, error, and async paths.
