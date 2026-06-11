---
name: quicker-browser-script
description: "End-to-end webpage scripting via the Quicker browser extension: prototype RunScript live (user_browser / chromecontrol), save as a sys:chromecontrol action, then auto-run it with event triggers (quicker_trigger, e.g. BrowserUrlChanged). Use when the user wants scripts to run on pages automatically."
---

# quicker-browser-script

Pipeline: **prototype script live → save as action → wire a trigger** so the script runs automatically on matching pages/events.

Requires the Quicker browser extension (Quicker Connector) connected; uses the user's logged-in browser.

## P1 — Prototype the script live

1. `user_browser({ action: "tabs" })` — confirm extension connected; pick `tabId`
2. `user_browser({ action: "run", operation: "RunScript", parameters: { tabId, script } })` — script runs in page context; return a JSON-serializable value as the result
3. Iterate until output is correct; reuse `sessionId`, `tabId` is auto-carried when omitted
4. Other operations (OpenUrl, GetTabInfo, GetElementInfo, …): schema via `qkrpc_step_runner_get` `key=sys:chromecontrol` + `controlField` = operation

CLI / MCP equivalents: `qkrpc chrome tabs|run` / `qkrpc_chrome_tabs` / `qkrpc_chrome_control`.

## P2 — Save as a Quicker action

1. `qkrpc_action_create` → edit body with `workspace_program` (authoring-workflow P1–P7)
2. Steps use `sys:chromecontrol` — **always** `qkrpc_step_runner_get key=sys:chromecontrol --control-field RunScript` first; never guess `inputParams`
3. Full module doc: `docs({ action: "get", topic: "chromecontrol-authoring" })`; patch with `reference: "examples/chromecontrol"`
4. Verify with `qkrpc_action_debug` (step outputs), not plain run

## P3 — Trigger setup (auto-run)

1. `quicker_trigger({ action: "events" })` — get exact `eventType`, `params` keys, and the **variables** the event passes to the triggered action. Always do this before add/update.
2. Add the rule:

```js
quicker_trigger({
  action: "add",
  eventType: "BrowserUrlChanged",
  params: { UrlPattern: "https://github.com" },
  actionIdOrName: "<action guid>",
  note: "run page script on GitHub",
})
```

`UrlPattern` is a **URL-prefix match** (semicolon-separated for multiple); use a `regex:` prefix for regular expressions — not bare regex.

3. Manage: `list` (query keyword) / `update` / `enable` / `disable`; `delete` only on explicit user ask.
4. Optional: `filter` expression against event variables; `delayMs` to wait before running.

CLI / MCP equivalents: `qkrpc trigger events|list|add|update|delete --json` / MCP `quicker_trigger`.

Common events for this pipeline:

| EventType | Fires when | Key params |
|-----------|------------|------------|
| `BrowserUrlChanged` | tab URL changes/matches (needs extension) | `UrlPattern` (prefix or `regex:`), `OnlyActiveTab` |
| `WindowActivated` | window gains focus | `ProcessName`, `WindowTitle` (`regex:` prefix) |
| `ClipboardChanged` | clipboard changes | `ContentType`, `TextPattern` |
| `Repeat` | timer | `RepeatInternval` (legacy typo key), `MaxRepeatCount` |

## Hard rules

- `quicker_trigger events` **before** add/update — `eventType` and `params` keys are case sensitive and include legacy typos (`RepeatInternval`, `IdelResetSeconds`). Never guess.
- Event variables (events output `variables`) are provided to the triggered action — e.g. `BrowserUrlChanged` passes `TabId`, `Url`, `Browser`, `IsActive`. Bind `TabId` into the `sys:chromecontrol` step (`tabId.var`) to target the triggering tab instead of re-querying tabs.
- **RunScript** on MV3: user must enable the extension's **Allow user scripts** toggle.
- Reuse **tabId** across steps (`tabId.var` in actions); do not guess `inputParams` — `step_runner_get` first.
- Confirm with the user before adding/enabling triggers that run on every event occurrence (e.g. broad `UrlPattern`, short `Repeat` intervals).

## Related

quicker-chromecontrol (live control details) · quicker-authoring (program body editing) · qkrpc
