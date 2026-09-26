# Skill Inventory

Canonical source: `.agents/skills`.

This file is generated from installed `SKILL.md` frontmatter. Run `npm run inventory` after adding, removing, or updating skills.

## Installed Skills

### Ab Testing

- Folder: `ab-testing`
- Path: `.agents/skills/ab-testing/SKILL.md`
- Purpose: When the user wants to plan, design, or implement an A/B test or experiment, or build a growth experimentation program. Also use when the user mentions "A/B test," "split test," "experiment," "test this change," "variant copy," "multivariate test," "hypothesis," "should I test this," "which version is better," "test two versions," "statistical significance," "how long should I run this test," "growth experiments," "experiment velocity," "experiment backlog," "ICE score," "experimentation program," or "experiment playbook." Use this whenever someone is comparing two approaches and wants to measure which performs better, or when they want to build a systematic experimentation practice. For tracking implementation, see analytics. For page-level conversion optimization, see cro.

### Ad Creative

- Folder: `ad-creative`
- Path: `.agents/skills/ad-creative/SKILL.md`
- Purpose: When the user wants to generate, iterate, or scale ad creative - headlines, descriptions, primary text, or full ad variations - for any paid advertising platform. Also use when the user mentions 'ad copy variations,' 'ad creative,' 'generate headlines,' 'RSA headlines,' 'bulk ad copy,' 'ad iterations,' 'creative testing,' 'ad performance optimization,' 'write me some ads,' 'Facebook ad copy,' 'Google ad headlines,' 'LinkedIn ad text,' or 'I need more ad variations.' Use this whenever someone needs to produce ad copy at scale or iterate on existing ads. For campaign strategy and targeting, see ads. For landing page copy, see copywriting.

### Ads

- Folder: `ads`
- Path: `.agents/skills/ads/SKILL.md`
- Purpose: When the user wants help with paid advertising campaigns on Google Ads, Meta (Facebook/Instagram), LinkedIn, Twitter/X, or other ad platforms. Also use when the user mentions 'PPC,' 'paid media,' 'ROAS,' 'CPA,' 'ad campaign,' 'retargeting,' 'audience targeting,' 'Google Ads,' 'Facebook ads,' 'LinkedIn ads,' 'ad budget,' 'cost per click,' 'ad spend,' or 'should I run ads.' Use this for campaign strategy, audience targeting, bidding, and optimization. For bulk ad creative generation and iteration, see ad-creative. For landing page optimization, see cro.

### Ai Seo

- Folder: `ai-seo`
- Path: `.agents/skills/ai-seo/SKILL.md`
- Purpose: When the user wants to optimize content for AI search engines, get cited by LLMs, or appear in AI-generated answers. Also use when the user mentions 'AI SEO,' 'AEO,' 'GEO,' 'LLMO,' 'answer engine optimization,' 'generative engine optimization,' 'LLM optimization,' 'AI Overviews,' 'optimize for ChatGPT,' 'optimize for Perplexity,' 'AI citations,' 'AI visibility,' 'zero-click search,' 'how do I show up in AI answers,' 'LLM mentions,' or 'optimize for Claude/Gemini.' Use this whenever someone wants their content to be cited or surfaced by AI assistants and AI search engines. For traditional technical and on-page SEO audits, see seo-audit. For structured data implementation, see schema.

### Analytics

- Folder: `analytics`
- Path: `.agents/skills/analytics/SKILL.md`
- Purpose: When the user wants to set up, improve, or audit analytics tracking and measurement. Also use when the user mentions "set up tracking," "GA4," "Google Analytics," "conversion tracking," "event tracking," "UTM parameters," "tag manager," "GTM," "analytics implementation," "tracking plan," "how do I measure this," "track conversions," "attribution," "Mixpanel," "Segment," "are my events firing," or "analytics isn't working." Use this whenever someone asks how to know if something is working or wants to measure marketing results. For A/B test measurement, see ab-testing.

### Aso

- Folder: `aso`
- Path: `.agents/skills/aso/SKILL.md`
- Purpose: When the user wants to audit or optimize an App Store or Google Play listing. Also use when the user mentions 'ASO audit,' 'app store optimization,' 'optimize my app listing,' 'improve app visibility,' 'app store ranking,' 'audit my listing,' 'why aren't people downloading my app,' 'improve my app conversion,' 'keyword optimization for app,' or 'compare my app to competitors.' Use when the user shares an App Store or Google Play URL and wants to improve it.

### Auth Implementation Patterns

- Folder: `auth-implementation-patterns`
- Path: `.agents/skills/auth-implementation-patterns/SKILL.md`
- Purpose: Master authentication and authorization patterns including JWT, OAuth2, session management, and RBAC to build secure, scalable access control systems. Use when implementing auth systems, securing APIs, or debugging security issues.

### Cavecrew

- Folder: `cavecrew`
- Path: `.agents/skills/cavecrew/SKILL.md`
- Purpose: Decision guide for delegating to caveman-style subagents. Tells the main thread WHEN to spawn `cavecrew-investigator` (locate code), `cavecrew-builder` (1-2 file edit), or `cavecrew-reviewer` (diff review) instead of doing the work inline or using vanilla `Explore`. Subagent output is caveman-compressed so the tool-result injected back into main context is ~60% smaller - main context lasts longer across long sessions. Trigger: "delegate to subagent", "use cavecrew", "spawn investigator/builder/reviewer", "save context", "compressed agent output".

### Caveman

- Folder: `caveman`
- Path: `.agents/skills/caveman/SKILL.md`
- Purpose: Ultra-compressed communication mode. Cuts token usage ~75% by speaking like caveman while keeping full technical accuracy. Supports intensity levels: lite, full (default), ultra, wenyan-lite, wenyan-full, wenyan-ultra. Use when user says "caveman mode", "talk like caveman", "use caveman", "less tokens", "be brief", or invokes /caveman. Also auto-triggers when token efficiency is requested.

### Caveman Commit

- Folder: `caveman-commit`
- Path: `.agents/skills/caveman-commit/SKILL.md`
- Purpose: Ultra-compressed commit message generator. Cuts noise from commit messages while preserving intent and reasoning. Conventional Commits format. Subject <=50 chars, body only when "why" isn't obvious. Use when user says "write a commit", "commit message", "generate commit", "/commit", or invokes /caveman-commit. Auto-triggers when staging changes.

### Caveman Compress

- Folder: `caveman-compress`
- Path: `.agents/skills/caveman-compress/SKILL.md`
- Purpose: Compress natural language memory files (CLAUDE.md, todos, preferences) into caveman format to save input tokens. Preserves all technical substance, code, URLs, and structure. Compressed version overwrites the original file. Human-readable backup saved as FILE.original.md. Trigger: /caveman-compress FILEPATH or "compress memory file"

### Caveman Help

- Folder: `caveman-help`
- Path: `.agents/skills/caveman-help/SKILL.md`
- Purpose: Quick-reference card for all caveman modes, skills, and commands. One-shot display, not a persistent mode. Trigger: /caveman-help, "caveman help", "what caveman commands", "how do I use caveman".

### Caveman Review

- Folder: `caveman-review`
- Path: `.agents/skills/caveman-review/SKILL.md`
- Purpose: Ultra-compressed code review comments. Cuts noise from PR feedback while preserving the actionable signal. Each comment is one line: location, problem, fix. Use when user says "review this PR", "code review", "review the diff", "/review", or invokes /caveman-review. Auto-triggers when reviewing pull requests.

### Caveman Stats

- Folder: `caveman-stats`
- Path: `.agents/skills/caveman-stats/SKILL.md`
- Purpose: Show real token usage and estimated savings for the current session. Reads directly from the Claude Code session log - no AI estimation. Triggers on /caveman-stats. Output is injected by the mode-tracker hook; the model itself does not compute the numbers.

### Churn Prevention

- Folder: `churn-prevention`
- Path: `.agents/skills/churn-prevention/SKILL.md`
- Purpose: When the user wants to reduce churn, build cancellation flows, set up save offers, recover failed payments, or implement retention strategies. Also use when the user mentions 'churn,' 'cancel flow,' 'offboarding,' 'save offer,' 'dunning,' 'failed payment recovery,' 'win-back,' 'retention,' 'exit survey,' 'pause subscription,' 'involuntary churn,' 'people keep canceling,' 'churn rate is too high,' 'how do I keep users,' or 'customers are leaving.' Use this whenever someone is losing subscribers or wants to build systems to prevent it. For post-cancel win-back email sequences, see emails. For in-app upgrade paywalls, see paywalls.

### Clean Architecture

