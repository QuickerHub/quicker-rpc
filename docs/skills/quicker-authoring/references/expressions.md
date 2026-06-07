# Expressions & interpolation

**When**: P4 — default to $= / sys:evalexpression before dedicated steps or csscript. Keys from step_runner_get.

## Pick (P4)

Data transforms → `$=` or `sys:evalexpression` first; `sys:csscript` only for heavy .cs / complex types (implementation-fallback).

| case | do |
|------|-----|
| short text | inline `"paramKey": "…"` |
| long script/HTML (>4 lines) | `"paramKey.file": "files/…"` (action-steps) |
| long evalexpression | `files/*.eval.cs` |

NO csscript Exec boilerplate for simple logic.

## value / varKey / file

One bind per param key — wire: `paramKey` / `paramKey.var` / `paramKey.file` (action-steps). NO mixing.

### value prefix

| prefix | meaning |
|--------|---------|
| (none) | literal; no expandable `{var}` |
| $$ | interpolation |
| $= | C# expression |

- **varKey bind** (`paramKey.var`): variable key string — not expression, no `$$`/`$=`, no `{braces}`.
- **SkipEval** (evalexpression expression): C# body; `{var}` inside; whole string need not start with $=.
- Expand declared var in value/defaultValue → need $$/$= or use varKey.

## Placeholders in strings

| token | meaning |
|-------|---------|
| {count} | action variable |
| {[cliptext]} | clipboard |

Write `{variableKey}` only — not `v_count`.

## quicker_in_param

Runtime action input; NOT in variables[]. Use `{quicker_in_param}` in $$/$=/evalexpression.

## sys:evalexpression

| param | notes |
|-------|-------|
| expression | C#; `{var}=…` assignments |
| onUiThread | UI thread when touching WPF/main UI |
| output | via outputParams string key |

Condition fields may use $= (keys from step_runner_get).

## Z.Expressions

$= and evalexpression: System, Linq, JsonConvert, Regex pre-registered; short type names.

Globals: `_qk`, `_context`, `_eval`. Multi-statement and `{result}={a}+{b}` assignments OK.

## See also

implementation-fallback · action-variables · action-steps · authoring-workflow
