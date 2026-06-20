---
name: quicker-agent-session-review
description: >-
  Analyze QuickerAgent chat exports (quicker-agent-chat-export JSON) to score
  authoring flow, detect tool/schema issues, and recommend prompt/tool/skill
  optimizations. Use when the user provides an exported thread JSON or asks to
  improve agent-gui behavior from real sessions.
---

# QuickerAgent Session Review

Offline analysis of exported chat threads to improve prompts, skills, tools, and agent flow.

## When to use

- User attaches or paths to `quicker-agent-*.json` under QuickerAgent exports
- User asks to optimize agent-gui after a failed or inefficient authoring session
- After manual benchmark runs — explain **why** the trace was slow or wrong

## Input format

Exports use `format: "quicker-agent-chat-export"` (see `agent-gui/lib/chat-thread-export.ts`).

Required fields: `thread`, `stats`, `messages[]` with assistant `tool-*` parts and optional `metadata.contextReport` / `agentTurnState`.

## Workflow

1. **Validate** export format/version.
2. **Extract** user prompt, tool timeline (with errors), token metrics, runtime metadata.
3. **Run rules**
   - Session rules: `agent-gui/lib/agent-session-analysis/session-rules.ts`
   - E-axis trace rubric: `agent-gui/lib/agent-eval/trace-rubric.ts`
4. **Match** user prompt to `authoring-tasks.json` when possible.
5. **Report** markdown + optimization hints mapped to repo paths.
6. **Optional F-axis**: if action id known and task has `verify.mockProfile`, run `qkrpc action run --mock --assert`.

## CLI (deterministic)

From repo root:

```powershell
pwsh -NoProfile -File ./scripts/Invoke-AgentSessionAnalysis.ps1 -Latest
pwsh -NoProfile -File ./scripts/Invoke-AgentSessionAnalysis.ps1 -ExportPath "C:\...\quicker-agent-*.json"
```

From `agent-gui/`:

```powershell
pnpm agent-session -- --latest
pnpm agent-session -- "C:\Users\...\exports\quicker-agent-*.json"
pnpm agent-session -- export.json --json
```

Cursor slash command: **`/session-analysis`**

Exit code 1 when trace rubric fails or severity=error findings exist.

## Report sections

| Section | Content |
|---------|---------|
| Summary | tokens, tool count, intent, matched benchmark task |
| Tool timeline | ordered calls, ERROR markers |
| Findings | session rules + E-axis violations |
| Optimization hints | ranked targets (instructions, skills, tools, Plugin) |

## Scoring reference

- **E-axis (auto)**: `docs/agent-authoring-benchmark.md` — patch/get order, inline patch, step_runner_get
- **A–D, F**: human or `pnpm agent-eval -- <task> --verify-mock --judge`
- **Outcome oracle**: `docs/quickerbench-design.md` when task is IO-focused

## Optimization map (common findings)

| ruleId | Likely fix |
|--------|------------|
| `schema-validation-error` | Tool description + object examples in `*-tool.server.ts` |
| `token-baseline-high` | `model-tool-definitions.ts`, `tool-intent-filter.ts` |
| `docs-call-heavy` | Preload pattern skill in `agent-skills/prompt.ts` |
| `C-duplicate-search` | Richer search results in `StepRunnerCatalogMapper.cs` |
| `create-then-read-data` | `docs/skills/quicker-authoring/prompt-tier0.md` |
| `trace-rubric` E violations | Flow fixes per benchmark doc |

## Related

- Export UI: chat thread export → `%AppData%/QuickerAgent/exports/`
- Full trace rules: [reference/trace-rules.md](reference/trace-rules.md)
- Report template: [reference/report-template.md](reference/report-template.md)
- Prompt assembly: `docs/agent-gui-prompt-structure.md`
- Harness: `docs/superpowers/specs/2026-06-19-agent-gui-cursor-harness-design.md`

## Do not

- Treat UI-only tasks (MsgBox, text window) as QuickerBench pass/fail
- Recommend changes without citing export evidence (tool name + errorText)
- Guess step-runner `inputParams` — analysis only; fixes go through search→get docs
