# sys:formatString

> **来源**：step JSON 示例 · **官方**：[formatstring](https://getquicker.net/KC/Help/Doc/formatstring)

**用途**：用 `String.Format` 将多个变量组合为文本（新逻辑可优先 `sys:evalexpression`）。

## 示例

### 插入文本参数

```json
{
  "stepRunnerKey": "sys:formatString",
  "inputParams": {
    "formatString": "你好，{0}!",
    "p0.var": "用户名"
  },
  "outputParams": {
    "output": "问候语"
  }
}
```

### 数字货币格式

```json
{
  "stepRunnerKey": "sys:formatString",
  "inputParams": {
    "formatString": "合计：{0:C2}",
    "p0.var": "金额"
  },
  "outputParams": {
    "output": "金额文本"
  }
}
```
