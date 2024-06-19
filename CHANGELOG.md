## 2.0.6

- maintenance release with updated dependencies

## 2.0.5

- Factor in file names with spaces when upserting files [#446](https://github.com/softprops/action-gh-release/pull/446) via [@MystiPanda](https://github.com/MystiPanda)
- Improvements to error handling [#449](https://github.com/softprops/action-gh-release/pull/449) via [@till](https://github.com/till)

## 2.0.4

- Minor follow up to [#417](https://github.com/softprops/action-gh-release/pull/417). [#425](https://github.com/softprops/action-gh-release/pull/425)

## 2.0.3

- Declare `make_latest` as an input field in `action.yml` [#419](https://github.com/softprops/action-gh-release/pull/419)

## 2.0.2

- Revisit approach to [#384](https://github.com/softprops/action-gh-release/pull/384) making unresolved pattern failures opt-in [#417](https://github.com/softprops/action-gh-release/pull/417)

## 2.0.1

- Add support for make_latest property [#304](https://github.com/softprops/action-gh-release/pull/304) via [@samueljseay](https://github.com/samueljseay)
- Fail run if files setting contains invalid patterns [#384](https://github.com/softprops/action-gh-release/pull/384) via [@rpdelaney](https://github.com/rpdelaney)
- Add support for proxy env variables (don't use node-fetch) [#386](https://github.com/softprops/action-gh-release/pull/386/) via [@timor-raiman](https://github.com/timor-raiman)
- Suppress confusing warning when input_files is empty [#389](https://github.com/softprops/action-gh-release/pull/389) via [@Drowze](https://github.com/Drowze)

## 2.0.0

- `2.0.0`!? this release corrects a disjunction between git tag versions used in the marketplace and versions list this file. Previous versions should have really been 1.\*. Going forward this should be better aligned.
- Upgrade action.yml declaration to node20 to address deprecations

## 0.1.15

- Upgrade to action.yml declaration to node16 to address deprecations
- Upgrade dependencies
- Add `asset` output as a JSON array containing information about the uploaded assets

## 0.1.14

- provides an new workflow input option `generate_release_notes` which when set to true will automatically generate release notes for you based on GitHub activity [#179](https://github.com/softprops/action-gh-release/pull/179). Please see the [GitHub docs for this feature](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes) for more information

## 0.1.13

- fix issue with multiple runs concatenating release bodies [#145](https://github.com/softprops/action-gh-release/pull/145)

## 0.1.12

- fix bug leading to empty strings subsituted for inputs users don't provide breaking api calls [#144](https://github.com/softprops/action-gh-release/pull/144)

## 0.1.11

- better error message on release create failed [#143](https://github.com/softprops/action-gh-release/pull/143)

## 0.1.10

- fixed error message formatting for file uploads

## 0.1.9

- add support for linking release to GitHub discussion [#136](https://github.com/softprops/action-gh-release/pull/136)

## 0.1.8

- address recent warnings in assert upload api as well as introduce asset upload overrides, allowing for multiple runs for the same release with the same named asserts [#134](https://github.com/softprops/action-gh-release/pull/134)
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
