---
name: clean-skill-install
description: Use when the user asks an agent to install, add, import, update, or publish skills in this repository. Enforces the clean universal workflow, avoids scattered agent folders, syncs the public skills mirror, regenerates inventory, validates the repo, and provides the correct install command for target projects.
---

# Clean Skill Install

Follow this workflow whenever installing or updating skills in `Walthergl66/mis-skills`.

## Rules

- Keep `.agents/skills` as the canonical universal location.
- Keep `skills/` as the public `npx skills add` mirror.
- Do not use `--all` for normal installs. It creates scattered folders such as `.aider-desk`, `.claude`, `.windsurf`, `data`, and extra root `skills` copies in target projects.
- Use `-a codex --copy -y` when installing external skills into this repo. In this project, that writes to `.agents/skills`.
- After installing, always run the repo maintenance commands.
- If scattered agent folders appear, remove only generated agent folders after confirming `.agents/skills` contains the installed skills.
- Do not delete app folders, source folders, user files, or unrelated project content.

## Install An External Skill Pack Into This Repo

From the root of `mis-skills`, run:

```sh
npx skills add owner/repo -a codex --copy -y
```

Example:

```sh
npx skills add coreyhaines31/marketingskills -a codex --copy -y
```

Use `--skill <name>` only when the user asks for one specific skill:

```sh
npx skills add owner/repo --skill skill-name -a codex --copy -y
```

## Maintenance After Install

Run:

```sh
npm run sync -- package
npm run inventory
npm run validate
npx skills add . --list
```

Expected result:

- `.agents/skills` contains the canonical skills.
- `skills/` contains the publication mirror.
- `docs/SKILLS.md` lists the current skills.
- `npm run validate` passes.
- `npx skills add . --list` finds the skills.

## Clean Generated Folders If Needed

If someone accidentally used `--all`, keep `.agents/skills` and remove generated adapter folders such as:

```txt
.adal
.aider-desk
.augment
.autohand
.bob
.claude
.codeartsdoer
.codebuddy
.codemaker
.codestudio
.commandcode
.continue
.cortex
.crush
.devin
.factory
.forge
.goose
.hermes
.iflow
.inferencesh
.jazz
.junie
.kilocode
.kiro
.kode
.lingma
.mcpjam
.moxby
.mux
.neovate
.ona
.openhands
.pi
.pochi
.qoder
.qwen
.reasonix
.roo
.rovodev
.tabnine
.terramind
.tinycloud
.trae
.vibe
.windsurf
.zencoder
data
```

Before deleting any generated folder, verify it is inside the intended workspace and is not part of the user's application.

## Install This Repo Into A Target Project

Recommended clean command from the target project:

```sh
npx skills add Walthergl66/mis-skills -a codex --copy -y
```

This installs into `.agents/skills`.

Avoid:

```sh
npx skills add Walthergl66/mis-skills --all --copy -y
```

because it creates many agent-specific folders.

## Final Response Checklist

When done, tell the user:

- How many skills are installed.
- That `.agents/skills` is the canonical location.
- That `skills/` was synced for public `npx skills add` installs.
- Which validation commands passed.
- The clean install command for target projects.
