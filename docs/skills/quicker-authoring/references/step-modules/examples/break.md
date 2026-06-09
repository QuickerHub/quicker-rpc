# sys:break

> **来源**：step JSON 示例 · **官方**：[break](https://getquicker.net/KC/Help/Doc/break)

**用途**：在「每个」或「重复」循环内跳出，结束循环。

## 示例

### 条件满足时跳出循环

置于 `sys:each` / `sys:repeat` 子步骤内；本步无 input/output 参数。

```json
{
  "stepRunnerKey": "sys:break"
}
```

### 配合 if：列表遍历遇目标即 break

```json
{
  "stepRunnerKey": "sys:if",
  "inputParams": {
    "condition": "$={当前项} == {目标值}"
  }
}
```

上一步 if 的 Then 分支内接：

```json
{
  "stepRunnerKey": "sys:break"
}
```
