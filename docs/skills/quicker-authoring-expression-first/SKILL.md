---
name: quicker-authoring-expression-first
description: "Quicker 表达式优先：单行 evalexpression 替代多步 stringProcess/assign 链。写去重、排序、拼接、简单变换类动作时加载。"
allowed-tools: docs
compatibility: "QuickerAgent (on-demand); requires Quicker + QuickerRpc plugin"
---


# 表达式优先（quicker-authoring-expression-first）

> **父 skill**：quicker-authoring · **状态**：promoted · **参考**：`action-patterns/expression-first.md`

## 何时加载

纯数据变换（去重、排序、拼接、简单解析）且可用 C# 表达式一步完成。不是 HTTP、文件 IO、剪贴板专用链。

## 步骤骨架

1. 输入变量（参数或上游输出）
2. **单步** `sys:evalexpression`（`{out} = …`）
3. 消费 `result`（showText / writeClipboard / `*.var`）

## 硬规则

- evalexpression 用 **`{var}`**；`simpleIf` 的 `condition` 才用 **`$=`**。
- 多变量一行：`{a}=…; {b}=…;`（见 quicker-authoring-evalexpression-multi-var）。
- `number` 运算字面量：`Convert.ToDouble(n)`。

## 深度阅读

- `action-patterns/expression-first.md` · quicker-eval-expression

