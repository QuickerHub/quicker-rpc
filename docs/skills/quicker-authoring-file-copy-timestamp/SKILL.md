---
name: quicker-authoring-file-copy-timestamp
description: "Quicker 文件复制加时间戳：evalexpression 目标路径 + fileOperation copyTo。"
allowed-tools: docs
compatibility: "QuickerAgent (on-demand); requires Quicker + QuickerRpc plugin"
---


# 文件复制时间戳（quicker-authoring-file-copy-timestamp）

> **父 skill**：quicker-authoring · **参考**：`docs/authoring-references/action-patterns/file-copy-timestamp.md`

## 何时加载

单文件复制到目标目录并在文件名加时间戳（备份/导出副本）。

## 步骤骨架

1. 源路径（`selectFile` 或变量）
2. `evalexpression` 拼 `dstPath`（`Path.Combine` + `DateTime.Now`）
3. `fileOperation` `copyTo` + `resultPath`

## 硬规则

- `get --control-field copyTo`；`copyTo` 非 `copyInto`。
- `selectFile` UI 步骤 headless 用变量默认路径 trace。

## 深度阅读

- `action-patterns/file-copy-timestamp.md` · file-batch

