---
name: spring-boot-mvc
description: 'Use when tracing a Spring MVC request from DispatcherServlet to a controller, adding a filter or HandlerInterceptor, writing a RestController, mapping exceptions with ControllerAdvice, configuring content negotiation or message converters, serving static resources, or returning Callable, DeferredResult, SseEmitter, and ResponseBodyEmitter results. Triggers include DispatcherServlet, WebMvcConfigurer, addInterceptors, extendMessageConverters, produces, consumes, HttpMessageNotReadableException, MethodArgumentNotValidException, 415 and 406, CORS preflight, WebAsyncManager, and spring.mvc.async.request-timeout. Do not use for HTTP status and error contract design or security enforcement. When other skills also apply, reconcile ownership before mutation.'
license: MIT
metadata:
  author: Walthergl66
  version: '1.0.0'
---

# Spring MVC Request Lifecycle, Filters, and Async

Place each cross-cutting concern in exactly one hook and name the hook in the code. Spring MVC offers several insertion points; picking the wrong one produces work that runs twice, skips the error path, or misses non-controller requests.

## When to use

- A `@RestController` endpoint returns the wrong status, body, or media type.
- Deciding between a `Filter`, a `HandlerInterceptor`, a `@ControllerAdvice`, and an argument resolver, or debugging a hook that does not run.
- Adding `Callable`, `DeferredResult`, `SseEmitter`, or `ResponseBodyEmitter` handling, and deciding where virtual threads help.

## When not to use

- Status codes, problem shapes, and versioning policy belong to `spring-boot-rest-api`.
- Request and response record shape belongs to `spring-boot-dto`.
- Bean Validation constraints on bodies and parameters belong to `spring-boot-validation`.
- Authentication, authorization, and CORS enforcement belong to `spring-boot-security`.
- Package placement, controller test slices, and MockMvc mechanics belong to `spring-boot-clean-architecture` and `spring-boot-integration-testing`.

## Ownership and sibling boundaries

This skill owns the dispatch pipeline and the behavior of every hook inside it.

- `spring-boot-rest-api` owns the HTTP contract and `spring-boot-dto` the record shape crossing it. Hand them status selection, error bodies, and field naming and serialization intent.
- `spring-boot-security` owns the filter chain. Hand it authentication, authorization, and CORS enforcement; a filter needing the principal goes after its chain, a correlation filter before it, and hand `spring-boot-validation` where constraint annotations go.
- `spring-boot-integration-testing` owns test mechanics. Hand it `MockMvc`, `WebTestClient`, and slice setup.

## The pipeline

```text
Tomcat / Jetty connector thread
  -> FilterChainProxy (Spring Security)
  -> ordered servlet filters: caching, request id, correlation
  -> DispatcherServlet.doDispatch
     -> HandlerMapping: RequestMappingHandlerMapping, ResourceHandlerMapping
     -> interceptors.preHandle -> HandlerAdapter -> argument resolvers
        -> @Controller method -> return value handlers, message converter write
     -> interceptors.postHandle, or afterCompletion on failure
     -> ExceptionHandlerExceptionResolver (@ControllerAdvice), then the default resolver
  -> filters unwind, response committed
```

## Where each hook belongs

| Hook | Sees | Runs for | Use for |
| --- | --- | --- | --- |
| `Filter` | Raw request and response | Every request, including static, error, and async dispatch | Correlation ids, body caching, logging, security, response wrapping |
| `OncePerRequestFilter` | Same, once per request, not on async re-dispatch | Default dispatch | Wrapping the request or response |
| `HandlerInterceptor` | `HandlerMethod`, `ModelAndView` | Requests with a mapped handler | Handler-shaped pre and post work, short-circuiting, timing |
| `@ControllerAdvice` and `HttpMessageConverter` | The exception, or the serialized form | Only inside MVC dispatch, or when a body is written or read | Mapping framework exceptions, or format translation |
| `HttpMessageConverter` | The serialized form | Only when a body is written or read | Format translation, envelope wrapping |

Filters run before the handler is known, so a decision that needs the handler, the method, or the request mapping, it belongs in an interceptor. A filter that is not a `@Component` needs a `FilterRegistrationBean` with `setOrder` or an `@Order` on the component; interceptors exist only through `WebMvcConfigurer#addInterceptors`, and only for the handler mappings you name. `preHandle` returning `false` skips the handler and `postHandle` but still runs `afterCompletion` for interceptors that already returned `true`; `postHandle` never runs when the handler throws, and a filter exception never reaches `@ControllerAdvice`.

