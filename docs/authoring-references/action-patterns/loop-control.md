# 循环与 break/continue

> **场景**：遍历列表并在条件满足时提前结束 · **难度**：M · **exemplar**：B03 学习验证 + `each`/`break` KC

## 何时用

对列表逐项处理，遇到目标项、错误态或计数上限时 `break`；跳过当前项剩余步骤用 `continue`。与 **file-batch** 的区别：本模式强调控制流；文件批处理是 each 的具体场景。

## 步骤骨架

1. **准备列表** — `sys:evalexpression`（`{list} = new string[] { … }`）或上游模块输出
2. **遍历** — `sys:each`（`useMultiThread: "0"`），子步骤挂在 **`ifSteps`**
3. **条件** — `sys:simpleIf`（`condition: $={item} == "…"`）→ True 分支内 `break` / `continue`
4. **收尾** — 循环外读取结果变量

## 变量约定

| 角色 | 建议 key | 类型 |
|------|----------|------|
| 列表 | `items` / `list` | List |
| 当前项 | `item`（each 输出） | Any |
| 序号 | `count`（each 输出） | Number |
| 命中结果 | `found` | Text |

## 示例动作

- 学习验证 `__pattern_learning__loop_break`：`evalexpression` 建表 → `each` → `simpleIf` + `break` @ `target`（count=2）→ `showText` 显示 `target`
- 库动作多用 `each`+子程序；入门优先 ≤5 步骨架

### 最小 patch

```json
{
  "replace": true,
  "variables": [
    { "key": "items", "varType": "list", "defaultValue": "" },
    { "key": "item", "defaultValue": "" },
    { "key": "found", "defaultValue": "" },
    { "key": "count", "varType": "number", "defaultValue": "0" }
  ],
  "steps": [
    {
      "stepRunnerKey": "sys:evalexpression",
      "inputParams": {
        "expression": "{items} = new string[] { \"a\", \"b\", \"target\", \"d\" };"
      }
    },
    {
      "stepRunnerKey": "sys:each",
      "inputParams": { "input.var": "items", "useMultiThread": "0" },
      "outputParams": { "item": "item", "count": "count" },
      "ifSteps": [
        {
          "stepRunnerKey": "sys:simpleIf",
          "inputParams": { "condition": "$={item} == \"target\"" },
          "ifSteps": [
            {
              "stepRunnerKey": "sys:evalexpression",
              "inputParams": { "expression": "{found} = {item};" }
            },
            { "stepRunnerKey": "sys:break" }
          ]
        }
      ]
    },
    {
      "stepRunnerKey": "sys:showText",
      "inputParams": { "text.var": "found" }
    }
  ]
}
```

## 陷阱

- **`each` 子步骤在 `ifSteps`**，不是顶层并列步骤。
- **`sys:if` 无 Else 时可能 NullReference**；单分支条件优先 **`sys:simpleIf`**。
- `condition` 表达式须 **`$=` 前缀**（与 evalexpression 步骤不同）。
- 默认 **`useMultiThread: "0"`**；多线程 each 变量写入受限。
- `break` 仅跳出 enclosing `each`/`repeat`，不是 `stop`。

## 相关

each · break · continue · simpleIf · if · evalexpression · file-batch
