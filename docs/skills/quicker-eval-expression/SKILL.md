---
name: quicker-eval-expression
description: "Quicker $=, $$, and sys:evalexpression: C# eval, LINQ, multi-variable {var}= assignment in one step. Use when writing expressions in action params or evalexpression steps (P4), before sys:csscript."
allowed-tools: docs
compatibility: "QuickerAgent (agent-ui); requires Quicker + QuickerRpc plugin"
---

# Quicker expressions (quicker-eval-expression)

`$=`, `$$`, and **sys:evalexpression** — P4 default before dedicated steps or **sys:csscript**.

Full program editing → **quicker-authoring**. Run-only → **quicker-run**.

## When to load

- `$=` / `$$` in param `value` fields
- **sys:evalexpression** steps (multi-line C#, LINQ)
- **Multi-variable** `{varKey}=` assignment in one step
- Expression vs csscript choice (implementation-fallback)

## Quick pick

| need | use |
|------|-----|
| concat text | `$$` interpolation |
| calc / compare / single result | `$=` on param `value` |
| multi-line C#, LINQ, **multiple `{a}=…; {b}=…`** | **sys:evalexpression** |
| heavy `.cs` / Exec API | **sys:csscript** last |

## Multi-var assignment (critical)

One **evalexpression** step can write **many** action variables:

```text
{sum} = {num1} + {num2};
{product} = {num1} * {num2}
```

- LHS: `{declaredVarKey}` from `variables[]` — author `{key}`, never `v_key`
- `var tmp = …` = local only; persist with `{varKey}=`
- `expression` is SkipEval — C# body, **no** `$=` prefix
- `{varKey}=` writes even without `output` mapping; `output` = last expression value only

## Placeholders

| token | use |
|-------|-----|
| `{count}` | action variable key |
| `{[cliptext]}` | clipboard |
| `{quicker_in_param}` | runtime input (tray/panel/runaction) |

## Deep-read (docs get)

| topic | reference | content |
|-------|-----------|---------|
| `quicker-eval-expression` | `expressions` | full guide (Z.Expressions, globals, multi-var) |
| `quicker-eval-expression` | `evalexpression-examples` | sys:evalexpression step JSON |
| `expressions` | — | same full guide (authoring topic alias) |
| `step-modules` | `examples/evalexpression` | step JSON (catalog path) |
| `implementation-fallback` | — | expressions vs module vs csscript |

Load this skill first for expression tasks; deep-read one topic at a time when stuck.

