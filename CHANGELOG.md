## 0.1.2

* Add support for merging draft releases [#16](https://github.com/softprops/action-gh-release/pull/16)

GitHub's api doesn't explicitly have a way of fetching a draft release by tag name which caused draft releases to appear as separate releases when used in a build matrix.
This is now fixed.

---

## 0.1.1

* Add support for publishing releases on all supported virtual hosts

You'll need to remove `docker://` prefix and use the `@v1` action tag

---

## 0.1.0

* Initial release