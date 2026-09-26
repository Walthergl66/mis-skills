# Module Boundaries

Load this when writing module annotations, running the verification test, or reviewing which dependencies between modules are allowed.

## Dependencies

| Artifact | Purpose |
| --- | --- |
| `spring-modulith-starter-core` | module detection, verification, documentation |
| `spring-modulith-events-api` and `spring-modulith-events-core` | transactional event publication registry |
| `spring-modulith-events-jdbc` or `spring-modulith-events-jpa` | durable event publication registry |
| `spring-modulith-starter-jdbc`, `spring-modulith-starter-jpa` | per-module persistence, schema ownership |
| `spring-modulith-test` | `@ModulithTest` and the `Scenario` API |
| `spring-modulith-docs` | the `Documenter` API for generated diagrams |
| `spring-modulith-runtime` | runtime bootstrap of `ApplicationModules` for the actuator |
| `spring-modulith-actuator` | exposes the detected structure to Actuator |

## Declaring a module

```java
import org.springframework.modulith.ApplicationModule;

@ApplicationModule(
        displayName = "Order management",
        allowedDependencies = { "inventory::api", "payments::api" })
package com.example.shop.orders;
```

`@ApplicationModule` is a package annotation, and `package-info.java` is the convention. The default detection strategy treats every direct subpackage of the application package as a module; set `spring.modulith.detection-strategy=explicitly-annotated` when the tree does not follow that shape. `@ApplicationModule(type = ApplicationModule.Type.OPEN)` exposes all types of a module and is a migration aid for a legacy tree, not a target state.

| `allowedDependencies` value | Meaning | Use |
| --- | --- | --- |
| omitted or `{}` | this module may depend on nothing | leaf module, the safest default |
| `"inventory"` | the whole inventory module | only if you accept coupling to its internals through the model |
| `"inventory::api"` | one named interface of that module | the normal choice |
| `"order::*"` | every named interface of that module | a migration step, never a final state |

## Exposing a named interface

```java
import org.springframework.modulith.NamedInterface;

@NamedInterface("api")
package com.example.shop.orders.api;
```

Types in a named-interface package are reachable from other modules. Types in any other package of the module are internal: another module referencing them fails verification with `ModularityViolationException`.

The exposed surface should be the smallest set that makes the module usable: one facade interface per use case group, the event records it publishes, and the value objects those signatures need.

## Running the verification

```java
package com.example.shop;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;
import org.springframework.modulith.docs.Documenter;

class ModularityTests {

    private final ApplicationModules modules = ApplicationModules.of("com.example.shop");

    @Test
    void verifiesModularity() {
        modules.verify();
    }

    @Test
    void documentsModules() {
        new Documenter(modules).writeModulesAsPlantUml();
    }

    @Test
    void listsViolations() {
        modules.detectViolations().getMessages().forEach(System.out::println);
    }
}
```

`verify()` runs each check once per instance and throws `ModularityViolationException` on the first failure. `detectViolations()` always re-runs and returns a `Violations` value, which is what a test that reports rather than fails should use.

The documentation call is optional but worth wiring into a test: a generated PlantUML diagram in a pull request makes an accidental new dependency visible in review.

## Allowed dependency matrix

| From | To `orders` | To `inventory` | To `payments` | To `shared` |
| --- | --- | --- | --- | --- |
| `orders` | allowed | `inventory::api` | `payments::api` | allowed |
| `inventory` | not allowed | allowed | not allowed | allowed |
| `payments` | not allowed | not allowed | allowed | allowed |
| `shared` | not allowed | not allowed | not allowed | allowed |

The matrix is the design document. A row that must be widened is a coupling decision, and a column that must be widened is a shared kernel forming.

## Testing one module

```java
package com.example.shop.orders;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.modulith.test.ModulithTest;
import org.springframework.modulith.test.Scenario;

@ModulithTest
class OrderManagementTests {

    private final OrderManagementService orders;

    OrderManagementTests(OrderManagementService orders) {
        this.orders = orders;
    }

    @Test
    void placingAnOrderPublishesOrderPlaced(Scenario scenario) {
        scenario.stimulate(() -> orders.place(customerId(), List.of(line())))
                .andWaitForEventOfType(OrderPlaced.class)
                .toArriveAndVerify(event -> assertThat(event.orderId()).isNotNull());
    }
}
```

`Scenario` starts with `stimulate` or `publish` and ends with a verification: `andWaitForEventOfType(...).toArriveAndVerify(...)` for an event, or `andWaitForStateChange(...).andVerify(...)` for a state read from a component. A `Scenario` can also be a JUnit method parameter, as above.

`@ModulithTest` boots the module under test plus the modules it is allowed to depend on, so an illegal dependency surfaces as a context startup failure rather than as a silent success.

## What verification does not catch

| Gap | Consequence | Detection |
| --- | --- | --- |
| Two modules writing the same table | a split becomes a data migration | schema review, ownership table |
| A module reading another module through SQL | boundaries pass, coupling stays | no direct cross-module table access in review |
| A `shared` type that imports a module type | the shared kernel is no longer neutral | an ArchUnit rule for `shared` |
| A module that is too large | verification passes anyway | cohesion review, change frequency |
| A cycle broken by a Spring event at runtime | the compile-time graph is acyclic but the runtime graph is not | event review |

## Fixing a cycle

```text
cycle: orders -> inventory -> orders
1  move the shared concept both need into a value object in each module, or into a neutral shared kernel
2  if the dependency is real and one-directional, delete the other edge and use a module event
3  if both directions are real, the two modules are one module: merge them
4  never solve it with spring.main.allow-circular-references=true or @Lazy on a constructor
```

Step 4 hides a design problem until runtime, keeps the compile-time graph dishonest, and makes the failure appear under load rather than in a test.
