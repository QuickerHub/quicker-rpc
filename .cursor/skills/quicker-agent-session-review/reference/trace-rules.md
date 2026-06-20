# Session trace rules

Deterministic checks in `agent-gui/lib/agent-session-analysis/session-rules.ts` plus `agent-gui/lib/agent-eval/trace-rubric.ts`.

## Session rules (session-rules.ts)

| ruleId | Severity | Trigger |
|--------|----------|---------|
| `schema-validation-error` | warn | Tool `output-error` with schema/type validation message |
| `tool-error` | error | Other tool errors |
| `C-duplicate-search` | warn | Same `qkrpc_step_runner_search` query twice |
| `redundant-read-empty-data` | info | `read_data` returned `"steps": []` |
| `create-then-read-data` | info | `read_data` after `qkrpc_action_create` |
| `token-baseline-high` | info | system+tools ≥ 10K tokens on first user turn |
| `tool-call-count-high` | info | ≥ 20 tool calls, ≤ 1 user turn |
| `docs-call-heavy` | warn | ≥ 3 `docs` calls in one session |
| `write-without-step-runner-get` | warn | `write_data` with inputParams but no prior get |

## Trace rubric (trace-rubric.ts) — E-axis

| Violation | Meaning |
|-----------|---------|
| patch followed by full sync/read | patch 后又 `action_get` / `read_data` |
| inline steps JSON in patch | patch 参数含内联 steps |
| patch with inputParams before get | 未 get 就 patch inputParams |
| clip-lines-expr + csscript | 任务禁止 csscript |
| runtime intent/risk mismatch | agentTurnState 与任务 readOnly 不符 |
| patch without diagnostics | patch 后无 diagnostics（无 recovery 推荐时） |
| mutation after ask_user recovery | recovery 要求用户确认但仍执行写操作 |

## Adding a rule

1. Implement in `session-rules.ts` with stable `ruleId`
2. Add entry to `OPTIMIZATION_MAP` in `report.ts`
3. Add test case in `analyze.test.ts`
4. Document row in this file