- Folder: `clean-architecture`
- Path: `.agents/skills/clean-architecture/SKILL.md`
- Purpose: Structure software around the Dependency Rule: source code dependencies point inward from frameworks to use cases to entities. Use when the user mentions "architecture layers", "dependency rule", "ports and adapters (hexagonal)", "onion architecture", "screaming architecture", "where should business logic go", "decouple from the database", "swap the framework without a rewrite", or "keep business rules independent". Also trigger when deciding which layer code belongs in, isolating core logic from infrastructure, defining module boundaries, or debating whether the framework should call your code or the reverse. Covers component principles, boundaries, and SOLID. For code-level quality, see clean-code. For domain modeling, see domain-driven-design.

### Clean Skill Install

- Folder: `clean-skill-install`
- Path: `.agents/skills/clean-skill-install/SKILL.md`
- Purpose: Use when the user asks an agent to install, add, import, update, or publish skills in this repository. Enforces the clean universal workflow, avoids scattered agent folders, syncs the public skills mirror, regenerates inventory, validates the repo, and provides the correct install command for target projects.

### Co Marketing

- Folder: `co-marketing`
- Path: `.agents/skills/co-marketing/SKILL.md`
- Purpose: When the user wants to find co-marketing partners, plan joint campaigns, or brainstorm partnership opportunities. Use when the user says 'co-marketing,' 'partner marketing,' 'joint campaign,' 'who should we partner with,' 'integration marketing,' 'cross-promotion,' 'collaborate with another company,' 'partnership ideas,' or 'co-brand.' For customer referral programs, see referrals. For launch-specific partnerships, see launch.

### Cold Email

- Folder: `cold-email`
- Path: `.agents/skills/cold-email/SKILL.md`
- Purpose: Write B2B cold emails and follow-up sequences that get replies. Use when the user wants to write cold outreach emails, prospecting emails, cold email campaigns, sales development emails, or SDR emails. Also use when the user mentions "cold outreach," "prospecting email," "outbound email," "email to leads," "reach out to prospects," "sales email," "follow-up email sequence," "nobody's replying to my emails," or "how do I write a cold email." Covers subject lines, opening lines, body copy, CTAs, personalization, and multi-touch follow-up sequences. For warm/lifecycle email sequences, see emails. For sales collateral beyond emails, see sales-enablement.

### Community Marketing

- Folder: `community-marketing`
- Path: `.agents/skills/community-marketing/SKILL.md`
- Purpose: Build and leverage online communities to drive product growth and brand loyalty. Use when the user wants to create a community strategy, grow a Discord or Slack community, manage a forum or subreddit, build brand advocates, increase word-of-mouth, drive community-led growth, engage users post-signup, or turn customers into evangelists. Trigger phrases: \"build a community,\" \"community strategy,\" \"Discord community,\" \"Slack community,\" \"community-led growth,\" \"brand advocates,\" \"user community,\" \"forum strategy,\" \"community engagement,\" \"grow our community,\" \"ambassador program,\" \"community flywheel.\"

### Competitor Profiling

- Folder: `competitor-profiling`
- Path: `.agents/skills/competitor-profiling/SKILL.md`
- Purpose: When the user wants to research, profile, or analyze competitors from their URLs. Also use when the user mentions 'competitor profile,' 'competitor research,' 'competitor analysis,' 'profile this competitor,' 'analyze competitor,' 'competitive intelligence,' 'competitor deep dive,' 'who are my competitors,' 'competitor landscape,' 'competitor dossier,' 'competitive audit,' or 'research these competitors.' Input is a list of competitor URLs. Output is structured competitor profile markdown files. For creating comparison/alternative pages from profiles, see competitors. For sales-specific battle cards, see sales-enablement.

### Competitors

- Folder: `competitors`
- Path: `.agents/skills/competitors/SKILL.md`
- Purpose: When the user wants to create competitor comparison or alternative pages for SEO and sales enablement. Also use when the user mentions 'alternative page,' 'vs page,' 'competitor comparison,' 'comparison page,' '[Product] vs [Product],' '[Product] alternative,' 'competitive landing pages,' 'how do we compare to X,' 'battle card,' or 'competitor teardown.' Use this for any content that positions your product against competitors. Covers four formats: singular alternative, plural alternatives, you vs competitor, and competitor vs competitor. For sales-specific competitor docs, see sales-enablement.

### Content Strategy

- Folder: `content-strategy`
- Path: `.agents/skills/content-strategy/SKILL.md`
- Purpose: When the user wants to plan a content strategy, decide what content to create, or figure out what topics to cover. Also use when the user mentions "content strategy," "what should I write about," "content ideas," "blog strategy," "topic clusters," "content planning," "editorial calendar," "content marketing," "content roadmap," "what content should I create," "blog topics," "content pillars," or "I don't know what to write." Use this whenever someone needs help deciding what content to produce, not just writing it. For writing individual pieces, see copywriting. For SEO-specific audits, see seo-audit. For social media content specifically, see social.

### Copy Editing

- Folder: `copy-editing`
- Path: `.agents/skills/copy-editing/SKILL.md`
- Purpose: When the user wants to edit, review, or improve existing marketing copy, or refresh outdated content. Also use when the user mentions 'edit this copy,' 'review my copy,' 'copy feedback,' 'proofread,' 'polish this,' 'make this better,' 'copy sweep,' 'tighten this up,' 'this reads awkwardly,' 'clean up this text,' 'too wordy,' 'sharpen the messaging,' 'refresh this content,' 'update this page,' 'this content is outdated,' or 'content audit.' Use this when the user already has copy and wants it improved or refreshed rather than rewritten from scratch. For writing new copy, see copywriting.

### Copywriting

- Folder: `copywriting`
- Path: `.agents/skills/copywriting/SKILL.md`
- Purpose: When the user wants to write, rewrite, or improve marketing copy for any page - including homepage, landing pages, pricing pages, feature pages, about pages, or product pages. Also use when the user says "write copy for," "improve this copy," "rewrite this page," "marketing copy," "headline help," "CTA copy," "value proposition," "tagline," "subheadline," "hero section copy," "above the fold," "this copy is weak," "make this more compelling," or "help me describe my product." Use this whenever someone is working on website text that needs to persuade or convert. For email copy, see emails. For popup copy, see popups. For editing existing copy, see copy-editing.

### Cro

- Folder: `cro`
- Path: `.agents/skills/cro/SKILL.md`
- Purpose: When the user wants to optimize, improve, or increase conversions on any marketing page or form - including homepage, landing pages, pricing pages, feature pages, lead capture forms, or contact forms. Also use when the user says 'CRO,' 'conversion rate optimization,' 'this page isn't converting,' 'improve conversions,' 'why isn't this page working,' 'my landing page sucks,' 'form abandonment,' 'nobody's converting,' 'low conversion rate,' or 'this page needs work.' Use this even if the user just shares a URL and asks for feedback. For signup/registration flows, see signup. For post-signup activation, see onboarding. For popups/modals, see popups.

### Customer Research

- Folder: `customer-research`
- Path: `.agents/skills/customer-research/SKILL.md`
- Purpose: When the user wants to conduct, analyze, or synthesize customer research. Use when the user mentions "customer research," "ICP research," "talk to customers," "analyze transcripts," "customer interviews," "survey analysis," "support ticket analysis," "voice of customer," "VOC," "build personas," "customer personas," "jobs to be done," "JTBD," "what do customers say," "what are customers struggling with," "Reddit mining," "G2 reviews," "review mining," "digital watering holes," "community research," "forum research," "competitor reviews," "customer sentiment," or "find out why customers churn/convert/buy." Use for both analyzing existing research assets AND gathering new research from online sources. For writing copy informed by research, see copywriting. For acting on research to improve pages, see cro.

### Directory Submissions

- Folder: `directory-submissions`
- Path: `.agents/skills/directory-submissions/SKILL.md`
- Purpose: When the user wants to submit their product to startup, SaaS, AI, agent, MCP, no-code, or review directories for backlinks, domain rating, and discovery. Also use when the user mentions "directory submissions," "submit to directories," "backlinks from directories," "list my product," "submit to Product Hunt," "BetaList," "TAAFT," "Futurepedia," "G2 listing," "Capterra listing," "AlternativeTo," "SaaSHub," "AI directories," "MCP registry," "agent directory," "dofollow backlinks," "launch directories," or "directory tracker." Use this whenever someone is planning the directory layer of a product launch or an ongoing backlink campaign. For the broader launch moment, see launch. For programmatic SEO pages that should live behind these backlinks, see programmatic-seo. For AI citation optimization, see ai-seo.

### Emails

- Folder: `emails`
- Path: `.agents/skills/emails/SKILL.md`
- Purpose: When the user wants to create or optimize an email sequence, drip campaign, automated email flow, or lifecycle email program. Also use when the user mentions "email sequence," "drip campaign," "nurture sequence," "onboarding emails," "welcome sequence," "re-engagement emails," "email automation," "lifecycle emails," "trigger-based emails," "email funnel," "email workflow," "what emails should I send," "welcome series," or "email cadence." Use this for any multi-email automated flow. For cold outreach emails, see cold-email. For in-app onboarding, see onboarding.

