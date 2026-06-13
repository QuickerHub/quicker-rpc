# sys:splitString

> **分类**：文本 · **来源**：仓库手写 · **官方**：[splitstring](https://getquicker.net/KC/Help/Doc/splitstring)

**用途**：按分隔符将文本拆分为列表。

## 示例

### 按逗号拆分

```json
{
  "stepRunnerKey": "sys:splitString",
  "inputParams": {
    "data.var": "文本",
    "separator": ","
  },
  "outputParams": {
    "output": "列表"
  }
}
```

### 多字符分隔符

```json
{
  "stepRunnerKey": "sys:splitString",
  "inputParams": {
    "data.var": "文本",
    "separator": "||",
    "multiSeparator": true,
    "removeEmpty": true
  },
  "outputParams": {
    "output": "列表"
  }
}
```

### 转义分隔符

```json
{
  "stepRunnerKey": "sys:splitString",
  "inputParams": {
    "data.var": "文本",
    "separator": "\\n",
    "escapeSeparator": true
  },
  "outputParams": {
    "output": "列表"
  }
}
```

## 陷阱

- `multiSeparator: true` 时 `separator` 每行一个分隔符；`escapeSeparator` 解析 `\r\n\t`。
- `removeEmpty` 默认 true；反向合并用 `joinList`；正则拆分用 `evalexpression`。

## 相关

joinList · strReplace · listOperations · step-runner-get
