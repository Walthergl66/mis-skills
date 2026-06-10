---
name: skill-router
description: Use when the user wants help choosing which skills to use, starts a broad or ambiguous task, begins a new professional project, or asks an agent to decide the right workflow. Routes user intent to the best skills in this repository and explains the recommended sequence briefly.
---

# Skill Router

Use this skill as the entry point when the user does not know which skill to invoke.

Your job is to translate the user's intent into the right skill sequence. Be practical, concise, and decisive.

## Core Behavior

1. Identify the user's goal.
2. Classify the work area.
3. Choose one primary skill.
4. Add supporting skills only when they clearly help.
5. Explain the recommended sequence in plain language.
6. Then proceed with the work using the selected skill guidance.

Do not overwhelm the user with a long menu. If the task is clear, choose the workflow and move.

## Routing Principles

- Prefer one primary skill over many.
- Use supporting skills for review, polish, launch, measurement, or distribution.
- If the request is broad, start with planning or research before execution.
- If the user asks to install or update skills, use `clean-skill-install`.
- If the user asks for UI, product polish, motion, or interaction quality, include `emil-design-eng`.
- If the user asks for marketing but lacks product context, start with `product-marketing`.
- If the user asks for growth ideas without a channel, start with `marketing-ideas`.
- If the user asks to improve a page that already exists, start with `cro`.
- If the user asks to write new copy, start with `copywriting`.
- If the user asks to edit existing copy, start with `copy-editing`.

## Common Routes

### New Professional Project

Use when the user is starting a serious app, SaaS, product, or client project.

Recommended sequence:

1. `product-marketing` for audience, positioning, and product context.
2. `marketing-plan` for the growth roadmap.
3. `site-architecture` for the website/page structure.
4. `copywriting` for core pages.
5. `emil-design-eng` for UI polish and product feel.
6. `analytics` for measurement.

### Landing Page Or Website

Use when the user wants to create, review, or improve a marketing page.

Recommended sequence:

1. `product-marketing` if context is missing.
2. `copywriting` for new page copy.
3. `cro` for conversion review.
4. `emil-design-eng` for interface polish.
5. `seo-audit` and `schema` for search readiness.

### Launch

Use when the user is preparing a product, feature, app, or campaign launch.

Recommended sequence:

1. `launch` for launch strategy and checklist.
2. `product-marketing` for positioning.
3. `directory-submissions` for listing and backlink opportunities.
4. `social` for launch posts.
5. `emails` for announcement sequences.
6. `analytics` for launch measurement.

### SEO And Organic Growth

Use when the user wants traffic from search or AI answers.

Recommended sequence:

1. `seo-audit` for baseline issues.
2. `content-strategy` for topic planning.
3. `programmatic-seo` for scalable page systems.
4. `schema` for structured data.
5. `ai-seo` for AI search visibility.

### Paid Ads

Use when the user wants paid acquisition.

Recommended sequence:

1. `ads` for channel, campaign, targeting, and budget strategy.
2. `ad-creative` for ad variations.
3. `cro` for landing page conversion.
4. `analytics` for conversion tracking.
5. `ab-testing` for experiment design.

### Email And Lifecycle

Use when the user wants onboarding, nurture, retention, or win-back flows.

Recommended sequence:

1. `emails` for lifecycle sequences.
2. `onboarding` for post-signup activation.
3. `churn-prevention` for retention and cancellation flows.
4. `copywriting` or `copy-editing` for message quality.
5. `analytics` for tracking.

### Sales And Outbound

Use when the user wants B2B leads, outreach, or sales assets.

Recommended sequence:

1. `prospecting` for lead lists and account qualification.
2. `cold-email` for outbound sequences.
3. `sales-enablement` for decks, one-pagers, objection handling, and demo scripts.
4. `competitor-profiling` and `competitors` for competitive positioning.
5. `revops` for handoff and pipeline process.

### Social And Content

Use when the user wants posts, calendars, short-form content, or repurposing.

Recommended sequence:

1. `content-strategy` for themes and pillars.
2. `social` for platform-specific posts.
3. `video` for video production workflows.
4. `image` for marketing visuals.
5. `copy-editing` for polish.

### App Store Or Mobile Growth

Use when the user works on a mobile app listing or app growth.

Recommended sequence:

1. `aso` for app store optimization.
2. `product-marketing` for positioning.
3. `signup` for registration flow.
4. `onboarding` for activation.
5. `analytics` for funnel measurement.

### Pricing And Monetization

Use when the user wants to improve revenue, pricing, packaging, or upgrade flows.

Recommended sequence:

1. `pricing` for model and packaging.
2. `paywalls` for in-product upgrade moments.
3. `cro` for public pricing page conversion.
4. `ab-testing` for pricing experiments.
5. `analytics` for revenue tracking.

### Skill System Maintenance

Use when the user wants to add, install, update, publish, clean, or sync skills.

Recommended sequence:

1. `clean-skill-install`.
2. Run the clean install workflow.
3. Keep all installed skills under `.agents/skills`.
4. Sync the public `skills/` mirror.
5. Validate and regenerate inventory.

## Response Format

When routing, respond briefly:

```md
Recommended route:
- Primary: `skill-name`
- Supporting: `skill-a`, `skill-b`
- Why: one short reason

I will start with `skill-name`.
```

If the user asked you to perform the task, do not stop after routing. Start the work.

## If Unsure

Ask at most one clarifying question only when the wrong route would create real rework.

Otherwise choose the closest route and say your assumption.
