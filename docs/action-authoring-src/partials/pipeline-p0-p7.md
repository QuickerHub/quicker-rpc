{{#only-cli}}Standalone V1 CLI/MCP existing-action edits: **program-source** — open → YAML/files → dry-run → save. V2 uses native MCP.
QuickerAgent / legacy JSON / action creation:
{{/only-cli}}```text
Ph  Goal
──  ─────────────────────────────────────────
P0  Quicker + plugin; cwd / connectivity
P1  actionId (create / query / search)
P2  sync workspace (get → .quicker/actions/{id}/)
P3  metadata optional (set_metadata)
P4  pick impl: expressions first → module → csscript
P5  per step: step_runner_search → get (NO guess keys)
P6  edit data.json / files/ → save (patch or --patch-file)
P7  trust editVersion after save (NO verify re-get)
```
