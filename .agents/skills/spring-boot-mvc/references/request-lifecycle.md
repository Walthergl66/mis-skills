# Request Lifecycle and Hooks

Load this when tracing where a request is handled, choosing between the servlet filter chain, the interceptor chain, and exception advice, or debugging a hook that does not run for some requests.

## Dispatch steps

| Step | Component | What happens | Failure that surfaces |
| --- | --- | --- | --- |
| 1 | Connector | Request accepted, TLS terminated, thread or virtual thread assigned | Connection reset, 503 |
| 2 | `FilterChainProxy` | Spring Security chains, then the other filters in order | 401, 403, filter-level errors |
| 3 | `DispatcherServlet.service` | Servlet entry, `DispatcherServlet.properties` applied | 404 when no mapping exists |
| 4 | `FrameworkServlet.processRequest` | Binds a context, applies locale and theme resolvers | `LocaleContextHolder` failures |
| 5 | `getHandler` | `HandlerMapping` returns a `HandlerExecutionChain` | `NoHandlerFoundException` to 404 |
| 6 | `applyPreHandle` | Interceptors in declared order | Short-circuit, or `afterCompletion` for the earlier ones |
| 7 | `ha.handle` | Argument resolution and validation, then the method | 400 for resolution and validation failures |
| 8 | Return value handling | Converter writes the body | 406 when nothing can write |
| 9 | `applyPostHandle` | Interceptors in reverse order | Never runs when the handler threw |
| 10 | `processDispatchResult` | `ExceptionHandlerExceptionResolver`, then `DefaultHandlerExceptionResolver`, then the error dispatch | 4xx and 5xx bodies |
| 11 | Filter unwind | Response committed, MDC cleared, buffers flushed | Truncated responses |

## Filter registration

```java
package com.acme.billing.web;

import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
class FilterConfig {

    @Bean
    FilterRegistrationBean<CachingFilter> cachingFilter() {
        FilterRegistrationBean<CachingFilter> registration = new FilterRegistrationBean<>(new CachingFilter());
        registration.setOrder(30);
        registration.addUrlPatterns("/api/*");
        return registration;
    }
}
```

| Concern | Decision |
| --- | --- |
| Annotated `@Component` filter | Add `@Order`. Boot orders it among the other filters. |
| Filter created in a `@Bean` method | Wrap it in `FilterRegistrationBean` to set order, url patterns, and dispatcher types. |
| Needs the handler method | Interceptor, not filter. Filters run before mapping. |
| Must run on the async re-dispatch | Plain `Filter`, or `OncePerRequestFilter` with an explicit `shouldNotFilterAsyncDispatch` override. |
| Must run on the error dispatch | `FilterRegistrationBean#setDispatcherTypes(REQUEST, ERROR, ASYNC)`. |
| Wraps the request for a library | `OncePerRequestFilter`, never a plain `Filter`, or the body is read twice on nested dispatches. |

The Spring Security chain is registered with order `SecurityProperties.DEFAULT_FILTER_ORDER`, which is `-100`. Any custom filter that must see the authenticated context needs a lower order value than that; any filter that must run unauthenticated, such as CORS preflight handling, needs a higher value.

## Interceptors

```java
package com.acme.billing.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.ModelAndView;

@Component
class HandlerTimingInterceptor implements HandlerInterceptor {

    private static final String START = "com.acme.billing.start";

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (handler instanceof HandlerMethod method) {
            request.setAttribute(START, System.nanoTime());
            request.setAttribute("handler", method.getBeanType().getSimpleName() + "#" + method.getMethod().getName());
        }
        return true;
    }

    @Override
    public void postHandle(HttpServletRequest request, HttpServletResponse response, Object handler,
            @Nullable ModelAndView modelAndView) {
        Object start = request.getAttribute(START);
        if (start instanceof Long startedAt) {
            long millis = (System.nanoTime() - startedAt) / 1_000_000L;
            response.setHeader("X-Handler-Millis", Long.toString(millis));
        }
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        request.removeAttribute(START);
    }
}
```

