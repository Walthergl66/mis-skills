# Test Layers, Slices, and HTTP Clients

Load this when choosing a layer, configuring a slice test, or picking between `MockMvc`, `WebTestClient`, and a real booted server.

## Layer decision

| Claim about the system | Layer | Fails when |
| --- | --- | --- |
| A rule, calculation, or state transition | Pure unit | The rule changes or a branch is missing |
| A JSON payload of one type round trips | `@JsonTest` | A field, name, format, or visibility rule changes |
| A request is routed, validated, and rendered | `@WebMvcTest` | A mapping, a constraint, a converter, or advice changes |
| An outbound request is shaped correctly | `@RestClientTest` | A URL, header, body, or status mapping changes |
| A query returns the right rows under real SQL | `@DataJpaTest` on a container | A mapping, a derived query, a fetch plan, or a constraint changes |
| Beans wire and a request path completes | `@SpringBootTest` | A bean is missing, a proxy is absent, or configuration is wrong |
| The deployed server answers correctly over HTTP | `@SpringBootTest(RANDOM_PORT)` | Filter order, serialization over the wire, security, or error mapping changes |

If a claim fits two rows, take the cheaper one and record the gap. A rule proven only by an end to end test is unproven by every other change.

## What each slice scans

| Slice | Includes | Excludes by default | Typical failure after adding a collaborator |
| --- | --- | --- | --- |
| `@WebMvcTest` | `@Controller`, `@RestController`, `@ControllerAdvice`, `WebMvcConfigurer`, filters, interceptors, converters, `@JsonComponent` | `@Service`, `@Repository`, plain `@Component`, most auto-configuration | `NoSuchBeanDefinitionException` for the service |
| `@DataJpaTest` | Entities, repositories, `@EntityListener`, embedded database replacement | Controllers, services, web layer, most auto-configuration | `No qualifying bean` for a service used in a listener |
| `@JsonTest` | Jackson auto-configuration, `JacksonTester` | Everything else | Only a mapping surprise, which is the point |
| `@RestClientTest` | `RestClient` and `RestTemplate` auto-configuration, message converters | Servers, repositories, services | A missing custom converter |

Resolution rules for a slice:

- Declare a missing collaborator with `@MockitoBean` when the test asserts around it.
- `@Import` the configuration when the real behavior of that configuration is part of the claim, for example the security configuration.
- Prefer a narrow explicit selector, `@WebMvcTest(CheckoutController.class)`, over a broad one that scans every controller.
- Add `@ImportAutoConfiguration` only for the auto-configuration the slice genuinely needs, and only once per class.

## `@SpringBootTest` web environments

| `webEnvironment` | Server | Use |
| --- | --- | --- |
| `MOCK` (default) | None, `MockMvc` available | Wiring and filter chain without a socket |
| `RANDOM_PORT` | Real on an ephemeral port | True end to end, with `TestRestTemplate` or `WebTestClient` |
| `DEFINED_PORT` | Real on `server.port` or `local.server.port` | A fixed port contract, or an external process |
| `NONE` | None | A worker or a batch entry point that has no web layer |

`RANDOM_PORT` plus `@AutoConfigureWebTestClient` binds `WebTestClient` to the running server. Without that annotation, `WebTestClient` binds to the mock context, which is a different test.

## `MockMvc` against `WebTestClient`

| Criterion | `MockMvc` | `WebTestClient` against a real port |
| --- | --- | --- |
| Server | Simulated by default | Real servlet container and socket |
| Filters and security | Full chain when filters are enabled | Full chain, plus container level behavior |
| Servlet API access | `MockHttpServletRequest` available | Not available |
| Request body size limits, timeouts, connection handling | Not exercised | Exercised |
| Streaming and SSE | Awkward | Natural |
| Setup cost | Milliseconds | Seconds |

| Need | Choice |
| --- | --- |
| A controller contract in a slice | `MockMvc` with filters enabled |
| A controller test with no security claim | `MockMvc` with `addFilters = false`, named accordingly |
| Wire format, content negotiation, and error payloads | Real port with `WebTestClient` or `TestRestTemplate` |
| Reactive client behavior | `WebTestClient` against a real port |
| A critical end to end journey | Real port, a few of them, tagged `e2e` |

