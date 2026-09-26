# Filter Chains and Authentication

Load this when configuring one or more `SecurityFilterChain` beans, ordering them, wiring an `AuthenticationManager` or `AuthenticationProvider`, or propagating the security context into async and background work.

## Chain selection and order

Spring Security builds a `FilterChainProxy` containing one chain per `SecurityFilterChain` bean. For every request, the first chain whose `securityMatcher` matches is used, in bean order.

| Rule | Detail |
| --- | --- |
| Order with `@Order` | Lower value first; the chain with no matcher is the catch-all and belongs last |
| Match a path | `securityMatcher("/api/**")` |
| Match a method or header | `securityMatcher(AntPathRequestMatcher.antMatcher(HttpMethod.POST, "/api/orders"))` or a lambda matcher |
| No matcher at all | Catches every request the earlier chains did not, including the error dispatch |
| Two chains matching | The first one wins; the other never runs, with no warning |

```java
package com.acme.billing.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
class SecurityConfig {

    private static final String[] PUBLIC_PATHS = { "/api/auth/token", "/actuator/health", "/v3/api-docs/**" };

    @Bean
    @Order(1)
    SecurityFilterChain publicChain(HttpSecurity http) throws Exception {
        return http
                .securityMatcher(PUBLIC_PATHS)
                .authorizeHttpRequests(requests -> requests.anyRequest().permitAll())
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .build();
    }

    @Bean
    @Order(2)
    SecurityFilterChain browserChain(HttpSecurity http) throws Exception {
        return http
                .securityMatcher("/ui/**")
                .authorizeHttpRequests(requests -> requests.anyRequest().authenticated())
                .formLogin(Customizer.withDefaults())
                .build();
    }

    @Bean
    @Order(100)
    SecurityFilterChain defaultChain(HttpSecurity http) throws Exception {
        return http
                .authorizeHttpRequests(requests -> requests
                        .requestMatchers(PUBLIC_PATHS).permitAll()
                        .anyRequest().authenticated())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .csrf(csrf -> csrf.disable())
                .oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()))
                .build();
    }
}
```

## Filter order inside the chain

```text
DisableEncodeUrlFilter, WebAsyncManagerIntegrationFilter, SecurityContextHolderFilter
  -> HeaderWriterFilter (security headers)
  -> CorsFilter
  -> LogoutFilter
  -> BearerTokenAuthenticationFilter | UsernamePasswordAuthenticationFilter
  -> RequestCacheAwareFilter
  -> SecurityContextHolderAwareRequestFilter
  -> AnonymousAuthenticationFilter
  -> SessionManagementFilter
  -> ExceptionTranslationFilter
  -> AuthorizationFilter (the authorizeHttpRequests rules)
```

| Need | Placement |
| --- | --- |
| CORS preflight | `http.cors(Customizer.withDefaults())` so `CorsFilter` runs before authentication |
| Custom header, principal-aware work | Application `Filter` above `SecurityProperties.DEFAULT_FILTER_ORDER`, which is `-100` |
| Correlation id, early rejection | Application `Filter` below `-100`, so it also runs on unauthenticated failures |
| Reading the principal inside a filter | After the authentication filters; the context is populated |
| Wrapping the response for security headers | Application filter on the way out, or `headers` in the chain |

## AuthenticationManager and providers

```java
package com.acme.billing.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
class AuthenticationConfig {

    @Bean
    AuthenticationManager authenticationManager(UserDetailsService users, PasswordEncoder encoder) {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider();
        provider.setUserDetailsService(users);
        provider.setPasswordEncoder(encoder);
        // One failure for a wrong password and a missing user, so the endpoint cannot enumerate accounts.
        provider.setHideUserNotFoundExceptions(true);
        return new ProviderManager(provider);
    }
}
```

| Rule | Reason |
| --- | --- |
| One `AuthenticationManager` per distinct credential type | A chain is a decision about credentials, not a catch-all |
| A resource server chain does not use `AuthenticationManager` | `BearerTokenAuthenticationFilter` builds the `Authentication` itself |
| `hideUserNotFoundExceptions` on | It prevents user enumeration through a different error |
| Never log the password or the raw credentials | Logs outlive the incident response |
| `Authentication` is immutable once returned | Build it in the provider, never mutate it later |

## Security context and propagation

| Rule | Detail |
| --- | --- |
| Read with `SecurityContextHolder.getContext().getAuthentication()` | Returns an unauthenticated token for anonymous traffic, never null |
| Read a typed principal in MVC | `@AuthenticationPrincipal Jwt jwt` or a custom argument resolver |
| Background work, schedulers, and executors | No request means no context. Pass the identity explicitly, or wrap the task with `DelegatingSecurityContextExecutor` |
| Virtual threads | Keep the default `MODE_THREADLOCAL`. Inheritable thread local mode does not propagate into virtual threads |
| Async MVC and long-lived pools | The context is restored on the async dispatch; clear it in a `finally` block, or a pooled thread keeps the previous caller principal |

```java
package com.acme.billing.orders;

import java.util.UUID;
import java.util.concurrent.Executor;
import org.springframework.security.concurrent.DelegatingSecurityContextExecutor;
import org.springframework.stereotype.Service;

@Service
public class OrderNotificationService {

    private final OrderRepository repository;
    private final Executor withContext;

    OrderNotificationService(OrderRepository repository, Executor delegate) {
        this.repository = repository;
        this.withContext = new DelegatingSecurityContextExecutor(delegate);
    }

    public void notifyOwner(UUID orderId) {
        withContext.execute(() -> repository.load(orderId).notifyOwner());
    }
}
```

## Stateless chain checklist

1. `SessionCreationPolicy.STATELESS`.
2. `csrf` disabled only because the credential is the `Authorization` header, with `formLogin`, `httpBasic`, and `logout` explicitly disabled so a later dependency cannot silently re-enable them.
3. `RequestCache` set to null, or the default request cache stops interfering with token requests.
4. CORS configured in the chain, not only in MVC.
5. A `ProblemDetail` or small JSON body for 401 and 403, with no detail beyond the standard challenge.
6. Clock skew configured deliberately, default zero, and the audience validated when the token is not minted for this service alone.

## Test the chains

```java
package com.acme.billing.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.authenticated;
import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.unauthenticated;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class SecurityConfigTests {

    @Autowired
    private MockMvc mvc;

    @Test
    void publicEndpointIsOpen() throws Exception {
        mvc.perform(get("/api/auth/token")).andExpect(unauthenticated());
    }

    @Test
    void protectedEndpointRejectsAnonymous() throws Exception {
        mvc.perform(get("/api/orders")).andExpect(status().isUnauthorized());
    }

    @Test
    void scopeGrantIsRequired() throws Exception {
        mvc.perform(get("/api/orders").with(SecurityMockMvcRequestPostProcessors.jwt()
                        .jwt(jwt -> jwt.subject("subject"))
                        .authorities(new SimpleGrantedAuthority("SCOPE_orders.read"))))
                .andExpect(authenticated().withUsername("subject"));
    }
}
```

Add a test per chain and per rule group, including one that proves which chain matched: a test that passes through the wrong chain is a false green.
