# Skill Catalog

Every skill installed in `.agents/skills`, grouped by domain, with the decision it owns and the concrete triggers that should select it. Use it to break a tie in routing step 4. Do not load a `SKILL.md` to decide; the description is the contract.

## Spring Boot (26)

| Skill | Owns | Triggers |
| --- | --- | --- |
| `spring-boot-clean-architecture` | Layer placement and the dependency rule | domain, application, adapter packages, JPA leaking into domain, is layering worth it |
| `spring-boot-hexagonal-architecture` | Ports, driven adapters, composition root | port interface, two implementations, vendor SDK wrapper, test seam |
| `spring-boot-ddd` | Aggregates, invariants, value objects, domain events | bounded context, aggregate root, anemic model, value object, Specification |
| `spring-boot-modular-monolith` | Spring Modulith module boundaries | `@ApplicationModule`, `ApplicationModules.verify`, `@NamedInterface`, cyclic modules, extract a module |
| `spring-boot-core` | Starters, auto-configuration, properties, profiles | `@ConfigurationProperties`, `@ConditionalOnMissingBean`, property not applied, profile, `spring.config.import` |
| `spring-boot-mvc` | Dispatch pipeline and every hook in it | `DispatcherServlet`, filter versus interceptor, `@ControllerAdvice`, `SseEmitter`, content negotiation, 415 or 406 |
| `spring-boot-data-jpa` | Repositories, entity mapping, transaction boundaries, fetch plans | `JpaRepository`, N+1, `@Transactional` self-invocation, projections, keyset pagination, pessimistic lock |
| `spring-boot-security` | Filter chain, authentication, authorization, JWT | `SecurityFilterChain`, `AuthorizationManager`, `@PreAuthorize`, resource server, CSRF, CORS, BCrypt, 401 versus 403 |
| `spring-boot-validation` | Bean Validation, groups, error contract | `@Valid`, `@Validated`, `ConstraintValidator`, validation groups, `MethodArgumentNotValidException` |
| `spring-boot-postgresql` | Postgres types, SQL, indexes, plans, pooling | `jsonb`, `EXPLAIN ANALYZE`, index not used, `SKIP LOCKED`, isolation level, Hikari sizing |
| `spring-boot-hibernate` | ORM engine, mappings, fetch, caching | `@Entity`, `FetchType`, entity graph, batch size, second-level cache, `LazyInitializationException`, `hbm2ddl` |
| `spring-boot-flyway` | Migrations, baseline, repair, zero downtime | `V` migration, checksum mismatch, baseline, out of order, expand and contract, run migrations in CI |
| `spring-boot-query-optimization` | Slow query and throughput diagnosis | p99 latency, slow endpoint, connection pool wait, N+1 detection, before and after measurement |
| `spring-boot-rest-api` | HTTP contract, status codes, error body | `@RestController`, `ProblemDetail`, 201 with `Location`, 202, 409 versus 422, 412, `Idempotency-Key`, `ETag`, pagination |
| `spring-boot-openapi` | OpenAPI 3.1 doc and spec gating | springdoc, `/v3/api-docs`, `GroupedOpenApi`, `@Schema`, `@ApiResponse`, spec diff in CI |
| `spring-boot-dto` | Request and response records, mapping, evolution | record DTO, entity leaking from a controller, over-posting, MapStruct, create versus update DTO |
| `spring-boot-api-versioning` | Version strategy, deprecation, routing | `/v1` path, `Accept-Version`, `ApiVersion`, breaking change, `Deprecation` and `Sunset` headers |
| `spring-boot-junit` | JUnit 5 mechanics, structure, parameters, extensions | `@Test`, `@ParameterizedTest`, `@Nested`, `@TestInstance`, `@RegisterExtension`, `assertThat`, `@Tag` |
| `spring-boot-mockito` | Test doubles, stubbing, verification | `@MockBean` migration, `@MockitoBean`, `@SpyBean`, captor, `lenient`, static mock, over-mocking |
| `spring-boot-testcontainers` | Real dependency test infrastructure | `@Testcontainers`, `@ServiceConnection`, `PostgreSQLContainer`, `@DynamicPropertySource`, container reuse, CI cost |
| `spring-boot-integration-testing` | Test layer choice and end-to-end proof | `@SpringBootTest`, `@WebMvcTest`, `@DataJpaTest`, `MockMvc`, `WebTestClient`, `RANDOM_PORT`, rollback trap, `@WithMockUser` |
| `spring-boot-docker` | Container image build and hygiene | Dockerfile, layered jar, multi-stage, jlink, buildpacks, `.dockerignore`, non-root, `MaxRAMPercentage`, image size |
| `spring-boot-observability` | Metrics, traces, instrumentation, SLO signals | `MeterRegistry`, `Counter`, `Timer`, `@Observed`, Micrometer Tracing, OTel, cardinality |
| `spring-boot-logging` | Logback, structured logs, MDC, levels, volume | `logback-spring.xml`, `<springProfile>`, JSON logs, correlation id, redact, async appender |
| `spring-boot-actuator` | Endpoint exposure, health groups, shutdown | `management.endpoints.web.exposure.include`, probes, liveness, readiness, `HealthIndicator`, `info`, graceful shutdown |
| `spring-boot-ci-cd` | Pipeline, publish, promote, rollback | GitHub Actions, Maven cache, test matrix, image scan, SBOM, secrets, canary, smoke test, rollback |

