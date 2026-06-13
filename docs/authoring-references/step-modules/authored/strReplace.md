# sys:strReplace

> **分类**：文本 · **来源**：仓库手写 · **官方**：[strreplace](https://getquicker.net/KC/Help/Doc/strreplace)

**用途**：单次或批量查找替换文本。

## 示例

### 单次替换

```json
{
  "stepRunnerKey": "sys:strReplace",
  "inputParams": {
    "type": "single",
    "input.var": "原文",
    "old": "foo",
    "new": "bar"
  },
  "outputParams": {
    "output": "结果"
  }
}
```

### 正则替换

```json
{
  "stepRunnerKey": "sys:strReplace",
  "inputParams": {
    "type": "single",
    "input.var": "原文",
    "old": "\\d+",
    "new": "#",
    "useRegex": true
  },
  "outputParams": {
    "output": "结果"
  }
}
```

### 批量替换

```json
{
  "stepRunnerKey": "sys:strReplace",
  "inputParams": {
    "type": "batch",
    "input.var": "原文",
    "batchReplaceData": "old1|new1\nold2|new2"
  },
  "outputParams": {
    "output": "结果"
  }
}
```

## 陷阱

- `batchReplaceData` 每行 `查找|替换` 或 `查找|||替换`；`replaceEscapes` 默认转义 `new` 中的 `\r\n\t`。
- 正则模式注意 `singleLine`/`multiLine`/`ignoreCase`；复杂替换可用 `evalexpression`。
- 写步骤前 `get --control-field single|batch`。

## 相关

splitString · formatString · evalexpression · step-runner-get
