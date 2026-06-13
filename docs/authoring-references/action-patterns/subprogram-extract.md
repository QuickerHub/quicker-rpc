# 子程序抽取复用

> **场景**：多动作共享同一段步骤逻辑 · **难度**：M · **exemplar**：`subprogram-workflow` + 学习子程序 `__pattern_learning__upper_core`（`b6675a14-…`）

## 何时用

两段以上动作需要相同处理块（格式化、校验、调用外部工具等），应抽到 **global 子程序** 再 `sys:subprogram` 调用。与 **embedded 子程序** 的区别：公共库存盘在 `.quicker/subprograms/`，跨动作复用。

## 步骤骨架

### A. 抽取（global subprogram）

1. `subprogram create` → 记 `callIdentifier`（`%%{guid}`）
2. 变量表：`isInput` / `isOutput` + `paramName`
3. 子程序体步骤（如 `stringProcess`）
4. `subprogram patch` 保存

### B. 调用（action）

1. `subprogram get` → 确认 `callIdentifier` 与 IO 变量名
2. `step-runner get sys:subprogram`
3. 主动作一步 `sys:subprogram`：`subProgram` + IO 映射（**`var:<子程序变量key>`** → 主程序变量）
4. `outputParams` 用 **`var:<outputKey>`** 接收子程序输出

## 变量约定

| 侧 | 角色 | 标记 |
|----|------|------|
| 子程序 | 输入 | `isInput: true` |
| 子程序 | 输出 | `isOutput: true` |
| 主程序 | 传入/接收 | 与 IO `key` 同名映射 |

## 示例（B04 trace ✅）

- 子程序 `__pattern_learning__upper_core`：`text` in → `stringProcess toUpper` → `result` out（已删）
- 主动作：`var:text` ← `inputText` → `var:result` → `outputText`，`showText` 显示 `HELLO SUB`

### 主动作 IO wire

```json
{
  "stepRunnerKey": "sys:subprogram",
  "inputParams": {
    "subProgram": "%%<guid>",
    "var:text": { "varKey": "inputText" }
  },
  "outputParams": {
    "var:result": "outputText",
    "isSuccess": "spOk"
  }
}
```

Patch 模板：`.local/patch-b04-subprogram.json`、`.local/patch-b04-caller.json`

## 陷阱

- **禁止**未 `subprogram get` 猜 `callIdentifier`。
- IO 绑定键名为 **`var:<子程序变量key>`** / **`var:<outputKey>`**（非 `text.var`）；见 `scripts/voxtype-quicker/voxtype-run-subprogram.patch.json`。
- IO 键名须与子程序变量 `key`/`paramName` 一致；改子程序 IO 后须同步所有调用步。
- 列表/词典按引用传递，子程序内修改会影响主程序。
- `runAction` 用于跑**其他动作**；子程序调用用 **`sys:subprogram`**。

## 相关

subprogram-workflow · subprogram · stop · workspace-editing
