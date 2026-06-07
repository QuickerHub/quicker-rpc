# {{#topic-title}}

**When**: create or edit **data.json** — need machine-readable steps[] + variables[] wire shape.

## JSON schema

`qkrpc guide get --topic action-data-schema --json` → **`schema`** (`qkrpc.program-data.v1`).

| programKind | variables[] |
|-------------|-------------|
| **action** | base fields only — NO isInput/isOutput/paramName; runtime input = `{quicker_in_param}` |
| **subprogram** | base + isInput/isOutput/paramName + inputParamInfo/outputParamInfo/tableDef when IO/table |

**steps[]** wire is identical for both kinds.

Human prose: **action-steps** · **action-variables** · **subprogram-workflow**.
