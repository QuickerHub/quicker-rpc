---
name: quicker-authoring-file-batch
description: "Quicker 多文件批处理：getSelectedFiles 或列表 + each + readFile + WriteTextFile。写合并/批量读写文件类动作时加载。"
allowed-tools: docs
compatibility: "QuickerAgent (on-demand); requires Quicker + QuickerRpc plugin"
---


# 文件批处理（quicker-authoring-file-batch）

> **父 skill**：quicker-authoring · **状态**：promoted · **参考**：`action-patterns/file-batch.md`

## 何时加载

多个文件路径 → 逐项读取/变换/写出。不是单文件 `readFile`、不是纯循环控制。

## 步骤骨架

1. 路径列表（`getSelectedFiles` 或 `evalexpression` `string[]`）
2. `each` + `ifSteps`：`readFile` → 累加 `evalexpression`
3. `WriteTextFile` 或逐文件写出

## 硬规则

- 无头测试用 **表达式路径列表**，不依赖 Explorer 选区。
- `each` 子步骤在 **`ifSteps`**。
- 读写编码一致（`utf-8`）。

## 深度阅读

- `action-patterns/file-batch.md` · `loop-control`

