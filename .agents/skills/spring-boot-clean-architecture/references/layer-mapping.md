# Ring To Package Mapping

Load this when translating the four rings into a Spring Boot package tree, writing the import rules, or adding an architecture test that fails on a violation.

## The annotated package tree

```text
com.example.ordering
├── OrderingApplication.java            # composition root, @SpringBootApplication
├── config/
│   ├── PersistenceConfig.java           # @EnableJpaRepositories, @EntityScan, @EnableTransactionManagement
│   ├── JpaAuditingConfig.java
│   └── ClockConfig.java                 # Clock bean so use cases stay testable
├── domain/                              # ring 1
│   ├── Order.java                       # aggregate root, no framework imports
│   ├── OrderLine.java  OrderId.java  Money.java  OrderStatus.java
│   ├── InvalidOrderTransitionException.java
│   └── OrderRepository.java             # port declared inward, plain interface
├── application/                         # ring 2
│   ├── PlaceOrderUseCase.java  CancelOrderUseCase.java
│   ├── PlaceOrderCommand.java           # record, jakarta.validation allowed
│   └── OrderEvents.java                 # domain event records, no Spring types
├── adapter/
│   ├── in/web/
│   │   ├── OrderController.java  OrderExceptionHandler.java
│   │   └── PlaceOrderRequest.java  OrderResponse.java
│   └── out/
│       ├── persistence/
│       │   ├── OrderRow.java            # @Entity, adapter-local
│       │   ├── OrderRowMapper.java      # row to domain, no logic
│       │   ├── JpaOrderRepository.java  # implements domain.OrderRepository
│       │   └── OrderSpecifications.java
│       ├── payment/                     # StripePaymentGateway, implements a port
│       └── inventory/                   # ErpInventoryGateway, implements a port
└── shared/
    ├── PageResponse.java                # neutral generic, not business rules
    └── MoneyJson.java                   # Jackson adapter for the value object
```

A package named `domain` may not import anything outside `java.*`. `application` may import `domain`. `adapter` may import both. `config` may import everything. `shared` may import nothing from `domain`; if it needs a domain type, that type belongs in the adapter that needs it.

## Import rules as a table

| Package | Allowed imports | Forbidden imports | ArchUnit rule name |
| --- | --- | --- | --- |
| `..domain..` | `java..` | everything else | `domainIsFrameworkFree` |
| `..application..` | `..domain..`, `java..`, `jakarta.validation..` | `..adapter..`, `org.springframework..`, `jakarta.persistence..` | `applicationDoesNotKnowAdapters` |
| `..adapter..` | `..application..`, `..domain..`, `org.springframework..`, `jakarta..` | nothing forbidden | no rule |
| `..config..` | everything | nothing forbidden | no rule |
| `..shared..` | `java..`, `jakarta.validation..` | `..domain..`, `..adapter..` | `sharedStaysNeutral` |

## The architecture test

```java
package com.example.ordering.architecture;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

class LayeringTest {

    private static JavaClasses classes;

    @BeforeAll
    static void importClasses() {
        classes = new ClassFileImporter().importPackages("com.example.ordering");
    }

    @Test
    void domainIsFrameworkFree() {
        ArchRule rule = noClasses()
                .that().resideInAPackage("..domain..")
                .should().dependOnClassesThat()
                .resideInAnyPackage("org.springframework..", "jakarta.persistence..",
                        "jakarta.servlet..", "jakarta.validation..")
                .because("the domain ring must be plain Java");
        rule.check(classes);
    }

    @Test
    void applicationDoesNotKnowAdapters() {
        ArchRule rule = noClasses()
                .that().resideInAPackage("..application..")
                .should().dependOnClassesThat().resideInAPackage("..adapter..")
                .because("a use case cannot depend on an outer ring");
        rule.check(classes);
    }
}
```

It runs as a plain unit test with no Spring context, so it stays fast and fails on the structural level rather than at runtime.

## Mapping the domain to a database

The domain class is not the table. The adapter owns both shapes and the translation.

```java
package com.example.ordering.adapter.out.persistence;

import com.example.ordering.domain.Money;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "orders")
class OrderRow {

    @Id
    private UUID id;

    @Column(name = "customer_id", nullable = false)
    private UUID customerId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 32)
    private OrderRowStatus status;

    @Column(name = "total_amount", nullable = false, precision = 19, scale = 2)
    private BigDecimal totalAmount;

    @Column(name = "currency", nullable = false, length = 3)
    private String currency;

    protected OrderRow() {
    }

    OrderRow(UUID id, UUID customerId, OrderRowStatus status, Money total) {
        this.id = id;
        this.customerId = customerId;
        this.status = status;
        this.totalAmount = total.amount();
        this.currency = total.currency();
    }

    UUID id() {
        return id;
    }
}
```

The mapper is the only place both shapes appear together:

```java
package com.example.ordering.adapter.out.persistence;

import com.example.ordering.domain.Money;
import com.example.ordering.domain.Order;
import com.example.ordering.domain.OrderId;

final class OrderRowMapper {

    private OrderRowMapper() {
    }

    static OrderRow toRow(Order order) {
        return new OrderRow(order.id().value(), order.customerId().value(),
                OrderRowStatus.valueOf(order.status().name()), order.total());
    }

    static Order toDomain(OrderRow row) {
        return Order.restore(new OrderId(row.id()),
                new Money(row.totalAmount(), row.currency()));
    }
}
```

`Order.restore` rehydrates a stored aggregate and skips the validation `place` performs, because a stored order was already valid once. Keep it domain-owned and named so the intent is obvious in review.

## Naming conventions that reduce review noise

| Concept | Name | Never name it |
| --- | --- | --- |
| Persistence model | `OrderRow` | `OrderEntity`, `OrderDO` |
| Port | `OrderRepository`, `PaymentGateway` | `OrderDao`, `IOrderService` |
| Adapter implementation | `JpaOrderRepository` | `OrderRepositoryImpl` |
| Use case | `PlaceOrderUseCase` | `OrderService`, `OrderManager` |
| Rehydration factory | `Order.restore(...)` | `Order.setState(...)` |
| Domain event | `OrderPlaced` | `OrderPlacedEventDTO` |

The naming rule is a boundary detector: if a domain type is called `Entity`, `Dao`, or `DTO`, it has probably leaked a ring.

## Decision table for a new class

| The class... | Belongs in | Because |
| --- | --- | --- |
| validates one payload field | `adapter.in.web` request record | transport shape, not a rule |
| decides whether an order may be cancelled | `domain` | holds regardless of delivery |
| orchestrates save then publish then return | `application` | use case flow |
| maps a `ResultSet` to a domain object | `adapter.out.persistence` | format translation |
| decides which retry policy a vendor uses | `adapter.out.vendor` | infrastructure policy |
| is used by three modules for formatting only | `shared` | neutral utility |

If two rows could apply, choose the one further inward and accept the extra adapter code. Outward placement leaks policy inward; inward placement costs one mapping class.
