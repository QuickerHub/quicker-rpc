# Release changelogs

Each release tag `vX.Y.Z` has a matching `vX.Y.Z.md` in this folder.

**Commit the file before running `Publish-GitHubRelease.ps1`.** The tag push triggers
`.github/workflows/release-cli.yml`, which reads this file from the tagged commit to
build GitHub Release notes (same content as `qkrpc action update --changelog-file`).

Example `v0.4.5.md`:

```text
v0.4.5

CLI
- ...

安装
- ...

插件 / Quicker
- ...
```

Only the changelog body goes here. Install instructions are appended automatically by
`publish/qkrpc-publish-lib.ps1`.
