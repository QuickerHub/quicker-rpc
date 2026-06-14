# Browser Automation Unification — Design Spec

**Date:** 2026-06-14  
**Status:** Approved (user: 继续，推荐就行)  
**Scope:** QuickerAgent agent-gui — unify Playwright headless, Electron embedded, and Quicker Connector extension behind clear boundaries.

---

## Problem

QuickerAgent has three browser automation paths with overlapping capabilities but unclear LLM-facing boundaries:

| Path | Runtime | Port / RPC | Today |
|------|---------|------------|-------|
| Playwright headless | Node `browser-runtime` | `:6017` | Agent `browser` tool (always) |
| Electron embedded | WebContentsView + automation HTTP | `:6018` | Side panel + `/api/browser/panel` only |
| Quicker Connector | Plugin `sys:chromecontrol` | `qkrpc chrome` | `user_browser` tool exists but **not in registry** |

Pain points:

- Agent automation never uses embedded browser despite `:6018` sharing the same op protocol.
- Embedded automation requires UI mount (`"webview is not mounted"`) — no background script execution.
- `user_browser` documented in routing but disabled by default.
- Registry description for `browser` is stale (“自动化暂不可用”).
- Three backends × duplicate routing logic → agent confusion.

---

## Goals

1. **Default scraping / no-login automation** → Playwright headless (simplest, always available).
2. **Agent can run scripts in embedded Chromium** → offscreen by default; **show side panel only when needed**.
3. **User logged-in browser** → `user_browser` only (extension), never `browser`.
4. **LLM sees 2 tools, not 3** — embedded is a runtime mode of `browser`, not a separate tool.
5. **Internal one op protocol, three drivers** — avoid three parallel method sets.

---

## Non-Goals

- Unifying extension ops into `browser` action schema (chromecontrol stays `operation` + `parameters`).
- Replacing `sys:chromecontrol` in Quicker actions.
- Removing Playwright browser-runtime or Python `browser-runtime/` package.
- Browser-only dev (`localhost:3000` without Electron) gaining embedded mode.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ LLM tools (2)                                                 │
│   browser          — automation (scrape / interact / script)  │
│   user_browser     — user's real browser (extension)          │
└────────────────────────────┬─────────────────────────────────┘
                             │
                  BrowserAutomationFacade
                  resolveTarget() + execute()
                             │
       ┌─────────────────────┼─────────────────────┐
       ▼                     ▼                     ▼
  PlaywrightDriver     EmbeddedDriver      ExtensionDriver
  (:6017 headless)     (:6018 WebContents)  (qkrpc chrome)
       │                     │                     │
  isolated MS Edge      Electron persist      user cookies
  profile               partition (shared)    + Connector
```

### Shared profile decision (approved)

**Embedded offscreen and side panel share the same `sessionId` → same Electron persist partition.**

Rationale: user manually browses in side panel, then asks agent to `evaluate` on same site — cookies and storage carry over. `sessionId` defaults to thread id (existing `browser` convention).

Playwright headless remains **isolated** — never shares cookies with embedded or extension.

---

## Backend Boundaries

| Dimension | headless | embedded | extension |
|-----------|----------|----------|-----------|
| **Tool** | `browser` | `browser` | `user_browser` |
| **Login** | None | Electron profile (not user's Chrome) | User's real cookies |
| **Needs** | `:6017` runtime | Electron shell + `:6018` | Quicker + plugin + Connector |
| **UI** | Never | `showPanel=false` offscreen; `true` → side panel | User's browser window |
| **Default for** | `target=auto`, scrape, no-login | `showPanel=true` or `target=embedded` | Logged-in sites, tab ops |
| **Fallback** | — | → headless if `:6018` down | Error with setup hint |

### Hard routing rules (system prompt + tool descriptions)

| User intent | Tool | Not |
|-------------|------|-----|
| Scrape / no-login page / batch `evaluate` | `browser` (auto → headless) | `user_browser` |
| See page inside QuickerAgent | `browser` + `showPanel: true` | Playwright-only mental model |
| User's logged-in Chrome/Edge/Firefox | `user_browser` | `browser` |
| Author production automation | `sys:chromecontrol` in actions | chat tools |

---

## External API: `browser` tool

Add two optional fields to existing schema:

```ts
target?: "auto" | "headless" | "embedded"  // default: "auto"
showPanel?: boolean                          // default: false
```

All existing `action` values unchanged (`navigate`, `evaluate`, `snapshot`, …).

### `target=auto` resolution

```
1. If caller needs user browser cookies → reject with message: use user_browser
2. If target === "headless" → PlaywrightDriver
3. If target === "embedded" OR showPanel === true:
     if EmbeddedDriver available → EmbeddedDriver
     else → PlaywrightDriver (fallbackFromNative: true)
