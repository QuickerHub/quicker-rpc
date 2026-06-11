# sys:assign

> **来源**：step JSON 示例 · **官方**：[assign](https://getquicker.net/KC/Help/Doc/assign)

**用途**：为变量赋值（列表/词典会创建副本；新逻辑优先 `sys:evalexpression`）。

## 示例

### 文本插值赋值

```json
{
  "stepRunnerKey": "sys:assign",
  "inputParams": {
    "input": "$$Hello, {用户名}!"
  },
  "outputParams": {
    "output": "问候语"
  }
}
```

### 复制列表变量

```json
{
  "stepRunnerKey": "sys:assign",
  "inputParams": {
    "input.var": "源列表"
  },
  "outputParams": {
    "output": "列表副本"
  }
}
```

### 表达式赋值（文本非空）

```json
{
  "stepRunnerKey": "sys:assign",
  "inputParams": {
    "input": "$=!String.IsNullOrWhiteSpace({文本})"
  },
  "outputParams": {
    "output": "非空"
  }
}
```
