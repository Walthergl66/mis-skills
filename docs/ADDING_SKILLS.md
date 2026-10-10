# Adding Skills

## Universal Skill

1. Create a folder under `.agents/skills/<skill-name>`.
2. Add a required `SKILL.md`.
3. Use lowercase kebab-case for the folder and frontmatter `name`.
4. Keep the `SKILL.md` concise. Put large examples in `examples/`, reusable files in `resources/`, and deterministic helpers in `scripts/`.
5. Add `references/*.md` when the skill has depth worth offloading from the main file. Deep technical and framework skills should ship 2 to 3 reference files; self-contained persona or workflow skills may stay single-file.
6. Add `evals/evals.json` so the skill is testable. Use `{"skill": "<name>", "version": "1.0.0", "cases": [{"id", "prompt", "expectations"}]}` with 4 to 6 checkable cases. Every installed skill in this repo now has evals.
7. Run `npm run validate`.
8. Run `npm run inventory`.
9. Run `npm run sync` if adapters need refreshed copies.

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
