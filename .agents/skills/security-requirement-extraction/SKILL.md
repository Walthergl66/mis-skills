---
name: security-requirement-extraction
description: >
  Turn a threat model and business context into actionable, testable security
  requirements: security user stories, acceptance criteria, and security test
  cases, traced to threats and compliance frameworks. Use when translating
  threats into requirements, writing security user stories, or building security
  test cases. Triggers include "threat model to requirements", "security user
  story", "security acceptance criteria", "security test case", "compliance
  mapping". Do not use to design or implement the controls themselves - for auth
  mechanics use auth-implementation-patterns, for Spring Security wiring use
  spring-boot-security. This skill produces the requirements, not the code.
license: MIT
metadata:
  author: wshobson
  version: 1.0.0
---

# Security Requirement Extraction

Transform threat analysis into actionable security requirements.

## When to Use This Skill

- Converting threat models to requirements
- Writing security user stories
- Creating security test cases
- Building security acceptance criteria
- Compliance requirement mapping
- Security architecture documentation

## Boundaries

This skill converts threats into requirements and tests. It stops at the requirement:

- Designing or implementing auth controls (JWT, OAuth2, RBAC) → `auth-implementation-patterns`.
- Spring Security filter chain and Java config → `spring-boot-security`.
- Ambient security review of a whole codebase → the framework audit skill for that stack.

When both apply, capture the requirement here, then hand the implementation to the owning skill.

## Core Concepts

### 1. Requirement Categories

```
Business Requirements → Security Requirements → Technical Controls
         ↓                       ↓                      ↓
  "Protect customer    "Encrypt PII at rest"   "AES-256 encryption
   data"                                        with KMS key rotation"
```

### 2. Security Requirement Types

| Type               | Focus                   | Example                               |
| ------------------ | ----------------------- | ------------------------------------- |
| **Functional**     | What system must do     | "System must authenticate users"      |
| **Non-functional** | How system must perform | "Authentication must complete in <2s" |
| **Constraint**     | Limitations imposed     | "Must use approved crypto libraries"  |

### 3. Requirement Attributes

| Attribute        | Description                 |
| ---------------- | --------------------------- |
| **Traceability** | Links to threats/compliance |
| **Testability**  | Can be verified             |
| **Priority**     | Business importance         |
| **Risk Level**   | Impact if not met           |

## Templates and detailed worked examples

Full template library lives in `references/details.md`. Read that file when you need concrete templates for this skill.

## Best Practices

### Do's

- **Trace to threats** - Every requirement should map to threats
- **Be specific** - Vague requirements can't be tested
- **Include acceptance criteria** - Define "done"
- **Consider compliance** - Map to frameworks early
- **Review regularly** - Requirements evolve with threats

### Don'ts

- **Don't be generic** - "Be secure" is not a requirement
- **Don't skip rationale** - Explain why it matters
- **Don't ignore priorities** - Not all requirements are equal
- **Don't forget testability** - If you can't test it, you can't verify it
- **Don't work in isolation** - Involve stakeholders
