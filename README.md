# action gh-release [![](https://github.com/softprops/action-gh-release/workflows/Main/badge.svg)](https://github.com/softprops/action-gh-release/actions)


A Github Action for creating Github Releases

## Usage

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
      - name: Release
        uses: docker://softprops/action-gh-release
        if: startsWith(github.ref, 'refs/tags/')
        with:
          files: Release.txt
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## inputs

| Name    | Type    | Description                                                   |
|---------|---------|---------------------------------------------------------------|
| `body`  | String  | text communicating notable changes in this release            |
| `draft` | Boolean | indicator of whether or not this release is a draft           |
| `files` | String  | comma-delimited globs of paths to assets to upload for release|
| `name`  | String  | name of the release. defaults to tag name                     |

## environment variables

| Name           | Description                          |
|----------------|--------------------------------------|
| `GITHUB_TOKEN` | GITHUB_TOKEN as provided by `secrets`|

Doug Tangren (softprops) 2019