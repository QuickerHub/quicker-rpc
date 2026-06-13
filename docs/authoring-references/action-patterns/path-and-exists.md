# 路径检查与分支

> **场景**：文件/目录存在性检查并按结果分支 · **难度**：S · **exemplar**：`__pattern_learning__path_exists` trace ✅

## 何时用

读写文件、启动外部程序、合并输出前，先 `checkPathExists` 再 `simpleIf` 走 EXISTS/MISSING 分支。与 **file-batch** 的区别：本模式是单路径守卫；批处理在 each 内可对每项再套本 pattern。

## 步骤骨架

1. **checkPathExists** — `path.var` ← 目标路径变量
2. **simpleIf** — `condition: $={exists}`（输出 `isExists` → boolean 变量）
3. **分支赋值** — True/False 各用 `evalexpression` 设 `message`（或直接进入读写步骤）
4. **收尾** — `showText` / `MsgBox` / 错误处理

## 变量约定

| 角色 | 建议 key | 类型 |
|------|----------|------|
| 目标路径 | `targetPath` / `path` | Text |
| 是否存在 | `exists` | Boolean |
| 分支文案/结果 | `message` / `status` | Text |

## 示例（trace ✅）

无头：`.local/b05-a.txt` 存在 → `checkPathExists` → `simpleIf` True 分支 `{message}="EXISTS"` → `showText`。

Patch：`.local/patch-path-exists.json`

### 最小 patch

```json
{
  "stepRunnerKey": "sys:checkPathExists",
  "inputParams": { "path.var": "targetPath" },
  "outputParams": { "isExists": "exists" }
},
{
  "stepRunnerKey": "sys:simpleIf",
  "inputParams": { "condition": "$={exists}" },
  "ifSteps": [
    {
      "stepRunnerKey": "sys:evalexpression",
      "inputParams": { "expression": "{message} = \"EXISTS\";" }
    }
  ],
  "elseSteps": [
    {
      "stepRunnerKey": "sys:evalexpression",
      "inputParams": { "expression": "{message} = \"MISSING\";" }
    }
  ]
}
```

## 陷阱

- `checkPathExists` **无 `isSuccess` 输出**；用 **`isExists`** 映射到 boolean 变量。
- 双分支用 **`sys:simpleIf`** + `ifSteps`/`elseSteps`；单分支可省略 `elseSteps`。
- `condition` 须 **`$={exists}`** 前缀，与 evalexpression 语法不同。
- 路径用变量 + `path.var` wire；无头测试填 `defaultValue` 绝对路径。

## 相关

checkPathExists · simpleIf · pathExtraction · file-batch · WriteTextFile · readFile
