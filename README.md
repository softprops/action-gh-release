
# action gh-release [![](https://github.com/softprops/action-gh-release/workflows/Main/badge.svg)](https://github.com/softprops/action-gh-release/actions)


A GitHub Action for creating GitHub Releases

## 🤸 Usage

### 🚥 Limit releases to pushes to tags

Typically usage of this action involves adding a step to a build that
is gated pushes to git tags. You may find `step.if` field helpful in accomplishing this
as it maximizes the resuse value of your workflow for non-tag pushes.

Below is a simple example of `step.if` tag gating

```yaml
name: Main

on: push

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@master
      - name: Release
        uses: docker://softprops/action-gh-release
        if: startsWith(github.ref, 'refs/tags/')
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```


### ⬆️ Uploading release assets

You can can configure a number of options for your
GitHub release and all are optional. 

A common case for GitHub releases is to upload your binary after its been validated and packaged.
Use the `with.files` input to declare a comma-separated list of glob expressions matching the files
you wish to upload to GitHub releases. If you'd like you can just list the files by name directly.

Below is an example of uploading a single asset named `Release.txt`

```yaml
name: Main

on: push

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@master
      - name: Build
        run: echo ${{ github.sha }} > Release.txt
      - name: Test
        run: cat Release.txt
      - name: Release
        uses: docker://softprops/action-gh-release
        if: startsWith(github.ref, 'refs/tags/')
        with:
          files: Release.txt
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 📝 External release notes

Many systems exist that can help generate release notes for you. This action supports
loading release notes from a path in your repository's build to allow for the flexibility 
of using any changelog generator for your releases, including a human 👩‍💻

```yaml
name: Main

on: push

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@master
      - name: Generate Changeload
        run: echo "# Good things have arrived" > ${{ github.workflow }}-CHANGELOG.txt
      - name: Release
        uses: docker://softprops/action-gh-release
        if: startsWith(github.ref, 'refs/tags/')
        with:
          body_path: ${{ github.workflow }}-CHANGELOG.txt
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 💅 Customizing

#### inputs

The following are optional as `step.with` keys

| Name        | Type    | Description                                                     |
|-------------|---------|-----------------------------------------------------------------|
| `body`      | String  | Text communicating notable changes in this release              |
| `body_path` | String  | Path to load text communicating notable changes in this release |
| `draft`     | Boolean | Indicator of whether or not this release is a draft             |
| `files`     | String  | Comma-delimited globs of paths to assets to upload for release  |
| `name`      | String  | Name of the release. defaults to tag name                       |

💡When providing a `body` and `body_path` at the same time, `body_path` will be attempted first, then falling back on `body` if the path can not be read from.

#### environment variables

The following are *required* as `step.env` keys

| Name           | Description                          |
|----------------|--------------------------------------|
| `GITHUB_TOKEN` | GITHUB_TOKEN as provided by `secrets`|

Doug Tangren (softprops) 2019