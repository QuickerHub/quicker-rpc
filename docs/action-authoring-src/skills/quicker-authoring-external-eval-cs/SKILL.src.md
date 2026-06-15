
# 外置表达式文件（quicker-authoring-external-eval-cs）

> **父 skill**：quicker-authoring · **参考**：`action-patterns/external-eval-cs.md`

## 何时加载

`sys:evalexpression` 逻辑较长（>4 行、try/catch）→ `files/*.eval.cs` + `expression.file`。

## 步骤

1. `files/<name>.eval.cs` + `data.json` → `expression.file`
2. workspace_program patch
3. 运行时 `sys:if` 等分支

## 硬规则

- wire：**`expression.file`**，扩展名 **`.eval.cs`**
- 正文语法 = 内联 `expression`（SkipEval 纯 C#）→ **`expressions` topic**
- 业务 `ok` 在 eval 内 `{ok}=`；勿用 `outputParams.isSuccess` 覆盖 `ok`

## 深度阅读

`action-patterns/external-eval-cs.md` · workspace-editing · action-project-files
