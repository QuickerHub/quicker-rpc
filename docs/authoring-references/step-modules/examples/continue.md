# sys:continue

> **来源**：step JSON 示例 · **官方**：[continue](https://getquicker.net/KC/Help/Doc/continue)

**用途**：在「每个」/「重复」循环内跳过本次剩余步骤，进入下一次迭代。

## 示例

### 循环内 continue

置于 `sys:each` / `sys:repeat` 子步骤；无 input/output。

```json
{
  "stepRunnerKey": "sys:continue"
}
```

### 配合 if：跳过空项

```json
{
  "stepRunnerKey": "sys:if",
  "inputParams": {
    "condition": "$=String.IsNullOrWhiteSpace({当前项})"
  }
}
```

Then 分支内：

```json
{
  "stepRunnerKey": "sys:continue"
}
```
