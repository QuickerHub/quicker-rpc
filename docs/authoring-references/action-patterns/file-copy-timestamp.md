# 文件复制加时间戳

> **场景**：选定源文件 → 生成带时间戳的目标路径 → copyTo · **难度**：M · **exemplar**：`__pattern_learning__file_copy_ts` trace ✅

## 何时用

备份、导出副本时在文件名嵌入 `yyyyMMdd_HHmmss`。与 **file-batch** 的区别：单文件复制+重命名，非 each 合并；与 **path-and-exists** 的区别：本模式写新路径而非存在性分支。

## 步骤骨架

1. **源路径** — `selectFile`（UI）或变量默认 / 参数
2. **目标路径** — `evalexpression`：`Path.Combine` + `GetFileNameWithoutExtension` + 时间戳 + 扩展名
3. **复制** — `fileOperation` `type: copyTo`，`path.var` + `dstPath.var`
4. **反馈** — `resultPath` / `showText` / `notify`

## 变量约定

| 角色 | 建议 key | 类型 |
|------|----------|------|
| 源文件 | `srcPath` / `path` | Text |
| 目标目录 | `dstDir` | Text |
| 完整目标 | `dstPath` | Text |
| 结果路径 | `result` | Text |

## 示例（trace ✅）

`.local/b05-a.txt` → `b05-a_20260613_154123.txt` 同目录副本。

Patch：`.local/patch-file-copy-timestamp.json`

### 最小 patch

```json
{
  "stepRunnerKey": "sys:evalexpression",
  "inputParams": {
    "expression": "{dstPath} = System.IO.Path.Combine({dstDir}, System.IO.Path.GetFileNameWithoutExtension({srcPath}) + \"_\" + DateTime.Now.ToString(\"yyyyMMdd_HHmmss\") + System.IO.Path.GetExtension({srcPath}));"
  }
},
{
  "stepRunnerKey": "sys:fileOperation",
  "inputParams": {
    "type": "copyTo",
    "path.var": "srcPath",
    "dstPath.var": "dstPath",
    "overwrite": "False"
  },
  "outputParams": { "resultPath": "result", "isSuccess": "ok" }
}
```

## 陷阱

- `copyTo`（复制为）目标须**含完整文件路径**；`copyInto` 仅到目录。
- `step-runner get --control-field copyTo` 查 wire 键。
- `selectFile` 需 UI；headless 用变量默认绝对路径 trace。
- 目标目录须存在；可先 `makeDir` 或 `checkPathExists` 分支创建。

## 相关

file-batch · path-and-exists · fileOperation · selectFile · skill：`quicker-authoring-file-copy-timestamp`
