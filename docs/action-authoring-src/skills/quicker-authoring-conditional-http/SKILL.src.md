
# 条件 HTTP（quicker-authoring-conditional-http）

> **父 skill**：quicker-authoring · **参考**：`docs/authoring-references/action-patterns/conditional-http.md`

## 何时加载

动作变量 `url` 可能为空，需分支：空则提示，非空则 `sys:http` GET/POST。

## 步骤骨架

1. `sys:if` + `$=string.IsNullOrWhiteSpace({url})`
2. if：提示；else：`http` `url.var` → `body`
3. 解析/展示下游

## 硬规则

- else 含 **http 或多步** → **`sys:if`**，不用 `simpleIf`（else 可能被跳过）。
- `step-runner get --control-field GET` 查 http 键。

## 深度阅读

- `action-patterns/conditional-http.md` · http-json-api
