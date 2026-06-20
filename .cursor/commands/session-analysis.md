# QuickerAgent 会话分析（session-analysis）

分析导出的 Agent 对话 JSON，自动跑 trace 规则并给出 prompt / tool / skill 优化建议。先 **Read** skill：`.cursor/skills/quicker-agent-session-review/SKILL.md`。

## 何时执行

- 用户提供了 `quicker-agent-*.json` 导出路径或附件
- 用户问「分析这段 Agent 对话 / 优化 prompt / 为什么 tool 调用这么多」
- benchmark 或手工试跑后，需要解释 trace 问题

## 输入

- 格式：`quicker-agent-chat-export` v1（QuickerAgent 聊天 → 导出线程）
- 默认目录：`%AppData%\QuickerAgent\exports\`

## 执行（Agent 自跑）

**有明确路径**（用户附件或 `@` 文件）：

```powershell
pwsh -NoProfile -File ./scripts/Invoke-AgentSessionAnalysis.ps1 -ExportPath "<绝对路径>"
```

**自动取最新导出**（用户未指定文件）：

```powershell
pwsh -NoProfile -File ./scripts/Invoke-AgentSessionAnalysis.ps1 -Latest
```

**机器可读 JSON**：

```powershell
pwsh -NoProfile -File ./scripts/Invoke-AgentSessionAnalysis.ps1 -Latest -Json
```

**保存报告**（可选）：

```powershell
pwsh -NoProfile -File ./scripts/Invoke-AgentSessionAnalysis.ps1 -Latest -OutFile agent-gui/.local/session-analysis-last.md
```

等价 npm（在 `agent-gui/`）：

```powershell
pnpm agent-session -- "<export.json>"
pnpm agent-session -- "<export.json>" --json
pnpm agent-session -- --latest
```

## 完成后汇报

- 匹配的 benchmark task id（若有）
- E-axis PASS/FAIL
- tool 次数、error/retry 次数、主要 findings（前 3 条）
- Optimization hints 中优先级最高的一条及目标文件

若 exit code ≠ 0：列出 severity=error 的 finding 或 trace rubric violation。

## 禁止

- 未读 export 就猜测 agent 行为
- 把 UI 交互任务当 QuickerBench 唯一通过标准
- 建议修改 step-runner `inputParams` 而不引用 export 中的 tool 证据
