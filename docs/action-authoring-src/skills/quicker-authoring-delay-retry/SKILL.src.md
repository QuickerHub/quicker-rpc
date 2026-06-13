
# 延迟与重试（quicker-authoring-delay-retry）

> **父 skill**：quicker-authoring · **状态**：promoted · **参考**：`action-patterns/delay-retry.md`

## 何时加载

固定次数重试 + 每次间隔等待；不是 each 列表遍历。

## 步骤骨架

1. `repeat`（`count`、`repeatDelayMs`）+ `ifSteps`
2. 尝试操作 + `simpleIf` 成功 → `break`
3. 失败分支 `delay`
4. 循环外收尾

## 硬规则

- 子步骤在 **`ifSteps`**。
- 成功必 **`break`** 或 `stopCondition`。
- `condition` 用 **`$=`** 前缀。

## 深度阅读

- `action-patterns/delay-retry.md` · loop-control
