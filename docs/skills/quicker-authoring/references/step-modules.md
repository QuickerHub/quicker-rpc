# 常用模块对照（StepRunner 选型）

**何时读**：**`overview`** P5 — 在 **`qkrpc_step_runner_search`** 之前查本表找 `stepRunnerKey`，再 **`qkrpc_step_runner_get`** 取 `inputParams` 键名。

表达式/计算/LINQ **优先 `expressions` / `sys:evalexpression`**；无表项 → **`step-runner-search`** → **`implementation-fallback`**（先表达式，再 csscript）。

大表：`docs_get_reference({ topic: "step-modules", file: "modules-table" })`。

## 相关

`step-runner-search` · `implementation-fallback` · `expressions` · `authoring-workflow` · `overview`
