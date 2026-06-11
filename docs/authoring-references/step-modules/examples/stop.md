# sys:stop

> **来源**：step JSON 示例 · **官方**：[stop](https://getquicker.net/KC/Help/Doc/stop)

**用途**：结束动作运行并可选返回值或错误提示。

## 示例

### 正常结束并返回值

```json
{
  "stepRunnerKey": "sys:stop",
  "inputParams": {
    "method": "default",
    "return.var": "结果"
  }
}
```

### 带提示结束

```json
{
  "stepRunnerKey": "sys:stop",
  "inputParams": {
    "method": "default",
    "return": "完成",
    "showMessage": "处理完毕"
  }
}
```

### 错误停止

```json
{
  "stepRunnerKey": "sys:stop",
  "inputParams": {
    "method": "default",
    "isError": "1",
    "showMessage.var": "错误信息"
  }
}
```
