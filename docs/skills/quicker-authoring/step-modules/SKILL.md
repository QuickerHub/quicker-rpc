---
name: step-modules
description: "常用 stepRunnerKey 速查表。Use before step-runner search when a known module might fit."
allowed-tools: qkrpc_step_runner_get qkrpc_step_runner_search
metadata:
  phase: "P5"
---

# 常用模块对照（StepRunner 选型）
**链路位置**：**`overview`** P5 — 在 **`qkrpc_step_runner_search`** 之前用本表选 `stepRunnerKey`，再 **`qkrpc_step_runner_get`** 取 `inputParams` 键名。
表达式/计算优先 **`expressions`**；无表项 → **`step-runner-search`** → **`implementation-fallback`**。

完整模块对照表（按分类）：`docs_get_reference({ topic: "step-modules", file: "modules-table" })`。

