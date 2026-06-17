# Browser → Quicker Action — Design Spec

**Date:** 2026-06-16  
**Status:** implementing (MVP)  
**Scope:** QuickerAgent — convert `browser` / `user_browser` automation into `sys:chromecontrol` action steps.

---

## Problem

Agent prototypes flows with Playwright `browser` tool (no login). Users need **durable Quicker actions** that replay in their real browser via Quicker Connector (`sys:chromecontrol`).

---

## Goals (MVP)

1. Map `browser` call sequence → `data.json` steps (`sys:chromecontrol` + optional `sys:comment`).
2. Agent tool `browser_to_action` returns `dataJson` draft for `workspace_program`.
3. Session recording: successful `browser` calls append to in-memory store (keyed by `sessionId`).
4. Unit tests for navigate / evaluate / click / fill / user_browser passthrough.

## Non-goals (MVP)

- Workbench「导入为动作」UI button
- Auto patch + save without agent review
- `click_xy`, coordinate-only flows
- Login/cookie transfer from Playwright → extension
- Trigger wiring (Wave 1.5)

---

## Mapping table

| `browser` action | Quicker step | Notes |
|------------------|--------------|-------|
| `navigate` | `OpenUrl` | `windowId: New`, `waitComplete: true`, output `tabId` → `browserTab` |
| `evaluate` (+ optional `url`) | `OpenUrl`? + `RunScript` | Split when `url` set |
| `content` | `RunScript` | `document.querySelector(selector)` extract |
| `click` / `fill` / `type` / `press` | `RunScript` | DOM helper from ref role/name/nth |
| `reload` | `Reload` | `tabId.var` |
| `close` | `CloseTab` | |
| `user_browser` run | same `operation` | 1:1 chromecontrol |

**Skip (warn):** `status`, `snapshot`, `search`, `tabs`, `tab`, `wait`, `scroll`, `back`, `forward`, `click_xy`

---

## Wire format

Disk `data.json` per **action-data-schema** — flat `inputParams`, `tabId.var` for reuse.

---

## Agent workflow

1. Prototype with `browser` (headless).
2. `browser_to_action({ source: "session" })` or explicit `recordings`.
3. `qkrpc_action_create` → `workspace_program write_data` with returned `dataJson` → `patch`.

---

## Verification

- `pnpm test --prefix agent-gui -- browser-to-action`
- Manual: generate → patch → `qkrpc_action_debug` with extension connected
