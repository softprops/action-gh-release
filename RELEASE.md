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
   - If the summary mentions issues, use plain `#123` references or full issue links; do not wrap issue numbers like `#123` in backticks.
   - Prefer user-facing fixes and features over internal churn.
   - Keep the merged PR list aligned with `.github/release.yml` categories.
3. Run `npm i` to refresh [package-lock.json](package-lock.json).
4. Run the full local verification set:
   - `npm run fmtcheck`
   - `npm run typecheck`
   - `npm run build`
   - `npm test`
5. Commit the release prep.
   - Use `git commit -s` so the release commit carries a DCO sign-off.
   - Use a plain release commit message like `release X.Y.Z`.
6. Push a release branch and open a pull request against `master`.
   - Wait for required checks and reviews.
   - Do not bypass branch protection or tag an unmerged release branch.
7. After merge, fetch `origin/master` and resolve the exact merged release commit.
   - Confirm that commit contains the expected package version and top changelog entry.
   - When the PR is squash-merged, do not assume the release branch commit is the release commit.
8. Create and push the full annotated version tag on the merged release commit.
   - Example: `git tag -a vX.Y.Z -m "vX.Y.Z" <release-commit>`
   - Push only the full version tag first, then wait for its tag-triggered CI to pass.
9. Move the floating major tag to the same merged release commit.
   - For the current major line, run `npm run updatetag` to move `v3`.
   - Keep `v2` pinned to the latest `2.x` release for consumers that still need the Node 20 runtime.
   - Verify `v3` and the full version tag are annotated and peel to the same commit.
   - Verify `v2` did not move, then wait for the separate `v3` tag-triggered CI run to pass.
10. Create the GitHub release from the full version tag.
   - Prefer the release body from [CHANGELOG.md](CHANGELOG.md), then let GitHub append generated notes only if they add value.
   - Verify the release shows the expected tag, title, notes, draft/prerelease state, and attached artifacts.
11. Run post-release consumer verification in `ruitest2/action-gh-release-test`.
   - Run the generic smoke against both the full version tag and `v3`.
   - Run regression workflows relevant to the fixes in the release.
   - Confirm that every disposable release, tag, discussion, container, volume, and temporary credential was cleaned up.

## Notes

- Behavior changes should already have matching updates in [README.md](README.md), [action.yml](action.yml), tests, and `dist/index.js` before release prep begins.
- Docs-only releases still need an intentional changelog entry and version bump decision.
- If a release is mainly bug fixes, keep the title and summary patch-oriented; do not bury the actual fixes under dependency noise.
- Do not move the floating major tag or publish the GitHub release until the full
  version tag's CI passes.
