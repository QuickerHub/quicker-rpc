# Overview

Authoring via Quicker MCP. **Setup:** `mcp-setup`. **Tool names/params:** MCP tool list (not duplicated here).

## Workflow

1. Resolve **`actionId`** via **`action_search`** (create new actions in Quicker UI first — qkrpc MCP has no `action_create`).
2. **`action_get`** before editing: `returnMode: structure` to scan steps; `returnMode: full` when you need param values for the patch (non-default literals only — do not request full catalog defaults).
3. **Pick implementation path** (before stacking many steps): read **`implementation-fallback`** — prefer **`expressions`** / **`sys:evalexpression`** for compute/compare/assign; use dedicated **`step-modules`** only when a stable catalog step fits; if search finds nothing, follow the **fallback chain** (script / self-contained C#), never internal Quicker-repo-only APIs.
4. Per dedicated step: **`guide_get`** topic **`step-modules`** to pick `stepRunnerKey`, then **`step_runner_get`** for schema — use **`step_runner_search`** only when the cheatsheet has no match (one call with `|` OR and `*` wildcards per **`step-runner-search`**); never guess param keys.
5. Expressions in values: **`guide_get`** topic **`expressions`**.
6. **`action_patch`** once per save (edits the action in your current Quicker profile).
7. Use the **patch response** (`editVersion`, `addedSteps`, `updatedSteps`, `addedVariables`, `updatedVariables`) — **do not** call `action_get` again only to verify or to read ids you just wrote. See **`patch-workflow`**.
8. Summarize results to the user (below).

## Rules

| Rule | Detail |
|------|--------|
| Read before write | Patch only after a fresh read when editing existing actions |
| Minimal patch | **`action_patch`**: omit steps, variables, and `inputParams` keys you are not changing — merge preserves the rest |
| Native JSON | `patch` / `xAction` / patches are objects/arrays, not escaped strings |
| Schema-driven | `stepRunnerKey` and `inputParams` keys from `step_runner_get` |
| Ephemeral `stepId` | Use `nodePath` or `addedSteps` after insert; variables use `key` |
| Types on save | Variables: numeric `type`; reads may show `varType` string |
| No post-patch re-read | After successful `action_patch`, use response fragments; skip `action_get` unless conflict or unrelated inspection |
| Token discipline | `addedSteps` / `addedVariables` supply new `stepId` and variable shape for the next patch |
| Read compression | `action_get` always omits default/empty literal `inputParams` in **full** mode — enough for patching; never needed to expand to full catalog defaults |
| No repo-only APIs | Do not reference types from the Quicker source tree unless exposed via MCP / `step_runner_get`; see **`implementation-fallback`** |
| Fallback when no module | After failed `step_runner_search`, use expression → `evalexpression` → `csscript` / `runScript` per **`implementation-fallback`** |

## User summary

Report: `actionId`, `stepRunnerKey`(s), what changed, save success / `editVersion`, or `errorMessage` and retry hint.

## Topics

`implementation-fallback` · `step-modules` · `step-runner-search` · `mcp-setup` · `xaction-json` · `variables` · `expressions` · `patch-workflow`
