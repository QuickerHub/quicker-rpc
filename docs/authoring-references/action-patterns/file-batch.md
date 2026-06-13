# 多文件批处理

> **场景**：对多个文件路径逐项读/写/变换 · **难度**：M · **exemplar**：`each` + `readFile` + `WriteTextFile`（B05 无头 patch）

## 何时用

合并、转换、统计多个文件内容。与 **loop-control** 重叠在 `each`，本 pattern 强调 **文件 IO 链**；与 **getSelectedFiles** 的区别：可从资源管理器选区取路径，也可用表达式/列表变量（无头测试）。

## 步骤骨架

1. **获取路径列表** — `sys:getSelectedFiles`（`getSelection`）或 `evalexpression` 建 `string[]`（benchmark 无头）
2. **遍历** — `sys:each`（`ifSteps` 内处理单文件）
3. **读** — `sys:readFile`（`path.var` ← `item`）
4. **累加/变换** — `evalexpression` / `stringProcess`
5. **写出** — `sys:WriteTextFile`（合并结果或逐文件输出）

## 变量约定

| 角色 | 建议 key | 类型 |
|------|----------|------|
| 路径列表 | `paths` / `files` | List |
| 当前路径 | `path` / `item` | Text |
| 单文件内容 | `chunk` / `content` | Text |
| 合并结果 | `merged` | Text |
| 输出路径 | `outPath` | Text |

## 示例（B05 trace ✅）

无头：`.local/b05-a.txt` + `b05-b.txt` → each `readFile` → 拼接 → `b05-merged.txt`（含 `line1`/`alpha`）。

Patch：`.local/patch-b05-file-batch.json`

## 陷阱

- `getSelectedFiles` 依赖 Explorer 选区；无头 benchmark 用 **表达式列表**。
- `readFile` + `WriteTextFile` 注意 `encoding` 一致（UTF-8）。
- 大文件用流式/分块策略；本骨架适合小文本批处理。
- `each` 子步骤在 **`ifSteps`**（见 loop-control）。

## 相关

getSelectedFiles · readFile · WriteTextFile · each · loop-control · pathExtraction
