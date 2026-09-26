---
name: spring-boot-hexagonal-architecture
description: 'Use when defining or reviewing port interfaces, driven adapters, composition roots, and the anti-corruption boundary around vendor SDKs in a Spring Boot service. Triggers include hexagonal, ports and adapters, primary port, secondary port, driven adapter, two implementations of one port, @Qualifier wiring, @Primary, ObjectProvider, in-memory fake for a test, wrap the Stripe client, ERP adapter, port per use case, who constructs the dependency, and swapping the vendor. Do not use for layer placement, aggregate design, module boundary verification, security filter chains, or JPA mapping. When other skills also apply, reconcile ownership before mutation.'
license: MIT
metadata:
  author: Walthergl66
  version: '1.0.0'
---

# Hexagonal Architecture In Spring Boot

Model the application as use cases that reach the outside world only through interfaces the application itself owns. Spring already supplies a composition root and an injection container, so the real work is deciding which interfaces deserve to exist, binding several implementations to one port unambiguously, and keeping a vendor SDK behind an anti-corruption layer. Add a port only when a second implementation, a volatile dependency, or an expensive test justifies it.

## When to use

- Deciding whether a class deserves its own interface, or is a wrapper with one caller.
- One port needs two implementations, such as a real gateway and an in-memory fake.
- A vendor SDK, payment client, or ERP connector is spreading through application code.
- `@Qualifier` literals are ambiguous, or a bean fails with a type collision.
- A use case test needs a database or HTTP stub and should not.
- An entry point class is an interface by habit, with no real port behind it.
- A vendor changes their response model, or a second provider is being evaluated.

## When not to use

- Ring placement and the dependency rule belong to `spring-boot-clean-architecture`.
- Aggregate boundaries, value objects, and invariants belong to `spring-boot-ddd`.
- Package cycle verification and inter-module rules belong to `spring-boot-modular-monolith`.
- Filter chains, authentication, and authorization belong to `spring-boot-security`; repositories, projections, and query mechanics belong to `spring-boot-data-jpa`.

## Ownership and sibling boundaries

This skill owns port definitions, driven adapters, the binding of multiple implementations, and the anti-corruption layer.

- `spring-boot-clean-architecture` owns where packages go. Hand it any question phrased as which layer.
- `spring-boot-ddd` owns the model a port returns. Hand it aggregate and value object design.
- `spring-boot-modular-monolith` owns module boundaries. Hand it any inter-module access question.
- `spring-boot-security` owns the security adapter. Hand it authentication and authorization, keep ports application-facing.
- `spring-boot-data-jpa` owns the persistence adapter. Hand it JPA mechanics; keep the port free of framework types.

## Ports in one sentence

A port is an interface the application owns, named after a capability it needs, that hides one replaceable or test-hostile detail. It is an interface only when a second implementation, a volatile dependency, or a valuable test seam exists; otherwise inject the concrete class.

| Term | Meaning | Example |
| --- | --- | --- |
| Primary port | An entry point the application offers, beside the use case | `PlaceOrderUseCase` |
| Secondary port | A capability the application requires | `PaymentGateway` |
| Driven adapter | The implementation of a secondary port | `StripePaymentGateway` |
| Driving adapter | The caller of a primary port | `OrderController` |
| Composition root | The only place naming concrete classes | `PaymentWiringConfig` |

## Wiring two implementations of one port

```java
package com.example.ordering.config;

import com.example.ordering.adapter.out.payment.FakePaymentGateway;
import com.example.ordering.application.port.PaymentGateway;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration(proxyBeanMethods = false)
public class PaymentWiringConfig {

    @Bean
    PaymentGateway stripePaymentGateway(StripeClientFactory client) {
        return new StripePaymentGateway(client);
    }

    @Bean
    @Profile("local")
    PaymentGateway fakePaymentGateway() {
        return new FakePaymentGateway();
    }
}
```

| Situation | Mechanism | Cost |
| --- | --- | --- |
| One implementation | plain constructor injection | none |
| One per environment | `@Profile` on each bean | a profile per environment |
| Chosen by data | inject both with `@Qualifier` per field | explicit and verbose |
| Chosen at runtime | `ObjectProvider<Port>` with `getIfAvailable(name)` | no startup failure, harder to trace |
| One primary, one fallback | `@Primary` on the default | silent fallback when a qualifier is forgotten |
| Genuinely optional | `ObjectProvider<Port>.getIfAvailable()` | fine for an absent capability |

Qualifier strings must equal a bean method name, never a hand-typed literal that drifts. Never rely on bean definition order to pick a winner. A missing required binding must fail at startup, which is why `ObjectProvider` is reserved for ports that may legitimately be absent. A use case that names `StripeClientFactory` has moved the composition root inward: it should name `PaymentGateway`, and a `config` class decides how the port is satisfied.

## Anti-corruption around a vendor SDK

```java
package com.example.ordering.application.port;

import java.math.BigDecimal;
import java.util.UUID;

public interface PaymentGateway {

    PaymentResult charge(UUID orderId, BigDecimal amount, String currency);

    enum PaymentResult { CAPTURED, DECLINED }
}
```

```java
package com.example.ordering.adapter.out.payment;

import com.example.ordering.application.port.PaymentGateway;
import java.math.BigDecimal;
import java.util.UUID;
import vendor.sdk.ChargeRequest;
import vendor.sdk.ChargeResult;
import vendor.sdk.StripeClient;

public final class StripePaymentGateway implements PaymentGateway {
    private final StripeClient client;

    public StripePaymentGateway(StripeClient client) { this.client = client; }

    @Override
    public PaymentResult charge(UUID orderId, BigDecimal amount, String currency) {
        ChargeResult result = client.charge(new ChargeRequest(orderId.toString(),
                amount.longValueExact(), currency.toLowerCase()));
        return "succeeded".equals(result.status()) ? PaymentResult.CAPTURED : PaymentResult.DECLINED;
    }
}
```

The port speaks the application language, the adapter speaks the vendor language, and no `ChargeResult` escapes the adapter. Every vendor field with no application meaning is dropped rather than propagated as `Map<String, Object>`, and vendor errors become application errors at the adapter boundary so a use case never catches a vendor exception.

One implementation, one caller, and no volatility means inject the class and delete the interface; an interface that exists only to mock a class with no logic should go too. A port that leaks the vendor model, returns a JPA entity, or mirrors the SDK method for method is worse than no port, because it advertises a boundary it does not hold. Adopt incrementally: start at the volatile edge, extract one port, add the in-memory adapter, move wiring into `config`, and stop until a second implementation or a real test cost appears.

## Reference routing

| Task | Load |
| --- | --- |
| Catalogue ports, name them, decide primary versus secondary | [ports-and-adapters.md](references/ports-and-adapters.md) |
| Wire several implementations, conditions, qualifiers, composition root | [wiring-and-composition-root.md](references/wiring-and-composition-root.md) |
| Replace a port with a fake, choose fake versus mock, contract test an adapter | [testing-through-ports.md](references/testing-through-ports.md) |

## Expected response

- **Verdict:** which boundaries deserve a port, and which interfaces should go.
- **Port table:** each port with its signature, the reason it exists, and its adapter class.
- **Wiring:** the binding mechanism per port, and how a missing bean fails at startup.
- **Anti-corruption map:** the vendor concepts that must not escape an adapter.
- **Test seam:** the fake a test will use, and what stays untested without a real adapter.
- **Sequence:** the smallest set of ports to add now and what to defer.
