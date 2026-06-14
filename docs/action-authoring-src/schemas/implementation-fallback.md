# {{#topic-title}}

**When**: overview P4 — no fitting module from search, or logic/calc not fixed UI.

## Priority

| tier | means | use |
|------|-------|-----|
| 1 | `$=` / `$$` (expressions) | inline calc, concat, compare, conditional fields on **other** step params |
| 2 | **sys:assign** | single action-var write step (literal, `$$`, `$=`, or `input.var` copy) — search `赋值` → get |
| 3 | **sys:evalexpression** | batch `{varKey}=` in one step, multi-line C#, LINQ, shared intermediate logic |
| 4 | dedicated module (search → get) | clipboard, HTTP, file, UI, … |
| 5 | **sys:csscript** | expressions insufficient (Exec, complex types, API orchestration) |
| 6 | sys:runScript | short PS/CMD or user script |
| 7 | sys:run | external exe |

**FORBIDDEN**: csscript Exec boilerplate when assign/evalexpression suffices. No dedicated module → assign or expressions first, not long PowerShell.

**sys:csscript**: script in **files/*.cs**, inputParams **`"script.file": "files/…"`** — action-data-schema.

## Decision

```text
single var write (literal/$$/$=/copy)? → sys:assign (search 赋值 → get)
inline on other param?                 → $= / $$ on that param value
batch multi-{var}= / LINQ / JSON?      → sys:evalexpression
known stepRunnerKey?                   → step-runner get → step-modules ref → data.json
else                                   → step-runner search (one OR|*) → get
still no fit?                          → sys:csscript
```

Write shapes: **action-data-schema**, **action-project-files**.

## Confusions

| scenario | pick | note |
|----------|------|------|
| single var assign / calc | **sys:assign** or `$=` on param | not csscript |
| batch assign / LINQ / string ops | **sys:evalexpression** | not csscript |
| heavy C# (.cs file) | sys:csscript | after expressions fail |
| type into foreground window | sys:outputText | not sys:showText |
| need else branch | sys:if | not sys:simpleIf |
| multi-file ops | sys:fileOperation | pick type sub-op |
| multi sub-op module | search/get key + control | stringProcess, uiautomation, … |

## Related

expressions · step-runner-search · authoring-workflow · overview
