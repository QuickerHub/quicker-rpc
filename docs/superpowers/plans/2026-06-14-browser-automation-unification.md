# Browser Automation Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify three browser backends behind 2 LLM tools (`browser` + `user_browser`) with clear routing, offscreen embedded execution, and optional side-panel display.

**Architecture:** `BrowserAutomationFacade` + three drivers; `browser` gains `target`/`showPanel`; embedded shares `sessionId` profile with side panel; Playwright remains default for scrape.

**Tech Stack:** Next.js agent-gui, Playwright browser-runtime (:6017), Electron embedded automation (:6018), qkrpc chrome RPC.

**Spec:** `docs/superpowers/specs/2026-06-14-browser-automation-design.md`

---

## File Map

| File | Responsibility |
|------|----------------|
| `agent-gui/lib/browser/types.ts` | `BrowserTarget`, driver interfaces |
| `agent-gui/lib/browser/ops.ts` | `action` → runtime `op` mapping |
| `agent-gui/lib/browser/resolve-target.ts` | `auto` / env / `showPanel` logic |
| `agent-gui/lib/browser/facade.ts` | `executeBrowserAutomation()` |
| `agent-gui/lib/browser/drivers/playwright.ts` | `:6017` invoke |
| `agent-gui/lib/browser/drivers/embedded.ts` | `:6018` invoke + mode metadata |
| `agent-gui/lib/browser/resolve-target.test.ts` | Target resolution unit tests |
| `agent-gui/lib/browser-tool.server.ts` | Thin wrapper: schema + delegate |
| `agent-gui/lib/browser-panel-patch.ts` | Panel sync on `showPanel` |
| `agent-gui/lib/tool-registry.ts` | Fix `browser` desc; add `user_browser` |
| `agent-gui/lib/tool-routing.ts` | Add `showPanel` / embedded row |
| `agent-gui/lib/tools.ts` | Ensure `user_browser` wired (verify only) |
| `agent-gui/electron/embedded-browser/manager.mjs` | Offscreen `ensureSession` |
| `agent-gui/electron/embedded-browser/automation-engine.mjs` | Use offscreen WebContents |
| `docs/browser-automation.md` | Human boundary table |
| `docs/skills/quicker-chromecontrol/SKILL.md` | Cross-link unified doc |

---

## Phase P0 — Registry & docs (shippable alone)

### Task 1: Register `user_browser` and fix stale descriptions

**Files:**
- Modify: `agent-gui/lib/tool-registry.ts`
- Modify: `agent-gui/lib/tool-routing.ts`

- [ ] Add `user_browser` entry: group `write`, category `runtime`, label「用户浏览器」
- [ ] Update `browser` description: headless default; embedded when `showPanel`; not for user cookies
- [ ] Add routing row: `| Show page in app side panel | browser + showPanel | user_browser |`
- [ ] Verify `lib/tools.ts` / `pickChatTools` includes registry ids (no code change if already generic)

**Test:** Tool picker shows both; default-enabled ids include `user_browser`.

---

### Task 2: Human-readable boundary doc

**Files:**
- Create: `docs/browser-automation.md`
- Modify: `docs/skills/quicker-chromecontrol/SKILL.md` (link only)

- [ ] One-page table: headless / embedded / extension / sys:chromecontrol
- [ ] When-to-use decision tree (Chinese + English tool names)
- [ ] Environment matrix from spec
- [ ] Link from `agent-gui/README.md` or `docs/README.md` index

**Test:** Doc review — no contradiction with spec.

---

## Phase P1 — Facade + offscreen embedded

### Task 3: Extract browser op mapping

**Files:**
- Create: `agent-gui/lib/browser/ops.ts`
- Modify: `agent-gui/lib/browser-tool.server.ts` (import from ops)

- [ ] Move `opForAction`, `SESSION_ENSURE_ACTIONS` to `ops.ts`
- [ ] Export types used by drivers
- [ ] `browser-tool.server.ts` behavior unchanged (still Playwright-only for now)

**Test:** `pnpm exec tsx --test` any existing browser tests still pass; or run tool-test `browser` action `status`.

---

### Task 4: Target resolution

**Files:**
- Create: `agent-gui/lib/browser/types.ts`
- Create: `agent-gui/lib/browser/resolve-target.ts`
- Create: `agent-gui/lib/browser/resolve-target.test.ts`

- [ ] `resolveBrowserTarget({ target, showPanel, env })` implements spec matrix
- [ ] Tests: auto+no panel → headless; auto+showPanel+embedded available → embedded; explicit headless; fallback when no :6018
- [ ] `env.embeddedAvailable` injectable for tests

**Test:** `pnpm exec tsx --test lib/browser/resolve-target.test.ts` green.

