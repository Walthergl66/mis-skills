# Universal Agent Skills

This directory is the portable agent-facing entry point.

- Canonical skills live in `.agents/skills/<skill-name>/SKILL.md`.
- Every `SKILL.md` must include YAML frontmatter with `name` and `description`.
- Agent-specific integration belongs in `adapters/<agent>`.
- The generated inventory lives in `docs/SKILLS.md`.

Agents should inspect `docs/SKILLS.md` first for a compact list of available skills, then open a specific `SKILL.md` only when that skill is relevant.
