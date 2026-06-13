
# 路径检查与分支（quicker-authoring-path-and-exists）

> **父 skill**：quicker-authoring · **状态**：promoted · **参考**：`action-patterns/path-and-exists.md`

## 何时加载

单文件/目录存在性检查 → 按 EXISTS/MISSING 分支或决定是否继续 IO。

## 步骤骨架

1. `checkPathExists`（`path.var` → `isExists` → `exists`）
2. `simpleIf`（`$={exists}`）+ `ifSteps`/`elseSteps`
3. 分支内 `evalexpression` 或读写模块

## 硬规则

- 输出键 **`isExists`**，不是 `isSuccess`。
- 双分支用 **`sys:simpleIf`**，不用无 Else 的 `sys:if`。
- 无头测试：`targetPath` 填已知存在的绝对路径。

## 深度阅读

- `action-patterns/path-and-exists.md` · file-batch
