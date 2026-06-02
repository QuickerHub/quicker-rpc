---
name: action-project-files
description: "大段 inputParams 用 file 引用与 .quicker 目录 export/import（终端 qkrpc CLI）。Use when patch JSON is too large for inline inputParams."
compatibility: "export/import via qkrpc CLI; agent-ui has no export/import tools yet"
---

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

agent-ui **暂无** export/import 工具；请在终端使用 qkrpc：`action export` / `action import`、`subprogram export` / `subprogram import`（命令见 CLI 版 **`action-project-files`**）。

**Export (reversible):** If `data.json` already lists `file` refs, export writes file contents from Quicker and keeps `file` in `data.json`. First export without template writes inline `value` only.

**Import:** Reads `info.json` + `data.json`, resolves all `file` refs, then `action replace` / `subprogram replace`.

See also: `patch-workflow`, `xaction-json`, `authoring-workflow`.