### Emil Design Eng

- Folder: `emil-design-eng`
- Path: `.agents/skills/emil-design-eng/SKILL.md`
- Purpose: This skill encodes Emil Kowalski's philosophy on UI polish, component design, animation decisions, and the invisible details that make software feel great.

### Free Tools

- Folder: `free-tools`
- Path: `.agents/skills/free-tools/SKILL.md`
- Purpose: When the user wants to plan, evaluate, or build a free tool for marketing purposes - lead generation, SEO value, or brand awareness. Also use when the user mentions "engineering as marketing," "free tool," "marketing tool," "calculator," "generator," "interactive tool," "lead gen tool," "build a tool for leads," "free resource," "ROI calculator," "grader tool," "audit tool," "should I build a free tool," or "tools for lead gen." Use this whenever someone wants to build something useful and give it away to attract leads or earn links. For downloadable content lead magnets (ebooks, checklists, templates), see lead-magnets.

### Frontend Architecture

- Folder: `frontend-architecture`
- Path: `.agents/skills/frontend-architecture/SKILL.md`
- Purpose: A portable, framework-agnostic architecture style for any React or React Native frontend. Organizes apps into feature modules with page/screen directories, a strict server-state vs UI-state split, barrel-only cross-module imports, co-located styles, and clear component-promotion rules. State-management agnostic (Zustand, Redux Toolkit, MobX, Jotai, Valtio, or Context). Styling agnostic (Tailwind, CSS Modules, Tamagui, StyleSheet, styled-components). Use this skill when scaffolding a new app, adding a feature or module, deciding where a component, hook, or piece of state should live, naming types and interfaces, or reviewing folder structure and import boundaries. Works with Next.js App Router, React + Vite SPA, Remix, and Expo / React Native.

### Frontend Data Contracts

- Folder: `frontend-data-contracts`
- Path: `.agents/skills/frontend-data-contracts/SKILL.md`
- Purpose: A portable, framework-agnostic discipline for type safety at the network edge of any React or React Native app. Establishes one typed API client as the single fetch boundary, a parse-don't-validate rule that turns wire JSON into trusted domain types before it enters the app, a single response envelope ({ data } / { error }), one normalized typed error class for every failure mode (server error, bad status, network/abort), per-field validation errors mapped to forms, branded ID types so identifiers can't be mixed, and the rule that raw API shapes never leak past the client. Works with fetch, Zod/Valibot validation, and TanStack Query / RTK Query / SWR. Use this skill when designing an API client, validating or parsing API responses, modeling request/response types, handling API errors, mapping server validation to form fields, or stopping untyped fetch calls from spreading through components. Works with React + Vite, Next.js, Remix, and Expo / React Native.

### Frontend Lighthouse

- Folder: `frontend-lighthouse`
- Path: `.agents/skills/frontend-lighthouse/SKILL.md`
- Purpose: A portable, framework-agnostic Lighthouse CI performance-gate system for any web frontend. Enforces Core Web Vitals budgets (LCP, INP via the TBT lab proxy, CLS) and category score floors (performance, SEO, accessibility, best-practices) as a blocking CI check on every pull request. Runs Lighthouse against the production build with median-of-N runs for stability, on mobile emulation by default with an opt-in desktop form factor. Ships a single `lighthouserc.cjs` config, an npm `lhci` script, and a GitHub Actions workflow. Use this skill when adding performance gates to a project, configuring Lighthouse CI, tuning Core Web Vitals budgets, setting category score thresholds, wiring a Lighthouse GitHub Action, or debugging flaky or failing Lighthouse runs. Works with Next.js, Remix, Astro, SvelteKit, Vite, or any app that serves a production build over HTTP.

### Frontend Observability

- Folder: `frontend-observability`
- Path: `.agents/skills/frontend-observability/SKILL.md`
- Purpose: A portable, framework-agnostic field-side observability system for any React or React Native app. Establishes one typed event taxonomy (canonical event-name constants, never inline strings), a best-effort non-blocking provider fan-out so a failing or absent analytics provider can never throw into the app or block other providers, a single track() entry point exposed through a context hook, real-user Core Web Vitals (RUM) reporting that complements lab Lighthouse budgets, error reporting at deliberate boundaries, and consent/privacy gating so nothing fires before opt-in. Provider-agnostic (Firebase Analytics, GA4, Microsoft Clarity, PostHog, OpenPanel, Sentry, Vercel/Cloudflare analytics) and works the same on web and React Native via one adapter shape. Use this skill when adding analytics or product tracking, instrumenting user actions, reporting Web Vitals from real users, wiring Firebase Analytics on web or React Native, wiring error reporting, gating telemetry on consent, or designing an event schema. Pairs with the frontend-lighthouse skill (lab budgets ↔ field reality). Works with React + Vite, Next.js, Remix, and Expo / React Native.

### Frontend Optimistic Mutations

- Folder: `frontend-optimistic-mutations`
- Path: `.agents/skills/frontend-optimistic-mutations/SKILL.md`
- Purpose: A portable, framework-agnostic discipline for the write path of any React or React Native app using a query/cache layer. Codifies the optimistic-update lifecycle (cancel in-flight queries → snapshot every affected cache → patch instantly → roll back verbatim on error → invalidate on settle), idempotency keys generated once at form init so retries replay the original response on money-moving writes, multi-cache coherence so a detail view and every list page update in lock-step, and the rule that server state is never mirrored into a client store. Shows TanStack Query, RTK Query, and SWR variants. Use this skill when writing create/update/delete mutations, adding optimistic UI with rollback, making writes idempotent, keeping list and detail caches consistent after a write, or reviewing mutation and cache-invalidation code. Works with React + Vite, Next.js, Remix, and Expo / React Native.

### Frontend Seo

- Folder: `frontend-seo`
- Path: `.agents/skills/frontend-seo/SKILL.md`
- Purpose: A portable, framework-agnostic SEO system for any React or React Native-for-web frontend. Centralizes site metadata in one constants module, derives canonical URLs from a single base, builds per-route metadata (title, description, canonical, Open Graph, Twitter/X cards), generates sitemap.xml, robots.txt, and an RSS feed from real content, and emits typed JSON-LD structured data (Person, WebSite, BlogPosting, CreativeWork, BreadcrumbList, FAQPage). Pure, testable builder functions with a thin framework adapter on top. Use this skill when adding SEO to a site, wiring metadata into routes, generating sitemaps/robots/feeds, adding schema.org structured data, fixing canonical URLs or duplicate-content issues, or reviewing SEO coverage. Pairs with the frontend-architecture skill (SEO lives in a service module) and works with Next.js App Router, Remix, Astro, React + Vite, and Expo Router for web.

### Humanizer

- Folder: `humanizer`
- Path: `.agents/skills/humanizer/SKILL.md`
- Purpose: Remove signs of AI-generated writing from text. Use when editing or reviewing text to make it sound more natural and human-written. Based on Wikipedia's comprehensive "Signs of AI writing" guide. Detects and fixes patterns including: inflated symbolism, promotional language, superficial -ing analyses, vague attributions, em dash overuse, rule of three, AI vocabulary words, passive voice, negative parallelisms, and filler phrases.

### Image

- Folder: `image`
- Path: `.agents/skills/image/SKILL.md`
- Purpose: When the user wants to create, generate, edit, or optimize images for marketing - blog heroes, social graphics, product mockups, profile banners, listing visuals, or brand assets. Also use when the user mentions 'AI image generation,' 'generate an image,' 'create a graphic,' 'product mockup,' 'hero image,' 'social media graphic,' 'banner image,' 'cover photo,' 'profile banner,' 'listing screenshot,' 'Flux,' 'Flux Kontext,' 'Midjourney,' 'DALL-E,' 'GPT Image,' 'ChatGPT Images,' 'Ideogram,' 'Gemini image,' 'Nano Banana,' 'Recraft,' 'Stable Diffusion,' 'Canva,' 'Figma,' 'image optimization,' 'compress images,' 'WebP,' or 'OG image.' Use this for general-purpose marketing image creation and optimization. For paid ad image creative and platform-specific ad specs, see ad-creative. For video production, see video.

### Launch

- Folder: `launch`
- Path: `.agents/skills/launch/SKILL.md`
- Purpose: When the user wants to plan a product launch, feature announcement, or release strategy. Also use when the user mentions 'launch,' 'Product Hunt,' 'feature release,' 'announcement,' 'go-to-market,' 'beta launch,' 'early access,' 'waitlist,' 'product update,' 'how do I launch this,' 'launch checklist,' 'GTM plan,' or 'we're about to ship.' Use this whenever someone is preparing to release something publicly. For ongoing marketing after launch, see marketing-ideas.

