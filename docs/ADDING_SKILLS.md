# Adding Skills

## Universal Skill

1. Create a folder under `.agents/skills/<skill-name>`.
2. Add a required `SKILL.md`.
3. Use lowercase kebab-case for the folder and frontmatter `name`.
4. Keep the `SKILL.md` concise. Put large examples in `examples/`, reusable files in `resources/`, and deterministic helpers in `scripts/`.
5. Run `npm run validate`.
6. Run `npm run inventory`.
7. Run `npm run sync` if adapters need refreshed copies.

Minimum `SKILL.md`:

```md
---
name: my-skill
description: Short trigger-focused description of what this skill does and when agents should use it.
---

# My Skill

Use this workflow when...
```

## External Skill Source

Add the source to `registry/skills.json`, then run:

```sh
npm run install:skills
npm run inventory
npm run validate
```

If the package is private or not yet published, keep `status` as `planned` and document the expected purpose in `notes`.

## Agent-Specific Skill

If a skill only works for one agent, place its universal explanation in `.agents/skills` only if other agents can safely read it. Put agent-only hooks, commands, or config under `adapters/<agent>`.
