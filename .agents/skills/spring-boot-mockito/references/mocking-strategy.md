# Mocking Strategy and Anti-Patterns

Load this when deciding what a test should replace, when a test has become a pile of stubs, or when a suite passes while the production wiring is broken.

## The honesty test

A double is honest when the behavior it hides is not what the test claims to prove. Apply the question in this order and stop at the first yes.

1. Is the behavior under test a decision made by the collaborator? Then do not replace it.
2. Do I own the collaborator type? If yes, prefer a fake over a mock.
3. Does the collaborator talk SQL, a wire protocol, or a broker? If yes, a mock is a lie about semantics and a real dependency is required.
4. Do I own the value type being exchanged? Then build the real object.
5. Only now: is this a vendor SDK or an outbound client I do not own? Then a mock is appropriate.

## Decision table

| Situation | Choose | Failure mode if you choose otherwise |
| --- | --- | --- |
| Domain rule, calculation, state machine | Real object built in the test | The rule is never executed |
| Value object or record used as a fixture | Real instance | A mocked value object returns defaults that make the assertion meaningless |
| Application owned port with branching logic | Hand-written fake | The fake is the thing under test, and it is untested |
| Application owned port with trivial delegation | Mock is acceptable | None, but a fake is usually the same effort |
| Spring Data repository, and the query is the claim | Real repository on a container | Derived query names, fetch plans, and constraints stay unproven |
| Spring Data repository, and the query is incidental | Fake repository seeded with the rows the test needs | Mock argument matching grows with every call |
| `RestClient` or `RestTemplate` outbound | `MockRestServiceServer` or a stubbed WireMock call | Serialization, headers, and status mapping are never exercised |
| Message broker producer | Fake port with a recorded list | Serialization, partitioning, and transaction boundaries stay unproven |
| Message broker consumer, redelivery or offset behavior | Real container | The behavior cannot be simulated honestly |
| File system, clock, random source | Inject the abstraction and pass a test implementation | Tests become order and time dependent |
| The class under test itself | Never | A test that verifies a mock of itself passes forever |
| Framework internals such as `EntityManager` | Never in a unit test | The test asserts on the framework, not on the application |

## Test double smells by collaborator type

| Collaborator | Smell | Repair |
| --- | --- | --- |
| Repository | `when(repo.findById(any())).thenReturn(order)` in a test about a service rule | Seed a fake repository with the rows the rule needs |
| HTTP client | `given(client.exchange(any())).willReturn(response)` | Assert the recorded request URI, headers, and body, not only the status |
| Message publisher | `verify(publisher).publish(any())` as the only assertion | Assert the published payload fields the consumer depends on |
| Clock | `mockStatic(Clock.class)` inside a `@SpringBootTest` | Inject `Clock` as a bean and supply a fixed test bean |
| Configuration properties | Mocking `@ConfigurationProperties` when the claim is binding | Bind a real record from a test property source |

## The mock-count smell

Count the doubles in a test. The thresholds below are signals to redesign, not budgets.

| Doubles in one test | Reading | Action |
| --- | --- | --- |
| 0 to 1 | Healthy | None |
| 2 to 3 | Acceptable when the collaborators are external clients | None |
| 4 or more | The subject is doing orchestration the test cannot see | Extract a port and write a fake, or move the test to a slice |
| More doubles than assertions | The test asserts the mocks | Delete it and assert the outcome instead |

## Anti-patterns and repairs

