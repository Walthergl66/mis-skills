---
name: spring-boot-security
description: 'Use when configuring SecurityFilterChain beans and their order, choosing between filter-level and method-level authorization, wiring an OAuth2 resource server with JWT validation and claim to authority mapping, deciding between stateless bearer and cookie sessions, setting CSRF and CORS posture, declaring a PasswordEncoder, guarding methods with @PreAuthorize, or testing with spring-security-test. Triggers include SecurityFilterChain, securityMatcher, @EnableMethodSecurity, AuthenticationManager, AuthenticationProvider, JwtDecoder, jwk-set-uri, issuer-uri, SecurityContextHolder, DelegatingSecurityContextExecutor, hasRole, hasAuthority, 401, 403, and BCrypt strength. Do not use for MVC hook placement or authorization data storage. When other skills also apply, reconcile ownership before mutation.'
license: MIT
metadata:
  author: Walthergl66
  version: '1.0.0'
---

# Spring Security Configuration, Authorization, and Tokens

Configure security as explicit filter chains with an explicit posture, then place every authorization decision in exactly one of two layers. Most production defects here are not bypasses; they are rules scattered across three layers where only one is tested.

## When to use

- One or more `SecurityFilterChain` beans, their order, and their path scope.
- Stateless bearer API versus cookie session, and the CSRF consequences.
- OAuth2 resource server with JWT, including issuer, audience, and signature validation.
- Mapping scopes, roles, or permissions from claims to Spring authorities.
- `@PreAuthorize`, custom permission evaluators, or `AuthorizationManager` beans.
- Password hashing, secret handling, response headers, error leakage, and `spring-security-test` usage.

## When not to use

- Where a filter or interceptor sits in the pipeline belongs to `spring-boot-mvc`.
- Secret injection and vault wiring belong to `spring-boot-ci-cd`.
- Storing roles and permissions belongs to `spring-boot-data-jpa`.
- Input constraint validation belongs to `spring-boot-validation`.
- Threat modeling and derived requirements belong to `security-requirement-extraction`.
- Token issuance and session design belong to `auth-implementation-patterns`.
- Publishing the security scheme belongs to `spring-boot-openapi`.

## Ownership and sibling boundaries

This skill owns the filter chains, the authentication and authorization decisions, and the runtime security posture.

- `spring-boot-mvc` owns request hook placement. Hand it the pipeline; keep security filters ahead of application filters.
- `spring-boot-ci-cd` owns secrets at rest. Hand it the environment variables the chain reads.
- `spring-boot-data-jpa` owns the tables holding roles. Hand it the schema; keep the decision here.
- `security-requirement-extraction` owns the threat model. Hand it derived requirements, not framework code.
- `auth-implementation-patterns` owns token issuance. Hand it what the resource server does not validate.

## The filter chain

```text
container thread
  -> springSecurityFilterChain (FilterChainProxy, order -100)
     -> CorsFilter -> SecurityContextHolderFilter
        -> BearerTokenAuthenticationFilter (stateless) | UsernamePasswordAuthenticationFilter (browser)
        -> AnonymousAuthenticationFilter -> ExceptionTranslationFilter
        -> AuthorizationFilter: the authorizeHttpRequests rules, first match wins
  -> application filters, then DispatcherServlet -> method security proxy: @PreAuthorize
```

## Hard rules

1. **One `SecurityFilterChain` bean per security scope.** A path-scoped chain needs `securityMatcher`; the chain with no matcher is the catch-all and is declared last.
2. **Order chains with `@Order`, lowest first**, and keep the catch-all last. Inside a chain the first matching rule wins, so `permitAll()` precedes `anyRequest()`.
3. **Stateless and stateful are different applications.** Do not mix session creation with bearer tokens in one chain.
4. **CSRF off is only valid for a bearer header.** A cookie-carried credential needs CSRF protection.
5. **CORS is enforced by security, not by MVC**, when Spring Security is present. MVC mappings alone leave preflight unprotected.
6. **Every rule has exactly one home.** Coarse rules in `authorizeHttpRequests`, resource rules in `@PreAuthorize`, row rules in the query.
7. **Never leak failure detail.** 401 for missing or invalid credentials, 403 for an authenticated caller without permission, reasons in the log only.

## Chains and rules

