# Async, Streaming, and Content Handling

Load this when returning `Callable`, `DeferredResult`, `SseEmitter`, or `ResponseBodyEmitter` from a controller, registering a message converter, changing how a body is negotiated, or serving static resources.

## Async return types

| Return type | Completing party | Bound while pending | Timeout source | Use for |
| --- | --- | --- | --- | --- |
| `Callable<T>` | Spring, on the async executor | One executor thread | `spring.mvc.async.request-timeout` | Short blocking work under a second or two |
| `DeferredResult<T>` | Application, from any thread | Only the container request | `spring.mvc.async.request-timeout` plus `onTimeout` | Polling, callbacks, fan-in |
| `SseEmitter` | Application, incrementally | Container connection state | Timeout passed to the constructor | Server-sent event streams |
| `ResponseBodyEmitter` | Application, raw bytes | Container connection state | Timeout passed to the constructor | File and chunk streaming |

```java
package com.acme.billing.web;

import java.util.concurrent.CompletableFuture;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.async.DeferredResult;

@RestController
class ValuationController {

    private final ValuationService valuationService;
    private final AsyncTaskExecutor executor;

    ValuationController(ValuationService valuationService, @Qualifier("applicationTaskExecutor") AsyncTaskExecutor executor) {
        this.valuationService = valuationService;
        this.executor = executor;
    }

    @GetMapping(path = "/api/valuations", produces = MediaType.APPLICATION_JSON_VALUE)
    DeferredResult<ValuationResponse> valuation(String reference) {
        DeferredResult<ValuationResponse> result = new DeferredResult<>(5_000L);
        executor.execute(() -> result.setResult(valuationService.valueOf(reference)));
        result.onTimeout(() -> result.setErrorResult(new ValuationUnavailable(reference)));
        result.onError(throwable -> result.setErrorResult(new ValuationFailed(reference)));
        return result;
    }
}
```

| Rule | Reason |
| --- | --- |
| Inject `AsyncTaskExecutor` with the `applicationTaskExecutor` qualifier | MVC async uses that bean by name; an unqualified `Executor` is not picked up. |
| Set `onTimeout` and `onError` on every `DeferredResult` | Otherwise the client holds the request until the container timeout. |
| Complete an emitter exactly once | A second `complete` throws and the client sees a broken stream. |
| Send a first event immediately | Proxies buffer until they see bytes or headers. |
| Add a heartbeat when the proxy idle timeout is under a minute | Idle streams get dropped silently by nginx and similar proxies. |
| Do not hold a database transaction across a `DeferredResult` | The connection and lock stay bound to a request that may not complete. |

```java
package com.acme.billing.web;

import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyEmitter;

@RestController
class ExportController {

    @GetMapping(path = "/api/exports/ledger.csv", produces = "text/csv")
    ResponseBodyEmitter export() {
        // A zero timeout means no container-imposed limit; the emitter is completed explicitly.
        ResponseBodyEmitter emitter = new ResponseBodyEmitter(0L);
        new Exporter().writeTo(emitter, "ledger");
        return emitter;
    }

    private static final class Exporter {

        void writeTo(ResponseBodyEmitter emitter, String report) {
            Thread.ofVirtual().name("export-" + report).start(() -> {
                try (Writer writer = new OutputStreamWriter(emitter.getOutputStream(), StandardCharsets.UTF_8)) {
                    writer.write("id,amount\n");
                    writer.flush();
                }
                catch (IOException exception) {
                    emitter.completeWithError(exception);
                    return;
                }
                emitter.complete();
            });
        }
    }
}
```

## Async executor configuration

```java
package com.acme.billing.web;

import java.util.concurrent.Executor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.web.servlet.config.annotation.AsyncSupportConfigurer;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
class AsyncSupportConfig implements WebMvcConfigurer {

    @Override
    public void configureAsyncSupport(AsyncSupportConfigurer configurer) {
        configurer.setTaskExecutor(applicationTaskExecutor());
        configurer.setDefaultTimeout(10_000L);
    }

    @Bean(name = "applicationTaskExecutor")
    Executor applicationTaskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(32);
        executor.setMaxPoolSize(128);
        executor.setQueueCapacity(512);
        executor.setThreadNamePrefix("mvc-async-");
        executor.initialize();
        return executor;
    }
}
```

| Setting | With virtual threads | Without |
| --- | --- | --- |
| `applicationTaskExecutor` | `SimpleAsyncTaskExecutor` on virtual threads | `ThreadPoolTaskExecutor`, 8 core threads by default |
| `spring.task.execution.pool.*` | Ignored | Applied |
| `spring.mvc.async.request-timeout` | Applied | Applied |
| Concurrency bound | Database pool, semaphore, queue depth | Pool size and queue capacity |

## Content negotiation

| Step | Input | Result on mismatch |
| --- | --- | --- |
| Request mapping match | Path, method, params, headers, `consumes` | 404 when no pattern matches, 405 for method, 415 for content type |
| Body conversion | `Content-Type` selects a `HttpMessageConverter` | 415 with no supported type |
| Return conversion | `Accept` plus `produces` selects a converter | 406 with no acceptable type |
| Read failure | JSON, enum, or date conversion inside the converter | 400 from `HttpMessageNotReadableException` |

| Rule | Reason |
| --- | --- |
| Keep `spring.mvc.contentnegotiation.favor-parameter=false` | `?format=` lets a client override the negotiated type and breaks caches and CSRF assumptions. |
| Declare `produces` on anything that is not JSON | Without it, a browser `Accept: text/html` can produce an unexpected representation. |
| Register extra converters with `extendMessageConverters` | Boot already configured the defaults, including Jackson. |
| Insert a converter before Jackson when it must win | Converter order is the list order in `extendMessageConverters`. |
| Return `application/problem+json` from advice | `ProblemDetail` serializes as a problem document. |
| Reject unknown fields on request bodies deliberately | Otherwise a client typo is silently ignored. |

```java
package com.acme.billing.web;

import java.util.List;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
class ConverterConfig implements WebMvcConfigurer {

    @Override
    public void extendMessageConverters(List<HttpMessageConverter<?>> converters) {
        for (HttpMessageConverter<?> converter : converters) {
            if (converter instanceof MappingJackson2HttpMessageConverter jackson) {
                // Mutate the existing converter; convert it to insert one ahead of Jackson in the list.
                jackson.setObjectMapper(jackson.getObjectMapper()
                        .copy()
                        .findAndRegisterModules()
                        .disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS));
            }
        }
    }
}
```

## Static resources

| Property | Effect | Trap |
| --- | --- | --- |
| `spring.web.resources.static-locations` | Directories scanned for resources | A wide default exposes files that were never meant to be public |
| `spring.mvc.static-path-pattern` | Ant pattern the resource handler answers | `/**` shadows controller mappings |
| `spring.web.resources.add-mappings` | Turns the resource handling off | The clean way to serve no static files at all in an API service |
| `spring.web.resources.cache.period` | Cache-Control max-age for resources | Long periods on a mutable file force a versioned path |

A controller mapping wins over a resource handler when the patterns are more specific, and a catch-all resource pattern such as `/**` will swallow paths that should return 404 as JSON. For a pure API service, set `spring.web.resources.add-mappings: false` and let the advice render 404 as a problem document.

## Verify

1. `MockMvc` for the success path, the exception path, and the async path with `asyncDispatch`.
2. A live curl for negotiation, because MockMvc does not exercise the container's async timeout.
3. A proxy in front for SSE, because buffering behavior only appears there.
4. A load test with streaming clients before promising a connection count.
