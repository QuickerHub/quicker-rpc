---
name: quicker-authoring-csv-parse-aggregate
description: "Quicker 剪贴板 CSV：解析表头、行数与列求和，写回聚合结果。"
allowed-tools: docs
compatibility: "QuickerAgent (on-demand); requires Quicker + QuickerRpc plugin"
---


# CSV 剪贴板聚合（quicker-authoring-csv-parse-aggregate）

> **父 skill**：quicker-authoring · **参考**：`docs/authoring-references/action-patterns/csv-parse-aggregate.md`

## 何时加载

剪贴板 CSV（表头+数据行）统计行数、对指定列求和并写回 `行数,合计`。

## 步骤骨架

1. writeClipboard 样本 → getClipboardText
2. evalexpression 解析（列索引、Skip(1)、Sum）
3. sys:if `parseOk` → writeClipboard / else 提示

## 硬规则

- number 变量赋值用 **`Convert.ToDouble`**。
- 业务 **`parseOk`** 与剪贴板 **`clipOk`** 分离。
- 主逻辑用 evalexpression，勿 csscript 糊完。

## 深度阅读

- `action-patterns/csv-parse-aggregate.md` · clipboard-pipeline