---

### Task 5: Driver modules

**Files:**
- Create: `agent-gui/lib/browser/drivers/playwright.ts`
- Create: `agent-gui/lib/browser/drivers/embedded.ts`
- Create: `agent-gui/lib/browser/facade.ts`

- [ ] Move `executePlaywrightBrowserTool` body → `playwright.ts`
- [ ] Move `executeNativeEmbeddedBrowserTool` body → `embedded.ts`
- [ ] Facade: `resolveTarget` → driver → unified result shape with `mode`
- [ ] Preserve `audience: "panel"` path for `/api/browser/panel` (panel still prefers embedded)

**Test:** `/api/tools/execute` browser `status` returns `mode: "headless"` in browser-only dev.

---

### Task 6: Offscreen embedded session (Electron)

**Files:**
- Modify: `agent-gui/electron/embedded-browser/manager.mjs`
- Modify: `agent-gui/electron/embedded-browser/automation-engine.mjs`

- [ ] Add `ensureOffscreen(browserId)` — create WebContentsView without `addChildView`
- [ ] `getWebContents(browserId)` works when offscreen (not only mounted)
- [ ] `mount()` calls `ensureOffscreen` then attaches to window
- [ ] `session.ensure` op in automation-engine calls `ensureOffscreen`
- [ ] `isMounted()` remains false for offscreen-only sessions

**Test:** Electron dev — `curl :6018/v1/invoke` `session.ensure` + `page.evaluate` without prior panel mount.

---

### Task 7: Wire `browser` tool schema + panel sync

**Files:**
- Modify: `agent-gui/lib/browser-tool.server.ts`
- Modify: `agent-gui/lib/browser-panel-patch.ts`

- [ ] Add `target` and `showPanel` to Zod schema + tool description
- [ ] Remove `shouldUseHeadlessPlaywrightForAudience(agent)` hardcode; use facade
- [ ] `background: true` only when `mode === "headless"` && `!showPanel`
- [ ] `browserPanelSyncFromToolOutput`: open when `showPanel && mode === "embedded"`

**Test:** Agent tool `evaluate` with `showPanel:false` → no panel; with `showPanel:true` in Electron → panel opens.

---

### Task 8: Frontend check

**Files:** (verify only)

- [ ] `dev_frontend_check` paths `["/", "/tool-test"]` ok
- [ ] Tool-test browser suite: `status`, `navigate`, `evaluate` headless
- [ ] Electron manual: embedded offscreen evaluate + showPanel navigate

---

## Phase P2 — Polish (optional follow-up)

### Task 9: Tool-test UI mode badge ✅

**Files:**
- Modify: `agent-gui/lib/browser-tool-result.ts`
- Modify: `agent-gui/components/chat/BrowserToolResultView.tsx`
- Modify: `agent-gui/app/globals.css`

- [x] Show `mode`, `fallbackFromNative`, `showPanel` in browser tool summary + detail view

---

### Task 10: Cleanup stale references ✅

**Files:**
- Delete: `agent-gui/components/browser/EmbeddedBrowserRemoteView.tsx`
- Delete: `agent-gui/lib/use-browser-panel-stream.ts`
- Delete: `agent-gui/lib/browser-panel-stream-config.ts`
- Modify: `docs/action-authoring-src/workflows/action-publish-workflow.md` (+ cli + skill copies)

- [x] Remove orphaned Playwright side-panel preview client code
- [x] Fix action-publish doc wording (embedded browser)

---

## Commit Strategy

| Commit | Scope |
|--------|-------|
| `docs(agent-gui): browser automation boundary spec and plan` | P0 docs + spec (this PR batch) |
| `feat(agent-gui): register user_browser and fix browser tool metadata` | Task 1 |
| `docs: add browser-automation boundary guide` | Task 2 |
| `refactor(agent-gui): extract browser automation facade` | Tasks 3–5 |
| `feat(electron): offscreen embedded browser sessions` | Task 6 |
| `feat(agent-gui): browser target and showPanel routing` | Task 7 |

---

## Verification Checklist (before claiming done)

- [x] `browser` + `evaluate` + url → headless, no panel (browser-only dev) — API `status` returns `mode: headless`, `background: true`
- [x] `browser` + `showPanel:true` + `navigate` → embedded result includes `showPanel: true` (panel opens via `useBrowserPanelMessageSync` in chat UI)
- [x] `browser` + `target:embedded` + `evaluate` + url → offscreen embedded (`mode: embedded`, `mounted: false`)
- [x] `user_browser` + `tabs` → works with Connector (API verified)
- [x] `tool-routing` matches registry descriptions
- [x] `dev_frontend_check` ok after UI touches
- [x] Browser unit tests (13/13) pass
