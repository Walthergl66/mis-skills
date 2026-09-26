---
name: spring-boot-integration-testing
description: 'Use when choosing which Spring Boot 3.5 test layer proves a behavior, covering @SpringBootTest with webEnvironment options, @WebMvcTest, @DataJpaTest, @JsonTest, @RestClientTest, MockMvc against WebTestClient against a random port end to end test, test data builders, @Transactional test rollback and its traps, security test support with spring-security-test, and endpoint contract tests. Triggers include @AutoConfigureMockMvc, @AutoConfigureWebTestClient, @AutoConfigureTestDatabase, TestRestTemplate, @WithMockUser, SecurityMockMvcRequestPostProcessors, @Sql, @SqlBundle, slice failures caused by a missing bean, and webEnvironment RANDOM_PORT. Do not use for JUnit mechanics, mock design, or container provisioning. When other skills also apply, reconcile ownership before mutation.'
license: MIT
metadata:
  author: Walthergl66
  version: '1.0.0'
---

# Test Layer Selection for Spring Applications

Own the decision of which test proves a claim. Layer choice is a cost decision, not a style preference: a fast slice that mocks the query is cheap and worthless, a full context test for a rounding rule is slow and unnecessary.

## When to use

- Deciding between a plain unit test, a slice test, a container backed test, and a booted end to end test, or fixing a slice that fails on a missing bean or a missing security configuration.
- Choosing between `MockMvc`, `WebTestClient`, `TestRestTemplate`, and a random port server.
- Managing test data, the `@Transactional` rollback model, security assertions with `spring-security-test`, and endpoint contract tests.

## When not to use

- Test class structure, naming, parameterization, and tags belong to `spring-boot-junit`.
- Mock, fake, and spy design belong to `spring-boot-mockito`.
- Container provisioning, image pinning, and parallelism belong to `spring-boot-testcontainers`.
- Schema and migration history belong to `spring-boot-flyway`; pipeline stage gating belongs to `spring-boot-ci-cd`.

## Ownership and sibling boundaries

This skill owns the layer matrix, the context configuration, and the data and transaction model of a test.

- `spring-boot-junit` owns everything inside a test class. Hand it the mechanics once the layer is chosen.
- `spring-boot-testcontainers` owns the real dependency. Hand it the connection details and the container lifecycle.
- `spring-boot-rest-api` owns the endpoint contract. Hand it payload and status expectations, and keep the layer choice here.

## Hard rules

1. Every test lives at the cheapest layer that can still fail when the behavior breaks. A test one layer below the behavior is a liability.
2. A slice test proves its own layer and nothing below it. `@WebMvcTest` proves routing, binding, validation, serialization, and advice; it does not prove that the service exists or that the query works.
3. A slice test is configured explicitly. Everything it does not scan must be imported, mocked, or excluded, and every exclusion is a documented decision.
4. `@SpringBootTest(webEnvironment = RANDOM_PORT)` is the only layer that proves the real server, the real filter chain order, and the real serialization over the wire.
5. `@Transactional` on a test rolls back on the test thread only, and it silently supplies the transaction production code must open itself; `@Async` work, a second connection, and a committed inner transaction are not rolled back, and any test relying on the supplied transaction needs a twin that runs without it.
7. Test data is built per test through a builder: no shared mutable fixture, no shared sequence counter, and never a test against a shared or production database.
8. Security assertions go through `spring-security-test` post processors, not by hand written headers or tokens.
9. A test needing four or more mocked collaborators has outgrown the slice; move it up a layer or split the subject. Split the suite by cost, not by file name: unit and slice per commit, container backed tests on merge, end to end on merge or nightly.

## The layer matrix

| Layer | Annotation | Proves | Real dependencies | Typical cost | Do not use for |
| --- | --- | --- | --- | --- | --- |
| Pure unit | none, `new` the subject | Arithmetic, policy, state machine, validation logic | None | Milliseconds | Anything that needs a framework |
| Web slice | `@WebMvcTest` | Routing, binding, validation, message conversion, `@ControllerAdvice`, filter order | None, collaborators mocked | Tens of milliseconds | Persistence, service logic, real security providers |
| Persistence slice | `@DataJpaTest` | Entity mapping, derived queries, constraints, migrations | Real database, normally a container | Seconds | Controller, security, or service orchestration |
| Context integration | `@SpringBootTest` with a container | Bean wiring, transaction proxies, configuration, full request path | Real database and broker | Seconds to tens of seconds | Anything a cheaper layer already proves |
| End to end | `@SpringBootTest(RANDOM_PORT)` with `TestRestTemplate` or `WebTestClient` | Real server, real filter chain, real serialization, real security, real error payloads | Everything | Tens of seconds | Fast feedback loops |

