# sys:strCompare

> **分类**：文本 · **来源**：仓库手写 · **官方**：[strcompare](https://getquicker.net/KC/Help/Doc/strcompare)

**用途**：比较两段文本，输出布尔结果。

## 示例

### 相等

```json
{
  "stepRunnerKey": "sys:strCompare",
  "inputParams": {
    "type": "=",
    "param1.var": "文本A",
    "param2.var": "文本B"
  },
  "outputParams": {
    "value": "比较结果"
  }
}
```

### 包含（忽略大小写）

```json
{
  "stepRunnerKey": "sys:strCompare",
  "inputParams": {
    "type": "contains",
    "param1.var": "Haystack",
    "param2": "needle",
    "case": false
  },
  "outputParams": {
    "value": "比较结果"
  }
}
```

### 正则匹配

```json
{
  "stepRunnerKey": "sys:strCompare",
  "inputParams": {
    "type": "match",
    "param1.var": "文本",
    "param2": "^\\d+$"
  },
  "outputParams": {
    "value": "比较结果"
  }
}
```

## 陷阱

- `type`: `>`/`=`/`</`contains`/`startsWith`/`endsWith`/`match`/`pinyinMatch`；输出键为 `value`（Boolean）。
- `pinyinMatch` 不支持 `case`；复杂逻辑可用 `evalexpression` + `simpleIf`。
- 写步骤前 `get --control-field contains` 等。

## 相关

simpleIf · numCompare · evalexpression · step-runner-get
