
# 循环控制（quicker-authoring-loop-control）

> **父 skill**：quicker-authoring · **状态**：promoted · **参考**：`docs/authoring-references/action-patterns/loop-control.md`

## 何时加载

`sys:each` / `sys:repeat` 遍历，需在循环内 `break` 或 `continue`。不是单步 listOperations、不是文件批处理业务本身。

## 步骤骨架

1. 准备列表（`evalexpression` 或上游）
2. `sys:each` + **`ifSteps`** 子步骤
3. `sys:simpleIf`（`$=` 条件）→ True 内 `break` / `continue`
4. 循环外消费 `found` 等变量

## 硬规则（本场景）

- 子步骤挂在 each 的 **`ifSteps`**。
- 单分支无 Else 用 **`simpleIf`**，避免裸 `sys:if` 空 Else 崩溃（B03 卡点）。
- `condition` 必须 `$=` 前缀；each 输出 `item`/`count` 映射到变量表。

## 陷阱

- 勿开 `useMultiThread` 除非已读 KC 多线程说明。
- `break` 后不会执行列表剩余项（trace 可见「检测到Break标记」）。

## 深度阅读

- `action-patterns/loop-control.md`
- authored: each · break · continue · simpleIf
