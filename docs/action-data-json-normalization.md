# Action data.json normalization constraints

This document defines the stable disk shape for workspace `data.json` files written by
`qkrpc action get` workspace sync, `action extract/export`, and the workspace
`patch/apply/import` flow. It is a human-facing maintenance contract, not a skill.

## Goals

- `action get` may refresh an existing project, but it should keep the smallest useful
  diff: preserve `files/` external references and only replace action program data.
- `data.json` is an authoring file, not Quicker's native persisted JSON. It must avoid
  ephemeral editor/runtime identifiers.
- After `workspace_program patch` / `action apply`, the same `data.json` should already
  be in canonical disk shape so a later `action get` does not create a second cleanup diff.

## Canonical disk shape

- Root object contains `steps` and `variables`.
- Steps omit `stepId` / `StepId`.
- Variables omit `id` / `Id`.
- Step input binds use compact workspace wire keys where possible:
  - literal value: `"paramKey": "text"` or typed JSON literal
  - file ref: `"paramKey.file": "files/name.ext"`
  - variable bind: `"paramKey.var": "variableKey"`
- Empty branch arrays are omitted, and non-branching steps do not keep `ifSteps` /
  `elseSteps`.
- Variable file defaults use `defaultValue.file` / `default.file` wire after read, not
  legacy `defaultValueFile`.

## Default input parameters

When a step-runner catalog is available, non-control input parameters whose literal value
equals the runner default are omitted from `inputParams`. Control fields are the exception:
they stay in `data.json` even when equal to their default because they select the visible
mode and affect which parameters are meaningful.

Values bound to variables or files are never treated as defaults. Expression strings with
`$` are also kept because they are not plain literals.

## Existing data.json refresh

When refreshing an existing project, file references from the previous `data.json` are
preserved before identifiers are stripped:

- Prefer matching by `stepId` when the old file still has it.
- Fall back to the step's node path (`0`, `1/if/0`, `2/else/1`, etc.) when `stepId` is
  absent.

This allows old projects with `stepId` and newer canonical projects without `stepId` to
both keep externalized scripts/forms during `action get`.

## Patch/apply idempotence

The workspace patch/apply/import path reads `data.json`, compiles file refs, saves to
Quicker, then writes the canonical disk shape only if the file content would actually
change. A successful patch should not leave cleanup work for the next `action get`.

Regression tests should cover:

- writing canonical `data.json` without `stepId` or variable `id`;
- omitting non-control default input parameters while keeping control fields;
- preserving existing `.file` refs when the template has no `stepId`;
- write-if-changed behavior for patch/apply normalization.
