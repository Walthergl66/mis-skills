# Authorization and Tokens

Load this when implementing method security, writing a custom authorization decision, mapping JWT claims to authorities, validating tokens, or reviewing who can call what.

## Where the decision lives

| Layer | Question it answers | Granularity | Typical mechanism |
| --- | --- | --- | --- |
| Filter chain | May this caller reach this path at all | Route family | `authorizeHttpRequests` |
| Method security | May this authenticated caller perform this operation on this object | Use case, with the argument value | `@PreAuthorize` |
| Persistence query | Is this row within the caller's scope | Row | Specification or an explicit predicate |
| Domain | Is the operation legal for this state | Invariant | Plain code, no framework types |

Layering rule: coarse to fine. Each layer narrows the previous one, and none of them replaces it.

## Method security

```java
package com.acme.billing.ledger;

import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

@Service
public class LedgerService {

    private final LedgerRepository repository;

    LedgerService(LedgerRepository repository) {
        this.repository = repository;
    }

    @PreAuthorize("hasAuthority('SCOPE_ledger.read')")
    public LedgerView find(UUID id) {
        return repository.findById(id).map(LedgerView::from).orElseThrow();
    }

    @PreAuthorize("@ledgerAccess.mayArchive(#id, authentication)")
    public void archive(UUID id) {
        repository.archive(id);
    }
}
```

| Trap | Symptom | Fix |
| --- | --- | --- |
| `@EnableMethodSecurity` missing | Every annotation is ignored and the method is open | Enable it on the configuration class |
| Self-invocation or private method | The proxy is bypassed, the rule does not run | Guard the public entry point an outside caller invokes |
| Final class or manual instantiation | No proxy is created | Do not `new` a secured bean |
| `hasRole("admin")` versus `hasAuthority("ROLE_admin")` | Denied with no obvious cause | Pick one naming convention and use it everywhere |
| SpEL string changed without a test | Rule silently weaker or stronger | A unit test per rule with a negative case |
| Authority checked against the wrong claim | Every request denied for valid users | Log the authorities, not the token, and assert them in a test |

## Custom authorization bean

```java
package com.acme.billing.ledger;

import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

@Component("ledgerAccess")
public class LedgerAccess {

    private final LedgerOwnership ownership;

    LedgerAccess(LedgerOwnership ownership) {
        this.ownership = ownership;
    }

    // A named bean referenced from SpEL must return a boolean; @PreAuthorize rejects AuthorizationDecision.
    public boolean mayArchive(UUID ledgerId, Authentication authentication) {
        return authentication != null
                && authentication.isAuthenticated()
                && ownership.isOwner(ledgerId, authentication.getName());
    }
}
```

| Rule | Reason |
| --- | --- |
| Return `false` for an anonymous or unauthenticated authentication | An anonymous authentication object is still an `Authentication` |
| Deny by default | A missing record, a lookup error, or a timeout must not become an allow |
| Do not throw from the decision | An exception in a filter-level decision is swallowed into an allow path by some configurations |
| Keep the decision free of HTTP types | The same rule must work for a scheduler, a message consumer, and a test |

An `AuthorizationManager<RequestSecurityContext>`, registered with `http.authorizeHttpRequests(authorize -> authorize.access(manager))`, replaces path rules when access depends on a request attribute, a method claim, or a database lookup. It returns an `AuthorizationDecision`; the SpEL-referenced bean above must return a `boolean` instead, because `@PreAuthorize` evaluates a boolean. Do not mix an expression rule with a custom manager that contradicts it.

## Permission evaluator

```java
package com.acme.billing.invoice;

import java.io.Serializable;
import org.springframework.security.access.PermissionEvaluator;
import org.springframework.stereotype.Component;

@Component
public class InvoicePermissionEvaluator implements PermissionEvaluator {

    private final InvoiceOwnership ownership;

    InvoicePermissionEvaluator(InvoiceOwnership ownership) {
        this.ownership = ownership;
    }

    @Override
    public boolean hasPermission(Authentication authentication, Object targetDomainObject, Object permission) {
        return authentication != null
                && permission instanceof String permissionName
                && ownership.allows(authentication.getName(), (InvoiceView) targetDomainObject, permissionName);
    }

    @Override
    public boolean hasPermission(Authentication authentication, Serializable targetId, String permission) {
        return authentication != null && ownership.allows(authentication.getName(), targetId, permission);
    }
}
```

