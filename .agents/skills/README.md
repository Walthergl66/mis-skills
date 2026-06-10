# Skills

Canonical universal skill directory.

Each folder here is portable across agents that understand the `.agents/skills` convention:

```txt
<skill-name>/
└── SKILL.md
```

Use `../../docs/SKILLS.md` for the generated summary of installed skills and purposes.

Rules:

- Keep `SKILL.md` frontmatter `name` equal to the folder name.
- Use lowercase kebab-case.
- Put reusable examples in `examples/`, resources in `resources/`, and deterministic helpers in `scripts/`.
- Put agent-specific config in `../../adapters/<agent>`, not inside universal skills.
