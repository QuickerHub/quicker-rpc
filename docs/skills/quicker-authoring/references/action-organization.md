# Action organization

**When**: tidy action pages (panels), move grid slots, tab order, batch by subprogram ref, virtual process pages. **NOT** program body — see **authoring-workflow**.

## Checklist (O1–O4)

```text
- [ ] O1  list/search — profileId, profileName, row/col
- [ ] O2  action move — default NO swap; occupied/full → ask user (new page?)
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

```text
qkrpc_action_list({ query: "keyword", scope?: "global" })
qkrpc_action_search({ query: "uses:MySub", scope?: "agent" })
```
Response has profileId, profileName, row, col — note before move.

UI: agent-gui renders action table in chat; summarize counts, don't paste full markdown table.

## O2 Move one action

```text
action move --id <guid> --profile <profileId|profileName|scope>
  [--row N --col M]   # both required if set
  [--swap]
  [--on-no-empty-slot ask|cancel|create-page-after]
  [--on-occupied-slot ask|cancel|swap]
```

```text
qkrpc_action_move({ id: "<guid>", profile: "_global", row?: 0, col?: 0, swap?: true })
qkrpc_action_move({ id: "<guid>", profile: "<profileId>", row?: 0, col?: 1, swap?: true })
```

**Move policy** ("move X to page Y"):

1. Default: profile only, omit row/col → first empty slot. **Never swap by default.**
2. Target slot occupied → result returns needsUserChoice; **ask the user** (other slot, or swap) — do not silently pass swap / onOccupiedSlot: swap.
3. Page full → result returns needsUserChoice; **ask the user** whether to create a new page, then retry with onNoEmptySlot: createPageAfter (or cancel). **Never auto-create a page.**
4. swap only when the user explicitly asks to exchange two actions' positions.

| case | approach |
|------|----------|
| first empty on page | profile only (default) |
| exact (0,1) | row + col |
| user asks to exchange | swap or onOccupiedSlot: swap |
| occupied / page full | needsUserChoice → ask user before retry |

## O3 Global pages

Create blank page (after `_global`):

```text
qkrpc_profile_create({ count?: 1, afterFirst: true })
```

Delete empty page; reorder tabs:

```text
qkrpc_profile_delete({ profileId?: "<profileId>", profileIds?: ["<guid1>,<guid2>"] })
qkrpc_profile_reorder({ profileIds: ["[guid1,guid2,...]"] })
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

```text
qkrpc_process_ensure({ exeFile: "_my_app", displayName: "My App", profileNamePrefix: "@MyApp ", collectSubProgramName?: "MySub", moveActions?: true, moveAny?: true })
qkrpc_process_ensure({ exeFile: "_my_app", displayName: "My App", profileNamePrefix: "@MyApp ", collectSubProgramName?: "MySub", moveActions?: true, moveAny?: true })
```

## Common flows

**W1** Clear `_global`: list/search → ask user before creating pages → move each → optional reorder.

**W2** Group by subprogram: search uses:Sub → process ensure or profile create + move.

**W3** Tab order: list global → profile reorder.

## Notes

- Move ≠ edit: no data.json, no expectedEditVersion.
- Destructive OK: no Quicker confirm UI.
- needsUserChoice (occupied / full page) → surface the choice to the user; never auto-retry with swap or createPageAfter.

## Related

overview · authoring-workflow · subprogram-workflow
