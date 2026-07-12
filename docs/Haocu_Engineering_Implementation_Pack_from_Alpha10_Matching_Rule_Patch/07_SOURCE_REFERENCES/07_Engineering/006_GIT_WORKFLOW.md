# 006 Git Workflow

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Branch Strategy

Recommended branches:

- `main` — production-ready or stable demo.
- `develop` — integration branch for active work.
- `feature/<scope>-<short-name>` — feature work.
- `fix/<scope>-<short-name>` — bug fixes.
- `docs/<scope>-<short-name>` — documentation updates.

## Commit Style

Use clear prefixes:

- `feat:` new feature.
- `fix:` bug fix.
- `refactor:` code restructuring without behavior change.
- `docs:` documentation only.
- `test:` test changes.
- `chore:` tooling/config.

Examples:

```text
fix(mobile-chat): sort chat threads by latest message
feat(meal-buddy): create card from restaurant menu item
refactor(data): replace latestCorrectedMealRecord with meal record collection
```

## Pull Request Requirements

Every PR should include:

- Summary.
- Changed files or areas.
- Screenshots for UI changes.
- Test/typecheck result.
- Risk notes.
- Documentation updates if behavior changed.

## Merge Rule

Do not merge changes that:

- Break typecheck.
- Add hidden duplicate data sources.
- Change product rules without PRD update.
- Affect RLS without review.
- Break demo-critical flows.

## Release Tags

Use semantic release tags:

- `v0.1-demo`
- `v0.2-mvp-alpha`
- `v0.3-mvp-beta`
- `v1.0-public-mvp`
