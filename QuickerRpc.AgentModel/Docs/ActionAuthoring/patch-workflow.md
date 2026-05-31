# Patch workflow

Prefer **`qkrpc action patch`** — one call, one save. Op semantics (`update` / `add` / `remove` / `move`, locators) match the patch JSON schema; below is a minimal pattern.

```json
{
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
}
```

```powershell
qkrpc action patch --id <guid> --patch-file patch.json --expected-edit-version <N> --json
# or: --force when retrying after conflict
```

**Before patch:** each new/changed catalog step requires **`qkrpc step-runner get --key … --json`**（见 **`authoring-workflow`**）。

## After save — do not call `action get` to verify

On **`success: true`**, the patch response is the source of truth for what changed. **Do not** call `qkrpc action get` afterward just to confirm save or to list new `stepId` / variable `id`.

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

`qkrpc action get --return-mode full` hides default-empty params (e.g. `successMsg`). That is fine for **reading**; when **patching**, still omit those keys unless you explicitly want to set or remove them.

## Omit catalog defaults (Agent: reduce token use)

After **`step-runner get`**, compare each `Inputs[]` entry’s **`Default`** to the value you would write.

| Situation | What to include in `inputParams` |
|-----------|----------------------------------|
| **`add`** (new step) | **Required** params with no usable default (e.g. empty `script` default but you have real script text) **plus** any optional param whose value **differs** from catalog `Default` |
| **`update`** (existing step) | Only keys you **change**; use `null` to drop a key when switching `stepRunnerKey` |
| Either | **Never** copy patch **responses** (`updatedSteps` / `addedSteps`) back wholesale — they echo saved literals, not a minimal template |

**Rule:** if `{ "value": "<Default>" }` would match `step-runner get` → **omit the key** — **except control fields** (`schema.ControlField` / `Inputs[].IsControlField: true`): **keep them** even at default (identifies step variant / sub-operation).

Anti-pattern (redundant non-control defaults):

```json
"inputParams": {
  "mode": { "value": "normal" },
  "script": { "value": "..." },
  "waitResp": { "value": "true" },
  "runOnUiThread": { "value": "auto" },
  "stopIfFail": { "value": "true" },
  "waitMs": { "value": "10000" }
}
```

Minimal (same behavior; `mode` kept as control field):

```json
"inputParams": {
  "mode": { "value": "normal" },
  "script": { "value": "..." }
}
```

Optional params with empty catalog default (e.g. `title`, `reference`) — omit unless you set a non-empty value.

### `inputParams` merge semantics (when you do send a key)

| Patch value | Effect |
|-------------|--------|
| Key **omitted** | Existing param **unchanged** (normal case) |
| `{ "value": "..." }` / `{ "varKey": "..." }` | Merge into that param only (case-insensitive key) |
| `null` | **Remove** that param key |
| `{ "value": "" }` | Set literal to empty — only when you **intend** to clear; prefer omitting the key to keep the current value |

Patch **responses** (`updatedSteps` / `addedSteps`) return only the touched steps with full literals on those steps so you can see what was saved — not a template to copy back wholesale on the next patch.

### When `action get` is still required

| Situation | Why |
|-----------|-----|
| **Before** the first edit in a session | Need full `steps` / `variables` / `editVersion` to build the patch |
| **Version conflict** (`versionConflict: true` or stale `editVersion`) | Re-read for current `editVersion`, then retry |
| **Inspect unrelated parts** | Patch response only returns touched steps/variables |
| **`subPrograms` or full-program audit** | Patch does not return subPrograms |

Version conflict: `qkrpc action get` → retry with new `--expected-edit-version` or `--force`.

Full program replace (all steps + variables): `action_replace`.

**Storage:** edits actions in the **current Quicker profile** only (no `workspace` / `.quicker` file path).
