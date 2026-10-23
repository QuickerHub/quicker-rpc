Existing V1 action edits (CLI/MCP/QuickerAgent): **program-source** — open → YAML/files → dry-run → save. V2 uses native MCP.
The following P0–P7 covers action creation, global subprograms and legacy JSON:
```text
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
