# Wiring And The Composition Root

Load this when two implementations of one port exist, when a qualifier is ambiguous, or when deciding where concrete classes are named.

## The composition root rule

Only a `config` package, or a `@Configuration` class inside an adapter package, may name a concrete class that satisfies a port. Everything else depends on the interface.

| Location | May name a concrete adapter | Verdict |
| --- | --- | --- |
| `config` package | yes | correct |
| `adapter.out.*` for its own dependencies | yes | correct |
| `application` use case | no | violation, the composition root moved inward |
| `domain` | no | violation |
| `adapter.in.web` controller | no | violation |

Constructor injection picks the implementation; it does not get a vote about which implementation is right.

## Choosing a binding mechanism

| Situation | Mechanism | Failure mode |
| --- | --- | --- |
| One bean of the type | plain injection | none |
| One bean per environment | `@Profile` on the bean | wrong profile means a missing bean, which is loud |
| Choice driven by request data | `@Qualifier` on both constructor params | wrong qualifier is a startup failure, which is loud |
| Choice driven by a feature flag evaluated at runtime | `ObjectProvider` plus `getIfAvailable` | a typo becomes a silent null, so add a test |
| A default with an override | `@Primary` on the default | silent fallback hides a missing qualifier |
| A capability that may be absent | `ObjectProvider` with `getIfAvailable()` | fine, absence is intended |
| Two beans of the same type with no qualifier at all | none | startup failure: `NoUniqueBeanDefinitionException` |

Prefer the mechanism that fails at startup. A wiring mistake found at boot is cheap; a wiring mistake found in production at 03:00 is not.

## Profiles, one port two implementations

```java
package com.example.ordering.config;

import com.example.ordering.adapter.out.payment.FakePaymentGateway;
import com.example.ordering.adapter.out.payment.StripeClientFactory;
import com.example.ordering.adapter.out.payment.StripePaymentGateway;
import com.example.ordering.application.port.PaymentGateway;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Profile;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class PaymentWiringConfig {

    @Bean
    StripeClientFactory stripeClientFactory(PaymentProperties properties) {
        return new StripeClientFactory(properties.baseUrl(), properties.connectTimeoutMillis());
    }

    @Bean
    @Profile("!local")
    PaymentGateway stripePaymentGateway(StripeClientFactory client, PaymentProperties properties) {
        return new StripePaymentGateway(client, properties.currency());
    }

    @Bean
    @Profile("local")
    PaymentGateway fakePaymentGateway() {
        return new FakePaymentGateway();
    }
}
```

```yaml
spring:
  profiles:
    active: local
payments:
  currency: EUR
```

`@Profile("!local")` and `@Profile("local")` are mutually exclusive, so exactly one bean exists per environment. Never rely on ordering; two live beans of the same type without a qualifier is a startup failure, not a silent choice.

## Qualifiers on constructor parameters

```java
package com.example.ordering.application;

import com.example.ordering.application.port.RateProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

@Service
public class PriceQuoteService {
    private final RateProvider ecb;
    private final RateProvider fallback;

    public PriceQuoteService(@Qualifier("ecbRateProvider") RateProvider ecb,
                             @Qualifier("staticRateProvider") RateProvider fallback) {
        this.ecb = ecb;
        this.fallback = fallback;
    }
}
```

Rules for qualifiers:

- The qualifier string must equal the `@Bean` method name, character for character.
- Never build a qualifier string at runtime from a request; it cannot be validated at startup.
- Prefer a `List<Port>` injection point sorted with `@Order` over qualifiers once implementations grow.
- Keep qualifiers off the interface; a qualifier is a wiring decision and belongs in `config`.

## Collections instead of qualifiers

```java
package com.example.ordering.application;

import com.example.ordering.application.port.RateProvider;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class CompositeRateProvider implements RateProvider {
    private final List<RateProvider> delegates;

    public CompositeRateProvider(List<RateProvider> delegates) {
        this.delegates = delegates;
    }

    @Override
    public String name() {
        return "composite";
    }
}
```

Spring injects every bean of the type in order when the parameter is `List<T>` or `Collection<T>`. Combine with `@Order` on the beans to make precedence explicit instead of relying on bean name ordering.

## Runtime choice with ObjectProvider

```java
package com.example.ordering.config;

import com.example.ordering.application.port.PaymentGateway;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

@Component
public class PaymentGatewayRouter {
    private final ObjectProvider<PaymentGateway> providers;

    public PaymentGatewayRouter(ObjectProvider<PaymentGateway> providers) {
        this.providers = providers;
    }

    public PaymentGateway routeTo(String beanName) {
        PaymentGateway gateway = providers.getIfAvailable(beanName);
        if (gateway == null) {
            throw new NoSuchPaymentGatewayException(beanName);
        }
        return gateway;
    }
}
```

A runtime router needs a fallback: `routeTo` returning `null` in a payment path is an outage. Pair it with an explicit `NoSuchPaymentGatewayException` and a unit test per declared name.

## Conditional beans

```java
package com.example.ordering.config;

import com.example.ordering.adapter.out.tax.EuVatTaxCalculator;
import com.example.ordering.adapter.out.tax.SimpleRateTaxCalculator;
import com.example.ordering.application.port.TaxCalculator;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class TaxWiringConfig {

    @Bean
    @ConditionalOnProperty(name = "tax.eu-vat.enabled", havingValue = "true")
    TaxCalculator euVatTaxCalculator() {
        return new EuVatTaxCalculator();
    }

    @Bean
    @ConditionalOnProperty(name = "tax.eu-vat.enabled", havingValue = "true", matchIfMissing = true)
    TaxCalculator simpleRateTaxCalculator() {
        return new SimpleRateTaxCalculator();
    }
}
```

Write `havingValue` and `matchIfMissing` so exactly one bean matches. Two matching beans surface as `NoUniqueBeanDefinitionException` at startup, which is the good outcome.

## Configuration properties as records

```java
package com.example.ordering.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "payments")
public record PaymentProperties(String currency, String apiKey, Duration connectTimeout, Duration retryBackoff) {
}
```

Register with `@EnableConfigurationProperties(PaymentProperties.class)` on a `@Configuration` class, or with `@ConfigurationPropertiesScan` on the application class. Add `jakarta.validation` constraints plus `@Validated` on the record so a missing required property stops boot rather than surfacing at the first payment. Bind the secret from the environment with `api-key: ${PAYMENTS_API_KEY}` and never hardcode it in a bean method.

## Wiring review checklist

- [ ] Does any class outside `config` and `adapter.out` name a concrete adapter class?
- [ ] Is there exactly one live bean per port in every profile, and does a missing one fail at boot?
- [ ] Does every `@Qualifier` string match a `@Bean` method name exactly, with no runtime-built qualifier?
- [ ] Does a runtime router have a documented fallback and a test per declared name?
- [ ] Is every `ObjectProvider` justified by genuine optionality, not by avoidance of a decision?
- [ ] Are vendor secrets bound through properties and never hardcoded in a bean method?
- [ ] Do adapter beans receive clients rather than static singletons, so a test can inject a double?
