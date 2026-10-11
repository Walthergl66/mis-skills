# Contributing

## Commit convention

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) with a Spanish subject.

Format:

```
<type>(<scope>): <subject>
```

- `type` is one of: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`.
- `scope` is optional and names the area (for example `validate`, `sync`, `caveman`, `spring-boot-validation`).
- `subject` is a short imperative summary in Spanish, with no trailing period. Aim for 50 characters and keep the first line under 72.
- Keep subjects in plain ASCII (no accents), matching the existing history.

Body is optional. Add it only when the "why" is not obvious from the subject.

Examples:

```
feat(validate): comprobar enlaces relativos en todos los .md
fix(sync): podar skills obsoletas en los destinos
refactor(skills): normalizar frontmatter de las 98 skills
docs(architecture): documentar el flujo de publicacion
```

Rules:

- One coherent piece per commit. Do not bundle unrelated changes.
- Do not commit secrets, credentials, or generated artifacts that are gitignored.
- Keep commits independent of order so the history stays readable when rebased.
- The convention applies to new commits. History written before this document predates it and is not rewritten.

## Validation

Run before committing:

```
npm run validate
npm run inventory
npm run sync -- package
```

`npm run validate` checks frontmatter shape, relative links across every `.md`, catalog consistency, and the `registry.excludeSkills` invariant.
