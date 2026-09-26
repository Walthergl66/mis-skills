# Spring Boot Skill Architecture

The Spring Boot capability in this repository is organized as one skill per node of the tree below. The tree is expressed in skill names, not in folders, because `.agents/skills/<skill-name>/SKILL.md` is flat by contract and `validate`, `inventory`, and `sync` only read one level.

```txt
Spring Boot
├── Architecture
│   ├── Clean Architecture          spring-boot-clean-architecture
│   ├── Hexagonal Architecture      spring-boot-hexagonal-architecture
│   ├── DDD                         spring-boot-ddd
│   └── Modular Monolith            spring-boot-modular-monolith
│
├── Spring
│   ├── Spring Boot                 spring-boot-core
│   ├── Spring MVC                  spring-boot-mvc
│   ├── Spring Data JPA             spring-boot-data-jpa
│   ├── Spring Security             spring-boot-security
│   └── Spring Validation           spring-boot-validation
│
├── Database
│   ├── PostgreSQL                  spring-boot-postgresql
│   ├── Hibernate                   spring-boot-hibernate
│   ├── Flyway                      spring-boot-flyway
│   └── Query optimization          spring-boot-query-optimization
│
├── API
│   ├── REST                        spring-boot-rest-api
│   ├── OpenAPI                     spring-boot-openapi
│   ├── DTO                         spring-boot-dto
│   └── API versioning              spring-boot-api-versioning
│
├── Testing
│   ├── JUnit                       spring-boot-junit
│   ├── Mockito                     spring-boot-mockito
│   ├── Testcontainers              spring-boot-testcontainers
│   └── Integration testing         spring-boot-integration-testing
│
└── Production
    ├── Docker                      spring-boot-docker
    ├── Observability               spring-boot-observability
    ├── Logging                     spring-boot-logging
    ├── Actuator                    spring-boot-actuator
    └── CI/CD                       spring-boot-ci-cd
```

## Entry point

`skill-router` is the orchestrator. It runs first on any request that does not name a skill, resolves it to one primary plus at most two supporting skills, and then hands off.

- `references/catalog.md` in `skill-router` lists every skill with the decision it owns.
- `references/spring-boot-routing.md` in `skill-router` contains the symptom to owner tree and the frequently paired sequences for these 26 skills.

Direct invocation still works: ask for `spring-boot-flyway` and that skill loads without routing.

## Ownership rules inside the family

Every skill declares ownership in its `Ownership and sibling boundaries` section. The rules that keep the 26 skills from overlapping:

1. **One decision, one owner.** Architecture skills decide structure, framework skills execute inside it, data skills decide what the database does, testing skills decide how behavior is proven, production skills decide how it runs and ships.
2. **Structure before mechanism.** A request about where a class belongs is a `clean-architecture` question even when it mentions a Hibernate annotation.
3. **Contract before payload.** `rest-api` owns the envelope, `dto` owns the fields inside it, `validation` owns the constraints on the input, `openapi` documents the result.
4. **Diagnosis before remedy.** `query-optimization` and `observability` produce evidence; `postgresql` and `hibernate` then own the mechanism the evidence points to.
5. **Proof belongs to the layer.** `integration-testing` picks the test layer, `junit` owns the mechanics inside it, `mockito` owns the doubles, `testcontainers` owns the real dependency.

## Conventions for this family

- Target stack: Java 21, Spring Boot 3.5.x, Spring Framework 6.2, Spring Security 6, Spring Data JPA 3, Hibernate ORM 6.6, Flyway 11, PostgreSQL 16, Jakarta EE 10 namespaces.
- Frontmatter is `name`, single-quoted trigger-rich `description`, `license`, and `metadata` with `author` and `version`.
- Every description names a positive scope, a negative scope, and closes with the conflict-guard sentence, and must stay unique across the repository.
- Each skill ships 2 to 3 `references/*.md` files for depth and an `evals/evals.json` with 4 to 6 checkable cases.
- Sibling names appear in backticks and must resolve to an installed skill.

## Adding a node

1. Create `.agents/skills/spring-boot-<node>/SKILL.md` following the section order used by the family.
2. Declare ownership and the handoffs with the adjacent nodes in the same branch.
3. Add the skill to the catalog, the symptom table, and the sequences inside `skill-router`.
4. Run `npm run validate`, `npm run inventory`, and `npm run sync -- package opencode`.
