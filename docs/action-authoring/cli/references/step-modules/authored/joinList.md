# sys:joinList

> **分类**：文本处理 · **来源**：仓库手写 · **官方**：[joinlist](https://getquicker.net/KC/Help/Doc/joinlist)

**用途**：用分隔符将列表项拼接为一段文本（LINQ 可用 `evalexpression` 的 `String.Join`）。

## 示例

### 逗号连接

```json
{
  "stepRunnerKey": "sys:joinList",
  "inputParams": {
    "list.var": "标签列表",
    "separator": ","
  },
  "outputParams": {
    "output": "合并文本"
  }
}
```

### 换行连接

```json
{
  "stepRunnerKey": "sys:joinList",
  "inputParams": {
    "list.var": "行列表",
    "separator": "\n"
  },
  "outputParams": {
    "output": "多行文本"
  }
}
```

## 陷阱

- 列表来源用 `list.var`；`separator` 默认 `,`。
- `escapeSeparator: true` 时将分隔符中的 `\r`、`\n`、`\t` 转为实际换行/制表符。
- 反向拆分用 `splitString`；复杂格式化优先 `evalexpression`。

## 相关

splitString · evalexpression · formatString · listOperations · step-runner-get