### Lead Magnets

- Folder: `lead-magnets`
- Path: `.agents/skills/lead-magnets/SKILL.md`
- Purpose: When the user wants to create, plan, or optimize a lead magnet for email capture or lead generation. Also use when the user mentions "lead magnet," "gated content," "content upgrade," "downloadable," "ebook," "cheat sheet," "checklist," "template download," "opt-in," "freebie," "PDF download," "resource library," "content offer," "email capture content," "Notion template," "spreadsheet template," or "what should I give away for emails." Use this for planning what to create and how to distribute it. For interactive tools as lead magnets, see free-tools. For writing the actual content, see copywriting. For the email sequence after capture, see emails.

### Marketing Ideas

- Folder: `marketing-ideas`
- Path: `.agents/skills/marketing-ideas/SKILL.md`
- Purpose: When the user needs marketing ideas, inspiration, or strategies for their SaaS or software product. Also use when the user asks for 'marketing ideas,' 'growth ideas,' 'how to market,' 'marketing strategies,' 'marketing tactics,' 'ways to promote,' 'ideas to grow,' 'what else can I try,' 'I don't know how to market this,' 'brainstorm marketing,' or 'what marketing should I do.' Use this as a starting point whenever someone is stuck or looking for inspiration on how to grow. For specific channel execution, see the relevant skill (ads, social, emails, etc.).

### Marketing Plan

- Folder: `marketing-plan`
- Path: `.agents/skills/marketing-plan/SKILL.md`
- Purpose: When the user needs a comprehensive marketing plan for a client, a company they advise, or their own product. Also use when the user mentions "marketing plan," "growth plan," "GTM plan," "go-to-market plan," "AARRR plan," "90-day marketing plan," "12-month marketing roadmap," "fractional CMO plan," or "fCMO plan." Generates an exhaustive 13-section plan structured by AARRR (Acquisition, Activation, Retention, Referral, Revenue), customized to the client's current budget, team, and stage, mapped to future funding milestones, cross-referenced with the 139-idea marketing-ideas library and an embedded 17-section current-state audit rubric, with a full marketing operations stack showing which skills and MCP/API integrations execute each part. Outputs a Notion-paste-ready markdown document. For positioning and ICP context before planning, see product-marketing. For stage-specific deep work, see onboarding, signup, emails, referrals, pricing.

### Marketing Psychology

- Folder: `marketing-psychology`
- Path: `.agents/skills/marketing-psychology/SKILL.md`
- Purpose: When the user wants to apply psychological principles, mental models, or behavioral science to marketing. Also use when the user mentions 'psychology,' 'mental models,' 'cognitive bias,' 'persuasion,' 'behavioral science,' 'why people buy,' 'decision-making,' 'consumer behavior,' 'anchoring,' 'social proof,' 'scarcity,' 'loss aversion,' 'framing,' or 'nudge.' Use this whenever someone wants to understand or leverage how people think and make decisions in a marketing context. For applying psychology to specific pages, see cro; for pricing tactics, see pricing; for copy framing, see copywriting.

### Nestjs Architecture Principles

- Folder: `nestjs-architecture-principles`
- Path: `.agents/skills/nestjs-architecture-principles/SKILL.md`
- Purpose: Designs and reviews NestJS application architecture using cohesive feature modules, modular monoliths, layered or hexagonal boundaries, dependency inversion, and pragmatic engineering principles. Use when planning a NestJS project, changing module boundaries, evaluating Clean Architecture or DDD, resolving circular dependencies, defining ports and adapters, reviewing coupling, or deciding whether CQRS or microservices are justified. Do not use for pure frontend work or non-NestJS backends. When other skills also apply, reconcile ownership before mutation.

### Nestjs Code Audit

- Folder: `nestjs-code-audit`
- Path: `.agents/skills/nestjs-code-audit/SKILL.md`
- Purpose: Audits an existing NestJS repository with the NestJS Architecture, OOP, and Features skills and returns one prioritized, evidence-backed code-quality report. Use when asked to check a whole NestJS codebase or a scoped folder for syntax, TypeScript, lint, module-boundary, dependency, design-smell, security, testing, performance, reliability, or production-readiness problems. This is a read-only review workflow: it does not fix code, install dependencies, run migrations, or deploy. When other skills also apply, reconcile ownership before mutation.

### Nestjs Feature Audit

- Folder: `nestjs-feature-audit`
- Path: `.agents/skills/nestjs-feature-audit/SKILL.md`
- Purpose: Audits one NestJS feature against its documented roadmap on a specific Git branch and returns an evidence-backed implementation, gap, legacy, bug, and blocker report. Use when asked to audit a feature, validate feature completeness, compare code with a roadmap or acceptance plan, run a feature gap analysis, review migration status, or invoke /audit_feature with a feature name and optional branch. It stops when no clear roadmap is available and does not implement fixes. When other skills also apply, reconcile ownership before mutation.

### Nestjs Features Performance

- Folder: `nestjs-features-performance`
- Path: `.agents/skills/nestjs-features-performance/SKILL.md`
- Purpose: Selects and implements NestJS runtime features, error and API contracts, security, testing, DevOps, performance, and safe scale. Use for middleware, guards, pipes, interceptors, exception filters, typed failures/results, Problem Details, validation errors, HTTP/GraphQL/RPC/gRPC/WebSocket error mapping, deadlines, cancellation, retry classification, fatal process errors, authentication, authorization, caching, queues, schedulers, CI/CD, containers, Kubernetes, configuration and secrets, migrations, supply-chain controls, health probes, logs/metrics/traces, SLOs and alerts, incident recovery, rollout and rollback, event-loop or database bottlenecks, load tests, horizontal scaling, idempotency, backpressure, and graceful shutdown. Do not use for frontend-only performance or non-NestJS services. When other skills also apply, reconcile ownership before mutation.

### Nestjs Git Commit Pr Message

- Folder: `nestjs-git-commit-pr-message`
- Path: `.agents/skills/nestjs-git-commit-pr-message/SKILL.md`
- Purpose: Prepares and publishes intentional Git changes for NestJS projects. Use when the user asks to commit, push, create or update a pull request, prepare changelog or release text, or verify a GitHub Pages deployment after publication. It inspects the complete diff, preserves unrelated work, scans staged content for secrets, matches repository commit conventions, runs relevant checks, and performs only the explicitly requested remote actions. When other skills also apply, reconcile ownership before mutation.

### Nestjs Oop Design Patterns

- Folder: `nestjs-oop-design-patterns`
- Path: `.agents/skills/nestjs-oop-design-patterns/SKILL.md`
- Purpose: Applies pragmatic OOP, SOLID, object-design rules, and design patterns to NestJS and TypeScript code. Use when writing or refactoring controllers, providers, use cases, entities, value objects, repositories, adapters, factories, strategies, handlers, or tests; when diagnosing god services, primitive obsession, inheritance misuse, duplicated conditionals, or leaky abstractions; and when selecting a pattern without over-engineering. Do not use for pure functional codebases or non-NestJS frontend work. When other skills also apply, reconcile ownership before mutation.

### Nestjs Professional Software Engineering

- Folder: `nestjs-professional-software-engineering`
- Path: `.agents/skills/nestjs-professional-software-engineering/SKILL.md`
- Purpose: Designs, implements, refactors, debugs, reviews, and verifies production-quality NestJS and TypeScript software. Use for NestJS feature development, bug fixes, APIs, libraries, testing, maintainability, developer experience, idiomatic syntax, or syntactic sugar. It inspects the current project and official version-appropriate documentation before selecting syntax, preserves public behavior, and tests the result. When other skills also apply, reconcile ownership before mutation.

### Onboarding

- Folder: `onboarding`
- Path: `.agents/skills/onboarding/SKILL.md`
- Purpose: When the user wants to optimize post-signup onboarding, user activation, first-run experience, or time-to-value. Also use when the user mentions "onboarding flow," "activation rate," "user activation," "first-run experience," "empty states," "onboarding checklist," "aha moment," "new user experience," "users aren't activating," "nobody completes setup," "low activation rate," "users sign up but don't use the product," "time to value," or "first session experience." Use this whenever users are signing up but not sticking around. For signup/registration optimization, see signup. For ongoing email sequences, see emails.

### Paywalls

- Folder: `paywalls`
- Path: `.agents/skills/paywalls/SKILL.md`
- Purpose: When the user wants to create or optimize in-app paywalls, upgrade screens, upsell modals, or feature gates. Also use when the user mentions "paywall," "upgrade screen," "upgrade modal," "upsell," "feature gate," "convert free to paid," "freemium conversion," "trial expiration screen," "limit reached screen," "plan upgrade prompt," "in-app pricing," "free users won't upgrade," "trial to paid conversion," or "how do I get users to pay." Use this for any in-product moment where you're asking users to upgrade. Distinct from public pricing pages (see cro) - this focuses on in-product upgrade moments where the user has already experienced value. For pricing decisions, see pricing.

