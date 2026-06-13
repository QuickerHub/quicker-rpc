---
name: quicker-authoring-subprogram-extract
description: "Quicker 公共子程序抽取与 sys:subprogram 调用。写跨动作复用逻辑、global subprogram、callIdentifier 映射时加载。"
allowed-tools: docs
compatibility: "QuickerAgent (on-demand); requires Quicker + QuickerRpc plugin"
---


# 子程序抽取（quicker-authoring-subprogram-extract）

> **父 skill**：quicker-authoring · **状态**：promoted · **参考**：`action-patterns/subprogram-extract.md`

## 何时加载

逻辑需被多个动作复用：先 `subprogram create` + patch，再在主动作 `sys:subprogram` 调用。

## 步骤骨架

1. `subprogram create` → `callIdentifier`（`%%guid`）
2. 子程序 variables：`isInput`/`isOutput`
3. 主动作：`subProgram` + **`var:<ioKey>`** 输入 / **`var:<outKey>`** 输出映射

## 硬规则

- 调用前 **`subprogram get`**，禁止猜 `callIdentifier`。
- 子程序调用用 **`sys:subprogram`**，不是 `runAction`。
- IO 用 **`var:text`** 而非 `text.var`（patch 可 warning，运行有效）。

## 深度阅读

- `subprogram-workflow` · `action-patterns/subprogram-extract.md`

