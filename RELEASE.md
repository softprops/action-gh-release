# Release Workflow

Use this checklist when cutting a new `action-gh-release` release.

## Inputs

- Decide the semantic version bump first: `major`, `minor`, or `patch`.
- Review recent merged PRs and labels before drafting the changelog entry.
- Make sure `master` is current and the worktree is clean before starting.

## Checklist

1. Update [package.json](package.json) to the new version.
2. Add the new entry at the top of [CHANGELOG.md](CHANGELOG.md).
   - Summarize the release in 1 short paragraph.
   - Prefer user-facing fixes and features over internal churn.
   - Keep the merged PR list aligned with `.github/release.yml` categories.
3. Run `npm i` to refresh [package-lock.json](package-lock.json).
4. Run the full local verification set:
   - `npm run fmtcheck`
   - `npm run typecheck`
   - `npm run build`
   - `npm test`
5. Commit the release prep.
   - Use a plain release commit message like `release 2.5.4`.
6. Create the annotated tag for the release commit.
   - Example: `git tag -a v2.5.4 -m "v2.5.4"`
7. Push the commit and tag.
   - Example: `git push origin master && git push origin v2.5.4`
8. Move the floating major tag to the new release tag.
   - For the current major line, either run `npm run updatetag` or update the script first if the major ever changes.
   - Verify the floating tag points at the same commit as the new full tag.
9. Create the GitHub release from the new tag.
   - Prefer the release body from [CHANGELOG.md](CHANGELOG.md), then let GitHub append generated notes only if they add value.
   - Verify the release shows the expected tag, title, notes, and attached artifacts.

## Notes

- Behavior changes should already have matching updates in [README.md](README.md), [action.yml](action.yml), tests, and `dist/index.js` before release prep begins.
- Docs-only releases still need an intentional changelog entry and version bump decision.
- If a release is mainly bug fixes, keep the title and summary patch-oriented; do not bury the actual fixes under dependency noise.