### Popups

- Folder: `popups`
- Path: `.agents/skills/popups/SKILL.md`
- Purpose: When the user wants to create or optimize popups, modals, overlays, slide-ins, or banners for conversion purposes. Also use when the user mentions "exit intent," "popup conversions," "modal optimization," "lead capture popup," "email popup," "announcement banner," "overlay," "collect emails with a popup," "exit popup," "scroll trigger," "sticky bar," or "notification bar." Use this for any overlay or interrupt-style conversion element. For forms outside of popups, see cro. For general page conversion optimization, see cro.

### Pricing

- Folder: `pricing`
- Path: `.agents/skills/pricing/SKILL.md`
- Purpose: When the user wants help with pricing decisions, packaging, or monetization strategy. Also use when the user mentions 'pricing,' 'pricing tiers,' 'freemium,' 'free trial,' 'packaging,' 'price increase,' 'value metric,' 'Van Westendorp,' 'willingness to pay,' 'monetization,' 'how much should I charge,' 'my pricing is wrong,' 'pricing page,' 'annual vs monthly,' 'per seat pricing,' or 'should I offer a free plan.' Use this whenever someone is figuring out what to charge or how to structure their plans. For in-app upgrade screens, see paywalls.

### Product Marketing

- Folder: `product-marketing`
- Path: `.agents/skills/product-marketing/SKILL.md`
- Purpose: When the user wants to create or update their product marketing context document. Also use when the user mentions 'product context,' 'marketing context,' 'set up context,' 'positioning,' 'who is my target audience,' 'describe my product,' 'ICP,' 'ideal customer profile,' or wants to avoid repeating foundational information across marketing tasks. Use this at the start of any new project before using other marketing skills - it creates `.agents/product-marketing.md` that all other skills reference for product, audience, and positioning context.

### Programmatic Seo

- Folder: `programmatic-seo`
- Path: `.agents/skills/programmatic-seo/SKILL.md`
- Purpose: When the user wants to create SEO-driven pages at scale using templates and data. Also use when the user mentions "programmatic SEO," "template pages," "pages at scale," "directory pages," "location pages," "[keyword] + [city] pages," "comparison pages," "integration pages," "building many pages for SEO," "pSEO," "generate 100 pages," "data-driven pages," or "templated landing pages." Use this whenever someone wants to create many similar pages targeting different keywords or locations. For auditing existing SEO issues, see seo-audit. For content strategy planning, see content-strategy.

### Prospecting

- Folder: `prospecting`
- Path: `.agents/skills/prospecting/SKILL.md`
- Purpose: When the user wants to find, qualify, and build a list of prospects to reach out to - across B2B SaaS, general B2B, or local small businesses. Also use when the user mentions "prospecting," "build a prospect list," "find prospects," "find leads," "lead gen list," "find SaaS companies that," "find B2B companies," "find local businesses," "ICP-fit accounts," "who should we go after," "outbound list," "target account list," "find clients near me," "businesses without websites," "prospect research," or "qualified leads." Use this for the list-building and qualification phase. For writing the outbound copy after the list is built, see cold-email. For deep competitive research on specific accounts, see competitor-profiling.

### React Native Architecture

- Folder: `react-native-architecture`
- Path: `.agents/skills/react-native-architecture/SKILL.md`
- Purpose: Build production React Native apps with Expo, navigation, native modules, offline sync, and cross-platform patterns. Use when developing mobile apps, implementing native integrations, or architecting React Native projects.

### React Native Best Practices

- Folder: `react-native-best-practices`
- Path: `.agents/skills/react-native-best-practices/SKILL.md`
- Purpose: Software Mansion's best practices for production React Native and Expo apps on the New Architecture. MUST USE before writing, reviewing, or debugging ANY code in a React Native or Expo project. If the working directory contains a package.json with react-native, expo, or expo-router as a dependency, this skill applies. Trigger on: any code task in a React Native/Expo project, 'React Native', 'Expo', 'New Architecture', 'Reanimated', 'Gesture Handler', 'react-native-svg', 'ExecuTorch', 'react-native-audio-api', 'react-native-enriched-html', 'Worklet', 'Fabric', 'TurboModule', 'WebGPU', 'react-native-wgpu', 'TypeGPU', 'GPU shader', 'WGSL', 'svg', 'animation', 'gesture', 'audio', 'rich text', 'AI model', 'multithreading', 'chart', 'vector', 'image filter', 'shared value', 'useSharedValue', 'runOnJS', 'scheduleOnRN', 'thread', 'worklet', 'Bundle Mode', or any question involving UI, graphics, native modules, or React Native threading and animation behavior. Also use when a more specific sub-skill matches.

### Referrals

- Folder: `referrals`
- Path: `.agents/skills/referrals/SKILL.md`
- Purpose: When the user wants to create, optimize, or analyze a referral program, affiliate program, or word-of-mouth strategy. Also use when the user mentions 'referral,' 'affiliate,' 'ambassador,' 'word of mouth,' 'viral loop,' 'refer a friend,' 'partner program,' 'referral incentive,' 'how to get referrals,' 'customers referring customers,' or 'affiliate payout.' Use this whenever someone wants existing users or partners to bring in new customers. For launch-specific virality, see launch.

### Revops

- Folder: `revops`
- Path: `.agents/skills/revops/SKILL.md`
- Purpose: When the user wants help with revenue operations, lead lifecycle management, or marketing-to-sales handoff processes. Also use when the user mentions 'RevOps,' 'revenue operations,' 'lead scoring,' 'lead routing,' 'MQL,' 'SQL,' 'pipeline stages,' 'deal desk,' 'CRM automation,' 'marketing-to-sales handoff,' 'data hygiene,' 'leads aren't getting to sales,' 'pipeline management,' 'lead qualification,' or 'when should marketing hand off to sales.' Use this for anything involving the systems and processes that connect marketing to revenue. For cold outreach emails, see cold-email. For email drip campaigns, see emails. For pricing decisions, see pricing.

### Sales Enablement

- Folder: `sales-enablement`
- Path: `.agents/skills/sales-enablement/SKILL.md`
- Purpose: When the user wants to create sales collateral, pitch decks, one-pagers, objection handling docs, or demo scripts. Also use when the user mentions 'sales deck,' 'pitch deck,' 'one-pager,' 'leave-behind,' 'objection handling,' 'deal-specific ROI analysis,' 'demo script,' 'talk track,' 'sales playbook,' 'proposal template,' 'buyer persona card,' 'help my sales team,' 'sales materials,' or 'what should I give my sales reps.' Use this for any document or asset that helps a sales team close deals. For competitor comparison pages and battle cards, see competitors. For marketing website copy, see copywriting. For cold outreach emails, see cold-email.

### Schema

- Folder: `schema`
- Path: `.agents/skills/schema/SKILL.md`
- Purpose: When the user wants to add, fix, or optimize schema markup and structured data on their site. Also use when the user mentions "schema markup," "structured data," "JSON-LD," "rich snippets," "schema.org," "FAQ schema," "product schema," "review schema," "breadcrumb schema," "Google rich results," "knowledge panel," "star ratings in search," or "add structured data." Use this whenever someone wants their pages to show enhanced results in Google. For broader SEO issues, see seo-audit. For AI search optimization, see ai-seo.

### Security Requirement Extraction

- Folder: `security-requirement-extraction`
- Path: `.agents/skills/security-requirement-extraction/SKILL.md`
- Purpose: Derive security requirements from threat models and business context. Use when translating threats into actionable requirements, creating security user stories, or building security test cases.

### Seo Audit

- Folder: `seo-audit`
- Path: `.agents/skills/seo-audit/SKILL.md`
- Purpose: When the user wants to audit, review, or diagnose SEO issues on their site. Also use when the user mentions "SEO audit," "technical SEO," "why am I not ranking," "SEO issues," "on-page SEO," "meta tags review," "SEO health check," "my traffic dropped," "lost rankings," "not showing up in Google," "site isn't ranking," "Google update hit me," "page speed," "core web vitals," "crawl errors," or "indexing issues." Use this even if the user just says something vague like "my SEO is bad" or "help with SEO" - start with an audit. For building pages at scale to target keywords, see programmatic-seo. For adding structured data, see schema. For AI search optimization, see ai-seo.

### Signup

- Folder: `signup`
- Path: `.agents/skills/signup/SKILL.md`
- Purpose: When the user wants to optimize signup, registration, account creation, or trial activation flows. Also use when the user mentions "signup conversions," "registration friction," "signup form optimization," "free trial signup," "reduce signup dropoff," "account creation flow," "people aren't signing up," "signup abandonment," "trial conversion rate," "nobody completes registration," "too many steps to sign up," or "simplify our signup." Use this whenever the user has a signup or registration flow that isn't performing. For post-signup onboarding, see onboarding. For lead capture forms (not account creation), see cro.

