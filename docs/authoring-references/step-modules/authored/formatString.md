# sys:formatString

> **分类**：文本 · **来源**：仓库手写 · **官方**：[formatstring](https://getquicker.net/KC/Help/Doc/formatstring)

**用途**：`String.Format` 组合文本（已废弃；新步骤优先 `$$` 或 `evalexpression`）。

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
    "output": "结果"
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
    "output": "结果"
  }
}
```

## 陷阱

- 占位符 `{0}`…`{n}` 对应 `p0`…`pn`；新逻辑用 `$$` 插值更简单。
- 输出键为 `output`。

## 相关

evalexpression · outputText · strReplace · step-runner-get
