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
        if: ${{ startsWith(github.ref, 'refs/tags/') }}
        with:
          files: Release.txt
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Doug Tangren (softprops) 2019