### Site Architecture

- Folder: `site-architecture`
- Path: `.agents/skills/site-architecture/SKILL.md`
- Purpose: When the user wants to plan, map, or restructure their website's page hierarchy, navigation, URL structure, or internal linking. Also use when the user mentions "sitemap," "site map," "visual sitemap," "site structure," "page hierarchy," "information architecture," "IA," "navigation design," "URL structure," "breadcrumbs," "internal linking strategy," "website planning," "what pages do I need," "how should I organize my site," or "site navigation." Use this whenever someone is planning what pages a website should have and how they connect. NOT for XML sitemaps (that's technical SEO - see seo-audit). For SEO audits, see seo-audit. For structured data, see schema.

### Skill Router

- Folder: `skill-router`
- Path: `.agents/skills/skill-router/SKILL.md`
- Purpose: Primary entry point and orchestrator for this skill repository. Use FIRST, before any other skill, whenever a request is broad, ambiguous, or does not name a skill: decide which skill fits, in what order, and who owns what. Triggers include "which skill", "not sure which skill to use", "how should I start", "help me decide", a new project or feature request, a bug report, a slow system, a review or audit request, a release or launch request, and any mention of Spring Boot, NestJS, React, React Native, backend architecture, databases, APIs, testing, DevOps, marketing, SEO, or design. Resolves the catalog into one primary skill plus at most two supporting skills, assigns ownership when several apply, and then proceeds with the work instead of only advising. Do not use when the user already named a specific skill or when the task is a single trivial edit. When other skills also apply, reconcile ownership before mutation.

### Sms

- Folder: `sms`
- Path: `.agents/skills/sms/SKILL.md`
- Purpose: When the user wants to plan, build, or optimize SMS or MMS marketing - including welcome flows, abandoned cart texts, post-purchase, win-back, promotional sends, or transactional/auth SMS. Also use when the user mentions "SMS marketing," "text message campaigns," "SMS sequence," "SMS automation," "abandoned cart text," "post-purchase SMS," "Klaviyo SMS," "Postscript," "Attentive," "Twilio," "A2P 10DLC," "TCPA," "SMS compliance," "short code," "toll-free SMS," "MMS campaign," "should I do SMS," or "SMS vs email." For email sequences, see emails. For SMS copy framing, see copywriting. For opt-in popups that capture phone numbers, see popups.

### Social

- Folder: `social`
- Path: `.agents/skills/social/SKILL.md`
- Purpose: When the user wants help creating, scheduling, or optimizing social media content for LinkedIn, Twitter/X, Instagram, TikTok, Facebook, or other platforms. Also use when the user mentions 'LinkedIn post,' 'Twitter thread,' 'social media,' 'content calendar,' 'social scheduling,' 'engagement,' 'viral content,' 'what should I post,' 'repurpose this content,' 'tweet ideas,' 'LinkedIn carousel,' 'social media strategy,' 'grow my following,' 'TikTok video,' 'Reels,' 'Shorts,' 'video script,' 'video hook,' 'short-form video,' or 'create a reel.' Use this for social media content creation, repurposing, scheduling, and short-form video scripting. For broader content strategy, see content-strategy. For paid video ads, see ad-creative.

### Spring Boot Actuator

- Folder: `spring-boot-actuator`
- Path: `.agents/skills/spring-boot-actuator/SKILL.md`
- Purpose: Use when exposing, securing, or debugging Spring Boot 3.5 Actuator endpoints. Triggers include management.endpoints.web.exposure.include, management.server.port, management.endpoint.health.probes.enabled, livenessState, readinessState, HealthIndicator, AbstractHealthIndicator, management.endpoint.health.group, show-details, management.info.env, info contributors, conditions endpoint, /actuator/metrics, server.shutdown=graceful, spring.lifecycle.timeout-per-shutdown-phase, and probe configuration. Do not use for metric or trace design, nor for container build choices and pipeline rollout strategy. When other skills also apply, reconcile ownership before mutation.

### Spring Boot Api Versioning

- Folder: `spring-boot-api-versioning`
- Path: `.agents/skills/spring-boot-api-versioning/SKILL.md`
- Purpose: Use when choosing or implementing an API versioning strategy in Spring Boot, classifying a change as additive or breaking, signaling deprecation and sunset, routing several versions at once, or planning client migration and removal. Triggers include URI path /v1, media type versioning, an Accept-Version header, WebMvcConfigurer configureApiVersioning, ApiVersionConfigurer, usePathSegment, useRequestHeader, @RequestMapping version, ApiVersionStrategy, Deprecation and Sunset headers, RFC 9745, and Link rel deprecation. Do not use for endpoint and error contract design, DTO field evolution mechanics, generated spec review, or request mapping and filter mechanics. When other skills also apply, reconcile ownership before mutation.

### Spring Boot Ci Cd

- Folder: `spring-boot-ci-cd`
- Path: `.agents/skills/spring-boot-ci-cd/SKILL.md`
- Purpose: Use when designing, repairing, or reviewing the delivery pipeline for a Spring Boot 3.5 service. Triggers include GitHub Actions workflow, Maven wrapper, ~/.m2 cache key, surefire and failsafe split, testcontainers stage, docker build-push-action, image scan, SBOM, cosign, secrets handling, OIDC, environment promotion, rolling or blue-green or canary deploy, smoke test, health gate, and rollback. Do not use for Dockerfile and image internals, nor for runtime property configuration. When other skills also apply, reconcile ownership before mutation.

### Spring Boot Clean Architecture

- Folder: `spring-boot-clean-architecture`
- Path: `.agents/skills/spring-boot-clean-architecture/SKILL.md`
- Purpose: Use when enforcing the dependency rule in a Spring Boot service, choosing which layer a class belongs in, or reviewing whether JPA, Spring, or HTTP types leak into business rules. Triggers include layering, dependency rule, domain application adapter, service depends on repository, business logic in controller, keep JPA out of the domain, is Clean Architecture worth it, layered vs annotated Spring service, entity is also a database row, where does this class go, or unit test without a Spring context. Do not use for aggregate and invariant design, port interface definition, module boundary verification, DTO shape, or repository and mapping mechanics. When other skills also apply, reconcile ownership before mutation.

### Spring Boot Core

- Folder: `spring-boot-core`
- Path: `.agents/skills/spring-boot-core/SKILL.md`
- Purpose: Use when picking Spring Boot starters, writing or repairing auto-configuration, binding and validating ConfigurationProperties records, activating profiles, diagnosing why a property is not applied, or choosing between a starter, an auto-configuration, and hand-wired beans. Triggers include @SpringBootApplication, @AutoConfiguration, @ConditionalOnClass, @ConditionalOnMissingBean, @EnableConfigurationProperties, spring.config.import, application-prod.yaml, property precedence, actuator env and configprops, DevTools, and virtual threads. Do not use for request handling, persistence wiring, or security wiring. When other skills also apply, reconcile ownership before mutation.

### Spring Boot Data Jpa

- Folder: `spring-boot-data-jpa`
- Path: `.agents/skills/spring-boot-data-jpa/SKILL.md`
- Purpose: Use when designing Spring Data JPA repository interfaces, mapping entities and associations, placing @Transactional boundaries, eliminating N+1 selects, adding interface or DTO projections, applying @EntityGraph or join fetch, paginating with Pageable or keyset cursors, locking rows with @Lock or @Version, auditing created and modified fields, or choosing JPA versus JdbcClient versus jOOQ for a read or write. Triggers include JpaRepository, CrudRepository, EntityManager, LazyInitializationException, MultipleBagFetchException, OptimisticLockingFailureException, @Modifying, PageRequest, Slice, open-in-view, and N plus 1. Do not use for SQL dialect tuning, migration files, or slow query diagnosis. When other skills also apply, reconcile ownership before mutation.

### Spring Boot Ddd

- Folder: `spring-boot-ddd`
- Path: `.agents/skills/spring-boot-ddd/SKILL.md`
- Purpose: Use when modelling bounded contexts, aggregates, entity identity, value objects, invariants, domain services, domain events, and repository semantics in a Spring Boot service. Triggers include bounded context, aggregate, aggregate root, invariant, value object, anemic domain model, domain service, domain event, repository returns rows, two writes one transaction, Specification, set based authorization, ApplicationEventPublisher for domain events, and modelling a messy legacy domain. Do not use for JPA mapping, query tuning, module boundary verification, layer placement, or broker delivery guarantees. When other skills also apply, reconcile ownership before mutation.

### Spring Boot Docker

