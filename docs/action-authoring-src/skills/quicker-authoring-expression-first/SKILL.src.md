
# 表达式优先（quicker-authoring-expression-first）

> **父 skill**：quicker-authoring · **状态**：promoted · **参考**：`action-patterns/expression-first.md`

## 何时加载

纯数据变换（去重、排序、拼接、简单解析）且需 **C# 表达式/LINQ** 一步完成（非单变量 assign 可覆盖的场景）。不是 HTTP、文件 IO、剪贴板专用链。

## 步骤骨架

1. 输入变量（参数或上游输出）
2. 若单变量写入 → **`sys:assign`**；若批量 `{var}=` 或 LINQ → **单步** `sys:evalexpression`
3. 消费 `result`（showText / writeClipboard / `*.var`）

## 硬规则

- evalexpression 用 **`{var}`**；`simpleIf` 的 `condition` 才用 **`$=`**。
- 多变量一行：`{a}=…; {b}=…;`（见 quicker-authoring-evalexpression-multi-var）。
- `number` 运算字面量：`Convert.ToDouble(n)`。

## 深度阅读

- `action-patterns/expression-first.md` · quicker-eval-expression
