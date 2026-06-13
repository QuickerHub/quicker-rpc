---
name: quicker-authoring-step-comments
description: "Quicker 多步动作自描述：sys:comment 分段注释，便于 structure 阅读与 Agent 自检。"
allowed-tools: docs
compatibility: "QuickerAgent (on-demand); requires Quicker + QuickerRpc plugin"
---


# 步骤注释（quicker-authoring-step-comments）

> **父 skill**：quicker-authoring · **参考**：`action-patterns/step-comments.md`

## 何时加载

自写 **≥3 步** 或含 **if/loop/subprogram/外置文件** 的动作；需要 structure 一眼看懂数据流时。

## 步骤骨架

1. 每段逻辑前加 `sys:comment`，`note` 写「输入 → 操作 → 输出」
2. `step-runner get --key sys:comment` 确认仅 `note` 键
3. 与可执行步骤交替排列；不要堆在末尾

## 硬规则

- comment **无**运行时副作用；**不**替代 assign/evalexpression
- 读 structure 自检：步骤类型序列应能复述流程
- 库/分享动作只读解构时可看他人是否用 comment；**写作**只在本地新建动作

## 深度阅读

- `action-patterns/step-comments.md` · `authored/comment.md`