| Anti-pattern | Why it fails | Repair |
| --- | --- | --- |
| Mocking the repository to test a query | The test passes while the query throws at runtime | Real repository in a container test |
| `when(x.f(any())).thenReturn(...)` inside a loop | Order dependent stubs; the last one wins | Move the stub into the test that needs it, or use a fake with a rule |
| `doReturn` on a plain mock | Hides that the real method was never called | Use `when` unless the type is a spy or partial mock |
| `RETURNS_DEEP_STUBS` on a domain type | Every unstubbed call silently returns a mock | Stub explicitly or return a real object |
| `lenient()` on a shared `setUp` | Hides that production code stopped calling the collaborator | Delete the unused stub and fix the test |
| `verifyNoMoreInteractions` on a subject with logging | Fails when a log line is added | Assert the outcome; verify only the boundary call |
| Verifying private methods | Couples the test to structure | Extract a collaborator and verify that |
| Argument matcher mixed with a raw value | Matches nothing and fails with a confusing message | All arguments use a matcher, or none do |
| A mock with 30 stubs reused by ten tests | One change breaks unrelated tests | A fake with a default, overridden per test |
| Mocking `Optional`, `List`, or `Stream` | Collection behavior is the JDK contract | Use `Optional.of`, `List.of`, and a real stream |
| Mocking `Clock.systemUTC()` statically when a constructor accepts a `Clock` | Thread-bound static state, breaks under parallel execution | Inject `Clock.fixed` |
| `@SpyBean` on a first-party service | Spies call real code, so the test asserts on a half-real path | Assert the outcome on the real service with a fake collaborator |
| A mock for a port that has one implementation and no branching | Cost with no payoff | Use the real implementation |

## Where the seam should live

| Layer | Testable seam | Owner |
| --- | --- | --- |
| Adapter port | Interface owned by the application, implemented by an adapter | `spring-boot-hexagonal-architecture` |
| Application service | Pure functions plus ports; constructor injected collaborators | `spring-boot-mockito` for the doubles |
| Domain | No framework types at all, therefore no doubles needed | Domain modeling skill |
| Persistence adapter | A real database, not a mock of `EntityManager` | `spring-boot-testcontainers` |
| Inbound adapter | A slice test with a mocked application port | `spring-boot-integration-testing` |

A double that requires `import org.springframework` in order to work is no longer a double; it is a wired bean. Keep fakes framework-free.

## Migration from the deprecated overrides

| Deprecated in Boot 3.4 | Replacement | Behavior change to check |
| --- | --- | --- |
| `@MockBean` | `@MockitoBean` | Field, type, and method targets stay; package changes |
| `@MockBean(name = "x")` | `@MockitoBean(name = "x")` | Bean name qualifier semantics stay |
| `@SpyBean` | `@MockitoSpyBean` | The spy now wraps the fully initialized bean |
| `@MockBean(reset = MockReset.NONE)` | `@MockitoBean(reset = MockReset.NONE)` | State leaks between methods by design; assert that explicitly |
| `@MockBean(answer = ...)` | `@MockitoBean` with explicit stubbing, or `@MockitoSettings` on the test | A class wide answer is usually a hidden shared default |

`@MockBean` and `@SpyBean` also resolved the class to mock from the field type and, for an interface, looked for a single candidate in the context. `@MockitoBean` resolves the type from the field declaration, so an interface with several candidates needs `name` or an explicit `classes` attribute.

## Removing a mock

Use this sequence when a mock is proven to be hiding real behavior.

1. Delete the double and run the test. Record the exact failure: `NoSuchBeanDefinitionException`, a null dereference, or a wrong value.
2. If the failure is a missing bean, decide whether the collaborator is genuinely required or is an unnecessary constructor argument.
3. If it is required, decide whether the test can use the real implementation with a short-lived real resource.
4. If a real resource is too expensive for this layer, keep the double but move the behavior that matters into a separate integration test.
5. Never return to the previous state without a test that fails when the real dependency breaks.

## Handoff

Override wiring, matchers, captors, spies, and static mocking are in [mockito-mechanics.md](mockito-mechanics.md). Test class structure and naming are owned by `spring-boot-junit`. Layer selection and slice configuration are owned by `spring-boot-integration-testing`. Real dependency provisioning and per-class isolation are owned by `spring-boot-testcontainers`.
