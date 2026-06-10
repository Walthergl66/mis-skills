# Agent Adapters

Adapters are optional projections of the canonical `.agents/skills` tree.

Keep universal skills in `.agents/skills`. Put only agent-specific glue, prompts, commands, or generated copies in `adapters/<agent>`.

Supported first-class adapters:

- `adapters/codex`: Codex notes and compatibility guidance.
- `adapters/cursor`: Cursor-facing skill copies and usage notes.
- `adapters/gemini`: Gemini CLI-facing skill copies and usage notes.
- `adapters/claude`: Claude Code-facing skill copies and usage notes.
- `adapters/opencode`: OpenCode-facing skill copies and usage notes.
- `adapters/copilot`: GitHub Copilot-facing skill copies and usage notes.

Run `npm run sync` to refresh adapter skill copies from `.agents/skills`.
