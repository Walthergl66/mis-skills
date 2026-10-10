---
name: auth-implementation-patterns
description: >
  Framework-agnostic authentication and authorization design: JWT, OAuth2/OpenID
  Connect, session versus token, refresh-token rotation, RBAC and ABAC, SSO, API
  keys, and multi-tenancy. Use when implementing an auth system, securing an API,
  or debugging login, token, or permission logic. Triggers include "JWT",
  "OAuth2", "OIDC", "refresh token", "session cookie", "RBAC", "ABAC", "SSO",
  "multi-tenant", "API key". Do not use for the Spring Security filter chain or
  Java security config - use spring-boot-security. Do not use for NestJS guards,
  pipes, and interceptors - use nestjs-features-performance. This skill decides
  the scheme; the framework skill decides the wiring.
license: MIT
metadata:
  author: wshobson
  version: 1.0.0
---

# Authentication & Authorization Implementation Patterns

Build secure, scalable authentication and authorization systems using industry-standard patterns and modern best practices.

## When to Use This Skill

- Implementing user authentication systems
- Securing REST or GraphQL APIs
- Adding OAuth2/social login
- Implementing role-based access control (RBAC)
- Designing session management
- Migrating authentication systems
- Debugging auth issues
- Implementing SSO or multi-tenancy

## Boundaries

This skill owns the framework-agnostic scheme. It does not own framework wiring:

- Spring Security filter chain, `SecurityFilterChain`, `@PreAuthorize`, `JwtDecoder` beans → `spring-boot-security`.
- NestJS guards, pipes, interceptors, exception filters → `nestjs-features-performance`.

When both apply, decide the scheme here (session versus token, OAuth2 flow, RBAC model) and implement the wiring in the framework skill.

## Core Concepts

### 1. Authentication vs Authorization

**Authentication (AuthN)**: Who are you?

- Verifying identity (username/password, OAuth, biometrics)
- Issuing credentials (sessions, tokens)
- Managing login/logout

**Authorization (AuthZ)**: What can you do?

- Permission checking
- Role-based access control (RBAC)
- Resource ownership validation
- Policy enforcement

### 2. Authentication Strategies

**Session-Based:**

- Server stores session state
- Session ID in cookie
- Traditional, simple, stateful

**Token-Based (JWT):**

- Stateless, self-contained
- Scales horizontally
- Can store claims

**OAuth2/OpenID Connect:**

- Delegate authentication
- Social login (Google, GitHub)
- Enterprise SSO

## Detailed patterns and worked examples

Detailed pattern documentation lives in `references/details.md`. Read that file when the navigation tier above is insufficient.

## Best Practices

1. **Never Store Plain Passwords**: Always hash with bcrypt/argon2
2. **Use HTTPS**: Encrypt data in transit
3. **Short-Lived Access Tokens**: 15-30 minutes max
4. **Secure Cookies**: httpOnly, secure, sameSite flags
5. **Validate All Input**: Email format, password strength
6. **Rate Limit Auth Endpoints**: Prevent brute force attacks
7. **Implement CSRF Protection**: For session-based auth
8. **Rotate Secrets Regularly**: JWT secrets, session secrets
9. **Log Security Events**: Login attempts, failed auth
10. **Use MFA When Possible**: Extra security layer

## Common Pitfalls

- **Weak Passwords**: Enforce strong password policies
- **JWT in localStorage**: Vulnerable to XSS, use httpOnly cookies
- **No Token Expiration**: Tokens should expire
- **Client-Side Auth Checks Only**: Always validate server-side
- **Insecure Password Reset**: Use secure tokens with expiration
- **No Rate Limiting**: Vulnerable to brute force
- **Trusting Client Data**: Always validate on server
