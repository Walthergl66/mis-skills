---
name: skill-router
description: 'Primary entry point and orchestrator for this skill repository. Use FIRST, before any other skill, whenever a request is broad, ambiguous, or does not name a skill: decide which skill fits, in what order, and who owns what. Triggers include "which skill", "not sure which skill to use", "how should I start", "help me decide", a new project or feature request, a bug report, a slow system, a review or audit request, a release or launch request, and any mention of Spring Boot, NestJS, React, React Native, backend architecture, databases, APIs, testing, DevOps, marketing, SEO, or design. Resolves the catalog into one primary skill plus at most two supporting skills, assigns ownership when several apply, and then proceeds with the work instead of only advising. Do not use when the user already named a specific skill or when the task is a single trivial edit. When other skills also apply, reconcile ownership before mutation.'
license: MIT
metadata:
  author: Walthergl66
  version: '2.0.0'
---

# Skill Router

Activate this skill first, resolve the request into a skill, then hand the work to that skill. Routing is a decision, not a menu: one primary owner, at most two supporting skills, and a stated order.

## When to use

- The request does not name a skill, or names a technology instead of a workflow.
- The request is broad, spans domains, or is a new project, new feature, or new service.
- Something is broken, slow, unsafe, or failing review and the correct discipline is not obvious.
- The user asks which skill, which order, or where to start.

## When not to use

- The user named a specific skill: load it directly.
- The task is a one-line edit, a lookup, or a command: answer it.
- Another skill was already activated and is mid-work: finish that work instead of re-routing.

## Core algorithm

Run these steps in order. Stop early when the answer is already clear.

### 1. Honor explicit intent

If the user named a skill, a framework-specific need, or a specific deliverable, that wins. Skip to step 6 and use it.

### 2. Fence the domain

Pick the domain from the stack and the artifact, not from the vocabulary. A request about a Spring Boot service is backend work even when it mentions users, pricing, or onboarding.

| Signal | Domain | Router |
| --- | --- | --- |
| Spring Boot, Maven, Gradle, JPA, Hibernate, Flyway, Actuator, Testcontainers, `@RestController` | Spring Boot | [spring-boot-routing.md](references/spring-boot-routing.md) |
| NestJS, providers, modules, guards, pipes, decorators | NestJS | `nestjs-professional-software-engineering` then `nestjs-architecture-principles` |
| React, Next.js, Vite, TanStack Query, hooks, RSC | React frontend | `vercel-react-best-practices` plus `frontend-architecture` |
| React Native, Expo, Reanimated, Gesture Handler, Fabric, Skia, Worklets | React Native | `react-native-best-practices` first, always |
| Vitest, RTL, Playwright on a JS project | JS testing | `vitest-testing-patterns` |
| Positioning, ICP, campaigns, funnels, ads, SEO, launch, docs | Marketing and growth | [sequences.md](sequences.md) marketing routes |
| Mobile listing, app store, ASO | App growth | `aso` |
| Animation, polish, interaction feel, UI detail | Design | `emil-design-eng` |
| Installing, publishing, syncing, auditing skills | Skill system | `clean-skill-install` |
| Commit, push, PR, release notes for a NestJS repo | Git and delivery | `nestjs-git-commit-pr-message` |

### 3. Classify the work type

| Work type | What the user is asking for | Bias |
| --- | --- | --- |
| Design | Choosing a structure, a boundary, a model, a contract | Start with the architecture or domain skills, not the framework skills |
| Build | Writing new code | Framework skill first, then the architecture or domain skill that owns placement |
| Review | Judging existing code | Audit or review skill; do not rewrite |
| Diagnose | Explaining a symptom | Diagnosis skill, evidence before remedy |
| Optimize | Making something faster or cheaper | Measurement first, one change at a time |
| Harden | Security, validation, failure behavior | Security or validation skill, with the contract skill |
| Ship | Build, release, deploy, promote | Production or delivery skills |
| Measure | Instrumentation, tracking, experiments | Observability or analytics skills |

### 4. Pick the primary skill

Score every plausible candidate on three questions:

1. **Ownership:** does the skill explicitly own the decision in question? Prefer the narrowest owner.
2. **Trigger match:** does the request match concrete triggers in the description, not just the topic area?
3. **Cost of being wrong:** which wrong choice forces rework? Prefer the skill whose miss is expensive.

Choose the highest total. If two tie, choose the one whose skill names the narrower scope. If the tie is about architecture versus mechanics, architecture wins first and mechanics second.

### 5. Add supporting skills, then stop

Add at most two, only when they own a decision the primary cannot make alone. State the order. Never route to more than three skills for one request; a long list is how work gets skipped.

If the request needs a plan before execution, the primary is the planning skill and the framework skill is supporting, not the reverse.

### 6. Assign ownership for conflicts

When two active skills would touch the same decision, name one owner and bound the other to advice. Order of authority:

1. explicit user intent;
2. repository contracts and verified runtime or production constraints;
3. the narrowest primary owner from step 4.

Example: a request to move a validation error into the API error body is owned by the validation skill for the constraint set and by the REST skill for the response shape. The validation skill decides what the violations are; the REST skill decides the body.

### 7. Announce, then work

```md
Route: <primary-skill> → <supporting-skill> → <supporting-skill>
Why: one sentence naming the decision being made
```

Then load the primary skill and do the work. A route without execution is a failure to route.

## Catalog

Full index of every skill with trigger hints: [catalog.md](references/catalog.md). Consult it when step 4 has two plausible candidates. Do not read every `SKILL.md` to decide; the description is the contract.

## Anti-patterns

- **Menu dumping.** Listing ten options and asking the user to choose is a delegation failure. Choose, state the assumption, proceed.
- **Topic matching.** Matching on words instead of on the decision the skill owns. Read the description, not the title.
- **Over-routing.** Loading four skills to review one function wastes context and dilutes ownership.
- **Framework first, always.** Architecture and domain skills decide structure; framework skills execute inside it. Reversing them produces a framework-shaped domain model.
- **Silent routing.** Choosing a skill without saying so makes the choice unreviewable.
- **Routing to a skill that does not exist.** Verify the name against the catalog.

## Clarify only when it matters

Ask at most one question, and only when two routes lead to materially different work. Otherwise pick the closest route, name the assumption in one clause, and continue.

## Reference routing

| Task | Load |
| --- | --- |
| See every available skill with its trigger hints | [catalog.md](references/catalog.md) |
| Route a Spring Boot request across the 26 backend skills | [spring-boot-routing.md](references/spring-boot-routing.md) |
| Pick a multi-skill sequence for a real scenario | [sequences.md](references/sequences.md) |

## Expected response

- **Route:** primary skill, then supporting skills, in order.
- **Why:** the decision being owned, in one sentence.
- **Assumption:** stated only if the request was ambiguous.
- **Work:** the actual result, not a plan to produce the result later.

If the request is already unambiguous, skip the route block and just do the work.
