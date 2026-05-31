# Compressed XAction (read model)

`action_get` → field **`compressed`**; response also has **`editVersion`** and **`returnMode`**.

## returnMode

| Mode | Use when | `compressed` shape |
|------|----------|-------------------|
| **`full`** (default) | Building or applying patches; need param values | `{ steps, variables, … }` with `inputParams` / `outputParams` |
| **`structure`** | Locating steps to edit; then `action_get` with `full` on one branch or patch by `stepId` | `{ steps, variables }` — **no** `inputParams` / `outputParams`; keeps `stepId`, `stepRunnerKey`, `ifSteps` / `elseSteps`, `note` |
| **`metadata`** | Orientation only (title, counts, outline) | `{ title, description, icon, stepCount, variableCount, variableKeys, stepOutline, … }` — no param bodies |

**`full`** mode always omits literal `inputParams` that are empty or equal to the StepRunner catalog default (same as former `omitDefaultLiteralInputs: true`). Agents must not expect every catalog field in the read model — use **`step_runner_get`** for schema; use **`action_patch`** merge (omit unchanged keys) when writing.

Typical flow: `action_get` **`structure`** → pick `stepId` / `nodePath` → `action_get` **`full`** or **`action_patch`** with minimal diff.

## ActionStep fields

| Field | Notes |
|-------|--------|
| `stepId` | Ephemeral per read (`s-1`…); after **`action_patch`**, take new ids from response **`addedSteps`** / **`updatedSteps`** — no extra `action_get` |
| `stepRunnerKey` | From catalog |
| `inputParams` | `key → { varKey? \| value? }` — keys from **`step_runner_get`** |
| `outputParams` | `outputKey → variableKey` (non-empty only) |
| `ifSteps` / `elseSteps` | Branch children (omitted when empty) |
| `note`, `disabled`, `collapsed`, `delayMs` | Omitted when default/empty |

Expression / interpolation in values: topic **`expressions`**.

## nodePath (when `stepId` is awkward)

| Path | Target |
|------|--------|
| `0` | First root step |
| `1/if/0` | First child in If branch of step index 1 |
| `1/else/0` | First child in Else branch |

## Variables (read)

| Field | Notes |
|-------|--------|
| `key` | Stable id for patches |
| `id` | Ephemeral per read (`v-1`…) |
| `varType` | String when not default `text` |
| `type` | Use numeric **`type`** when **writing** — see **`variables`** |

## subPrograms

Omitting `subPrograms` on full replace/patch preserves existing subPrograms unless you intentionally replace them.
