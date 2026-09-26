# Ports And Adapters Catalogue

Load this when deciding which interfaces deserve to exist, naming them, or writing the anti-corruption layer around a vendor SDK.

## Port naming

A port is named after the capability the application needs, in the application language, from the point of view of the caller. Not after the vendor, not after the database table, not after the HTTP method.

| Bad name | Why | Better name |
| --- | --- | --- |
| `StripeService` | Names the vendor, so swapping it is a rename everywhere | `PaymentGateway` |
| `OrdersJpaRepository` | Leaks the adapter technology into the port | `OrderRepository` |
| `RestTemplateWrapper` | Names the mechanism, not the capability | `NotificationSender` |
| `DataAccess` | Says nothing about which business capability | `InventoryAvailability` |
| `OrderPort` | Mechanical suffix, no meaning | `OrderCancellation` |
| `IOrderService` | Hungarian prefix, not a capability | `OrderCancellation` |

## A port catalogue for one use case

| Capability needed | Port | Operations | Adapter in `adapter.out` | Volatility |
| --- | --- | --- | --- | --- |
| Charge a customer | `PaymentGateway` | `charge`, `refund` | `StripePaymentGateway` | high, vendor API |
| Read live stock | `InventoryAvailability` | `availableQuantity` | `ErpInventoryGateway` | high, ERP and network |
| Send a message | `NotificationSender` | `send` | `EmailNotificationSender` | medium |
| Store the aggregate | `OrderRepository` | `save`, `findById` | `JpaOrderRepository` | low, but expensive to test |
| Generate a document | `InvoiceDocumentFactory` | `render` | `PdfInvoiceDocumentFactory` | low |

Read it as a table of volatility, not a table of abstraction. A port for a low-volatility, logic-free capability is usually ceremony.

## Port signature rules

```java
package com.example.ordering.application.port;

import com.example.ordering.domain.Money;
import com.example.ordering.domain.OrderId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface OrderRepository {

    void save(Order order);

    Optional<Order> findById(OrderId id);

    List<Order> findByCustomer(UUID customerId);

    boolean existsByReference(String reference);
}
```

- Return domain types, never rows, DTOs, `Page`, or `Specification`.
- Take domain types or value objects, never `Map<String, Object>` and never a request record the HTTP layer built.
- Use `Optional` for a single lookup that may be absent; return an empty list, never null, for a collection.
- Keep synchronous methods on the port. Asynchrony is a delivery decision for the application layer, not for the port.
- Do not return `void` from a command that has an observable outcome; return the outcome or the identifier.

## Why interface-per-use-case is noise

```java
package com.example.ordering.application;

public interface PlaceOrderService {
    OrderPlacedResult place(PlaceOrderCommand command);
}
```

Adding `CancelOrderService.cancel(UUID orderId)` and `ShipOrderService.ship(UUID orderId)` in the same shape is the same design as three concrete classes with a Spring stereotype, plus three extra files, plus a Mockito mock per test that can drift from the real behaviour. It adds no seam, because the seam that matters is at the edge, not at the use case.

Make a use case an interface only when you genuinely intend to substitute it wholesale, for example in a multi-tenant variant resolved at runtime:

```java
package com.example.ordering.application;

public interface OrderEntryPoint {
    OrderPlacedResult place(PlaceOrderCommand command);
}
```

Then bind two implementations by qualifier and document why.

## Anti-corruption layer, complete

The port is the translation target. Every vendor concept stops at the adapter.

```java
package com.example.ordering.application.port;

import com.example.ordering.domain.Money;
import com.example.ordering.domain.OrderId;

public interface PaymentGateway {

    PaymentOutcome capture(OrderId orderId, Money amount);

    RefundOutcome refund(OrderId orderId, Money amount, String vendorReference);

    enum PaymentOutcome { CAPTURED, DECLINED, REQUIRES_ACTION }

    enum RefundOutcome { REFUNDED, NOT_FOUND, REJECTED }
}
```

```java
package com.example.ordering.adapter.out.payment;

import com.example.ordering.application.PaymentProviderUnavailableException;
import com.example.ordering.application.port.PaymentGateway;
import com.example.ordering.domain.Money;
import com.example.ordering.domain.OrderId;
import java.util.Locale;
import vendor.sdk.ChargeRequest;
import vendor.sdk.ChargeResult;
import vendor.sdk.RefundResult;
import vendor.sdk.StripeClient;
import vendor.sdk.StripeException;

public final class StripePaymentGateway implements PaymentGateway {
    private final StripeClient client;

    public StripePaymentGateway(StripeClient client) {
        this.client = client;
    }

    @Override
    public PaymentOutcome capture(OrderId orderId, Money amount) {
        try {
            ChargeResult result = client.charge(new ChargeRequest(
                    orderId.value().toString(),
                    amount.amount().movePointRight(2).longValueExact(),
                    amount.currency().getCurrencyCode().toLowerCase(Locale.ROOT)));
            return switch (result.status()) {
                case "succeeded" -> PaymentOutcome.CAPTURED;
                case "requires_action" -> PaymentOutcome.REQUIRES_ACTION;
                default -> PaymentOutcome.DECLINED;
            };
        } catch (StripeException failure) {
            throw new PaymentProviderUnavailableException(orderId, failure.getMessage(), failure);
        }
    }

    @Override
    public RefundOutcome refund(OrderId orderId, Money amount, String vendorReference) {
        RefundResult result = client.refund(vendorReference,
                amount.amount().movePointRight(2).longValueExact());
        return "refunded".equals(result.status()) ? RefundOutcome.REFUNDED : RefundOutcome.REJECTED;
    }
}
```

| Vendor concept | Application meaning | Handling |
| --- | --- | --- |
| Integer minor units | `Money` with a currency | convert in the adapter, never in the use case |
| `requires_action` status | a 3DS step the caller must perform | map to `REQUIRES_ACTION`, keep the vendor URL inside the adapter |
| `StripeException` with a transient cause | provider unavailable | translate to an application exception so no use case catches a vendor type |
| Webhook event stream | a fact that already happened | consume in a separate adapter, not inside the capture call |
| Idempotency key convention | a caller-supplied stable key | expose it in the port signature, generate it in the use case |

## Persistence as an adapter, briefly

The repository port is the same pattern with low volatility. Declare it in the domain, implement it with Spring Data in the adapter, and return domain objects. Its one special property is that it is the only port whose absence costs a real test, which is why it exists even though the database is unlikely to change.

## Anti-corruption versus layering

| Concern | Question | Owner |
| --- | --- | --- |
| Layering | which ring does this class live in | `spring-boot-clean-architecture` |
| Anti-corruption | which foreign model stops here | this skill |
| Aggregate design | what the returned object guarantees | `spring-boot-ddd` |

An anti-corruption layer without a port is just a wrapper class. A port without an anti-corruption layer leaks the foreign model anyway.

## Failure mapping table

| Adapter failure | Surface to the application as | Do not |
| --- | --- | --- |
| Connection refused, 5xx, timeout | `PaymentProviderUnavailableException`, retriable | retry inside the adapter without a policy |
| 4xx validation error | a declined or rejected outcome, not an exception | throw a raw vendor exception |
| Malformed response | a permanent failure, alert-worthy | return a default value |
| Local invariant violated before the call | a domain exception from the use case | call the vendor at all |
