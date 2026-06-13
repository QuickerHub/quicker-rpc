---
name: quicker-authoring-run-action-delegate
description: "Quicker 委托运行动作：runAction StartAction + wait + output。编排层调用另一动作时加载。"
allowed-tools: docs
compatibility: "QuickerAgent (on-demand); requires Quicker + QuickerRpc plugin"
---


# 委托运行动作（quicker-authoring-run-action-delegate）

> **父 skill**：quicker-authoring · **参考**：`docs/authoring-references/action-patterns/run-action-delegate.md`

## 何时加载

主动作需要 **运行另一个 Quicker 动作** 并可选等待 `output`。不是子程序 `sys:subprogram`。

## 步骤骨架

1. 目标动作 id（`action create` 或已有）
2. `sys:runAction`：`StartAction` + `actionId.var` + `wait: True`
3. 读 `isSuccess` / `actionTitle` / `output`

## 硬规则

- `step-runner get --control-field StartAction`。
- 读 `output` 必须 **`wait: True`**。
- `inputParam` → 目标 `quicker_in_param`。
- 子程序块用 **subprogram-extract**，不用 runAction。

## 深度阅读

- `action-patterns/run-action-delegate.md` · runAction