Decision tree and sequences: [spring-boot-routing.md](spring-boot-routing.md).

## NestJS (7)

| Skill | Owns | Triggers |
| --- | --- | --- |
| `nestjs-professional-software-engineering` | Implementing and verifying NestJS code | feature, bug fix, refactor, project inspection, official docs before syntax choice |
| `nestjs-architecture-principles` | Modules, boundaries, dependency direction, ports | module boundaries, circular dependency, microservices decision, CQRS justification |
| `nestjs-oop-design-patterns` | Object design, SOLID, pattern selection | god service, primitive obsession, inheritance misuse, pattern choice, refactor smell |
| `nestjs-features-performance` | Runtime features, error contract, security, performance, delivery | middleware, guards, pipes, interceptors, filters, queues, scaling, event loop bottleneck, Kubernetes |
| `nestjs-code-audit` | Whole-repository read-only audit | audit the repo, code quality report, prioritized findings across modules |
| `nestjs-feature-audit` | One feature against a roadmap on a branch | validate the feature, gap analysis, roadmap traceability on branch |
| `nestjs-git-commit-pr-message` | Commit, push, PR, changelog, Pages verification | commit, push, open a PR, release notes, secret scan before publishing |

## Frontend and mobile (10)

| Skill | Owns | Triggers |
| --- | --- | --- |
| `react-native-best-practices` | New Architecture correctness for RN and Expo | any RN or Expo code task, Reanimated, Gesture Handler, `react-native-svg`, Fabric, TurboModule, worklet |
| `react-native-architecture` | RN app structure, navigation, native modules, offline | project structure, navigation, native module, offline sync |
| `vercel-react-best-practices` | React and Next.js performance patterns | component, hook, data fetching, bundle size, server component |
| `frontend-architecture` | Portable React and RN feature module structure | new app, feature folder, server state versus UI state, import boundaries, styling choice |
| `frontend-data-contracts` | Typed API client and parse at the edge | fetch wrapper, Zod, typed error, response envelope, branded IDs, form error mapping |
| `frontend-optimistic-mutations` | Write path and cache coherence | create, update, delete with rollback, idempotency key, list and detail cache |
| `frontend-observability` | Field analytics, error reporting, consent | track events, RUM, Core Web Vitals in the field, consent gating |
| `frontend-lighthouse` | CI performance gate | Lighthouse CI, Core Web Vitals budget, bundle budget, blocking perf check |
| `frontend-seo` | Metadata, sitemap, feeds, structured data | meta tags, canonical, sitemap, JSON-LD, RSS |
| `vitest-testing-patterns` | Vitest and React Testing Library | unit test, component test, mock module, coverage in a JS project |

## Design and writing (2)

| Skill | Owns | Triggers |
| --- | --- | --- |
| `emil-design-eng` | UI polish, motion, interaction detail | animation decision, component detail, feel, transitions, micro-interactions |
| `humanizer` | Removing AI writing patterns | rewrite text to sound human, em dash overuse, rule of three, AI vocabulary |

## Framework-agnostic engineering (3)

| Skill | Owns | Triggers |
| --- | --- | --- |
| `clean-architecture` | Dependency rule, entities, use cases, adapters | dependency rule, ports and adapters, where does logic go, swap the framework |
| `auth-implementation-patterns` | Auth and authorization implementation | JWT, OAuth2, sessions, RBAC, refresh rotation, securing an API |
| `security-requirement-extraction` | Turning threats into requirements and tests | threat model to requirements, security user stories, security test cases |

## Marketing and growth (42)

