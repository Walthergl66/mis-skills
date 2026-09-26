# Adoption And Review

Load this when planning a move from a flat annotated service layout to layered packages, or when reviewing an existing layout and reporting findings.

## Never rewrite, move slices

A rewrite loses behaviour, produces a branch nobody merges, and ends with two models of the truth. Move one vertical slice, keep it green, then move the next.

| Step | Change | Test that proves it | Rollback cost |
| --- | --- | --- | --- |
| 1. Characterise | Add tests around current service behaviour | New unit tests pass before any move | none |
| 2. Freeze | ArchUnit rule that logs violations | New rule, no failures | delete the rule |
| 3. Edge | Move controllers and request and response records | `MockMvc` slice test, unchanged | move files back |
| 4. Session | `open-in-view: false` plus explicit mapping | Full integration test against Testcontainers | revert one property |
| 5. Boundary | Declare ports inward, adapter implements them | Adapter unit test with a mocked Spring Data repository | re-export the old interface |
| 6. Intent | Hoist `@Transactional` to use case entry points | Existing transactional tests still pass | remove the annotation |
| 7. Domain | Extract rules into `domain` classes | Pure unit tests with no Spring | keep the old method delegating |
| 8. Enforce | Flip the ArchUnit rule to failure | Build fails on a new violation | remove the rule |

Steps 3 and 5 are the highest value per unit of risk: they create a seam without moving any behaviour.

## Characterisation tests first

Write them against the current code, without changing it.

```java
package com.example.ordering.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@Transactional
class OrderServiceCharacterisationTest {

    @Autowired
    private OrderService orderService;

    @Test
    void cancellingAPlacedOrderMarksItCancelled() {
        UUID id = UUID.randomUUID();
        orderService.place(id, UUID.randomUUID(), List.of(line("SKU-1", "2", "10.00")));

        orderService.cancel(id);

        assertThat(orderService.statusOf(id)).isEqualTo("CANCELLED");
    }

    @Test
    void cancellingAShippedOrderIsRejected() {
        UUID id = UUID.randomUUID();
        orderService.place(id, UUID.randomUUID(), List.of(line("SKU-1", "1", "10.00")));
        orderService.ship(id);

        assertThatThrownBy(() -> orderService.cancel(id))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("cannot cancel");
    }

    private static OrderService.OrderLine line(String sku, String quantity, String unitPrice) {
        return new OrderService.OrderLine(sku, new BigDecimal(quantity), new BigDecimal(unitPrice));
    }
}
```

Write the assertion you want to preserve, not the assertion the code should have. A characterisation test that documents a bug is valuable: it marks the exact point where behaviour changes on purpose.

## The migration, slice by slice

Pick one aggregate or one endpoint. Do not start with the one with the most callers.

```text
slice: POST /api/orders/{id}/cancellation
 1  add OrderCannotBeCancelledException in domain, still thrown from OrderService
 2  add OrderRowMapper for orders, write a test proving round trip equality
 3  change OrderService to load Order via the mapper, keep the same signature
 4  declare OrderRepository in domain, make JpaOrderRepository implement it
 5  move the controller into adapter.in.web, keep the URL and status codes
 6  extract PlaceOrderCommand as a record with jakarta.validation constraints
 7  enable the ArchUnit rule for this package only
```

Order matters: exceptions first, then mapping, then ports, then transport. Each step is behaviour-preserving and independently revertible.

## Review checklist

Run this in order. Stop at the first hard failure and report it with the file and line.

### Structure

- [ ] Does any file under `domain` import `org.springframework`, `jakarta.persistence`, or `jakarta.servlet`?
- [ ] Do all `@RestController` methods contain arithmetic, branching, or entity mutation?
- [ ] Does any `@Service` in `application` reference a class from `adapter`?
- [ ] Are `@Transactional` annotations present anywhere except use case entry points?
- [ ] Is `spring.jpa.open-in-view` disabled in every profile?

### Boundaries

- [ ] Is every interface the application depends on declared inward, not in the adapter package?
- [ ] Does any adapter reach into another adapter to reuse its logic instead of a port?
- [ ] Is `config` free of business decisions, or does it contain an `if` on a domain state?
- [ ] Are `@EntityScan` and `@EnableJpaRepositories` pointed at the adapter package?

### Data and transactions

- [ ] Does a transaction span an outbound HTTP call, a file write, or a broker round trip?
- [ ] Can a use case write two aggregates in one transaction where a consistency rule forbids it?
- [ ] Are bulk updates and deletes using `@Modifying` with a clear-modification strategy, or re-reading rows one by one?
- [ ] Is optimistic locking present where concurrent writes are possible?

### Judgement

- [ ] Does the domain ring contain any class that is only a data holder with no rule?
- [ ] Does an interface exist with exactly one implementation, one method, and no test seam need?
- [ ] Is any layer created only to match a diagram, with no requirement forcing it?
- [ ] Could this be three packages instead of four without losing a boundary that matters?

The last box is the important one. A finding is only worth reporting when the remedy does not cost more than the violation.

## Severity model

| Severity | Criteria | Example |
| --- | --- | --- |
| High | A correctness or data integrity risk | Transaction spans a broker publish with no outbox, so a publish failure leaves state and message inconsistent |
| High | A rule is enforced in only one code path | Discount rule in the controller, so a second entry point skips it |
| Medium | A boundary that will break under change | Domain repository interface extends `JpaRepository`, so a JPA upgrade reaches the domain |
| Medium | Testability loss forced by structure | Domain test needs `@SpringBootTest` because a rule reads a repository |
| Low | Convention drift with no present harm | Adapter class named `OrderRepositoryImpl` |
| Informational | Optional improvement | A `Specification` could replace a JPQL string, but the current query is correct |

Do not report a High severity for a style preference. A reviewer who cannot distinguish the two stops reading.

## Evidence format for each finding

```text
severity:    High | Medium | Low | Informational
location:    com.example.ordering.service.OrderService:42
violation:   @Transactional on a method that also calls the payment vendor
impact:      a slow or failing vendor call holds a database row lock for the full timeout
remedy:      move @Transactional to PlaceOrderService, write the intent to the outbox table
validation:  a test that fails the vendor call and asserts the order row is already committed
```

## Signals that the layering is working

- A new use case needs no new infrastructure class, only a new adapter for the new edge.
- Domain unit tests run in milliseconds with no Spring context and no database.
- Renaming a column touches one mapper and one Flyway migration, nothing in `domain`.
- Adding a second payment provider adds one adapter class and one property, and touches no use case.
- A reviewer can tell which ring a class belongs to from its package name alone.
