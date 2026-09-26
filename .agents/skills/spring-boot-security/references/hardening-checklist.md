# Hardening Checklist

Load this when reviewing the security posture of a Spring Boot service, or before exposing a new endpoint family to the internet.

## CSRF

| Situation | Posture | Mechanism |
| --- | --- | --- |
| Stateless bearer token in the `Authorization` header | Disabled | A browser cannot attach that header cross-site, so the attack has no vector |
| Cookie session, server-rendered pages | Required | `CookieCsrfTokenRepository.withHttpOnlyFalse()` for a single-page app that reads the token, or the header parameter repository for a server-rendered form |
| Cookie session with `SameSite=Lax` or `Strict` | Required anyway | Same-site cookies are a defense in depth, not a replacement for a token |
| Basic auth | Required | The browser attaches credentials automatically, so the attack surface matches cookies |
| Any GET that changes state | Unacceptable | Restructure it; no token protects a state-changing GET |
| Actuator and public endpoints | Disabled | They hold no session and are not browser-driven |

```java
package com.acme.billing.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;

@Configuration
class CsrfConfig {

    @Bean
    CookieCsrfTokenRepository csrfTokenRepository() {
        // The cookie must be readable by the single-page app, which then copies the value into a header.
        CookieCsrfTokenRepository repository = CookieCsrfTokenRepository.withHttpOnlyFalse();
        repository.setCookiePath("/");
        return repository;
    }

    @Bean
    CsrfTokenRequestAttributeHandler csrfTokenRequestHandler() {
        // Opting out of the default XOR encoding lets a JavaScript client read the cookie value directly.
        CsrfTokenRequestAttributeHandler handler = new CsrfTokenRequestAttributeHandler();
        handler.setCsrfRequestAttributeName(null);
        return handler;
    }
}
```

| Rule | Reason |
| --- | --- |
| The `X-CSRF-TOKEN` header name is configurable, and the client must use the configured one | A mismatch produces 403 with no hint |
| Spring Security 6 defaults to the XOR handler for BREACH protection | A client that reads the cookie must be told to send the raw value, as above |
| Test every state-changing endpoint with `.with(csrf())` | Otherwise a correct setup looks broken, and the workaround is to disable CSRF |
| Never disable CSRF globally to make a test pass | That silently removes the protection from the cookie-based paths |

## CORS

| Where configured | Applies to | Trap |
| --- | --- | --- |
| `http.cors(Customizer.withDefaults())` plus a `CorsConfigurationSource` bean | Preflight and simple requests, before authentication | The usual correct place when Spring Security is present |
| `WebMvcConfigurer#addCorsMappings` | Preflight handled by MVC | Without `http.cors`, `CorsFilter` is absent and preflight fails with 403 or a missing allow header |
| `allowedOrigins` | Exact list | Never `*` with credentials |
| `allowedOriginPatterns` | Pattern list with credentials | Patterns are a deliberate, reviewable decision, not a convenience |
| `allowCredentials` | Cookies and authorization headers | Requires explicit origins |
| `maxAge` | Preflight caching | A short value means more preflights; a long one makes origin changes slow to apply |

| Rule | Reason |
| --- | --- |
| List origins explicitly | Reflection of any origin with credentials is equivalent to no CORS policy |
| Do not combine credentials with a wildcard | Browsers reject it, and servers that do not are the vulnerability |
| Restrict methods and headers to what is used | Least privilege on the browser contract |
| Do not use a regex for origins | ReDoS and accidental matches are both real risks |
| Test the preflight and the actual request | A green unit test with no CORS filter proves nothing |

## Sessions

| Rule | Reason |
| --- | --- |
| `STATELESS` for a bearer API | Nothing to fixate, replicate, or leak |
| `IF_REQUIRED` with a `SessionManagementConfigurer` for browser flows | Session fixation protection is on by default; keep it |
| Session cookie flags | `HttpOnly`, `Secure`, `SameSite=Lax` at minimum |
| Server-side session store when running more than one instance | In-memory sessions are lost on restart and on routing changes |
| Rotate the session id on privilege change | Prevents session fixation across a login |
| Never put anything sensitive in the session | It is server state, but it is also user-reachable through the id |

## Headers and transport

| Header | Default in Spring Security | When to change |
| --- | --- | --- |
| `Strict-Transport-Security` | Enabled with a default max age | Behind a TLS-terminating proxy, confirm the header is set by the edge and not duplicated |
| `X-Content-Type-Options: nosniff` | Enabled | Leave it on |
| `X-Frame-Options` | `DENY` | `SAMEORIGIN` only for a page that must be framed by itself |
| `Content-Security-Policy` | Not set | Set it for anything that renders HTML; a pure JSON API does not need it |
| `Referrer-Policy` | Strict origin by default | Tighten when URLs carry identifiers |
| `Permissions-Policy` | Not set | Set the features the service does not use |
| `Cache-Control` for sensitive responses | Not set by default | Set `no-store` for responses that must not be cached |

| Rule | Reason |
| --- | --- |
| TLS everywhere, including between services | Internal traffic is still on a network someone else may reach |
| Redirect HTTP to HTTPS at the edge | HSTS only protects after the first successful request |
| Do not disable redirect filters for local convenience | It is the most common way a production service ends up serving plain HTTP |

## Secrets and configuration

| Rule | Reason |
| --- | --- |
| Secrets come from the environment or a secret store | A secret in `application.yaml` is in Git history forever |
| Validate configuration at startup | A missing issuer or a weak pool size should stop the boot |
| `spring.jpa.hibernate.ddl-auto=validate`, never `update` | Schema changes belong to migrations, and `update` is a silent data risk |
| Actuator exposure is minimal | `env`, `configprops`, `heapdump`, and `threaddump` leak configuration and memory |
| Management port separated from the application port | The management surface then needs a different network policy |

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info,prometheus
  endpoint:
    health:
      probes:
        enabled: true
  server:
    port: 9090
```

## Error and log hygiene

| Rule | Reason |
| --- | --- |
| `server.error.include-message=never` and `include-stacktrace=never` | Messages and traces describe internals |
| One generic 500 problem body | Details go to the log with a correlation id |
| 401 for missing or invalid credentials, 403 for an authenticated caller without permission | The distinction is part of the contract, not an implementation detail |
| Never echo the submitted value of a rejected password or token | It ends up in a log and in a support ticket |
| Log the subject and the decision, not the token | A log sink is a credential store |
| Redact authorization headers at the ingress and in any request logging filter | Same reason |

```yaml
server:
  error:
    include-message: never
    include-stacktrace: never
    include-binding-errors: never
```

## Review checklist

1. Every chain has a matcher, an order, and an explicit catch-all default.
2. Every state-changing endpoint has a negative authorization test.
3. CSRF posture matches the credential transport, verified with `.with(csrf())` on cookie flows.
4. CORS origins are explicit and credentials are never combined with a wildcard.
5. Session policy, cookie flags, and store are consistent with the deployment topology.
6. Headers are set by the framework or explicitly, and verified on a real response.
7. Secrets come from the environment, and no actuator endpoint leaks them.
8. Error bodies carry no internal detail and correlate to a log line.
9. Dependencies are current; a CVE in the security layer is a release blocker, not a backlog item.
10. Rate limiting exists at the edge for authentication and expensive endpoints.