4. Else → PlaywrightDriver   // default scrape path
```

### `showPanel` behavior

| showPanel | Driver | UI |
|-----------|--------|-----|
| `false` | headless or embedded offscreen | No panel open |
| `true` | embedded (fallback headless + warn) | Open side panel, sync URL |

Result payload includes:

```ts
mode: "headless" | "embedded"
showPanel?: boolean
fallbackFromNative?: boolean
background?: boolean  // true only for headless agent calls (no panel sync)
```

Panel sync (`browserPanelSyncFromToolOutput`): open panel when `showPanel === true && mode === "embedded"`, not when `background === true`.

---

## External API: `user_browser` tool

- Add to `QKRPC_TOOL_REGISTRY` (category: `runtime`, group: `write`).
- Keep `action: tabs | run`, `operation`, `parameters`, `sessionId`.
- No changes to qkrpc chrome RPC surface.

---

## Internal Modules (new layout)

```
agent-gui/lib/browser/
  types.ts           # BrowserTarget, BrowserDriver, ExecuteOptions
  ops.ts             # action → op mapping (extracted from browser-tool.server.ts)
  resolve-target.ts  # auto/headless/embedded logic
  facade.ts          # executeBrowserAutomation()
  drivers/
    playwright.ts    # invokeBrowserRuntime (:6017)
    embedded.ts      # invokeEmbeddedBrowserRuntime (:6018)
```

`extension.ts` stays in `qkrpc-chrome-tool.ts` (only used by `user_browser`).

`browser-tool.server.ts` becomes thin: schema + `executeBrowserTool` delegates to facade.

---

## Electron: Offscreen Embedded Session

**Current blocker:** `manager.mjs` → `getViewOrThrow()` requires mount.

**Change:** `session.ensure` creates `WebContentsView` without `addChildView` when not visible.

```
ensureOffscreen(browserId):
  if view exists → return
  create WebContentsView with persist partition
  store in views map
  do NOT addChildView

mount(url, bounds):          // existing, for showPanel
  ensureOffscreen + addChildView + setBounds + loadURL

automation-engine:           // :6018 ops
  use getWebContents() not getViewOrThrow()
  works for offscreen views
```

`session.close` destroys offscreen view. Side panel manual IPC unchanged.

---

## Environment Matrix

| Environment | headless | embedded | user_browser |
|-------------|----------|----------|--------------|
| Electron dev/prod | ✅ | ✅ | ✅ if Quicker online |
| Browser-only dev | ✅ | ❌ → headless | ✅ if Quicker online |
| Third-party MCP | ❌ | ❌ | ✅ `qkrpc_chrome_*` |

---

## Migration Phases

### P0 — Boundaries & registry (no embedded agent path yet)

- Register `user_browser` in tool registry.
- Fix `browser` registry description and `tool-routing.ts` rows.
- Add `docs/browser-automation.md` (human-readable boundary table).
- Update `quicker-chromecontrol` skill cross-links.

### P1 — Facade + offscreen + agent embedded path

- Extract `lib/browser/*` facade and drivers.
- Implement offscreen session in `embedded-browser/manager.mjs`.
- Wire `browser` tool: `target`, `showPanel`, facade routing.
- Update `browser-panel-patch.ts` panel sync rules.
- Unit tests: `resolve-target.test.ts`, offscreen session tests.

### P2 — Polish

- Tool-test page: show `mode` / `fallbackFromNative` in browser tool results.
- Remove dead Playwright side-panel WS preview code (if still orphaned).
- Align stale docs mentioning “Playwright side panel”.

---

## Testing Strategy

| Layer | What |
|-------|------|
| Unit | `resolveTarget()` matrix; `showPanel` → panel sync intent |
| Unit | offscreen `session.ensure` without mount |
| Integration | `executeBrowserTool({ evaluate, url })` → headless in browser-only dev |
| Integration | Electron smoke: `evaluate` offscreen + `showPanel` opens panel |
| Manual | `user_browser` tabs with Connector; `browser` on getquicker without login |

---

## Open Items (deferred)

- Heuristic auto-switch to `user_browser` from natural language (P2+).
- Per-thread embedded vs global default `sessionId` override UI.
- MCP `qkrpc_chrome_*` alias documentation for third-party agents.