```java
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
class RequestIdFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String requestId = request.getHeader("X-Request-Id");
        requestId = requestId == null || requestId.isBlank() ? UUID.randomUUID().toString() : requestId;
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

## Error mapping advice

| Annotation | Effect | Use for |
| --- | --- | --- |
| `@RestControllerAdvice` | `@ControllerAdvice` plus `@ResponseBody`, so return values are serialized | JSON APIs, the default choice |
| `@RestControllerAdvice` extending `ResponseEntityExceptionHandler` | Adds handling for every exception the framework maps, in one place | One consistent error body for framework exceptions |

Narrow the scope with `basePackages` or `assignableTypes`; a global advice that catches `Exception` hides real failures. Handle the specific framework exceptions you can describe, plus one fallback that returns a generic problem with no exception message, stack trace, or SQL. `ResponseEntityExceptionHandler` produces `ProblemDetail` when `spring.mvc.problemdetails.enabled=true`, and a handler-level `@ExceptionHandler` wins over advice.

## Content negotiation and converters

| Input | Behavior | Failure |
| --- | --- | --- |
| `Accept` header and `produces` | Selects the best converter for the declared types | 406, `HttpMediaTypeNotAcceptableException` |
| `Content-Type` header and `consumes` | Must match a supported converter | 415, `HttpMediaTypeNotSupportedException` |
| Body read failure | JSON or date parse error | 400, `HttpMessageNotReadableException` |

Boot registers `MappingJackson2HttpMessageConverter` by default. Add a converter with `extendMessageConverters`, placed before Jackson when it must take precedence; never call `configureMessageConverters`, which replaces the defaults. Keep `spring.mvc.contentnegotiation.favor-parameter` at `false`, because `?format=json` lets any client override the negotiated type. `ProblemDetail` bodies are `application/problem+json`, so return `ResponseEntity<ProblemDetail>`.

## Async and streaming

| Return type | Who completes it | Use for | Cost |
| --- | --- | --- | --- |
| `Callable<T>` | Spring, on the async executor | Short blocking work off the request thread | Occupies an executor thread for the duration |
| `DeferredResult<T>` | The application, later, from any thread | Long polling, callbacks, fan-out | No thread held, the container holds the request |
| `SseEmitter` and `ResponseBodyEmitter` | The application, incrementally or as raw bytes | Event streams, file and chunk streaming | One emitter per client, explicit completion required |

```java
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

1. Register the executor explicitly in `WebMvcConfigurer#configureAsyncSupport` when concurrency matters. Boot wires `applicationTaskExecutor` into MVC async, and that bean becomes a virtual-thread `SimpleAsyncTaskExecutor` when `spring.threads.virtual.enabled=true`, which removes the pool bound.
2. Always handle `onTimeout` and `onError` on an emitter, because a disconnected client otherwise leaks it. Send an initial event so proxies flush headers, and add a heartbeat when a proxy has an idle timeout.
3. `spring.mvc.async.request-timeout` applies to `Callable` and `DeferredResult`, while emitters carry their own timeout. An async dispatch re-enters the filter chain, so use `OncePerRequestFilter` or check `request.isAsyncStarted()`, and never register a custom filter with `asyncSupported` disabled.

## Virtual threads in MVC

- With `spring.threads.virtual.enabled=true`, Tomcat and Jetty execute controllers on virtual threads, so blocking JDBC or HTTP inside a controller stops being a throughput wall, and container pool sizing stops applying.
- Pinning still happens on Java 21 when a virtual thread blocks inside `synchronized`. Measure with JFR or `jcmd` before claiming a win.
- The datasource pool becomes the real concurrency bound, so size it from measured database capacity. `SseEmitter` and `DeferredResult` hold no thread while idle, so streaming clients cost connection state, not threads. Keep a platform-thread deployment documented for libraries that cache thread-locals per thread.

## Reference routing

- Trace the pipeline, register a filter or interceptor, wire advice, or debug a hook that does not run: [request-lifecycle.md](references/request-lifecycle.md)
- Implement async, SSE, streaming, content negotiation, converters, or static resource handling: [async-and-content.md](references/async-and-content.md)

## Expected response

- **Hook choice:** the exact hook for each concern, with the reason it cannot live one level out or in.
- **Ordering:** filter order, interceptor paths, and advice scope, stated explicitly.
- **Failure paths:** what happens when the handler throws, the dispatch is async, or the client disconnects.
- **Negotiation, concurrency, and verification:** accepted and produced media types, converter precedence, the 400, 406, and 415 cases, the thread the request occupies, and a `MockMvc` or live request proving the hook runs on the success, error, and async paths.
