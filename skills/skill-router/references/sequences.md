# Routing Sequences

Worked routes for recurring requests. Each line is a decision owner, in order. Load the primary first and add the others only when they own a decision the primary cannot make alone.

## Software delivery

| Request | Route |
| --- | --- |
| "Start a new backend service" | `spring-boot-modular-monolith` then `spring-boot-clean-architecture` then `spring-boot-rest-api` |
| "Add an endpoint" | `spring-boot-rest-api`, `spring-boot-dto`, `spring-boot-validation` |
| "This endpoint is slow" | `spring-boot-observability` then `spring-boot-query-optimization` then `spring-boot-postgresql` or `spring-boot-hibernate` |
| "We get too many 500s in production" | `spring-boot-observability` then `spring-boot-logging` then `spring-boot-rest-api` for the error contract |
| "Make it ready for the load we expect" | `spring-boot-observability` then `spring-boot-actuator` then `spring-boot-docker` |
| "Set up the pipeline" | `spring-boot-ci-cd` then `spring-boot-testcontainers` then `spring-boot-docker` |
| "Release the new version safely" | `spring-boot-ci-cd` then `spring-boot-flyway` then `spring-boot-actuator` |
| "Review this repository" | the narrowest `spring-boot-*` owner per finding; `spring-boot-integration-testing` if the finding is about missing proof |
| "Audit the module design" | `spring-boot-modular-monolith` then `spring-boot-clean-architecture` then `spring-boot-ddd` |

## NestJS delivery

| Request | Route |
| --- | --- |
| "Build this feature" | `nestjs-professional-software-engineering` then `nestjs-architecture-principles` |
| "Refactor this service" | `nestjs-oop-design-patterns` then `nestjs-architecture-principles` |
| "The API is slow" | `nestjs-features-performance` for the resource diagnosis, `nestjs-architecture-principles` only if the boundary is wrong |
| "Audit the whole repo" | `nestjs-code-audit` |
| "Did we finish the roadmap item" | `nestjs-feature-audit` |
| "Commit and open a PR" | `nestjs-git-commit-pr-message` |

## Frontend and mobile

| Request | Route |
| --- | --- |
| "Write or review React code" | `vercel-react-best-practices` |
| "Structure a new React app" | `frontend-architecture` then `frontend-data-contracts` |
| "Call the API safely" | `frontend-data-contracts` |
| "The create or update flow feels wrong" | `frontend-optimistic-mutations` |
| "Any React Native or Expo work" | `react-native-best-practices` first, then `react-native-architecture` for structure |
| "App is slow in the field" | `frontend-observability` or `react-native-best-practices` depending on platform, then `frontend-lighthouse` for the web gate |
| "Block a regression in CI" | `frontend-lighthouse` |
| "Search traffic dropped" | `frontend-seo` and `seo-audit`, then `schema` and `ai-seo` |
| "Write tests for a JS project" | `vitest-testing-patterns` |

## Marketing and product

| Request | Route |
| --- | --- |
| "Launch the product" | `launch` then `product-marketing`, `directory-submissions`, `social`, `emails`, `analytics` |
| "The landing page is not converting" | `cro` then `copywriting`, then `ab-testing` |
| "Pricing needs work" | `pricing` then `paywalls` then `ab-testing` |
| "Users sign up but leave" | `signup` then `onboarding` then `churn-prevention` |
| "Nobody opens our emails" | `emails` then `copy-editing` |
| "Growth ideas, no channel" | `marketing-ideas` then `product-marketing` if context is missing |
| "Full growth plan" | `product-marketing` then `marketing-plan` |
| "Need leads" | `prospecting` then `cold-email` then `sales-enablement`, optionally `revops` |
| "Competitor comparison page" | `competitor-profiling` then `competitors` then `copywriting` |
| "App store listing" | `aso` then `product-marketing` |

## Skill system and agent workflow

| Request | Route |
| --- | --- |
| "Which skill should I use" | this skill, then the owner |
| "Add a skill to this repo" | `clean-skill-install` |
| "Make the agent less verbose" | `caveman` |
| "Commit my changes" | `caveman-commit` for message style, otherwise the framework delivery skill |
| "Review this diff" | `caveman-review` for comment style, otherwise the owning review skill |

## Escalation

When a request spans three domains, for example "our signup is slow, conversion is low, and the deploy is fragile", route to the domain that owns the first irreversible decision. Usually that is the code and its contract, not the marketing surface. State the assumption and sequence the rest.