- Folder: `spring-boot-docker`
- Path: `.agents/skills/spring-boot-docker/SKILL.md`
- Purpose: Use when building or reviewing a container image for a Spring Boot service, including Dockerfile design, layered jars, multi-stage builds, jlink runtimes, GraalVM native images, Cloud Native Buildpacks, .dockerignore, non-root execution, JVM container flags, MaxRAMPercentage, signal handling, image size, and build reproducibility. Triggers include Dockerfile, ENTRYPOINT java -jar, spring-boot-layertools, jarmode tools extract, eclipse-temurin, bpj, buildpacks, native-maven-plugin, OOMKilled, image layer caching, and CI image parity. Do not use for pipeline stages, registry publishing, or deployment strategy, nor for runtime property configuration. When other skills also apply, reconcile ownership before mutation.

### Spring Boot Dto

- Folder: `spring-boot-dto`
- Path: `.agents/skills/spring-boot-dto/SKILL.md`
- Purpose: Use when designing or changing the request and response model of a Spring Boot service, covering Java records for DTOs, immutability and defensive copying, mapping between DTO and domain or persistence models, separate create and update DTOs, over-posting prevention, read models versus command payloads, and DTO field evolution. Triggers include @RequestBody record, CreateOrderRequest, OrderView, MapStruct @Mapper, List.copyOf, clone for byte arrays, @JsonIgnoreProperties, and a DTO leaking an @Entity from a controller. Do not use for status code and error contract design, Bean Validation engine configuration, ORM entity mapping, generated spec review, or version routing. When other skills also apply, reconcile ownership before mutation.

### Spring Boot Flyway

- Folder: `spring-boot-flyway`
- Path: `.agents/skills/spring-boot-flyway/SKILL.md`
- Purpose: Use when authoring, ordering, baselining, repairing, or validating Flyway 11 migrations for a Spring Boot 3.5 application on PostgreSQL 16. Triggers include V-prefixed versioned migrations, R repeatable migrations, U undo migrations, checksum mismatch, validate failed, detected applied migration not resolved locally, baseline on an existing database, out of order, schema history table, expand and contract column renames, seed data, and running migrations as a pipeline step. Do not use for choosing column types or indexes, for entity mapping changes, for pipeline stage ordering, or for provisioning test databases. When other skills also apply, reconcile ownership before mutation.

### Spring Boot Hexagonal Architecture

- Folder: `spring-boot-hexagonal-architecture`
- Path: `.agents/skills/spring-boot-hexagonal-architecture/SKILL.md`
- Purpose: Use when defining or reviewing port interfaces, driven adapters, composition roots, and the anti-corruption boundary around vendor SDKs in a Spring Boot service. Triggers include hexagonal, ports and adapters, primary port, secondary port, driven adapter, two implementations of one port, @Qualifier wiring, @Primary, ObjectProvider, in-memory fake for a test, wrap the Stripe client, ERP adapter, port per use case, who constructs the dependency, and swapping the vendor. Do not use for layer placement, aggregate design, module boundary verification, security filter chains, or JPA mapping. When other skills also apply, reconcile ownership before mutation.

### Spring Boot Hibernate

- Folder: `spring-boot-hibernate`
- Path: `.agents/skills/spring-boot-hibernate/SKILL.md`
- Purpose: Use when mapping, tuning, or debugging Hibernate ORM 6.6 engine behavior in a Spring Boot 3.5 application, covering entity mappings, associations, FetchType, entity graphs, batch inserts, identifier generation, dirty checking, the query plan cache, second level cache, Criteria API, native query integration, statistics, and hbm2ddl configuration. Triggers include N+1, LazyInitializationException, MultipleBagFetchException, StaleObjectStateException, NonUniqueResultException, hibernate.jdbc.batch_size, StatelessSession, generate_statistics, open-in-view, and unexpected cascades. Do not use for SQL dialect or index design, for repository and pagination API design, for authoring migration files, or for end to end latency remediation. When other skills also apply, reconcile ownership before mutation.

### Spring Boot Integration Testing

- Folder: `spring-boot-integration-testing`
- Path: `.agents/skills/spring-boot-integration-testing/SKILL.md`
- Purpose: Use when choosing which Spring Boot 3.5 test layer proves a behavior, covering @SpringBootTest with webEnvironment options, @WebMvcTest, @DataJpaTest, @JsonTest, @RestClientTest, MockMvc against WebTestClient against a random port end to end test, test data builders, @Transactional test rollback and its traps, security test support with spring-security-test, and endpoint contract tests. Triggers include @AutoConfigureMockMvc, @AutoConfigureWebTestClient, @AutoConfigureTestDatabase, TestRestTemplate, @WithMockUser, SecurityMockMvcRequestPostProcessors, @Sql, @SqlBundle, slice failures caused by a missing bean, and webEnvironment RANDOM_PORT. Do not use for JUnit mechanics, mock design, or container provisioning. When other skills also apply, reconcile ownership before mutation.

### Spring Boot Junit

- Folder: `spring-boot-junit`
- Path: `.agents/skills/spring-boot-junit/SKILL.md`
- Purpose: Use when writing, restructuring, naming, or running JUnit 5 tests in a Spring Boot 3.5 project, covering test class and method layout, Given When Then scenarios, one behavior per test, @ParameterizedTest with @CsvSource, @MethodSource and @EnumSource, @Nested grouping, @TestInstance PER_CLASS, @BeforeEach and @BeforeAll lifecycle, custom JUnit extensions, AssertJ and SoftAssertions, Assumptions for environment gated tests, @Tag suites, Clock and seeded Random injection, bounded waiting, and surefire or failsafe execution. Triggers include @Test, @DisplayName, @Disabled, @Timeout, @RegisterExtension, assertThat, assertThatThrownBy, assertAll, junit-platform.properties, mvn test, and mvn verify. Do not use for test double design, container backed dependencies, or application context and slice test selection. When other skills also apply, reconcile ownership before mutation.

### Spring Boot Logging

- Folder: `spring-boot-logging`
- Path: `.agents/skills/spring-boot-logging/SKILL.md`
- Purpose: Use when configuring or reviewing logging in a Spring Boot 3.5 service, including Logback setup, logback-spring.xml, springProfile, springProperty, JSON output, logstash-logback-encoder, MDC and correlation ids, level strategy, appender selection, AsyncAppender queue tuning, sensitive data redaction, and log volume control. Triggers include logging.level, logger name, log pattern, console appender, file appender, rolling policy, stdout, MDC.put, traceId, DEBUG logs in production, log flooding, and log-driven debugging of one request. Do not use for metric or trace emission, nor for actuator endpoint exposure. When other skills also apply, reconcile ownership before mutation.

### Spring Boot Mockito

- Folder: `spring-boot-mockito`
- Path: `.agents/skills/spring-boot-mockito/SKILL.md`
- Purpose: Use when designing or reviewing test doubles in a Spring Boot 3.5 project, covering migration of the deprecated @MockBean and @SpyBean to @MockitoBean and @MockitoSpyBean, choosing between a mock, a fake, a stub, and a real object, stubbing with when versus doReturn, argument matchers and captors, verification scope, strict stubs and the UnnecessaryStubbingException, lenient stubs, static mocking of Clock or UUID, and final class support. Triggers include Mockito.mock, MockitoExtension, @InjectMocks, @MockitoSettings, MockReset, ArgumentCaptor, doThrow, verifyNoMoreInteractions, PotentialStubbingProblem, and mockito-inline removal. Do not use for JUnit class structure, container backed dependencies, or test layer selection. When other skills also apply, reconcile ownership before mutation.

### Spring Boot Modular Monolith

- Folder: `spring-boot-modular-monolith`
- Path: `.agents/skills/spring-boot-modular-monolith/SKILL.md`
- Purpose: Use when defining Spring Modulith application modules, named interfaces, module events, package visibility, and the rules for extracting a module into its own service. Triggers include Spring Modulith, @ApplicationModule, @NamedInterface, ApplicationModules.of and verify, cyclic module dependency, shared kernel, common module dumping ground, module event publication versus a direct call, @ModulithTest, package private visibility, and when to split a microservice. Do not use for inner layer design, aggregate design, port definition, container packaging, or CI pipeline wiring. When other skills also apply, reconcile ownership before mutation.

### Spring Boot Mvc

- Folder: `spring-boot-mvc`
- Path: `.agents/skills/spring-boot-mvc/SKILL.md`
- Purpose: Use when tracing a Spring MVC request from DispatcherServlet to a controller, adding a filter or HandlerInterceptor, writing a RestController, mapping exceptions with ControllerAdvice, configuring content negotiation or message converters, serving static resources, or returning Callable, DeferredResult, SseEmitter, and ResponseBodyEmitter results. Triggers include DispatcherServlet, WebMvcConfigurer, addInterceptors, extendMessageConverters, produces, consumes, HttpMessageNotReadableException, MethodArgumentNotValidException, 415 and 406, CORS preflight, WebAsyncManager, and spring.mvc.async.request-timeout. Do not use for HTTP status and error contract design or security enforcement. When other skills also apply, reconcile ownership before mutation.

