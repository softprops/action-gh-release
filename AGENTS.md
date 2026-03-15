# action-gh-release

This repository is maintained as a small, user-facing GitHub Action with a relatively wide compatibility surface.
Optimize for stability, reproducibility, and clear user value over broad rewrites.

## Core Rules

- Prefer narrow behavior fixes over structural churn.
- Reproduce current behavior on `master` before changing code.
- Treat GitHub platform behavior as distinct from action behavior.
  If GitHub controls the outcome, prefer docs or clearer errors over brittle workarounds.
- Do not revive stale PRs mechanically.
  Reuse the idea if it still has value, but reimplement on top of current `master`.
- Avoid standalone refactors with no clear user-facing benefit.

## Current Architecture

- `src/main.ts` is the orchestration layer: parse config, validate inputs, create/update release, upload assets, finalize, set outputs.
- `src/github.ts` owns release semantics: lookup, create/update/finalize, asset upload, race handling, and GitHub API interaction.
- `src/util.ts` owns parsing and path normalization.
- Keep behavior-specific logic in `src/github.ts` or `src/util.ts`; avoid growing `src/main.ts` with ad-hoc feature branches.

## Bug-Fix Workflow

- Reproduce the issue against current `master` first.
- When available, use the companion consumer harness repo `action-gh-release-test`.
- Capture exact workflow run URLs and release URLs before claiming a fix.
- If the issue is really a docs/usage or platform-limit case, document it and close it as such instead of forcing a code change.
- If a historical issue no longer reproduces on current `master`, prefer a short closeout note that asks the reporter to open a fresh issue if they still see it.

## Feature Triage

- Ship features only when there is clear user value or repeated demand.
- Small convenience features are fine, but they should stay small.
- Weak-demand features should not expand parsing complexity, cross-platform ambiguity, or maintenance surface.
- For old feature PRs:
  - check whether current `master` already covers the behavior
  - prefer a tiny docs clarification if the behavior exists but is poorly explained
  - close stale feature PRs when the idea is obsolete, low-value, or badly shaped for the current codebase

## Contract Sync

When behavior changes, keep the external contract in sync:

- update `README.md`
- update `action.yml`
- update tests under `__tests__/`
- regenerate `dist/index.js` with `npm run build`

Docs-only changes do not need `dist/index.js` regeneration.

## Verification

For code changes, run:

- `npm run fmtcheck`
- `npm run typecheck`
- `npm run build`
- `npm test`

For behavior changes, also run the relevant external regression workflow(s) in `action-gh-release-test` against the exact ref under test.

## Release and Triage Conventions

- Keep PR labels accurate. Release notes depend on them.
  - bug fixes: `bug`
  - docs-only changes: `documentation`
  - additive features: `feature` or `enhancement`
  - dependency updates: `dependencies`
- Follow [RELEASE.md](RELEASE.md) for version bumps, changelog updates, tagging, and release publication.
- Prefer manual issue/PR closeouts with a short rationale over implicit assumptions.
- Do not auto-close old PRs or issues through unrelated docs PRs.

## Implementation Preferences

- Preserve the current upload/finalize flow unless there is strong evidence it needs to change.
- Prefer upload-time semantics over filesystem mutation.
- Be careful with parsing changes around `files`, path handling, and Windows compatibility.
- Be careful with race-condition fixes; verify both local tests and consumer-repo concurrency harnesses.
- Do not assume a refactor is safe just because tests are green. This action’s behavior is heavily shaped by GitHub API edge cases.
