## 0.1.8

- fix backwards compatibility with `GITHUB_TOKEN` resolution. `GITHUB_TOKEN` is no resolved first from an env varibale and then from and input [#133](https://github.com/softprops/action-gh-release/pull/133)
- trim white space in provided `tag_name` [#130](https://github.com/softprops/action-gh-release/pull/130)

## 0.1.7

- allow creating draft releases without a tag [#95](https://github.com/softprops/action-gh-release/pull/95)
- Set default token for simpler setup [#83](https://github.com/softprops/action-gh-release/pull/83)
- fix regression with action yml [#126](https://github.com/softprops/action-gh-release/pull/126)

## 0.1.6

This is a release catch up have a hiatus. Future releases will happen more frequently

- Add 'fail_on_unmatched_files' input, useful for catching cases were your `files` input does not actually match what you expect [#55](https://github.com/softprops/action-gh-release/pull/55)
- Add `repository` input, useful for creating a release in an external repository [#61](https://github.com/softprops/action-gh-release/pull/61)
- Add release `id` to outputs, useful for refering to release in workflow steps following the step that uses this action [#60](https://github.com/softprops/action-gh-release/pull/60)
- Add `upload_url` as action output, useful for managing uploads separately [#75](https://github.com/softprops/action-gh-release/pull/75)
- Support custom `target_commitish` value, useful to customize the default [#76](https://github.com/softprops/action-gh-release/pull/76)
- fix `body_path` input first then fall back on `body` input. this was the originally documented precedence but was implemened the the opposite order! [#85](https://github.com/softprops/action-gh-release/pull/85)
- Retain original release info if the keys are not set, useful for filling in blanks for a release you've already started separately [#109](https://github.com/softprops/action-gh-release/pull/109)
- Limit number of times github api request to create a release is retried, useful for avoiding eating up your rate limit and action minutes do to either an invalid token or other circumstance causing the api call to fail [#111](https://github.com/softprops/action-gh-release/pull/111)

## 0.1.5

- Added support for specifying tag name [#39](https://github.com/softprops/action-gh-release/pull/39)

## 0.1.4

- Added support for updating releases body [#36](https://github.com/softprops/action-gh-release/pull/36)
- Steps can now access the url of releases with the `url` output of this Action [#28](https://github.com/softprops/action-gh-release/pull/28)
- Added basic GitHub API retry support to manage API turbulance [#26](https://github.com/softprops/action-gh-release/pull/26)

## 0.1.3

- Fixed where `with: body_path` was not being used in generated GitHub releases

## 0.1.2

- Add support for merging draft releases [#16](https://github.com/softprops/action-gh-release/pull/16)

GitHub's api doesn't explicitly have a way of fetching a draft release by tag name which caused draft releases to appear as separate releases when used in a build matrix.
This is now fixed.

- Add support for newline-delimited asset list [#18](https://github.com/softprops/action-gh-release/pull/18)

GitHub actions inputs don't inherently support lists of things and one might like to append a list of files to include in a release. Previously this was possible using a comma-delimited list of asset path patterns to upload. You can now provide these as a newline delimieted list for better readability

```yaml
- name: Release
  uses: softprops/action-gh-release@v1
  if: startsWith(github.ref, 'refs/tags/')
  with:
    files: |
      filea.txt
      fileb.txt
      filec.txt
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- Add support for prerelease annotated GitHub releases with the new input field `with.prerelease: true` [#19](https://github.com/softprops/action-gh-release/pull/19)

---

## 0.1.1

- Add support for publishing releases on all supported virtual hosts

You'll need to remove `docker://` prefix and use the `@v1` action tag

---

## 0.1.0

- Initial release
