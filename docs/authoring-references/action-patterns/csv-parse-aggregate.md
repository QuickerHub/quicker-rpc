# 剪贴板 CSV 解析聚合

> **场景**：剪贴板 CSV → 行数 + 列求和 → 写回 · **难度**：L · **exemplar**：`__pattern_learning__csv_stats` trace ✅ `3,35`

## 何时用

表格式剪贴板文本（第一行表头）需统计行数、对指定列（如 `amount`）求和并输出 `行数,合计`。与 **expression-first** 的关系：单步 evalexpression LINQ/循环可完成；与 **clipboard-pipeline** 的关系：读-算-写回链。

## 步骤骨架

1. **种子/读取** — `writeClipboard` 样本 CSV → `getClipboardText` → `text`
2. **解析聚合** — `evalexpression`：Split 行、找列索引、Skip(1) 数据行、Sum
3. **分支** — `sys:if` on **`parseOk`**（勿复用 `clipOk`）
4. **写回** — `writeClipboard` `result`；失败 `showText` `message`

## 变量约定

| 角色 | 建议 key | 类型 |
|------|----------|------|
| CSV 原文 | `text` | Text |
| 行数 | `rowCount` | Number |
| 列合计 | `amountSum` | Number |
| 输出 | `result`（`3,35`） | Text |
| 解析成功 | `parseOk` | Boolean |

## 示例（trace ✅）

输入：

```csv
name,amount
a,10
b,20
c,5
```

输出剪贴板：`3,35`

Patch：`.local/patch-csv-parse-aggregate.json`

## 陷阱

- **number 变量**：`{rowCount} = Convert.ToDouble(n)`，勿直接 `{rowCount} = dataRows.Length`。
- **勿**把 `isSuccess` 与业务 `parseOk` 共用一个 `ok` 变量（getClipboard 会覆盖分支判断）。
- trace 用 `writeClipboard` 先写入样本 CSV。
- 列缺失：`parseOk=false` + `message`；`sys:if` else 提示。
- 简单 CSV 无引号转义；复杂 CSV 再考虑专用解析或 csscript。
- **ActionRuntime mock**：避免 `Split(new[] {'\n','\r'})`（`'\n'` 可能被当变量）；用 `Replace("\r","").Split(new string[] { "\n" }, …)`；**勿用 LINQ**（`Select`/`Where`/`FindIndex` 在 mock eval 易失败）→ 用 `for` 循环。
- `$={parseOk}` 在 **旧 CLI** if 条件可能恒 false（`$=` 被当变量名）；`build.ps1 -t` 后 `ReadConditionBoolean` 已修复。csv bench 仍用无条件 `writeClipboard` 亦可。

## 相关

clipboard-pipeline · expression-first · evalexpression-multi-var · skill：`quicker-authoring-csv-parse-aggregate`
