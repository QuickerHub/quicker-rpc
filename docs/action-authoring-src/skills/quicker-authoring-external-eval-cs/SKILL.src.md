
# 外置表达式文件（quicker-authoring-external-eval-cs）

> **父 skill**：quicker-authoring · **参考**：`docs/authoring-references/action-patterns/external-eval-cs.md`

## 何时加载

`sys:evalexpression` 逻辑较长（>4 行、try/catch），需 `files/*.eval.cs` + `expression.file`。

## 步骤骨架

1. extract → `files/<name>.eval.cs` + `data.json` `expression.file`
2. `action apply` 或 workspace_program patch
3. 运行时 `sys:if` 分支成功/失败输出

## 硬规则

- wire：**`expression.file`**；扩展名 **`.eval.cs`**。
- 业务 `ok` 在 eval 内 `{ok}=`；勿用 `outputParams.isSuccess` 覆盖 `ok`。
- trace 前 `writeClipboard` 种子数据。

## 深度阅读

- `action-patterns/external-eval-cs.md` · workspace-editing · action-project-files
