---
name: quicker-eval-expression
description: "Quicker $=, $$, sys:assign, and sys:evalexpression: inline expressions, single-var assign step, batch {var}= / LINQ. Use when writing action params or assign/evalexpression steps (P4), before sys:csscript."
allowed-tools: docs
compatibility: "QuickerAgent (agent-ui); requires Quicker + QuickerRpc plugin"
---

# Quicker expressions (quicker-eval-expression)

`$=`, `$$`, **sys:assign**, and **sys:evalexpression** — P4 before **sys:csscript**.

Full program editing → **quicker-authoring**. Run-only → **quicker-run**.

## When to load

- `$=` / `$$` in param `value` fields (inline on other steps)
- **sys:assign** steps (single action-var write — search `赋值` → get)
- **sys:evalexpression** steps (batch `{varKey}=`, multi-line C#, LINQ)
- Expression vs csscript choice (implementation-fallback)

## Quick pick

| need | use |
|------|-----|
| one action var, one value | **sys:assign** step |
| concat/calc on another param | `$=` / `$$` inline |
| multi-line C#, LINQ, **multiple `{a}=…; {b}=…`** | **sys:evalexpression** |
| heavy `.cs` / Exec API | **sys:csscript** last |

## Multi-var assignment (critical)

One **evalexpression** step can write **many** action variables — but **only when downstream steps read them**:

```text
{sum} = {num1} + {num2};
{product} = {num1} * {num2}
```

## Vars vs locals (anti-abuse)

- **`var x = …`** — **default** for scratch inside one step (parsing, loops, branches); better perf (no action-var sync).
- **`{varKey}=`** — only when a **later step** (or mapped `output`) reads that var.
- **Do not** bulk-define action vars (`{hasAmount}=`, `{amountSum}=`, …) for logic confined to a single evalexpression.
- Add to `variables[]` only when the value **crosses step boundaries**; reuse existing vars when truly shared.

- LHS: `{declaredVarKey}` from `variables[]` — author `{key}`, never `v_key`
- `expression` is SkipEval — C# body, **no** `$=` prefix
- `{varKey}=` writes even without `output` mapping; `output` = last expression value only
- **Do not** use evalexpression when a single **assign** step suffices

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
| `step-modules` | `assign` / `evalexpression` | step JSON (authored ref) |
| `implementation-fallback` | — | assign vs evalexpression vs csscript |

Load this skill first for expression tasks; deep-read one topic at a time when stuck.