## Choosing the layer

Ask in order. Is the behavior a decision of one class with no framework dependency? Use a pure unit test. Does it belong to the HTTP layer, the JSON layer, or the outbound client? Use `@WebMvcTest`, `@JsonTest`, or `@RestClientTest`. Does it depend on SQL, constraints, or transaction semantics? Use `@DataJpaTest` against a container. Does it depend on beans being wired together? Use `@SpringBootTest`. If nothing matches, the seams are wrong: fix the design before adding a layer.

## A slice test configured honestly

```java
package com.acme.billing.checkout;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.acme.billing.order.CheckoutController;
import com.acme.billing.order.CheckoutService;
import com.acme.billing.security.SecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(CheckoutController.class)
@Import(SecurityConfig.class)
@AutoConfigureMockMvc
class CheckoutControllerTest {

    @MockitoBean
    private CheckoutService checkout;

    @Autowired
    private MockMvc mockMvc;

    @Test
    void returnsBadRequestForNegativeAmount() throws Exception {
        mockMvc.perform(post("/api/checkout").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"customerId\":\"C-1\",\"amountCents\":-1}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("amountCents"));
    }
}
```

`@WebMvcTest` scans controllers, advice, `WebMvcConfigurer`, filters, and interceptors, and nothing else. Its typical failure is `NoSuchBeanDefinitionException` for a collaborator that must be declared with `@MockitoBean` or brought in with `@Import`; importing the security configuration is what keeps authorization in the test at all.

## MockMvc, WebTestClient, or a real server

| Client | Server | Use for | Trap |
| --- | --- | --- | --- |
| `MockMvc` | None by default | Web slices, `addFilters = false` for a controller only | Async and streaming behavior is not a real socket |
| `WebTestClient` bound to a random port | Real | End to end for reactive and MVC applications | Requires `webEnvironment = RANDOM_PORT` |
| `TestRestTemplate` | Real | End to end for blocking HTTP clients | Needs `exchange` to read a 4xx or 5xx body; `getForEntity` throws on error status |

## Transactional rollback and its traps

| Situation | Rolled back by `@Transactional` on the test | Not rolled back |
| --- | --- | --- |
| Repository writes on the test thread | Yes | No |
| `@Async` or executor work | No | Yes, it commits on its own connection |
| An inner `REQUIRES_NEW` transaction that takes its own connection | No | Yes |

The consequence that matters most: a test that passes under a test-managed transaction proves nothing about whether the production method opens its own transaction. Pair every such test with one that commits explicitly and asserts the committed state.

## Security assertions

| Need | Mechanism | Trap |
| --- | --- | --- |
| An authenticated principal in a web slice | `@WithMockUser`, `@WithAnonymousUser`, or `SecurityMockMvcRequestPostProcessors.user` | `@WithMockUser` does not resolve a real `UserDetailsService` |
| A CSRF token on a mutating request | `SecurityMockMvcRequestPostProcessors.csrf()` | Omitting it yields 403 with a correct body |
| A bearer token or no security claim | `@WithJwt`, a request post processor, or `@AutoConfigureMockMvc(addFilters = false)` | Authorities must match the method security expression, and with filters off there is no security chain at all |

## Pipeline split

| Stage | Layers | Gate |
| --- | --- | --- |
| Per commit | Pure unit, `@JsonTest`, `@WebMvcTest`, `@RestClientTest` | Runs in under a couple of minutes, no Docker required |
| On merge | `@DataJpaTest` and `@SpringBootTest` with containers | Migration, query, and wiring behavior proven |
| On merge or nightly | `@SpringBootTest(RANDOM_PORT)` flows | A handful of critical end to end journeys |

## Reference routing

| Task | Load |
| --- | --- |
| Choose a layer, configure a slice, or choose `MockMvc`, `WebTestClient`, or a random port server | [test-layers.md](references/test-layers.md) |
| Design test data, use `@Transactional` rollback safely, seed with `@Sql`, or write contract tests | [data-and-transactions.md](references/data-and-transactions.md) |

## Expected response

- **Layer decision:** the chosen layer per claim, with the cheaper layer rejected and the reason stated.
- **Context configuration:** scanned components, imports, mocks, replaced datasources, and every exclusion justified.
- **Proven and unproven:** what the test fails on, and which behavior remains outside its reach.
- **Client, security, and suite shape:** the chosen HTTP client, the authorization and CSRF path asserted, the layer inventory, and the wall clock per layer.
