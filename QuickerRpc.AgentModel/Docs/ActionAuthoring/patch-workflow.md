# Patch workflow

Prefer **`action_patch`** — one call, one save. Op semantics (`update` / `add` / `remove` / `move`, locators) are defined on that MCP tool; below is a minimal pattern.

```json
{
  "actionId": "<guid>",
  "patch": {
    "steps": [
      {
        "op": "add",
        "after": { "nodePath": "0" },
        "step": {
          "stepRunnerKey": "sys:MsgBox",
          "inputParams": { "content": { "value": "hi" } }
        }
      },
      {
        "op": "update",
        "id": "s-1",
        "inputParams": { "note": { "value": "updated" } }
      }
    ],
    "variables": [
      { "op": "update", "key": "status", "defaultValue": "ok" }
    ]
  },
  "force": true
}
```

## After save — do not call `action_get` to verify

On **`success: true`**, the patch response is the source of truth for what changed. **Do not** call `action_get` afterward just to confirm save or to list new `stepId` / variable `id`.

| Field | Use |
|-------|-----|
| `editVersion` | Pass as `expectedEditVersion` on the next patch/replace |
| `updatedSteps` | Patched steps (compressed); includes new `stepId` for updates |
| `addedSteps` | Newly inserted steps (compressed); use `stepId` / structure for follow-up patches |
| `updatedVariables` | Patched variables (compressed) |
| `addedVariables` | New variables (compressed); stable `key` for later patches |

Summarize to the user from the patch response (`success`, `editVersion`, changed keys / `stepRunnerKey`s). Empty arrays or omitted fields mean nothing changed in that category.

## Patch is a minimal diff

**Only include fields you intend to change.** Omitted keys are left as-is on the server — you do not need to resend the whole step, whole `inputParams`, or unrelated variables.

| Level | Omit when unchanged |
|-------|---------------------|
| Step `update` | `stepRunnerKey`, `outputParams`, `note`, … |
| `inputParams` | Any param key you are not editing |
| Variable `update` | `name`, `defaultValue`, `type`, … |

Example: to add a notify step after write-clipboard, patch only the `add` op — **do not** include `inputParams` on the write-clipboard step unless you mean to change one of its params.

`action_get` (**full**) hides default-empty params (e.g. `successMsg`). That is fine for **reading**; when **patching**, still omit those keys unless you explicitly want to set or remove them.

### `inputParams` merge semantics (when you do send a key)

| Patch value | Effect |
|-------------|--------|
| Key **omitted** | Existing param **unchanged** (normal case) |
| `{ "value": "..." }` / `{ "varKey": "..." }` | Merge into that param only (case-insensitive key) |
| `null` | **Remove** that param key |
| `{ "value": "" }` | Set literal to empty — only when you **intend** to clear; prefer omitting the key to keep the current value |

Patch **responses** (`updatedSteps` / `addedSteps`) return only the touched steps with full literals on those steps so you can see what was saved — not a template to copy back wholesale on the next patch.

### When `action_get` is still required

| Situation | Why |
|-----------|-----|
| **Before** the first edit in a session | Need full `steps` / `variables` / `editVersion` to build the patch |
| **Version conflict** (`versionConflict: true` or stale `editVersion`) | Re-read for current `editVersion`, then retry |
| **Inspect unrelated parts** | Patch response only returns touched steps/variables |
| **`subPrograms` or full-program audit** | Patch does not return subPrograms |

Version conflict: `action_get` → retry with new `expectedEditVersion` or `force: true`.

Full program replace (all steps + variables): `action_replace`.

**Storage (qkrpc MCP):** edits actions in the **current Quicker profile** only (no `workspace` / `.quicker` file path).
