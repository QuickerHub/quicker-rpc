# Action organization

**When**: tidy action pages, move grid slots, tab order, batch by subprogram ref, virtual process pages. **NOT** program body — see **authoring-workflow**.

## Checklist (O1–O4)

```text
- [ ] O1  list/search — profileId, profileName, row/col
- [ ] O2  action move (profile / row+col / swap / onNoEmptySlot)
- [ ] O3  profile create | delete | reorder (global tabs)
- [ ] O4  process ensure + collect-subprogram (virtual app page)
- [ ] NO data.json edits — program body: authoring-workflow
```

## Concepts

| concept | notes |
|---------|-------|
| profile (action page) | Quicker tab; global scope; first often `_global` |
| scope | global, virtual exe key (`_ceacore_run`), or app exe |
| grid (row, col) | position; omit → first empty slot |
| virtual process | ExeFile `_` prefix; dedicated page in scene manager |

## O1 Discover

```text
list / search (name, scope)
  → uses:<subName>     actions calling subprogram
  → uses-only:<name>   single-step wrapper only
```

```powershell
qkrpc action list --query "keyword" [--scope global] --json
qkrpc action search --query "uses:MySub" [--scope agent] --json
```

UI: agent-gui renders action table in chat; summarize counts, don't paste full markdown table.

## O2 Move one action

```text
action move --id <guid> --profile <profileId|profileName|scope>
  [--row N --col M]   # both required if set
  [--swap]
  [--on-no-empty-slot ask|cancel|create-page-after]
  [--on-occupied-slot ask|cancel|swap]
```

```powershell
qkrpc action move --id <guid> --profile _global [--row 0 --col 0] [--swap] --json
qkrpc action move --id <guid> --profile <profileId> [--row 0 --col 1] [--swap] --json
```

| case | approach |
|------|----------|
| first empty on page | profile only |
| exact (0,1) | row + col |
| swap occupied | swap or onOccupiedSlot: swap |
| page full | needsUserChoice → onNoEmptySlot createPageAfter or cancel |

## O3 Global pages

Create blank page (after `_global`):

```powershell
qkrpc profile create --scope global [--count 1] [--after-first] --json
```

Delete empty page; reorder tabs:

```powershell
qkrpc profile delete --id <profileIdOrName> [--ids <guid1>,<guid2>] --json
qkrpc profile reorder --scope global --after-first --ids <guid1>,<guid2> --json
```

## O4 Virtual process + batch collect

```text
process ensure --exe <_key> --name "<display>" --profile-prefix "<prefix> "
  [--collect-subprogram <name> --move-actions [--move-any]]
```

| param | meaning |
|-------|---------|
| exe | virtual key e.g. `_ceacore_run` |
| profile-prefix | auto page name prefix |
| collect-subprogram + move-actions | move callers into new page |
| move-any | any caller vs wrapper-only (uses-only) |

```powershell
qkrpc process ensure --exe _my_app --name "My App" --profile-prefix "@MyApp " [--collect-subprogram MySub --move-actions [--move-any]] --json
qkrpc process ensure --exe _my_app --name "My App" --profile-prefix "@MyApp " [--collect-subprogram MySub --move-actions [--move-any]] --json
```

## Common flows

**W1** Clear `_global`: profile create → list/search → move each → optional reorder.

**W2** Group by subprogram: search uses:Sub → process ensure or profile create + move.

**W3** Tab order: list global → profile reorder.

## Notes

- Move ≠ edit: no data.json, no expectedEditVersion.
- Destructive OK: no Quicker confirm UI.
- Full page → needsUserChoice; retry with onNoEmptySlot / onOccupiedSlot.

## Related

overview · authoring-workflow · subprogram-workflow
