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

One **evalexpression** step can write **many** action variables:

```text
{sum} = {num1} + {num2};
{product} = {num1} * {num2}
```

- LHS: `{declaredVarKey}` from `variables[]` — author `{key}`, never `v_key`
- `var tmp = …` = local only; persist with `{varKey}=`
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
