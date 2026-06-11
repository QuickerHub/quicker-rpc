# sys:if

> **来源**：step JSON 示例 · **官方**：[if](https://getquicker.net/KC/Help/Doc/if)

**用途**：按 `$=` 条件分支执行 Then/Else 子步骤。

## 示例

### 数值比较

```json
{
  "stepRunnerKey": "sys:if",
  "inputParams": {
    "condition": "$={数量} > 0"
  }
}
```

### 文本非空

```json
{
  "stepRunnerKey": "sys:if",
  "inputParams": {
    "condition": "$=!String.IsNullOrWhiteSpace({路径})"
  }
}
```

### 多条件组合

```json
{
  "stepRunnerKey": "sys:if",
  "inputParams": {
    "condition": "$={已启用} && {计数} >= 3"
  }
}
```
