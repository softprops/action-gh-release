## 0.1.3

* Fixed where `with: body_path` was not being used in generated GitHub releases

## 0.1.2

* Add support for merging draft releases [#16](https://github.com/softprops/action-gh-release/pull/16)

GitHub's api doesn't explicitly have a way of fetching a draft release by tag name which caused draft releases to appear as separate releases when used in a build matrix.
This is now fixed.

* Add support for newline-delimited asset list [#18](https://github.com/softprops/action-gh-release/pull/18)

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

* Add support for prerelease annotated GitHub releases with the new input field `with.prerelease: true` [#19](https://github.com/softprops/action-gh-release/pull/19)

---

## 0.1.1

* Add support for publishing releases on all supported virtual hosts

You'll need to remove `docker://` prefix and use the `@v1` action tag

---

## 0.1.0

* Initial release