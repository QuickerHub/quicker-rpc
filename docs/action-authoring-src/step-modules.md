# 常用模块对照（StepRunner 选型）
**链路位置**：**`overview`** P5 — 在 {{#ref step-runner.search.invoke}} 之前用本表选 `stepRunnerKey`，再 {{#ref step-runner.get.invoke}} 取 `inputParams` 键名。
表达式/计算优先 **`expressions`**；无表项 → **`step-runner-search`** → **`implementation-fallback`**。
{{#only-cli}}
{{#include-reference modules-table}}
{{/only-cli}}
{{#only-agent}}
完整模块对照表（按分类）：`docs_get_reference({ topic: "step-modules", file: "modules-table" })`。
{{/only-agent}}
