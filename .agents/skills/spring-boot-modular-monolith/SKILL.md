---
name: spring-boot-modular-monolith
description: 'Use when defining Spring Modulith application modules, named interfaces, module events, package visibility, and the rules for extracting a module into its own service. Triggers include Spring Modulith, @ApplicationModule, @NamedInterface, ApplicationModules.of and verify, cyclic module dependency, shared kernel, common module dumping ground, module event publication versus a direct call, @ModulithTest, package private visibility, and when to split a microservice. Do not use for inner layer design, aggregate design, port definition, container packaging, or CI pipeline wiring. When other skills also apply, reconcile ownership before mutation.'
license: MIT
metadata:
  author: Walthergl66
  version: '1.0.0'
---

# Spring Modulith Modular Monolith

Structure the deployable as business modules with verified boundaries instead of a layered package tree, and keep the extraction option open by never letting two modules share a table. Spring Modulith detects the modules, verifies the dependency graph, and fails a test on a cycle or an undeclared access, which turns organised-by-feature from a convention into a build failure.

## When to use

- Deciding where the module boundary sits, or a cycle exists between packages, masked by `spring.main.allow-circular-references`.
- Two features share entities and constants, a `common` or `util` package is a dumping ground, or a module had to make its whole package public to expose one type.
- Deciding between a direct call and a module event, or whether a module is ready to become a service.

## When not to use

- Which ring a class belongs to belongs to `spring-boot-clean-architecture`; aggregate design to `spring-boot-ddd`.
- Port interfaces and adapter wiring belong to `spring-boot-hexagonal-architecture`.
- Container images and build output belong to `spring-boot-docker`; pipeline stages and promotion belong to `spring-boot-ci-cd`.

## Ownership and sibling boundaries

This skill owns module boundaries, their declared allowed dependencies, exposed named interfaces, module events, and the extraction gate.

- `spring-boot-clean-architecture` owns inner layer design. Hand it any question about a class inside a module.
- `spring-boot-ddd` owns aggregate design. Hand it what a module owns as data.
- `spring-boot-hexagonal-architecture` owns ports. Hand it a port between a module and an external system.
- `spring-boot-docker` owns packaging and `spring-boot-ci-cd` owns promotion. Hand them over once the extraction decision is made.

## What the verification actually checks

`ApplicationModules.of("com.example").verify()` throws `ModularityViolationException` for a cycle between modules and for a reference to a type not exposed by a named interface or a module event. It is a build-time and test-time check, not a runtime guard.

| Checked | Not checked |
| --- | --- |
| A cycle between two modules | Whether a module is the right size or cohesive |
| A direct access to a non-exposed internal type | Whether the SQL schema is shared |

Size, cohesion, and ownership remain human judgements. Verification prevents structural decay, not a wrong decomposition, and never checks whether the schema is shared.

## Module layout

```text
com.example.shop
├── OrderManagementApplication.java
├── orders/                # @ApplicationModule(allowedDependencies = {"inventory::api", "payments::api"})
│   ├── package-info.java  # module declaration
│   ├── api/               # @NamedInterface("api"), the only reachable package
│   │   └── OrderManagementService.java  OrderPlaced.java
│   └── internal/          # Order, OrderRepository, OrderController: package-private by default
├── inventory/             # package-info.java plus internal/ with StockLevel, ErpInventoryGateway
├── payments/              # package-info.java plus internal/ with PaymentAdapter
└── shared/                # only neutral, dependency-free types
```

An application module is a direct subpackage of the application root package, and its subpackages are internal unless a named interface exposes them. Set `spring.modulith.detection-strategy=explicitly-annotated` when the tree does not follow that shape.

## Exposing types with a named interface

```java
import org.springframework.modulith.ApplicationModule;

@ApplicationModule(
        displayName = "Order management",
        allowedDependencies = { "inventory::api", "payments::api" })
package com.example.shop.orders;
```

```java
import org.springframework.modulith.NamedInterface;

@NamedInterface("api")
package com.example.shop.orders.api;
```

`allowedDependencies` takes a module name, one named interface as `module::interface`, or `module::*` for every named interface of that module. Unlisted modules are unreachable, a module that declares none is isolated, and a declared dependency still needs a public named interface on the other side.

## Events instead of direct calls

| Need | Mechanism |
| --- | --- |
| The caller needs the result now, and a failure must abort the transaction | a direct call through an exposed named interface |
| The caller does not need the result, and the failure must not abort it | a module event |
| The event must survive a restart and be retried | the transactional event log of Spring Modulith with an externalised store |
| The event leaves the deployment | an outbox plus a broker, owned by the platform skill |

A module event hides the callee, which is also a way to hide a required dependency forever. If the caller cannot proceed without the result, call it directly.

## The shared-kernel trap

A `common` package accumulates because two modules need one type; then three need it, and it grows a `Utils` class. The code that should be most stable becomes most volatile.

| Request | Correct home |
| --- | --- |
| Two modules need a value object | duplicate it, or promote it to a deliberate shared kernel module with a versioned contract |
| Two modules need a technical helper | a neutral, dependency-free `shared` package |

Prefer duplication to a premature shared kernel: two copies that diverge cost less than one shared type that couples every module forever. A constant only one module uses belongs inside it.

## Test support

```java
@ModulithTest
class OrderManagementTests {

    @Test
    void placingAnOrderPublishesOrderPlaced(Scenario scenario) {
        scenario.stimulate(() -> orders.place(customerId(), List.of(line())))
                .andWaitForEventOfType(OrderPlaced.class)
                .toArriveAndVerify(event -> assertThat(event.orderId()).isNotNull());
    }
}
```

`@ModulithTest` boots one module plus its dependencies and verifies the boundaries on every run, so an undeclared access fails the build rather than a review. For blocking listener work, `spring.threads.virtual.enabled=true` is an option: it raises how many calls can wait at once, but not pool size, connection limits, or downstream timeouts.

## The extraction gate

Split a module into a service only when at least one of these is true, and name the owner. If none is true, keep the module: a codebase that merely feels large is not a reason.

| Signal | Question | Split if |
| --- | --- | --- |
| Deployment | must this capability ship on its own schedule | yes, per release |
| Ownership | does another team own it end to end | yes, per team |
| Scaling | is its load profile measurably different | yes, on a measured metric |
| Data | does it own data no other module writes | yes, and it takes its schema |
| Failure | must its unavailability not affect the rest | yes, if the coupling is real |

A module that shares a table cannot be extracted without a data migration, so shared tables are the strongest signal against splitting and schema ownership the strongest signal for it.

## Reference routing

| Task | Load |
| --- | --- |
| Write module annotations, run verification, review allowed dependencies | [module-boundaries.md](references/module-boundaries.md) |
| Choose events versus direct calls, handle transaction implications, use an outbox | [inter-module-collaboration.md](references/inter-module-collaboration.md) |
| Apply the extraction gate and run the migration to a real service | [extraction-to-services.md](references/extraction-to-services.md) |

## Expected response

- **Module map:** each module, its root package, the capability it owns, and the named interfaces it exposes.
- **Allowed dependencies:** the declared list per module, and the undeclared access failing today.
- **Collaboration:** per cross-module call, a direct call or an event, plus whether a failure aborts the publisher.
- **Shared kernel verdict:** what may stay in `common`, and what must be duplicated or moved.
- **Extraction verdict:** which gate signals are met, and the migration sequence.