A `PermissionEvaluator` bean enables `hasPermission(target, 'ARCHIVE')` in SpEL. Declare it as a bean of that type; Spring Security picks it up for method security and does not require a factory.

## JWT validation

| Check | How | Failure it prevents |
| --- | --- | --- |
| Signature | Decoder with the issuer keys, `jwk-set-uri` or discovery | Forged tokens |
| `iss` | `JwtValidators.createDefaultWithIssuer` | Tokens from another environment |
| `exp` and `nbf` | Included in the default validator | Replay of expired tokens |
| `aud` | Custom `OAuth2TokenValidator<Jwt>` | A token minted for a different service |
| `alg` | Reject anything the issuer does not use | Algorithm confusion and `alg: none` |
| `typ` and `cty` | Optional validator | A token of the wrong shape being accepted |

```java
package com.acme.billing.config;

import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

public final class AudienceValidator implements OAuth2TokenValidator<Jwt> {

    private final String expected;

    public AudienceValidator(String expected) {
        this.expected = expected;
    }

    @Override
    public OAuth2TokenValidatorResult validate(Jwt token) {
        return token.getAudience().contains(expected)
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(
                        new OAuth2Error("invalid_token", "The token audience is not this service", null));
    }
}
```

## Claim to authority mapping

| Token claim | Mapping | Rule |
| --- | --- | --- |
| `scope` or `scp`, space delimited | `SCOPE_` prefixed authorities, the Spring Security default | Keep it, and write `hasAuthority("SCOPE_x")` in rules |
| `roles` array | `ROLE_` prefixed | Map explicitly with `JwtGrantedAuthoritiesConverter` |
| `realm_access.roles` | Nested | Read the nested claim yourself; no converter walks it |
| `groups` | Application roles | Trim to what the service needs, a fat token slows every request |
| `department` or tenant | Resource scope, not a role | Use it inside a custom `AuthorizationManager` or a row predicate |
| `sub` | Principal name | Never authorize on a mutable display field |

| Rule | Reason |
| --- | --- |
| One naming convention, written down | `hasRole` and `hasAuthority` differ only by prefix, and mistakes are silent |
| Authorities are computed once per request | Mapping per authorization check is measurable overhead |
| Roles in a database are resolved at check time | A long-lived token cannot reflect a revoked role |
| Reject an unknown authority format | Log it and fail the authentication rather than granting nothing quietly |

## Token lifecycle

| Concern | Resource server | Authorization server |
| --- | --- | --- |
| Expiry | Enforced by the decoder | Short access tokens, for example 5 to 15 minutes |
| Refresh | Not applicable | Separate refresh token with rotation and reuse detection |
| Revocation | Requires short expiry or a denylist | Revocation endpoint and introspection |
| Key rotation | Refetch on unknown `kid` | Publish overlapping keys |
| Clock skew | Zero by default; add deliberately | Small allowance, for example 30 seconds |

| Rule | Reason |
| --- | --- |
| Keep access tokens short lived | A stateless chain cannot revoke a long-lived token |
| Never log the token, only `jti` and `sub` | A log is a credential store |
| Do not trust a token in a query parameter | It lands in access logs, referrers, and browser history |
| Reject tokens whose `kid` is unknown after a refetch | Prevents an attacker from forcing key lookups |

## Verification

1. One test per rule with a valid principal, plus the matching deny test.
2. A test with an expired token, a wrong issuer, a wrong audience, and a wrong algorithm.
3. A test proving method security is enabled at all, by asserting that an unguarded call is denied.
4. A test for the async or scheduled path, because the context is empty there by default.
5. A manual check of the 401 and 403 bodies and headers.
