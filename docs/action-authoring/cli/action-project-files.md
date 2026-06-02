# Local .quicker project (file refs)

For large `inputParams` literals, use a **local project directory** instead of embedding long `value` strings in JSON.

## Layout

```text
.quicker/
  actions/{name}/info.json      # id, title, description, icon, editVersion
  actions/{name}/data.json      # steps + variables (compressed XAction shape)
  actions/{name}/scripts/...    # optional resource files
  subprograms/{name}/           # same for global subprograms
```

Paths in `file` are **relative to the project directory** (where `data.json` lives), use `/` separators, and must not contain `..`.

## inputParams with file

In `data.json` only (never sent to Quicker storage):

```json
"script": { "file": "scripts/main.cs" }
```

Import compiles to `{ "value": "..." }` before RPC replace. `file` and `value` / `varKey` are mutually exclusive.

## Commands

```powershell
qkrpc action export --id <guid> --dir .quicker/actions/my-action --json
qkrpc action import --dir .quicker/actions/my-action [--expected-edit-version N] [--force] --json
qkrpc subprogram export --id <nameOrId> --dir .quicker/subprograms/my-sub --json
qkrpc subprogram import --dir .quicker/subprograms/my-sub --json
```

**Export (reversible):** If `data.json` already lists `file` refs, export writes file contents from Quicker and keeps `file` in `data.json`. First export without template writes inline `value` only.

**Import:** Reads `info.json` + `data.json`, resolves all `file` refs, then `action replace` / `subprogram replace`.

See also: `patch-workflow`, `xaction-json`, `authoring-workflow`.