### Spring Boot Observability

- Folder: `spring-boot-observability`
- Path: `.agents/skills/spring-boot-observability/SKILL.md`
- Purpose: Use when adding or reviewing metrics, traces, and instrumentation in a Spring Boot 3.5 service. Triggers include MeterRegistry, Counter, Timer, Gauge, Observation, ObservationRegistry, ObservedAspect, @Observed, Micrometer Tracing, OpenTelemetry export, management.tracing.sampling.probability, micrometer-registry-prometheus, actuator prometheus, hikaricp, jdbc.connections, jvm.memory, MeterFilter, cardinality, SLO, error budget, and burn rate. Do not use for log format, MDC, or appender configuration, nor for endpoint exposure rules and the management port. When other skills also apply, reconcile ownership before mutation.

### Spring Boot Openapi

- Folder: `spring-boot-openapi`
- Path: `.agents/skills/spring-boot-openapi/SKILL.md`
- Purpose: Use when generating, reviewing, gating, or publishing the OpenAPI 3.1 contract of a Spring Boot service with springdoc-openapi, including starter wiring, groups, Swagger UI exposure, @Schema and @Operation quality, @ApiResponse coverage, security scheme documentation, and spec drift detection in CI. Triggers include springdoc-openapi-starter-webmvc-ui, springdoc.api-docs.version, springdoc.group-configs, /v3/api-docs, GroupedOpenApi, OpenApiCustomizer, GlobalOpenApiCustomizer, @SecurityScheme, @ApiResponses, @ParameterObject, and openapi.json diffing. Do not use for endpoint design, DTO field shape, auth implementation, version routing, or contract test authoring. When other skills also apply, reconcile ownership before mutation.

### Spring Boot Postgresql

- Folder: `spring-boot-postgresql`
- Path: `.agents/skills/spring-boot-postgresql/SKILL.md`
- Purpose: Use when designing, tuning, or debugging PostgreSQL 16 in a Spring Boot 3.5 application, covering column types, native SQL, index selection, EXPLAIN ANALYZE plan reading, MVCC and isolation levels, row locking, jsonb, arrays, CTEs, window functions, partitioning, sequences and identity columns, extensions, and HikariCP plus pgjdbc pool configuration. Triggers include Seq Scan, index not used, GIN index, jsonb_path_ops, BRIN index, Rows Removed by Filter, deadlock, lock wait, SKIP LOCKED, READ COMMITTED, autovacuum, bloat, maximumPoolSize, connection leak, and slow SQL. Do not use for ORM entity mapping or fetch strategies, for repository and pagination API design, for authoring migration files, or for end to end latency remediation. When other skills also apply, reconcile ownership before mutation.

### Spring Boot Query Optimization

- Folder: `spring-boot-query-optimization`
- Path: `.agents/skills/spring-boot-query-optimization/SKILL.md`
- Purpose: Use when diagnosing or remediating slow queries, latency percentile regressions, or low throughput in a Spring Boot 3.5 application with PostgreSQL 16. Triggers include p99 latency, slow endpoint, slow SQL log, N+1 detection, connection pool wait time, keyset versus offset pagination, projection read paths, batch size tuning, SELECT count cost, cache layers, and proving a fix with before and after measurements. Do not use for SQL dialect or index theory, for entity mapping and fetch mechanics, for repository and pagination API design, or for metrics and tracing infrastructure. When other skills also apply, reconcile ownership before mutation.

### Spring Boot Rest Api

- Folder: `spring-boot-rest-api`
- Path: `.agents/skills/spring-boot-rest-api/SKILL.md`
- Purpose: Use when designing or changing the HTTP contract of a Spring Boot service, including resource and action endpoints, status code selection, ProblemDetail error bodies, pagination envelopes, Idempotency-Key retries, If-Match concurrency, and long-running operation resources. Triggers include @RestController, @RequestMapping, ResponseEntity, @ResponseStatus, @RestControllerAdvice, ProblemDetail, RFC 9457, 201 with Location, 202 Accepted, 204, 409 versus 422, 412 Precondition Failed, 415, 429, ETag, and cursor pagination. Do not use for filter and interceptor mechanics, field validation, DTO shape design, version routing, spec generation, or auth enforcement. When other skills also apply, reconcile ownership before mutation.

### Spring Boot Security

- Folder: `spring-boot-security`
- Path: `.agents/skills/spring-boot-security/SKILL.md`
- Purpose: Use when configuring SecurityFilterChain beans and their order, choosing between filter-level and method-level authorization, wiring an OAuth2 resource server with JWT validation and claim to authority mapping, deciding between stateless bearer and cookie sessions, setting CSRF and CORS posture, declaring a PasswordEncoder, guarding methods with @PreAuthorize, or testing with spring-security-test. Triggers include SecurityFilterChain, securityMatcher, @EnableMethodSecurity, AuthenticationManager, AuthenticationProvider, JwtDecoder, jwk-set-uri, issuer-uri, SecurityContextHolder, DelegatingSecurityContextExecutor, hasRole, hasAuthority, 401, 403, and BCrypt strength. Do not use for MVC hook placement or authorization data storage. When other skills also apply, reconcile ownership before mutation.

### Spring Boot Testcontainers

- Folder: `spring-boot-testcontainers`
- Path: `.agents/skills/spring-boot-testcontainers/SKILL.md`
- Purpose: Use when a Spring Boot 3.5 test must run against a real PostgreSQL, MySQL, MariaDB, Redis, Kafka, or LocalStack dependency, covering declaration of @Testcontainers with @Container, wiring @ServiceConnection, falling back to @DynamicPropertySource, writing a reusable singleton container, pinning an image tag and distribution, seeding and running migrations on start, teardown, parallel execution with JUnit resource locks, and controlling container cost and flakiness in CI. Triggers include postgres:16-alpine, withReuse, withInitScript, PostgreSQLContainer, GenericContainer, org.testcontainers.kafka.KafkaContainer, DynamicPropertyRegistry, TestcontainersLifecycleApplicationContextInitializer, and TESTCONTAINERS_REUSE_ENABLE. Do not use for pure JUnit mechanics, mock design, or endpoint and slice test selection. When other skills also apply, reconcile ownership before mutation.

### Spring Boot Validation

- Folder: `spring-boot-validation`
- Path: `.agents/skills/spring-boot-validation/SKILL.md`
- Purpose: Use when applying Jakarta Bean Validation in a Spring Boot service, designing constraint groups for create and update flows, writing ConstraintValidator implementations, validating cross-field rules, nested objects, collections, and map keys, validating @ConfigurationProperties at startup, or normalizing violations into one stable API error contract. Triggers include @Valid, @Validated, ValidationGroups, @GroupSequence, ConstraintValidator, jakarta.validation.constraints, MethodArgumentNotValidException, HandlerMethodValidationException, BindValidationException, and messages.properties. Do not use for DTO field design or persistence constraint enforcement. When other skills also apply, reconcile ownership before mutation.

### Vercel React Best Practices

- Folder: `vercel-react-best-practices`
- Path: `.agents/skills/vercel-react-best-practices/SKILL.md`
- Purpose: React and Next.js performance optimization guidelines from Vercel Engineering. This skill should be used when writing, reviewing, or refactoring React/Next.js code to ensure optimal performance patterns. Triggers on tasks involving React components, Next.js pages, data fetching, bundle optimization, or performance improvements.

### Video

- Folder: `video`
- Path: `.agents/skills/video/SKILL.md`
- Purpose: When the user wants to create, generate, or produce video content using AI tools or programmatic frameworks. Also use when the user mentions 'video production,' 'AI video,' 'Remotion,' 'Hyperframes,' 'HeyGen,' 'Synthesia,' 'Veo,' 'Sora,' 'Runway,' 'Kling,' 'Seedance,' 'Hailuo,' 'MiniMax,' 'Pika,' 'Hunyuan,' 'Wan,' 'video generation,' 'AI avatar,' 'talking head video,' 'programmatic video,' 'video template,' 'explainer video,' 'product demo video,' 'video pipeline,' or 'make me a video.' Use this for video creation, generation, and production workflows. For video content strategy and what to post, see social. For paid video ad creative, see ad-creative.

### Vitest Testing Patterns

- Folder: `vitest-testing-patterns`
- Path: `.agents/skills/vitest-testing-patterns/SKILL.md`
- Purpose: Write tests using Vitest and React Testing Library. Use when creating unit tests, component tests, integration tests, or mocking dependencies. Activates for test file creation, mock patterns,

