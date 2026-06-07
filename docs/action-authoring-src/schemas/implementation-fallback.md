# {{#topic-title}}

**When**: overview P4 — no fitting module from search, or logic/calc not fixed UI.

## Priority

| tier | means | use |
|------|-------|-----|
| 1 | `$=` / `$$` (expressions) | inline calc, concat, compare, conditional fields |
| 2 | **sys:evalexpression** | multi-line C#, LINQ, string ops, multi-var assign |
| 3 | dedicated module (search → get) | clipboard, HTTP, file, UI, … |
| 4 | **sys:csscript** | expressions insufficient (Exec, complex types, API orchestration) |
| 5 | sys:runScript | short PS/CMD or user script |
| 6 | sys:run | external exe |

**FORBIDDEN**: csscript Exec boilerplate when evalexpression suffices. No dedicated module → expressions first, not long PowerShell.

**sys:csscript**: script in **files/*.cs**, inputParams **`"script.file": "files/…"`** — action-steps.

## Decision

```text
string/LINQ/multi-assign/JSON? → expressions ($= or evalexpression)
calc/compare/single assign?    → $= / $$ or evalexpression
known stepRunnerKey?           → step-runner get → step-modules ref → data.json
else                           → step-runner search (one OR|*) → get
still no fit?                  → sys:csscript
```

Write shapes: **action-steps**, **action-project-files**.

## Confusions

| scenario | pick | note |
|----------|------|------|
| assign/calc/LINQ/string | expressions / evalexpression | not csscript; not obsolete sys:assign |
| heavy C# (.cs file) | sys:csscript | after expressions fail |
| type into foreground window | sys:outputText | not sys:showText |
| need else branch | sys:if | not sys:simpleIf |
| multi-file ops | sys:fileOperation | pick type sub-op |
| multi sub-op module | search/get key + control | stringProcess, uiautomation, … |

## Related

expressions · step-runner-search · authoring-workflow · overview