| Skill | Owns | Triggers |
| --- | --- | --- |
| `product-marketing` | Product context document | positioning, ICP, audience, start of any marketing project |
| `marketing-plan` | Full AARRR growth plan | marketing plan, GTM, 90-day plan, growth roadmap, fCMO |
| `marketing-ideas` | Channel and tactic ideation | marketing ideas, what else can I try, stuck on growth |
| `marketing-psychology` | Behavioral principles applied to marketing | anchoring, social proof, scarcity, framing, why people buy |
| `ads` | Paid channel strategy and targeting | PPC, Google Ads, Meta ads, budget, ROAS, CPA, retargeting |
| `ad-creative` | Ad copy at scale | headlines, RSA copy, variations, creative testing |
| `cro` | Conversion rate on pages and forms | not converting, landing page, form abandonment, improve conversions |
| `signup` | Registration and trial activation flow | signup friction, registration drop-off, trial conversion |
| `onboarding` | Post-signup activation | activation rate, first run, empty states, aha moment |
| `churn-prevention` | Cancellation, save offers, dunning | churn, cancel flow, failed payments, win-back, retention |
| `paywalls` | In-app upgrade moments | paywall, upsell, feature gate, limit reached, trial expiring |
| `popups` | Overlay and interrupt conversion elements | exit intent popup, modal, announcement banner, overlay, sticky bar, email capture popup |
| `pricing` | Pricing and packaging decisions | pricing tiers, packaging, price increase, willingness to pay |
| `emails` | Lifecycle email sequences | welcome series, drip, nurture, re-engagement, email automation |
| `sms` | SMS and MMS campaigns | SMS sequence, TCPA, abandoned cart text, SMS versus email |
| `social` | Social content per platform | LinkedIn post, thread, calendar, short-form script, reel |
| `content-strategy` | Topic and editorial planning | content strategy, blog topics, pillars, editorial calendar |
| `copywriting` | New marketing copy | headline, subheadline, hero, CTA, rewrite a page |
| `copy-editing` | Improving existing copy | edit this copy, proofread, tighten, refresh stale content |
| `seo-audit` | Diagnosing SEO problems | not ranking, traffic drop, technical SEO, indexing, page speed |
| `ai-seo` | Visibility in AI answers | AI Overviews, ChatGPT citations, LLM visibility, AEO, GEO |
| `programmatic-seo` | Templated pages at scale | programmatic SEO, template pages, location pages, pSEO |
| `schema` | Structured data | JSON-LD, schema markup, rich results, FAQ schema |
| `site-architecture` | Page hierarchy and navigation | sitemap, information architecture, URL structure, internal linking, breadcrumbs |
| `analytics` | Tracking and measurement | GA4, GTM, events, UTM, conversion tracking, attribution |
| `ab-testing` | Experiment design | A/B test, split test, hypothesis, significance, experiment backlog |
| `launch` | Release strategy and checklist | launch, Product Hunt, announcement, go-to-market, waitlist |
| `directory-submissions` | Directory listings for reach | directory submissions, Product Hunt listing, backlinks from directories |
| `lead-magnets` | Downloadable opt-in assets | lead magnet, ebook, checklist, template, gated content |
| `free-tools` | Free tools as an acquisition channel | calculator, generator, free tool, engineering as marketing |
| `referrals` | Referral and affiliate programs | referral program, affiliate, ambassador, viral loop |
| `co-marketing` | Partner and joint campaigns | co-marketing, partnership, cross-promotion, integration marketing |
| `community-marketing` | Community as a growth channel | community strategy, Discord, forum, ambassadors, UGC |
| `prospecting` | Building a qualified prospect list | prospecting, lead list, ICP accounts, outbound targets |
| `cold-email` | Outbound email sequences | cold email, SDR sequence, follow-up sequence, no replies |
| `sales-enablement` | Sales collateral | pitch deck, one-pager, objection handling, demo script, battle card |
| `revops` | Marketing to sales process | lead scoring, routing, MQL, SQL, pipeline stages, CRM automation |
| `competitor-profiling` | Researching competitors from URLs | profile these competitors, competitive intelligence, teardown research |
| `competitors` | Comparison and alternative pages | versus page, alternatives page, comparison page, competitive landing |
| `customer-research` | Interviews, reviews, VOC synthesis | interviews, review mining, support ticket analysis, jobs to be done, personas |
| `image` | Marketing image generation | hero image, social graphic, product mockup, banner, thumbnails |
| `video` | Video production | demo video, explainer, AI video, Remotion, avatar video |
| `aso` | App store listing optimization | ASO, app store ranking, listing conversion, keyword volume |

## Skill system and agent workflow (9)

| Skill | Owns | Triggers |
| --- | --- | --- |
| `skill-router` | This routing decision | ambiguous request, which skill, where to start |
| `clean-skill-install` | Installing, publishing, syncing skills | add a skill, install skills, update the mirror, publish this repo |
| `caveman` | Compressed response mode | talk like caveman, fewer tokens, be brief |
| `caveman-commit` | Compressed commit messages | write a commit, commit message, conventional commit |
| `caveman-review` | Compressed review comments | review this PR, review the diff, code review |
| `caveman-compress` | Compressing memory files | compress CLAUDE.md, compress memory file |
| `caveman-help` | Command reference | caveman help, what caveman commands |
| `caveman-stats` | Token usage report | caveman stats, token savings |
| `cavecrew` | When to delegate to subagents | delegate to subagent, spawn investigator, save context |