```java
@Configuration
@EnableWebSecurity
class SecurityConfig {

    @Bean
    @Order(1)
    SecurityFilterChain publicChain(HttpSecurity http) throws Exception {
        return http.securityMatcher("/api/auth/**")
                .authorizeHttpRequests(requests -> requests.anyRequest().permitAll())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .csrf(csrf -> csrf.disable())
                .build();
    }

    @Bean
    SecurityFilterChain apiChain(HttpSecurity http) throws Exception {
        return http.authorizeHttpRequests(requests -> requests
                        .requestMatchers("/actuator/**").denyAll()
                        .requestMatchers("/api/ledger/**").hasAuthority("SCOPE_ledger.write")
                        .anyRequest().authenticated())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .csrf(csrf -> csrf.disable())
                .oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()))
                .build();
    }
}
```

## Filter authorization or method authorization

| Aspect | `authorizeHttpRequests` | `@PreAuthorize` |
| --- | --- | --- |
| Granularity | Path and method | Bean method, with the actual argument |
| Use for | The coarse gate per route family | The rule on the use case, also visible to schedulers and listeners |

Both are required. A path rule cannot express "only the owner of this invoice may archive it", and a method rule alone leaves unauthenticated traffic to the framework default.

## Stateless or session

| Aspect | Stateless bearer API | Cookie session |
| --- | --- | --- |
| Credential | `Authorization: Bearer` header | Session cookie, `HttpOnly`, `Secure`, `SameSite` |
| CSRF | Disabled, a browser cannot attach the header | Required, token repository plus header |
| Session | `STATELESS`, revocation at the issuer | `IF_REQUIRED` with a shared store when scaling out, server-side invalidation |

## Resource server JWT and claim mapping

| Rule | Reason |
| --- | --- |
| Validate signature, `exp`, `nbf`, and `iss` always | A decoder without them accepts forged or stale tokens |
| Validate `aud` when the token is not minted for this service alone | A token issued for another audience would be accepted |
| Reject an unexpected `alg`, including `none`; offline `jwk-set-uri` means you own every validator | Algorithm confusion is the classic JWT attack, and skipped discovery removes the defaults |
| Map `scope` or `scp` to `SCOPE_` authorities in a `Converter<Jwt, AbstractAuthenticationToken>` | Mapping per check is measurable overhead, and nested claims need explicit code |
| One naming convention, written down | `hasRole` and `hasAuthority` differ by a prefix, and mistakes are silent |
| Resolve database roles at check time | A long-lived token cannot reflect a revoked role |
| Log `jti` and `sub`, never the token | A log sink is a credential store |

## Method security, passwords, context, and tests

| Rule | Reason |
| --- | --- |
| `@EnableMethodSecurity` on the configuration class | Without it every `@PreAuthorize` is ignored |
| Guard public methods of proxied beans | Self-invocation and private methods bypass the proxy |
| A resource-aware rule lives in a named bean returning `boolean` | SpEL strings cannot be unit tested, and `@PreAuthorize` rejects an `AuthorizationDecision` |
| `PasswordEncoder` bean, delegating encoder, deliberate BCrypt strength | The stored prefix keeps a later strength increase possible |
| `SecurityContextHolder` returns an unauthenticated token, never null | Null checks are a sign that the code reads the wrong thread |
| Wrap executor and scheduler work with `DelegatingSecurityContextExecutor`, and keep the default thread-local strategy on virtual threads | No request means no context, and inheritable mode does not propagate into virtual threads |
| `.with(jwt())`, `.with(user())`, `.with(csrf())`, `@WithMockUser`, and one negative test per rule | A suite that proves only the allowed case proves nothing |

## Reference routing

| Task | Load |
| --- | --- |
| Configure filter chains, authentication providers, and the context lifecycle | [filter-chain-and-auth.md](references/filter-chain-and-auth.md) |
| Implement method security, custom authorizations, JWT validation, and claim mapping | [authorization-and-tokens.md](references/authorization-and-tokens.md) |
| Review CSRF, CORS, sessions, headers, secret handling, and error leakage | [hardening-checklist.md](references/hardening-checklist.md) |

## Expected response

- **Posture and chains:** stateless or stateful, CSRF and CORS decisions, and one entry per chain with matcher, order, rules, and the catch-all default.
- **Authentication:** provider or resource server, decoder validation, and the secret source.
- **Authorization and verification:** where each rule lives, how claims become authorities, and the positive and negative test per rule.