| Rule | Reason |
| --- | --- |
| Register through `addInterceptors` | Interceptors are not picked up by component scanning. |
| Order interceptors with `registry.addInterceptor(...).order(n)` | Registration order alone is easy to break during refactors. |
| `preHandle` returning `false` stops the chain | Use it for a response already written, never as a silent business branch. |
| `postHandle` is skipped on exception | Cleanup belongs in `afterCompletion`. |
| `afterCompletion` runs once per interceptor that passed `preHandle` | Exceptions seen here are logged, not propagated. |
| Exclude paths explicitly | `excludePathPatterns` for health, metrics, docs, and static assets. |

## Exception advice

```java
package com.acme.billing.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
class ApiExceptionHandler {

    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<ProblemDetail> handleUnknownPath(NoResourceFoundException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, "No handler for this path");
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(problem);
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    ResponseEntity<ProblemDetail> handleInvalidParameter(HandlerMethodValidationException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Request parameter rejected");
        return ResponseEntity.badRequest().body(problem);
    }
}
```

| Exception | Default status | Notes |
| --- | --- | --- |
| `MethodArgumentNotValidException` | 400 | Body validation. Violation normalization belongs to `spring-boot-validation`. |
| `HandlerMethodValidationException` | 400 | Method parameter validation in Spring 6.1 and later. |
| `HttpMessageNotReadableException` | 400 | Malformed or unconvertible body. Never echo the payload. |
| `MethodArgumentTypeMismatchException` | 400 | Wrong parameter type, including date and enum conversion. |
| `HttpRequestMethodNotSupportedException` | 405 | |
| `HttpMediaTypeNotSupportedException` | 415 | `Content-Type` mismatch. |
| `HttpMediaTypeNotAcceptableException` | 406 | `Accept` mismatch. |
| `NoResourceFoundException` | 404 | Static and mapped resource misses. |
| `NoHandlerFoundException` | 404 | Only when `throw-exception-if-no-handler-found` is enabled. |
| `MissingServletRequestParameterException` | 400 | |
| `AsyncRequestTimeoutException` | 503 | From async dispatch. |
| `Exception` | 500 | One fallback only, with no internal detail. |

| Rule | Reason |
| --- | --- |
| Prefer `@RestControllerAdvice` for JSON APIs | It adds `@ResponseBody`, so return values serialize. |
| Extending `ResponseEntityExceptionHandler` gives one place for framework exceptions | The base class maps every documented Spring MVC exception. |
| Do not catch `Exception` per handler type and hide it | A catch-all must be last, generic, and free of internal detail. |
| Do not put advice in the domain or service layer | It is a transport concern and belongs with the transport. |
| Set `server.error.include-message=never` and `include-stacktrace=never` | The default error page leaks messages in some paths. |
| Never return the exception message for a 500 | Log it with the correlation id, return a generic problem. |

## Common failures

| Symptom | Cause | Remedy |
| --- | --- | --- |
| Filter runs twice on one request | Plain `Filter` plus an async or error re-dispatch | `OncePerRequestFilter`, or check `isAsyncStarted` |
| Interceptor does not run for a static file | No resource handler mapping, or path excluded | Register a `ResourceHandler` and re-check patterns |
| Advice never invoked | Exception thrown in a filter or before the handler is resolved | Handle it in the filter or in the error dispatch path |
| Advice ignored for one endpoint | Handler-level `@ExceptionHandler` wins | Remove the duplication |
| Advice catches everything and hides 404s | Catch-all `Exception` handler | Re-throw or return the original status |
| 400 with an empty body | Converter cannot write the advice return type | Return `ResponseEntity` with an explicit content type |
| Security context missing in a controller | Filter runs before the security chain, or async re-entry | Order the filter after `DEFAULT_FILTER_ORDER` and re-read the context on async dispatch |
