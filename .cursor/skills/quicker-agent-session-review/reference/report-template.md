# Session analysis report template

```markdown
# QuickerAgent Session Analysis

## Summary

| Field | Value |
|-------|-------|
| Thread | {title} ({shortId}) |
| User turns | {n} |
| Tool calls | {n} |
| Tool errors | {n} (retries: {n}) |
| Tokens | in / out / total |
| Static context | ~{n} tokens |
| Intent | {intent} ({risk}) |
| Matched benchmark | `{taskId}` |

## User prompt

\`\`\`
{userPrompt}
\`\`\`

## Tool timeline

1. `{tool}` — ok|ERROR
   - {error line if any}

## Findings

- **[severity]** `{ruleId}`: {message}

## Trace rubric (E-axis): PASS|FAIL

## Optimization hints

### 1. {ruleId}

{suggestion}

Targets:
- `{path}`
```

Generated automatically by `pnpm agent-session -- export.json`.

Human reviewer adds:

- **A–D axis** scores (0/1/2) per `docs/agent-authoring-benchmark.md`
- **F-axis** mock assert result if applicable
- **Acceptance**: whether the delivered action meets user intent