```java
package com.acme.billing.order;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureWebTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.reactive.server.WebTestClient;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureWebTestClient
@Tag("e2e")
class CheckoutContractIT {

    @Autowired
    private WebTestClient client;

    @Test
    @DisplayName("renders the created checkout with a stable field set")
    void rendersCreatedCheckout() {
        client.post()
                .uri("/api/checkout")
                .bodyValue(new CheckoutRequest("C-1", 12_000L))
                .exchange()
                .expectStatus().isCreated()
                .expectHeader().contentTypeCompatibleWith("application/json")
                .expectBody()
                .jsonPath("$.status").isEqualTo("AUTHORIZED")
                .jsonPath("$.amountCents").isEqualTo(12_000)
                .jsonPath("$.internalNotes").doesNotExist();
    }
}
```

`TestRestTemplate` needs `exchange` or a catch-all exception handler to see a 4xx or 5xx body; a plain `getForEntity` throws on error status codes.

## Security assertions in a web slice

```java
package com.acme.billing.order;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
class CheckoutAuthorizationTest {

    @MockitoBean
    private CheckoutService checkout;

    @Autowired
    private MockMvc mockMvc;

    @Test
    void rejectsAnAnonymousCheckout() throws Exception {
        mockMvc.perform(post("/api/checkout").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"customerId\":\"C-1\",\"amountCents\":12000}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void rejectsACheckoutWithoutCsrfToken() throws Exception {
        mockMvc.perform(post("/api/checkout")
                        .with(user("alice").roles("CUSTOMER"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"customerId\":\"C-1\",\"amountCents\":12000}"))
                .andExpect(status().isForbidden());
    }
}
```

| Rule | Detail |
| --- | --- |
| `@Import` the security configuration | Without it the slice has no filter chain and every request returns 200 |
| Keep filters enabled for authorization claims | `addFilters = false` removes security entirely; name such a class so the intent is visible |
| Use `@WithMockUser` for roles and `user(...)` for a real `UserDetailsService` lookup | `@WithMockUser` does not exercise user resolution |
| Add `csrf()` on every mutating request | A missing token is a 403, not a wiring failure |
| Use `@WithJwt` or a bearer post processor for token auth | Authorities must match the `hasRole` or `hasAuthority` expression exactly |

## Slice troubleshooting

| Symptom | Cause | Repair |
| --- | --- | --- |
| `NoSuchBeanDefinitionException` for a service | The slice does not scan services | `@MockitoBean` the port, or move the test up a layer |
| Security assertions always return 200 | The security configuration was not imported | `@Import(SecurityConfig.class)` and keep filters enabled |
| `WebTestClient` never reaches the real server | No random port or no `@AutoConfigureWebTestClient` | Assert on the injected client's base URL, then fix the configuration |
| `@DataJpaTest` uses an embedded database | Default `TestDatabaseAutoConfiguration` replacement | `@AutoConfigureTestDatabase(replace = Replace.NONE)` with a container |
| An `@Async` assertion fails intermittently | The work committed on another connection | Await a terminal state, or use a container with explicit cleanup |
| A filter is missing from a web slice | Filters are only applied if they are beans in the slice | Declare the filter as a `@Bean` in an imported configuration |
| Slice test count explodes | One class per controller case | Use `@Nested` per controller; a class per controller is acceptable |

## Suite shape

| Layer | Tag | Runs |
| --- | --- | --- |
| Pure unit | none | Every commit |
| `@JsonTest`, `@WebMvcTest`, `@RestClientTest` | none, or `slice` | Every commit |
| `@DataJpaTest`, `@SpringBootTest` with containers | `container` | Merge and main |
| Random port end to end flows | `e2e` | Merge, then nightly on main |

Keep the number of random port tests small enough to read in one sitting. Everything else that looks like an end to end test should be a slice test plus a container test.

## Handoff

Test data strategy, transactional rollback, and contract expectations are in [data-and-transactions.md](data-and-transactions.md). Double design inside a slice belongs to `spring-boot-mockito`; container provisioning belongs to `spring-boot-testcontainers`; JUnit mechanics belong to `spring-boot-junit`; endpoint and error payload design belongs to `spring-boot-rest-api`.
