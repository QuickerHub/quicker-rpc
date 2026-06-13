# sys:newGuid

> **分类**：计算与数据结构 · **来源**：仓库手写 · **官方**：[newguid](https://getquicker.net/KC/Help/Doc/newguid)

**用途**：生成 GUID 并输出为文本（也可用 `evalexpression` 的 `Guid.NewGuid()`）。

## 示例

### 标准 GUID

```json
{
  "stepRunnerKey": "sys:newGuid",
  "outputParams": {
    "output": "新ID"
  }
}
```

### 大写无连字符

```json
{
  "stepRunnerKey": "sys:newGuid",
  "inputParams": {
    "format": "N",
    "upper": true
  },
  "outputParams": {
    "output": "新ID"
  }
}
```

## 陷阱

- `format`: `D`（默认带连字符）/ `N`（32 位无分隔）/ `B`/`P`（括号）/ `X`（十六进制结构）；`upper: true` 字母大写。
- 无其他输入；文件名随机后缀可配合 `GenTempFilePath` 或表达式。

## 相关

evalexpression · GenTempFilePath · enc · step-runner-get
