# Architecture

This repository uses `.agents/skills` as the universal source of truth.

```txt
.agents/
└── skills/
    └── <skill-name>/
        ├── SKILL.md
        ├── resources/
        ├── examples/
        └── scripts/

skills/
└── <skill-name>/         # Public npx skills add mirror

adapters/
├── codex/
├── cursor/
├── gemini/
├── claude/
├── opencode/
└── copilot/

registry/
└── skills.json

scripts/
├── install.mjs
├── sync.mjs
├── inventory.mjs
└── validate.mjs
```

## Decisions

- `.agents/skills` is canonical because it is portable across compatible agents and keeps `SKILL.md` discoverable.
- `skills/` is a generated publication mirror for `npx skills add owner/repo` compatibility.
- `adapters/*` are generated or agent-specific compatibility layers, not the primary source.
- `registry/skills.json` records external sources and planned skills without requiring every source to be publicly resolvable today.
- `docs/SKILLS.md` is generated from installed `SKILL.md` frontmatter so agents and humans can quickly inspect available capabilities.
- Scripts are Node-based for Windows, Linux, macOS, and WSL compatibility. Bash and PowerShell wrappers are included for convenience.
