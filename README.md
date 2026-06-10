# Universal AI Agent Skills

Portable skill system for Codex, Cursor, Gemini CLI, Claude Code, OpenCode, GitHub Copilot, and agents compatible with `.agents/skills`.

The canonical standard in this repo is:

```txt
.agents/skills/<skill-name>/SKILL.md
```

For public installation with `npx skills add`, this repo also publishes a root `skills/` mirror:

```txt
skills/<skill-name>/SKILL.md
```

Each skill is a self-contained folder with a required `SKILL.md` and optional `resources/`, `examples/`, or `scripts/`.

## What Is Included

- Universal skill source: `.agents/skills`
- Public `npx skills add` mirror: `skills`
- Agent adapters: `adapters/<agent>`
- External source registry: `registry/skills.json`
- Cross-platform scripts for install, sync, inventory, and validation
- Generated skill catalog: `docs/SKILLS.md`
- Conventions for adding and naming skills

## Quick Start

```sh
npm run validate
npm run inventory
npm run sync
```

On Windows PowerShell:

```powershell
.\scripts\sync.ps1
.\scripts\bootstrap.ps1
```

On Linux, macOS, or WSL:

```sh
./scripts/sync.sh
./scripts/bootstrap.sh
```

## Repository Layout

```txt
.agents/
└── skills/              # Universal source of truth

adapters/                # Optional agent-specific projections
├── codex/
├── cursor/
├── gemini/
├── claude/
├── opencode/
└── copilot/

registry/
└── skills.json          # External source registry

scripts/                 # Cross-platform automation
docs/                    # Architecture, naming, and generated inventory
```

## Installed Skills

See `docs/SKILLS.md` for the generated list of installed skills and what each one does.

Currently installed:

- 52 total skills
- Base design/productivity skills from `emilkowalski/skill` and `juliusbrussee/caveman`
- Marketing skills from `coreyhaines31/marketingskills`

The remaining requested sources are preserved in `registry/skills.json` as `planned` because they did not resolve as public GitHub skill repositories during bootstrap.

## Commands

```sh
npm run install:skills  # Install sources from registry using npx skills
npm run install:project # Copy all canonical skills into another project
npm run sync            # Copy universal skills into adapters
npm run inventory       # Regenerate docs/SKILLS.md from SKILL.md metadata
npm run validate        # Validate naming, frontmatter, and duplicate metadata
npm run bootstrap       # Install, sync, inventory, validate
```

## Install Directly With npx

From any target project, use the clean universal install:

```sh
npx skills add Walthergl66/mis-skills -a codex --copy -y
```

This writes skills into `.agents/skills`, which is the portable location this repo standardizes on.

To inspect what the package exposes before installing:

```sh
npx skills add Walthergl66/mis-skills --list
```

Avoid `--all` unless you intentionally want the CLI to create many agent-specific folders such as `.aider-desk`, `.claude`, `.windsurf`, and others. This repository's recommended pattern is one shared `.agents/skills` tree.

The root `skills/` folder is generated from `.agents/skills` with:

```sh
npm run sync -- package
```

## Install Into Any Project

From this repository, run one command with the target project path:

```sh
npm run install:project -- ../my-app --overwrite
```

PowerShell:

```powershell
.\scripts\install-to-project.ps1 C:\work\my-app --overwrite
```

Bash, Linux, macOS, or WSL:

```sh
./scripts/install-to-project.sh ../my-app --overwrite
```

This copies every folder from `.agents/skills` into `<project>/.agents/skills`.

Options:

- `--overwrite`: replace existing target skills after backing them up into `<project>/.agents/skills.backup`.
- `--skip-existing`: copy only missing skills.
- `--no-backup`: with `--overwrite`, replace existing skills without backup.

## Adding New Skills

Read `docs/ADDING_SKILLS.md`.

Short version:

1. Add `.agents/skills/<skill-name>/SKILL.md`.
2. Use frontmatter with `name` and `description`.
3. Keep the folder name and frontmatter `name` identical.
4. Run `npm run validate`.
5. Run `npm run inventory`.
6. Run `npm run sync` when adapters need updates.

## Design Decisions

- `.agents/skills` is canonical for maximum agent compatibility.
- Adapters are optional compatibility layers, not the source of truth.
- External skill packages are tracked separately in `registry/skills.json`.
- Generated adapter copies are ignored by Git to keep diffs clean.
- `docs/SKILLS.md` gives agents fast context without loading every full skill.
