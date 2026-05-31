# Compressed XAction (read model)

`qkrpc action get` → `payload.compressed`；另有 **`editVersion`**、**`returnMode`**。

## returnMode

| Mode | Use when | `compressed` shape |
|------|----------|-------------------|
| **`full`** (default) | Building or applying patches; need param values | `{ steps, variables, … }` with `inputParams` / `outputParams` |
| **`structure`** | 定位要改的步骤；再 `action get --return-mode full` 或按 `stepId` patch | `{ steps, variables }` — **无** `inputParams` / `outputParams`；保留 `stepId`、`stepRunnerKey`、分支、`note` |
| **`metadata`** | Orientation only (title, counts, outline) | `{ title, description, icon, stepCount, variableCount, variableKeys, stepOutline, … }` — no param bodies |

**`full`** mode omits literal `inputParams` that are empty or equal to the StepRunner catalog default — **except control fields** (`step-runner get` → `schema.ControlField.Key` / `Inputs[].IsControlField`), which are always kept so agents can see the step variant (e.g. `sys:csscript` `mode`, `sys:runScript` `type`). 读模型**不能**代替目录 schema — 写 `inputParams` 前必须 **`qkrpc step-runner get`**；写入用 **`action patch`** 合并（省略未改键）。

典型流：`action get --return-mode structure` → 定 `stepId` / `nodePath` → `action get --return-mode full` 或直接用 **`action patch`** 最小 diff。

## ActionStep fields

| Field | Notes |
|-------|--------|
| `stepId` | 每次 read 临时（`s-1`…）；**`action patch`** 后用响应 **`addedSteps`** / **`updatedSteps`** 中的 `stepId`，勿仅为取 id 再 `action get` |
| `stepRunnerKey` | From catalog |
| `inputParams` | `key → { varKey? \| value? }` — 键名来自 **`step-runner get`** 的 `schema.Inputs[].Key` |
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
