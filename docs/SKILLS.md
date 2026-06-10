# Skill Inventory

Canonical source: `.agents/skills`.

This file is generated from installed `SKILL.md` frontmatter. Run `npm run inventory` after adding, removing, or updating skills.

## Installed Skills

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

### Emil Design Eng

- Folder: `emil-design-eng`
- Path: `.agents/skills/emil-design-eng/SKILL.md`
- Purpose: This skill encodes Emil Kowalski's philosophy on UI polish, component design, animation decisions, and the invisible details that make software feel great.

